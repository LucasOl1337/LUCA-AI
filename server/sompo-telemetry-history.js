import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';
import { convertSompoDataset, SOMPO_EXPORT_MAX_SAMPLES, SOMPO_EXPORT_MAX_JSON_BYTES } from '../shared/sompo-lab-export.js';
// geofencing (módulo server/geofencing): recalcula os episódios de faixa sobre a série gravada; null sem talhão.
import { summarizeEpisodeGeofence } from './geofencing/episode-geofence.js';
import { inferredImageMime } from './image-signature.js';

export const SOMPO_TELEMETRY_HISTORY_DEFAULT_LIMIT = 2000;
export const SOMPO_TELEMETRY_HISTORY_DEFAULT_WINDOW_MIN = 15;
export const SOMPO_TELEMETRY_HISTORY_MAX_WINDOW_MIN = 240;
export const SOMPO_TELEMETRY_SIMULATION_MAX_BATCH = 50;
// 'colisao' é o kind legado dos episódios gravados antes da generalização;
// episódios novos entram como 'roteiro' (qualquer cenário + desfecho roteirizado).
export const SOMPO_TELEMETRY_EPISODE_KINDS = Object.freeze(['colisao', 'roteiro']);
export const SOMPO_TELEMETRY_EPISODE_RECORDING_TIMEOUT_MS = 10 * 60_000;
export const SOMPO_TELEMETRY_EPISODE_KEY_SAMPLES_MAX = 30;
export const SOMPO_TELEMETRY_EPISODE_FRAMES_MAX = 6;
export const SOMPO_TELEMETRY_EPISODE_FRAME_MAX_BYTES = 300 * 1024;
// Janela pós-finish em que o upload de frames ainda é aceito ("recém-complete").
export const SOMPO_TELEMETRY_EPISODE_FRAME_GRACE_MS = SOMPO_TELEMETRY_EPISODE_RECORDING_TIMEOUT_MS;

const EPISODE_FRAME_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

const SOURCE_KINDS = new Set(['firebase', 'simulation']);
const EPISODE_KIND_SET = new Set(SOMPO_TELEMETRY_EPISODE_KINDS);
const EPISODE_FINAL_STATUSES = new Set(['complete', 'aborted']);
const EPISODE_PHASE_LABELS = Object.freeze({
  aproximacao: 'Antes do pico',
  impacto: 'Pico',
  'pos-impacto': 'Depois do pico',
});
const FONTE_TO_KIND = Object.freeze({
  firebase: 'firebase',
  simulacao: 'simulation',
});

export function defaultSompoTelemetryDbPath() {
  return path.join(process.env.LUCA_DATA_DIR || '.luca', 'sompo-telemetry.db');
}

export function defaultSompoEpisodeFramesDir() {
  return path.join(process.env.LUCA_DATA_DIR || '.luca', 'sompo-episodes');
}

/**
 * Decodifica um frame `{dataUrl, offsetMs, fase, label}` validando o mime pelos
 * BYTES (mesma verificação de assinatura do chat-attachments), nunca pelo rótulo.
 */
function parseEpisodeFrame(raw, index) {
  const position = `Frame ${index + 1}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw httpError(400, 'sompo_telemetry_episode_frame_invalid', `${position}: frame inválido.`);
  }
  const dataUrl = String(raw.dataUrl || '').trim();
  const match = dataUrl.match(/^data:(image\/jpeg|image\/png);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw httpError(
      400,
      'sompo_telemetry_episode_frame_invalid',
      `${position}: dataUrl deve ser data:image/jpeg;base64,... ou data:image/png;base64,...`,
    );
  }
  const declaredMime = match[1];
  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    throw httpError(400, 'sompo_telemetry_episode_frame_invalid', `${position}: base64 ilegível.`);
  }
  if (!buffer.length) {
    throw httpError(400, 'sompo_telemetry_episode_frame_invalid', `${position}: frame vazio.`);
  }
  if (buffer.length > SOMPO_TELEMETRY_EPISODE_FRAME_MAX_BYTES) {
    throw httpError(
      400,
      'sompo_telemetry_episode_frame_too_large',
      `${position}: ${buffer.length} bytes excede o teto de ${SOMPO_TELEMETRY_EPISODE_FRAME_MAX_BYTES} bytes por frame.`,
    );
  }
  const sniffedMime = inferredImageMime(buffer);
  if (!EPISODE_FRAME_MIME_TYPES.has(sniffedMime) || sniffedMime !== declaredMime) {
    throw httpError(
      400,
      'sompo_telemetry_episode_frame_invalid',
      `${position}: os bytes não correspondem a ${declaredMime} (assinatura detectada: ${sniffedMime || 'desconhecida'}).`,
    );
  }
  return {
    buffer,
    mimeType: sniffedMime,
    offsetMs: finiteNumber(raw.offsetMs),
    fase: optionalText(raw.fase),
    label: optionalText(raw.label),
  };
}

function originKey(sourceKind, tractorId, episodeId = null) {
  return JSON.stringify([sourceKind, tractorId, episodeId]);
}

function finiteNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function magnitude(x, y, z) {
  if (![x, y, z].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  return Math.sqrt((x ** 2) + (y ** 2) + (z ** 2));
}

function roundAvg(value) {
  if (value === null || value === undefined) return null;
  return Math.round(value * 100) / 100;
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isContractError(error) {
  const status = Number(error?.status);
  return String(error?.message || '').startsWith('sompo_telemetry_') || (status >= 400 && status < 500);
}

function rethrowSqlite(error, action) {
  if (isContractError(error)) throw error;
  console.error(`[sompo-telemetry-history] falha SQLite em ${action}:`, error?.message || error);
  throw error;
}

function parseTimestampMs(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`sompo_telemetry_timestamp_invalid:${label}`);
  }
  return parsed;
}

function mapSampleRow(row) {
  return {
    id: Number(row.id),
    episodeId: row.episodeId === null || row.episodeId === undefined ? null : Number(row.episodeId),
    tractorId: String(row.tractorId),
    sourceKind: row.sourceKind,
    scenarioLabel: row.scenarioLabel ?? null,
    deviceTimestamp: finiteNumber(row.deviceTimestamp),
    observedAt: String(row.observedAt),
    observedMs: Number(row.observedMs),
    distancia: finiteNumber(row.distancia),
    temperatura: finiteNumber(row.temperatura),
    umidade: finiteNumber(row.umidade),
    pitch: finiteNumber(row.pitch),
    roll: finiteNumber(row.roll),
    accX: finiteNumber(row.accX),
    accY: finiteNumber(row.accY),
    accZ: finiteNumber(row.accZ),
    rotX: finiteNumber(row.rotX),
    rotY: finiteNumber(row.rotY),
    rotZ: finiteNumber(row.rotZ),
    riscoColisao: row.collisionKnown ? Boolean(row.riscoColisao) : null,
    riscoInclinacao: row.inclinationKnown ? Boolean(row.riscoInclinacao) : null,
    velocidade: finiteNumber(row.velocidade),
    velocidadeRoda: finiteNumber(row.velocidadeRoda),
    // Posição de cena (metros locais, sintética) e faixa lida pelo radar no instante; null quando a origem não tem posição.
    posX: finiteNumber(row.posX),
    posZ: finiteNumber(row.posZ),
    headingDeg: finiteNumber(row.headingDeg),
    geofenceHazard: row.geofenceHazard ?? null,
    geofenceBand: row.geofenceBand ?? null,
  };
}

const SCENE_LIMIT_M = 100_000;
function sceneNumber(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > SCENE_LIMIT_M) {
    throw new Error(`sompo_telemetry_position_invalid:${name}`);
  }
  return value;
}
function sceneId(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[\p{L}\p{N}_:./-]{1,120}$/u.test(value)) {
    throw new Error(`sompo_telemetry_position_invalid:${name}`);
  }
  return value;
}
/** Posição de cena e faixa do radar vindas da amostra crua do simulador; mesmo formato de snapshot.position/geofence do cliente. */
function scenePositionFromRaw(raw) {
  const x = sceneNumber(raw?.posX, 'posX');
  const z = sceneNumber(raw?.posZ, 'posZ');
  const headingDeg = sceneNumber(raw?.headingDeg, 'headingDeg');
  const hazardKey = sceneId(raw?.geofenceHazard, 'geofenceHazard');
  const bandId = sceneId(raw?.geofenceBand, 'geofenceBand');
  // Metade de uma posição ou de uma faixa é erro do cliente, não amostra sem posição: falha alto em vez de gravar null.
  if ((x === null) !== (z === null)) throw new Error(`sompo_telemetry_position_invalid:${x === null ? 'posX' : 'posZ'}`);
  if (headingDeg !== null && (x === null || Math.abs(headingDeg) > 360)) throw new Error('sompo_telemetry_position_invalid:headingDeg');
  if ((hazardKey === null) !== (bandId === null)) throw new Error(`sompo_telemetry_position_invalid:${hazardKey === null ? 'geofenceHazard' : 'geofenceBand'}`);
  return {
    position: x !== null ? { x, z, headingDeg } : null,
    geofence: hazardKey !== null ? { nearest: { hazardKey, bandId } } : null,
  };
}

function snapshotToRow(snapshot, observedMs) {
  const readings = snapshot.readings || {};
  const acceleration = readings.acceleration || {};
  const rotation = readings.rotation || {};
  const sourceKind = snapshot.source?.kind;
  if (!SOURCE_KINDS.has(sourceKind)) {
    throw new Error('sompo_telemetry_source_kind_invalid');
  }
  return {
    tractorId: String(snapshot.tractorId || '001').trim() || '001',
    sourceKind,
    scenarioLabel: optionalText(snapshot.source?.scenarioLabel),
    deviceTimestamp: finiteNumber(snapshot.deviceTimestamp),
    observedAt: snapshot.observedAt,
    observedMs,
    distancia: finiteNumber(readings.distance),
    temperatura: finiteNumber(readings.temperature),
    umidade: finiteNumber(readings.humidity),
    pitch: finiteNumber(readings.pitch),
    roll: finiteNumber(readings.roll),
    accX: finiteNumber(acceleration.x),
    accY: finiteNumber(acceleration.y),
    accZ: finiteNumber(acceleration.z),
    rotX: finiteNumber(rotation.x),
    rotY: finiteNumber(rotation.y),
    rotZ: finiteNumber(rotation.z),
    riscoColisao: snapshot.risks?.collision ? 1 : 0,
    riscoInclinacao: snapshot.risks?.inclination ? 1 : 0,
    velocidade: finiteNumber(readings.speedKph),
    velocidadeRoda: finiteNumber(readings.wheelSpeedKph),
    // Atômico: posição só com x e z numéricos; faixa só com perigo e faixa em texto (o handler já rejeita o resto na borda).
    ...(isFiniteNumber(snapshot.position?.x) && isFiniteNumber(snapshot.position?.z)
      ? { posX: snapshot.position.x, posZ: snapshot.position.z, headingDeg: isFiniteNumber(snapshot.position.headingDeg) ? snapshot.position.headingDeg : null }
      : { posX: null, posZ: null, headingDeg: null }),
    ...(typeof snapshot.geofence?.nearest?.hazardKey === 'string' && typeof snapshot.geofence?.nearest?.bandId === 'string'
      ? { geofenceHazard: snapshot.geofence.nearest.hazardKey, geofenceBand: snapshot.geofence.nearest.bandId }
      : { geofenceHazard: null, geofenceBand: null }),
  };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function statOf(values) {
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numbers.length === 0) return { min: null, max: null, avg: null };
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const avg = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  return { min, max, avg: roundAvg(avg) };
}

function collectFlagTransitions(samples) {
  const transitions = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous.riscoColisao != null && current.riscoColisao != null && previous.riscoColisao !== current.riscoColisao) {
      transitions.push({
        at: current.observedAt,
        flag: 'riscoColisao',
        from: Boolean(previous.riscoColisao),
        to: Boolean(current.riscoColisao),
        index,
      });
    }
    if (previous.riscoInclinacao != null && current.riscoInclinacao != null && previous.riscoInclinacao !== current.riscoInclinacao) {
      transitions.push({
        at: current.observedAt,
        flag: 'riscoInclinacao',
        from: Boolean(previous.riscoInclinacao),
        to: Boolean(current.riscoInclinacao),
        index,
      });
    }
  }
  return transitions;
}

function pickKeySampleIndices(length, requiredIndices, maxCount = 20) {
  if (length <= maxCount) return Array.from({ length }, (_, index) => index);
  const required = new Set(
    [0, length - 1, ...requiredIndices].filter((index) => Number.isInteger(index) && index >= 0 && index < length),
  );
  const uniform = [];
  for (let step = 0; step < maxCount; step += 1) {
    uniform.push(Math.round((step * (length - 1)) / (maxCount - 1)));
  }
  const merged = [...new Set([...required, ...uniform])].sort((left, right) => left - right);
  if (merged.length <= maxCount) return merged;

  const optional = uniform.filter((index) => !required.has(index));
  const picked = new Set(required);
  const room = maxCount - picked.size;
  if (room > 0 && optional.length > 0) {
    for (let step = 0; step < room; step += 1) {
      const index = optional.length === 1
        ? optional[0]
        : optional[Math.round((step * (optional.length - 1)) / Math.max(room - 1, 1))];
      picked.add(index);
    }
  }

  let indices = [...picked].sort((left, right) => left - right);
  if (indices.length <= maxCount) return indices;

  const middle = indices.filter((index) => index !== 0 && index !== length - 1);
  const middleBudget = maxCount - 2;
  const keepMiddle = [];
  if (middle.length <= middleBudget) {
    keepMiddle.push(...middle);
  } else {
    for (let step = 0; step < middleBudget; step += 1) {
      keepMiddle.push(middle[Math.round((step * (middle.length - 1)) / Math.max(middleBudget - 1, 1))]);
    }
  }
  return [...new Set([0, ...keepMiddle, length - 1])].sort((left, right) => left - right).slice(0, maxCount);
}

function summarizeSamples(samples) {
  if (!Array.isArray(samples)) throw new Error('sompo_telemetry_history_samples_required');
  if (samples.length === 0) {
    const emptyStats = { min: null, max: null, avg: null };
    return {
      count: 0,
      spanMs: 0,
      first: null,
      last: null,
      stats: {
        distancia: emptyStats,
        temperatura: emptyStats,
        umidade: emptyStats,
        pitch: emptyStats,
        roll: emptyStats,
        accMagnitude: emptyStats,
        rotMagnitude: emptyStats,
      },
      flagTransitions: [],
      keySamples: [],
    };
  }

  const transitions = collectFlagTransitions(samples);
  const keyIndices = pickKeySampleIndices(
    samples.length,
    transitions.map((item) => item.index),
  );

  return {
    unknownCollisionCount: samples.filter(sample => sample.riscoColisao == null).length,
    count: samples.length,
    spanMs: Math.max(0, samples.at(-1).observedMs - samples[0].observedMs),
    first: samples[0],
    last: samples.at(-1),
    stats: {
      distancia: statOf(samples.map((sample) => sample.distancia)),
      temperatura: statOf(samples.map((sample) => sample.temperatura)),
      umidade: statOf(samples.map((sample) => sample.umidade)),
      pitch: statOf(samples.map((sample) => sample.pitch)),
      roll: statOf(samples.map((sample) => sample.roll)),
      accMagnitude: statOf(samples.map((sample) => magnitude(sample.accX, sample.accY, sample.accZ))),
      rotMagnitude: statOf(samples.map((sample) => magnitude(sample.rotX, sample.rotY, sample.rotZ))),
    },
    flagTransitions: transitions.map(({ at, flag, from, to }) => ({ at, flag, from, to })),
    keySamples: keyIndices.map((index) => samples[index]),
  };
}

function medianOf(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function episodePhaseSlice(id, samples, startIndex, endIndex) {
  const slice = samples.slice(startIndex, endIndex + 1);
  const originMs = samples[0].observedMs;
  return {
    id,
    label: EPISODE_PHASE_LABELS[id] || id,
    startIndex,
    endIndex,
    sampleCount: slice.length,
    startAt: slice[0].observedAt,
    endAt: slice.at(-1).observedAt,
    startOffsetMs: slice[0].observedMs - originMs,
    endOffsetMs: slice.at(-1).observedMs - originMs,
    durationMs: slice.at(-1).observedMs - slice[0].observedMs,
    riscoColisao: slice.some((sample) => sample.riscoColisao === true) ? true : slice.every((sample) => sample.riscoColisao === false) ? false : null,
    riscoInclinacao: slice.some((sample) => sample.riscoInclinacao === true) ? true : slice.every((sample) => sample.riscoInclinacao === false) ? false : null,
    stats: {
      distancia: statOf(slice.map((sample) => sample.distancia)),
      pitch: statOf(slice.map((sample) => sample.pitch)),
      roll: statOf(slice.map((sample) => sample.roll)),
      accMagnitude: statOf(slice.map((sample) => magnitude(sample.accX, sample.accY, sample.accZ))),
    },
  };
}

/**
 * Resumo de episódio: além do resumo padrão, detecta fases por heurística
 * determinística (impacto = amostra de pico de |aceleração|; fronteiras onde
 * |acc| cruza a metade entre a mediana e o pico) e aplica decimação adaptativa
 * nas amostras-chave (pico e vizinhança sempre presentes, teto de 30).
 */
export function summarizeSompoEpisodeSamples(samples, episode = null) {
  // geofencing (módulo server/geofencing): summary.geofence só existe quando o episódio lembra um cenário com talhão.
  const geofence = summarizeEpisodeGeofence(samples, episode);
  return { ...summarizeEpisodeMotion(samples), ...(geofence ? { geofence } : {}) };
}

function summarizeEpisodeMotion(samples) {
  const base = summarizeSamples(samples);

  // Divergência roda x solo: o smoking gun da aquaplanagem: roda mede
  // rotação, solo mede deslocamento; separados indicam pneu sem contato.
  let wheelDivergence = null;
  if (samples.length > 0) {
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const ground = finiteNumber(sample.velocidade);
      const wheel = finiteNumber(sample.velocidadeRoda);
      if (ground === null || wheel === null || ground < 20) continue;
      const diff = Math.abs(ground - wheel);
      if (diff >= 15 && (wheelDivergence === null || diff > wheelDivergence.diffKph)) {
        wheelDivergence = {
          index,
          at: sample.observedAt,
          offsetMs: sample.observedMs - samples[0].observedMs,
          wheelKph: roundAvg(wheel),
          groundKph: roundAvg(ground),
          diffKph: roundAvg(diff),
        };
      }
    }
  }
  if (samples.length === 0) return { ...base, impact: null, phases: [], wheelDivergence };

  const accSeries = samples.map((sample) => magnitude(sample.accX, sample.accY, sample.accZ));
  let peakIndex = -1;
  for (let index = 0; index < accSeries.length; index += 1) {
    if (accSeries[index] === null) continue;
    if (peakIndex === -1 || accSeries[index] > accSeries[peakIndex]) peakIndex = index;
  }
  if (peakIndex === -1) return { ...base, impact: null, phases: [], wheelDivergence };

  const median = medianOf(accSeries.filter((value) => value !== null));
  const threshold = median + ((accSeries[peakIndex] - median) / 2);
  let impactStart = peakIndex;
  while (impactStart > 0 && accSeries[impactStart - 1] !== null && accSeries[impactStart - 1] >= threshold) {
    impactStart -= 1;
  }
  let impactEnd = peakIndex;
  while (
    impactEnd < samples.length - 1
    && accSeries[impactEnd + 1] !== null
    && accSeries[impactEnd + 1] >= threshold
  ) {
    impactEnd += 1;
  }

  const phases = [];
  if (impactStart > 0) phases.push(episodePhaseSlice('aproximacao', samples, 0, impactStart - 1));
  phases.push(episodePhaseSlice('impacto', samples, impactStart, impactEnd));
  if (impactEnd < samples.length - 1) {
    phases.push(episodePhaseSlice('pos-impacto', samples, impactEnd + 1, samples.length - 1));
  }

  const required = new Set([0, samples.length - 1, peakIndex]);
  if (wheelDivergence) required.add(wheelDivergence.index);
  for (const transition of collectFlagTransitions(samples)) required.add(transition.index);
  for (const phase of phases) {
    required.add(phase.startIndex);
    required.add(phase.endIndex);
  }
  const denseStart = Math.max(0, impactStart - 2);
  const denseEnd = Math.min(samples.length - 1, impactEnd + 2);
  for (let index = denseStart; index <= denseEnd; index += 1) required.add(index);
  const keyIndices = pickKeySampleIndices(
    samples.length,
    [...required],
    SOMPO_TELEMETRY_EPISODE_KEY_SAMPLES_MAX,
  );

  return {
    ...base,
    keySamples: keyIndices.map((index) => samples[index]),
    impact: {
      index: peakIndex,
      at: samples[peakIndex].observedAt,
      offsetMs: samples[peakIndex].observedMs - samples[0].observedMs,
      accMagnitude: roundAvg(accSeries[peakIndex]),
    },
    phases,
    wheelDivergence,
  };
}

function parseFonte(value) {
  const raw = String(value ?? 'firebase').trim().toLowerCase() || 'firebase';
  const sourceKind = FONTE_TO_KIND[raw];
  if (!sourceKind) {
    throw httpError(
      400,
      'sompo_telemetry_history_invalid_fonte',
      'Parâmetro fonte inválido. Use firebase ou simulacao.',
    );
  }
  return sourceKind;
}

function parseJanelaMin(value) {
  if (value === undefined || value === null || value === '') {
    return SOMPO_TELEMETRY_HISTORY_DEFAULT_WINDOW_MIN;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw httpError(
      400,
      'sompo_telemetry_history_invalid_janela',
      'Parâmetro janelaMin inválido. Informe um número de minutos entre 1 e 240.',
    );
  }
  return Math.min(SOMPO_TELEMETRY_HISTORY_MAX_WINDOW_MIN, Math.max(1, Math.round(parsed)));
}

function parseOptionalObservedAt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('sompo_telemetry_timestamp_invalid:observedAt');
  }
  return new Date(parsed).toISOString();
}

function describeNormalizeError(error) {
  const code = String(error?.message || '');
  if (code === 'sompo_telemetry_invalid_payload') return 'payload inválido.';
  if (code === 'sompo_telemetry_empty_payload') return 'payload vazio.';
  if (code.startsWith('sompo_telemetry_timestamp_invalid')) return 'observedAt inválido.';
  if (code.startsWith('sompo_telemetry_position_invalid')) return `${code.split(':')[1]} inválido: posição de cena deve ser número finito e faixa um identificador curto.`;
  return code || 'amostra rejeitada.';
}

function sendHistoryError(res, error, fallbackMessage) {
  if (error?.status === 400) {
    res.status(400).json({
      ok: false,
      error: error.code || 'sompo_telemetry_history_invalid_query',
      message: error.message,
    });
    return;
  }
  console.error('[sompo-telemetry-history]', error);
  res.status(500).json({
    ok: false,
    error: 'sompo_telemetry_history_unavailable',
    message: fallbackMessage,
  });
}

export function createSompoTelemetryHistory({
  dbPath = defaultSompoTelemetryDbPath(),
  framesDir = defaultSompoEpisodeFramesDir(),
  now = Date.now,
} = {}) {
  const resolvedPath = dbPath === ':memory:' ? ':memory:' : path.resolve(dbPath);
  const resolvedFramesDir = path.resolve(framesDir);
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  let db;
  try {
    db = new DatabaseSync(resolvedPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 3000');
    db.exec(`
      CREATE TABLE IF NOT EXISTS sompo_telemetry_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tractor_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        scenario_label TEXT NULL,
        device_timestamp REAL NULL,
        observed_at TEXT NOT NULL,
        observed_ms INTEGER NOT NULL,
        distancia REAL NULL,
        temperatura REAL NULL,
        umidade REAL NULL,
        pitch REAL NULL,
        roll REAL NULL,
        acc_x REAL NULL,
        acc_y REAL NULL,
        acc_z REAL NULL,
        rot_x REAL NULL,
        rot_y REAL NULL,
        rot_z REAL NULL,
        risco_colisao INTEGER NOT NULL DEFAULT 0,
        risco_inclinacao INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS sompo_telemetry_samples_source_observed
        ON sompo_telemetry_samples (source_kind, observed_ms);
    `);
    // Migração idempotente: o banco de produção nasceu sem episode_id.
    const sampleColumns = db.prepare('PRAGMA table_info(sompo_telemetry_samples)').all();
    if (!sampleColumns.some((column) => column.name === 'episode_id')) {
      db.exec('ALTER TABLE sompo_telemetry_samples ADD COLUMN episode_id INTEGER NULL');
    }
    for (const column of ['collision_known', 'inclination_known']) {
      if (!sampleColumns.some((item) => item.name === column)) db.exec(`ALTER TABLE sompo_telemetry_samples ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    }
    for (const column of ['velocidade', 'velocidade_roda']) {
      if (!sampleColumns.some((item) => item.name === column)) db.exec(`ALTER TABLE sompo_telemetry_samples ADD COLUMN ${column} REAL NULL`);
    }
    // Posição de cena e faixa do radar (geofencing): nulas nas amostras antigas e na origem física, que não tem GNSS.
    for (const [column, type] of [['pos_x', 'REAL'], ['pos_z', 'REAL'], ['heading_deg', 'REAL'], ['geofence_hazard', 'TEXT'], ['geofence_band', 'TEXT']]) {
      if (!sampleColumns.some((item) => item.name === column)) db.exec(`ALTER TABLE sompo_telemetry_samples ADD COLUMN ${column} ${type} NULL`);
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS sompo_risk_assessments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tractor_id TEXT NOT NULL, source_kind TEXT NOT NULL, created_at TEXT NOT NULL, evidence_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sompo_telemetry_samples_episode
        ON sompo_telemetry_samples (episode_id);
      CREATE TABLE IF NOT EXISTS sompo_telemetry_episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_id TEXT UNIQUE NOT NULL,
        kind TEXT NOT NULL,
        tractor_id TEXT NULL,
        source_kind TEXT NULL,
        scenario_label TEXT NULL,
        started_at TEXT NOT NULL,
        started_ms INTEGER NOT NULL,
        ended_at TEXT NULL,
        ended_ms INTEGER NULL,
        status TEXT NOT NULL DEFAULT 'recording'
      );
      CREATE TABLE IF NOT EXISTS sompo_telemetry_episode_frames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        fase TEXT NULL,
        label TEXT NULL,
        offset_ms INTEGER NULL,
        mime TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (episode_id, seq)
      );
    `);
    // O episódio lembra o roteiro gravado: é por ele que o servidor resolve o talhão (polígonos e regras) depois.
    const episodeColumns = db.prepare('PRAGMA table_info(sompo_telemetry_episodes)').all();
    for (const column of ['scenario_id', 'outcome_id']) {
      if (!episodeColumns.some((item) => item.name === column)) db.exec(`ALTER TABLE sompo_telemetry_episodes ADD COLUMN ${column} TEXT NULL`);
    }
  } catch (error) {
    rethrowSqlite(error, 'open');
  }

  const insertStatement = db.prepare(`
    INSERT INTO sompo_telemetry_samples (
      tractor_id, source_kind, scenario_label, device_timestamp,
      observed_at, observed_ms,
      distancia, temperatura, umidade, pitch, roll,
      acc_x, acc_y, acc_z, rot_x, rot_y, rot_z,
      risco_colisao, risco_inclinacao, episode_id, collision_known, inclination_known,
      velocidade, velocidade_roda,
      pos_x, pos_z, heading_deg, geofence_hazard, geofence_band
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEpisodeStatement = db.prepare(`
    INSERT INTO sompo_telemetry_episodes (
      public_id, kind, tractor_id, source_kind, scenario_label,
      started_at, started_ms, status, scenario_id, outcome_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'recording', ?, ?)
  `);

  const episodeByPublicIdStatement = db.prepare(`
    SELECT
      id,
      public_id AS publicId,
      kind,
      tractor_id AS tractorId,
      source_kind AS sourceKind,
      scenario_label AS scenarioLabel,
      started_at AS startedAt,
      started_ms AS startedMs,
      ended_at AS endedAt,
      ended_ms AS endedMs,
      status,
      scenario_id AS scenarioId,
      outcome_id AS outcomeId
    FROM sompo_telemetry_episodes
    WHERE public_id = ?
  `);

  const finishEpisodeStatement = db.prepare(`
    UPDATE sompo_telemetry_episodes
    SET status = ?, ended_at = ?, ended_ms = ?
    WHERE id = ? AND status = 'recording'
  `);

  const insertFrameStatement = db.prepare(`
    INSERT INTO sompo_telemetry_episode_frames (
      episode_id, seq, fase, label, offset_ms, mime, byte_size, file_path, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const framesByEpisodeStatement = db.prepare(`
    SELECT
      seq,
      fase,
      label,
      offset_ms AS offsetMs,
      mime,
      byte_size AS byteSize,
      file_path AS filePath
    FROM sompo_telemetry_episode_frames
    WHERE episode_id = ?
    ORDER BY seq ASC
  `);

  const frameByEpisodeSeqStatement = db.prepare(`
    SELECT
      seq,
      fase,
      label,
      offset_ms AS offsetMs,
      mime,
      byte_size AS byteSize,
      file_path AS filePath
    FROM sompo_telemetry_episode_frames
    WHERE episode_id = ? AND seq = ?
  `);

  const sampleSelect = `
    SELECT
      id,
      episode_id AS episodeId,
      tractor_id AS tractorId,
      source_kind AS sourceKind,
      scenario_label AS scenarioLabel,
      device_timestamp AS deviceTimestamp,
      observed_at AS observedAt,
      observed_ms AS observedMs,
      distancia,
      temperatura,
      umidade,
      pitch,
      roll,
      acc_x AS accX,
      acc_y AS accY,
      acc_z AS accZ,
      rot_x AS rotX,
      rot_y AS rotY,
      rot_z AS rotZ,
      risco_colisao AS riscoColisao,
      risco_inclinacao AS riscoInclinacao,
      collision_known AS collisionKnown, inclination_known AS inclinationKnown,
      velocidade,
      velocidade_roda AS velocidadeRoda,
      pos_x AS posX, pos_z AS posZ, heading_deg AS headingDeg,
      geofence_hazard AS geofenceHazard, geofence_band AS geofenceBand
    FROM sompo_telemetry_samples
  `;
  const episodeSamplesStatement = db.prepare(`${sampleSelect} WHERE episode_id = ?
    ORDER BY observed_ms ASC, id ASC
  `);

  const queryStatement = db.prepare(`
    SELECT * FROM (
      ${sampleSelect}
      WHERE source_kind = ? AND tractor_id = ? AND observed_ms >= ?
      ORDER BY observed_ms DESC, id DESC
      LIMIT ?
    ) AS recent
    ORDER BY observedMs ASC, id ASC
  `);
  const exportWindowStatement = db.prepare(`${sampleSelect}
    WHERE source_kind = ? AND tractor_id = ? AND observed_ms >= ? AND observed_ms <= ?
    ORDER BY observed_ms ASC, id ASC LIMIT ?
  `);
  const exportEpisodeStatement = db.prepare(`${sampleSelect}
    WHERE episode_id = ? ORDER BY observed_ms ASC, id ASC LIMIT ?
  `);

  const lastChanged = new Map();
  try {
    const rows = db.prepare(`
      SELECT source_kind AS sourceKind, tractor_id AS tractorId, episode_id AS episodeId, MAX(observed_ms) AS lastMs
      FROM sompo_telemetry_samples
      GROUP BY source_kind, tractor_id, episode_id
    `).all();
    for (const row of rows) {
      lastChanged.set(originKey(row.sourceKind, row.tractorId, row.episodeId), Number(row.lastMs) || 0);
    }
  } catch (error) {
    rethrowSqlite(error, 'loadLastChanged');
  }

  let closed = false;

  function assertOpen() {
    if (closed) throw new Error('sompo_telemetry_history_closed');
  }

  function lookupLastMs(sourceKind, tractorId, pending, episodeId = null) {
    const key = originKey(sourceKind, tractorId, episodeId);
    if (pending?.has(key)) return pending.get(key);
    return lastChanged.get(key) ?? 0;
  }

  function insertSnapshot(snapshot, pending, episodeRowId = null) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('sompo_telemetry_snapshot_required');
    }
    const observedMs = parseTimestampMs(snapshot.observedAt, 'observedAt');
    const changedMs = parseTimestampMs(snapshot.changedAt || snapshot.observedAt, 'changedAt');
    if (observedMs === null || changedMs === null) {
      throw new Error('sompo_telemetry_timestamp_invalid:changedAt');
    }
    const row = snapshotToRow(snapshot, observedMs);
    const lastMs = lookupLastMs(row.sourceKind, row.tractorId, pending, episodeRowId);
    if (changedMs <= lastMs) return false;
    insertStatement.run(
      row.tractorId,
      row.sourceKind,
      row.scenarioLabel,
      row.deviceTimestamp,
      row.observedAt,
      row.observedMs,
      row.distancia,
      row.temperatura,
      row.umidade,
      row.pitch,
      row.roll,
      row.accX,
      row.accY,
      row.accZ,
      row.rotX,
      row.rotY,
      row.rotZ,
      row.riscoColisao,
      row.riscoInclinacao,
      episodeRowId,
      typeof snapshot.risks?.collision === 'boolean' ? 1 : 0,
      typeof snapshot.risks?.inclination === 'boolean' ? 1 : 0,
      row.velocidade,
      row.velocidadeRoda,
      row.posX,
      row.posZ,
      row.headingDeg,
      row.geofenceHazard,
      row.geofenceBand,
    );
    pending.set(originKey(row.sourceKind, row.tractorId, episodeRowId), changedMs);
    return true;
  }

  function commitPending(pending) {
    for (const [key, value] of pending) lastChanged.set(key, value);
  }

  function record(snapshot) {
    assertOpen();
    const pending = new Map();
    try {
      const inserted = insertSnapshot(snapshot, pending);
      commitPending(pending);
      return inserted;
    } catch (error) {
      rethrowSqlite(error, 'record');
    }
  }

  function recordMany(snapshots, { episodeId = null } = {}) {
    assertOpen();
    if (!Array.isArray(snapshots)) throw new Error('sompo_telemetry_samples_required');
    const episode = episodeId === null || episodeId === undefined || episodeId === ''
      ? null
      : resolveRecordingEpisode(episodeId);
    const pending = new Map();
    db.exec('BEGIN IMMEDIATE');
    try {
      let recorded = 0;
      for (const snapshot of snapshots) {
        if (insertSnapshot(snapshot, pending, episode ? episode.id : null)) recorded += 1;
      }
      db.exec('COMMIT');
      commitPending(pending);
      return recorded;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch (rollbackError) {
        console.error('[sompo-telemetry-history] rollback falhou:', rollbackError?.message || rollbackError);
      }
      rethrowSqlite(error, 'recordMany');
    }
  }

  function mapEpisodeRow(row) {
    const startedMs = Number(row.startedMs);
    const endedMs = row.endedMs === null || row.endedMs === undefined ? null : Number(row.endedMs);
    return {
      id: Number(row.id),
      publicId: String(row.publicId),
      kind: String(row.kind),
      tractorId: row.tractorId ?? null,
      sourceKind: row.sourceKind ?? null,
      scenarioLabel: row.scenarioLabel ?? null,
      startedAt: String(row.startedAt),
      startedMs,
      endedAt: row.endedAt ?? null,
      endedMs,
      status: String(row.status),
      durationMs: endedMs === null ? null : Math.max(0, endedMs - startedMs),
      scenarioId: row.scenarioId ?? null,
      outcomeId: row.outcomeId ?? null,
    };
  }

  function findEpisode(publicId) {
    const id = String(publicId ?? '').trim();
    if (!id) {
      throw httpError(400, 'sompo_telemetry_episode_id_required', 'Informe o publicId do episódio.');
    }
    let row;
    try {
      row = episodeByPublicIdStatement.get(id);
    } catch (error) {
      rethrowSqlite(error, 'findEpisode');
    }
    return row ? mapEpisodeRow(row) : null;
  }

  function closeEpisodeRow(episode, status) {
    const endedMs = now();
    try {
      finishEpisodeStatement.run(status, new Date(endedMs).toISOString(), endedMs, episode.id);
    } catch (error) {
      rethrowSqlite(error, 'closeEpisode');
    }
    return findEpisode(episode.publicId);
  }

  // Episódio 'recording' esquecido não fica pendurado: vira 'aborted' na leitura.
  function abortIfStale(episode) {
    if (episode.status !== 'recording') return episode;
    if (now() - episode.startedMs <= SOMPO_TELEMETRY_EPISODE_RECORDING_TIMEOUT_MS) return episode;
    return closeEpisodeRow(episode, 'aborted');
  }

  function resolveRecordingEpisode(publicId) {
    const found = findEpisode(publicId);
    if (!found) {
      throw httpError(400, 'sompo_telemetry_episode_not_found', `Episódio ${String(publicId).trim()} não existe.`);
    }
    const episode = abortIfStale(found);
    if (episode.status !== 'recording') {
      throw httpError(
        400,
        'sompo_telemetry_episode_not_recording',
        `Episódio ${episode.publicId} está '${episode.status}'; só episódios em gravação aceitam amostras.`,
      );
    }
    return episode;
  }

  function startEpisode({ kind, tractorId = '001', sourceKind = 'simulation', scenarioLabel = null, scenarioId = null, outcomeId = null } = {}) {
    assertOpen();
    for (const [name, value] of [['scenarioId', scenarioId], ['outcomeId', outcomeId]]) {
      if (value !== null && value !== undefined && value !== '' && (typeof value !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(value))) {
        throw httpError(400, 'sompo_telemetry_episode_scenario_invalid', `${name} do episódio inválido: use o id do roteiro (letras, números e hífen).`);
      }
    }
    if (!EPISODE_KIND_SET.has(kind)) {
      throw httpError(
        400,
        'sompo_telemetry_episode_kind_invalid',
        `Kind de episódio inválido. Conhecidos: ${SOMPO_TELEMETRY_EPISODE_KINDS.join(', ')}.`,
      );
    }
    if (!SOURCE_KINDS.has(sourceKind)) {
      throw httpError(
        400,
        'sompo_telemetry_episode_source_kind_invalid',
        'sourceKind de episódio inválido. Use firebase ou simulation.',
      );
    }
    const startedMs = now();
    const publicId = randomUUID();
    try {
      insertEpisodeStatement.run(
        publicId,
        kind,
        String(tractorId || '001').trim() || '001',
        sourceKind,
        optionalText(scenarioLabel),
        new Date(startedMs).toISOString(),
        startedMs,
        optionalText(scenarioId),
        optionalText(outcomeId),
      );
    } catch (error) {
      rethrowSqlite(error, 'startEpisode');
    }
    return findEpisode(publicId);
  }

  function requireEpisode(publicId) {
    assertOpen();
    const found = findEpisode(publicId);
    if (!found) {
      throw httpError(404, 'sompo_telemetry_episode_not_found', `Episódio ${String(publicId).trim()} não existe.`);
    }
    return abortIfStale(found);
  }

  function finishEpisode(publicId, { status = 'complete' } = {}) {
    assertOpen();
    if (!EPISODE_FINAL_STATUSES.has(status)) {
      throw httpError(
        400,
        'sompo_telemetry_episode_status_invalid',
        'Status final de episódio inválido. Use complete ou aborted.',
      );
    }
    const episode = requireEpisode(publicId);
    if (episode.status !== 'recording') {
      throw httpError(
        400,
        'sompo_telemetry_episode_not_recording',
        `Episódio ${episode.publicId} já está '${episode.status}'; não pode ser fechado de novo.`,
      );
    }
    return closeEpisodeRow(episode, status);
  }

  function mapFrameRow(episode, row) {
    return {
      seq: Number(row.seq),
      fase: row.fase ?? null,
      label: row.label ?? null,
      offsetMs: finiteNumber(row.offsetMs),
      mimeType: String(row.mime),
      size: Number(row.byteSize),
      url: `/api/sompo/telemetry/episode/${encodeURIComponent(episode.publicId)}/frames/${Number(row.seq)}`,
    };
  }

  function listEpisodeFrameRows(episode) {
    try {
      return framesByEpisodeStatement.all(episode.id);
    } catch (error) {
      rethrowSqlite(error, 'episodeFrames');
    }
  }

  // Frames só entram com o episódio em gravação ou recém-fechado como complete.
  function assertEpisodeAcceptsFrames(episode) {
    if (episode.status === 'recording') return;
    const recentlyComplete = episode.status === 'complete'
      && episode.endedMs !== null
      && now() - episode.endedMs <= SOMPO_TELEMETRY_EPISODE_FRAME_GRACE_MS;
    if (recentlyComplete) return;
    throw httpError(
      400,
      'sompo_telemetry_episode_frames_closed',
      `Episódio ${episode.publicId} está '${episode.status}' e fora da janela de upload; frames só entram durante a gravação ou logo após o finish.`,
    );
  }

  function addEpisodeFrames(publicId, rawFrames) {
    assertOpen();
    const episode = requireEpisode(publicId);
    assertEpisodeAcceptsFrames(episode);
    if (!Array.isArray(rawFrames) || rawFrames.length === 0) {
      throw httpError(400, 'sompo_telemetry_episode_frames_required', 'Envie { frames: [...] } com pelo menos um frame.');
    }
    const existing = listEpisodeFrameRows(episode);
    if (existing.length + rawFrames.length > SOMPO_TELEMETRY_EPISODE_FRAMES_MAX) {
      throw httpError(
        400,
        'sompo_telemetry_episode_frames_limit',
        `Episódio ${episode.publicId} já tem ${existing.length} frame(s); o teto é ${SOMPO_TELEMETRY_EPISODE_FRAMES_MAX} por episódio.`,
      );
    }
    // Valida TODOS antes de gravar qualquer um: rejeição não deixa resto pela metade.
    const parsed = rawFrames.map((raw, index) => parseEpisodeFrame(raw, existing.length + index));
    const dir = path.join(resolvedFramesDir, episode.publicId);
    fs.mkdirSync(dir, { recursive: true });
    const stored = [];
    for (let index = 0; index < parsed.length; index += 1) {
      const frame = parsed[index];
      const seq = existing.length + index + 1;
      const extension = frame.mimeType === 'image/png' ? 'png' : 'jpg';
      const filePath = path.join(dir, `frame-${seq}.${extension}`);
      fs.writeFileSync(filePath, frame.buffer);
      try {
        insertFrameStatement.run(
          episode.id,
          seq,
          frame.fase,
          frame.label,
          frame.offsetMs,
          frame.mimeType,
          frame.buffer.length,
          filePath,
          new Date(now()).toISOString(),
        );
      } catch (error) {
        rethrowSqlite(error, 'addEpisodeFrames');
      }
      stored.push(seq);
    }
    return {
      episode,
      frames: listEpisodeFrameRows(episode).map((row) => mapFrameRow(episode, row)),
      added: stored.length,
    };
  }

  function readEpisodeFrame(publicId, seq) {
    assertOpen();
    const episode = requireEpisode(publicId);
    const seqNumber = Number(seq);
    let row;
    try {
      row = Number.isInteger(seqNumber) && seqNumber > 0
        ? frameByEpisodeSeqStatement.get(episode.id, seqNumber)
        : undefined;
    } catch (error) {
      rethrowSqlite(error, 'readEpisodeFrame');
    }
    if (!row) {
      throw httpError(
        404,
        'sompo_telemetry_episode_frame_not_found',
        `Frame ${String(seq)} não existe no episódio ${episode.publicId}.`,
      );
    }
    let buffer;
    try {
      buffer = fs.readFileSync(row.filePath);
    } catch (error) {
      // Metadado sem arquivo é corrupção real: falha alto, nada de 404 disfarçado.
      throw httpError(
        500,
        'sompo_telemetry_episode_frame_unreadable',
        `Frame ${seqNumber} do episódio ${episode.publicId} está registrado mas o arquivo não pôde ser lido (${error?.code || 'erro de leitura'}).`,
      );
    }
    return { ...mapFrameRow(episode, row), buffer };
  }

  function getEpisode(publicId) {
    const episode = requireEpisode(publicId);
    let samples;
    try {
      samples = episodeSamplesStatement.all(episode.id).map(mapSampleRow);
    } catch (error) {
      rethrowSqlite(error, 'episodeSamples');
    }
    return {
      episode,
      samples,
      summary: summarizeSompoEpisodeSamples(samples, episode),
      frames: listEpisodeFrameRows(episode).map((row) => mapFrameRow(episode, row)),
    };
  }

  function query({
    sourceKind,
    tractorId = '001',
    windowMs = SOMPO_TELEMETRY_HISTORY_DEFAULT_WINDOW_MIN * 60_000,
    limit = SOMPO_TELEMETRY_HISTORY_DEFAULT_LIMIT,
  } = {}) {
    assertOpen();
    if (!SOURCE_KINDS.has(sourceKind)) {
      throw new Error('sompo_telemetry_history_source_kind_required');
    }
    const window = Number(windowMs);
    if (!Number.isFinite(window) || window <= 0) {
      throw new Error('sompo_telemetry_history_window_invalid');
    }
    const cappedLimit = Math.min(
      SOMPO_TELEMETRY_HISTORY_DEFAULT_LIMIT,
      Math.max(1, Math.trunc(Number(limit) || SOMPO_TELEMETRY_HISTORY_DEFAULT_LIMIT)),
    );
    const tractor = String(tractorId || '001').trim() || '001';
    const startMs = now() - window;
    try {
      return queryStatement.all(sourceKind, tractor, startMs, cappedLimit).map(mapSampleRow);
    } catch (error) {
      rethrowSqlite(error, 'query');
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    db.close();
  }

  function exportDataset({ sourceKind, tractorId, windowMin = SOMPO_TELEMETRY_HISTORY_DEFAULT_WINDOW_MIN, episodeId } = {}) {
    assertOpen();
    const endMs = now();
    const episode = episodeId ? requireEpisode(episodeId) : null;
    const kind = sourceKind ?? episode?.sourceKind ?? 'firebase';
    const tractor = String(tractorId ?? episode?.tractorId ?? '001').trim();
    if (!SOURCE_KINDS.has(kind) || !tractor) throw httpError(400, 'sompo_export_invalid_origin', 'Informe uma máquina e origem válidas.');
    if (!Number.isFinite(windowMin) || windowMin < 1 || windowMin > SOMPO_TELEMETRY_HISTORY_MAX_WINDOW_MIN) throw httpError(400, 'sompo_export_invalid_window', 'janelaMin deve estar entre 1 e 240 minutos.');
    if (episode && (episode.sourceKind !== kind || episode.tractorId !== tractor)) throw httpError(400, 'sompo_export_episode_origin_mismatch', 'O episódio não corresponde à máquina/origem selecionadas.');
    const startMs = endMs - windowMin * 60_000;
    let samples;
    try {
      samples = (episode
        ? exportEpisodeStatement.all(episode.id, SOMPO_EXPORT_MAX_SAMPLES + 1)
        : exportWindowStatement.all(kind, tractor, startMs, endMs, SOMPO_EXPORT_MAX_SAMPLES + 1)).map(mapSampleRow);
    } catch (error) {
      rethrowSqlite(error, 'exportDataset');
    }
    if (samples.length > SOMPO_EXPORT_MAX_SAMPLES) throw httpError(413, 'sompo_export_too_large', `A gravação excede ${SOMPO_EXPORT_MAX_SAMPLES} amostras. Exporte uma janela menor; nenhuma amostra foi truncada.`);
    if (!samples.length) throw httpError(400, 'sompo_export_empty', 'Nenhuma amostra registrada para a máquina/origem neste período. Amplie a janela ou inicie a telemetria.');
    const dataset = {
      schemaVersion: 'sompo-telemetry-v1', sourceKind: kind, tractorId: tractor,
      synthetic: kind === 'simulation', timestampBasis: kind === 'firebase' ? 'server_received' : 'simulator_observed',
      description: 'Histórico normalizado do servidor SOMPO; não é payload bruto do firmware. Unidades físicas seguem a convenção SOMPO; IMU preservada na unidade de origem.',
      exportedAt: new Date(endMs).toISOString(),
      window: episode ? { startAt: episode.startedAt, endAt: episode.endedAt ?? new Date(endMs).toISOString(), episodeId: episode.publicId }
        : { startAt: new Date(startMs).toISOString(), endAt: new Date(endMs).toISOString(), windowMin },
      count: samples.length, samples,
      ...(episode ? { episode } : {}),
    };
    if (Buffer.byteLength(JSON.stringify(dataset)) > SOMPO_EXPORT_MAX_JSON_BYTES) throw httpError(413, 'sompo_export_too_large', 'O dataset excede 8 MiB. Exporte uma janela menor; nenhuma amostra foi truncada.');
    return dataset;
  }

  return {
    saveAssessment(userId, evidence) {
      const id = randomUUID();
      const result = { ...evidence, id, createdAt: new Date(now()).toISOString() };
      db.prepare('INSERT INTO sompo_risk_assessments VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, evidence.snapshot.tractorId, evidence.snapshot.source.kind, result.createdAt, JSON.stringify(result));
      return result;
    },
    listAssessments(userId, tractorId, sourceKind) {
      return db.prepare('SELECT evidence_json FROM sompo_risk_assessments WHERE user_id = ? AND tractor_id = ? AND source_kind = ? ORDER BY created_at DESC LIMIT 20').all(userId, tractorId, sourceKind).map(row => JSON.parse(row.evidence_json));
    },
    record,
    recordMany,
    query,
    exportDataset,
    summarize: summarizeSamples,
    summarizeEpisode: summarizeSompoEpisodeSamples,
    startEpisode,
    finishEpisode,
    getEpisode,
    addEpisodeFrames,
    readEpisodeFrame,
    close,
    dbPath: resolvedPath,
    framesDir: resolvedFramesDir,
  };
}

export function createSompoTelemetryHistoryHttpHandler(history) {
  return async function sompoTelemetryHistoryHttpHandler(req, res) {
    try {
      const sourceKind = parseFonte(req.query?.fonte);
      const windowMin = parseJanelaMin(req.query?.janelaMin);
      const tractorId = String(req.query?.trator || '001').trim() || '001';
      const samples = history.query({
        sourceKind,
        tractorId,
        windowMs: windowMin * 60_000,
      });
      res.json({
        ok: true,
        samples,
        summary: history.summarize(samples),
        windowMin,
      });
    } catch (error) {
      sendHistoryError(res, error, 'Não foi possível ler o histórico de telemetria.');
    }
  };
}

export function createSompoTelemetryExportHttpHandler(history) {
  return async function sompoTelemetryExportHttpHandler(req, res) {
    try {
      const format = req.query?.format ?? 'json';
      if (!['json', 'csv'].includes(format)) throw httpError(400, 'sompo_export_invalid_format', 'Formato inválido. Use format=json ou format=csv.');
      const rawWindow = req.query?.janelaMin;
      if (rawWindow != null && (!Number.isFinite(Number(rawWindow)) || Number(rawWindow) < 1 || Number(rawWindow) > 240)) throw httpError(400, 'sompo_export_invalid_window', 'janelaMin deve estar entre 1 e 240 minutos.');
      const dataset = history.exportDataset({
        sourceKind: req.query?.fonte == null ? undefined : parseFonte(req.query.fonte),
        tractorId: req.query?.trator,
        windowMin: rawWindow == null ? SOMPO_TELEMETRY_HISTORY_DEFAULT_WINDOW_MIN : Number(rawWindow),
        episodeId: req.query?.episodeId,
      });
      res.setHeader('Cache-Control', 'private, no-store');
      if (format === 'csv') {
        const converted = convertSompoDataset(dataset);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${converted.fileName}"`);
        res.send(converted.csv);
      } else {
        const safeId = dataset.tractorId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
        res.setHeader('Content-Disposition', `attachment; filename="sompo-${safeId}-${dataset.sourceKind}.json"`);
        res.json(dataset);
      }
    } catch (error) {
      if ([400, 404, 413].includes(Number(error?.status))) {
        res.status(error.status).json({ ok: false, error: error.code || 'sompo_export_invalid_dataset', message: error.message });
      } else {
        console.error('[sompo-telemetry-export]', error);
        res.status(500).json({ ok: false, error: 'sompo_export_unavailable', message: 'Não foi possível exportar o histórico de telemetria.' });
      }
    }
  };
}

export function createSompoTelemetrySimulationHttpHandler(history, { now = Date.now } = {}) {
  return async function sompoTelemetrySimulationHttpHandler(req, res) {
    try {
      const samples = req.body?.samples;
      if (!Array.isArray(samples)) {
        res.status(400).json({
          ok: false,
          error: 'sompo_telemetry_simulation_invalid_body',
          message: 'Envie um JSON { samples: [...] } com as amostras do simulador.',
        });
        return;
      }
      if (samples.length > SOMPO_TELEMETRY_SIMULATION_MAX_BATCH) {
        res.status(400).json({
          ok: false,
          error: 'sompo_telemetry_simulation_batch_too_large',
          message: `O lote aceita no máximo ${SOMPO_TELEMETRY_SIMULATION_MAX_BATCH} amostras.`,
        });
        return;
      }

      const baseMs = now();
      const snapshots = [];
      for (let index = 0; index < samples.length; index += 1) {
        const raw = samples[index];
        try {
          const observedAt = parseOptionalObservedAt(raw?.observedAt) || new Date(baseMs + index).toISOString();
          const snapshot = { ...normalizeSompoTelemetry(raw, { observedAt }), ...scenePositionFromRaw(raw) };
          snapshot.source = {
            ...snapshot.source,
            kind: 'simulation',
            provider: 'Simulador 3D local',
            path: 'simulation://sompo',
            scenarioLabel: optionalText(raw?.scenarioLabel) || undefined,
          };
          snapshots.push(snapshot);
        } catch (error) {
          res.status(400).json({
            ok: false,
            error: 'sompo_telemetry_simulation_invalid_item',
            message: `Amostra ${index + 1}: ${describeNormalizeError(error)}`,
            index,
          });
          return;
        }
      }

      const rawEpisodeId = req.body?.episodeId;
      const episodeId = rawEpisodeId === undefined || rawEpisodeId === null || rawEpisodeId === ''
        ? null
        : String(rawEpisodeId).trim();
      const recorded = history.recordMany(snapshots, episodeId ? { episodeId } : {});
      res.json({ ok: true, recorded, ...(episodeId ? { episodeId } : {}) });
    } catch (error) {
      sendHistoryError(res, error, 'Não foi possível gravar o histórico simulado.');
    }
  };
}

function sendEpisodeError(res, error, fallbackMessage) {
  const status = Number(error?.status);
  if (status === 400 || status === 404) {
    res.status(status).json({
      ok: false,
      error: error.code || 'sompo_telemetry_episode_invalid',
      message: error.message,
    });
    return;
  }
  console.error('[sompo-telemetry-history]', error);
  res.status(500).json({
    ok: false,
    error: 'sompo_telemetry_episode_unavailable',
    message: fallbackMessage,
  });
}

export function createSompoTelemetryEpisodeStartHttpHandler(history) {
  return async function sompoTelemetryEpisodeStartHttpHandler(req, res) {
    try {
      const body = req.body || {};
      const episode = history.startEpisode({
        kind: body.kind,
        tractorId: body.trator,
        sourceKind: 'simulation',
        scenarioLabel: body.scenarioLabel,
        scenarioId: body.scenarioId,
        outcomeId: body.outcomeId,
      });
      res.json({ ok: true, episode });
    } catch (error) {
      sendEpisodeError(res, error, 'Não foi possível abrir o episódio de telemetria.');
    }
  };
}

export function createSompoTelemetryEpisodeFinishHttpHandler(history) {
  return async function sompoTelemetryEpisodeFinishHttpHandler(req, res) {
    try {
      const status = req.body?.status === undefined ? 'complete' : req.body.status;
      const finished = history.finishEpisode(req.params?.publicId, { status });
      const { episode, summary } = history.getEpisode(finished.publicId);
      res.json({ ok: true, episode, summary });
    } catch (error) {
      sendEpisodeError(res, error, 'Não foi possível fechar o episódio de telemetria.');
    }
  };
}

export function createSompoTelemetryEpisodeGetHttpHandler(history) {
  return async function sompoTelemetryEpisodeGetHttpHandler(req, res) {
    try {
      const { episode, samples, summary, frames } = history.getEpisode(req.params?.publicId);
      res.json({ ok: true, episode, samples, summary, frames });
    } catch (error) {
      sendEpisodeError(res, error, 'Não foi possível ler o episódio de telemetria.');
    }
  };
}

export function createSompoTelemetryEpisodeFramesHttpHandler(history) {
  return async function sompoTelemetryEpisodeFramesHttpHandler(req, res) {
    try {
      const { episode, frames, added } = history.addEpisodeFrames(req.params?.publicId, req.body?.frames);
      res.json({ ok: true, episode, frames, added });
    } catch (error) {
      sendEpisodeError(res, error, 'Não foi possível gravar os frames do episódio.');
    }
  };
}

/** Leitura do binário no padrão visual-artifacts: Content-Type real + cache privado. */
export function createSompoTelemetryEpisodeFrameGetHttpHandler(history) {
  return async function sompoTelemetryEpisodeFrameGetHttpHandler(req, res) {
    try {
      const frame = history.readEpisodeFrame(req.params?.publicId, req.params?.seq);
      res.setHeader('Content-Type', frame.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Length', String(frame.buffer.length));
      res.send(frame.buffer);
    } catch (error) {
      sendEpisodeError(res, error, 'Não foi possível ler o frame do episódio.');
    }
  };
}
