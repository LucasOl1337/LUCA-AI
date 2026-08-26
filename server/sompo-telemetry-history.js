import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';

export const SOMPO_TELEMETRY_HISTORY_DEFAULT_LIMIT = 2000;
export const SOMPO_TELEMETRY_HISTORY_DEFAULT_WINDOW_MIN = 15;
export const SOMPO_TELEMETRY_HISTORY_MAX_WINDOW_MIN = 240;
export const SOMPO_TELEMETRY_SIMULATION_MAX_BATCH = 50;
export const SOMPO_TELEMETRY_EPISODE_KINDS = Object.freeze(['colisao']);
export const SOMPO_TELEMETRY_EPISODE_RECORDING_TIMEOUT_MS = 10 * 60_000;
export const SOMPO_TELEMETRY_EPISODE_KEY_SAMPLES_MAX = 30;

const SOURCE_KINDS = new Set(['firebase', 'simulation']);
const EPISODE_KIND_SET = new Set(SOMPO_TELEMETRY_EPISODE_KINDS);
const EPISODE_FINAL_STATUSES = new Set(['complete', 'aborted']);
const EPISODE_PHASE_LABELS = Object.freeze({
  aproximacao: 'Aproximação',
  impacto: 'Impacto',
  'pos-impacto': 'Pós-impacto',
});
const FONTE_TO_KIND = Object.freeze({
  firebase: 'firebase',
  simulacao: 'simulation',
});

export function defaultSompoTelemetryDbPath() {
  return path.join(process.env.LUCA_DATA_DIR || '.luca', 'sompo-telemetry.db');
}

function originKey(sourceKind, tractorId) {
  return `${sourceKind}:${tractorId}`;
}

function finiteNumber(value) {
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
    riscoColisao: Boolean(row.riscoColisao),
    riscoInclinacao: Boolean(row.riscoInclinacao),
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
  };
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
    if (Boolean(previous.riscoColisao) !== Boolean(current.riscoColisao)) {
      transitions.push({
        at: current.observedAt,
        flag: 'riscoColisao',
        from: Boolean(previous.riscoColisao),
        to: Boolean(current.riscoColisao),
        index,
      });
    }
    if (Boolean(previous.riscoInclinacao) !== Boolean(current.riscoInclinacao)) {
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
    riscoColisao: slice.some((sample) => Boolean(sample.riscoColisao)),
    riscoInclinacao: slice.some((sample) => Boolean(sample.riscoInclinacao)),
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
export function summarizeSompoEpisodeSamples(samples) {
  const base = summarizeSamples(samples);
  if (samples.length === 0) return { ...base, impact: null, phases: [] };

  const accSeries = samples.map((sample) => magnitude(sample.accX, sample.accY, sample.accZ));
  let peakIndex = -1;
  for (let index = 0; index < accSeries.length; index += 1) {
    if (accSeries[index] === null) continue;
    if (peakIndex === -1 || accSeries[index] > accSeries[peakIndex]) peakIndex = index;
  }
  if (peakIndex === -1) return { ...base, impact: null, phases: [] };

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

export function createSompoTelemetryHistory({ dbPath = defaultSompoTelemetryDbPath(), now = Date.now } = {}) {
  const resolvedPath = dbPath === ':memory:' ? ':memory:' : path.resolve(dbPath);
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
    db.exec(`
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
    `);
  } catch (error) {
    rethrowSqlite(error, 'open');
  }

  const insertStatement = db.prepare(`
    INSERT INTO sompo_telemetry_samples (
      tractor_id, source_kind, scenario_label, device_timestamp,
      observed_at, observed_ms,
      distancia, temperatura, umidade, pitch, roll,
      acc_x, acc_y, acc_z, rot_x, rot_y, rot_z,
      risco_colisao, risco_inclinacao, episode_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEpisodeStatement = db.prepare(`
    INSERT INTO sompo_telemetry_episodes (
      public_id, kind, tractor_id, source_kind, scenario_label,
      started_at, started_ms, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'recording')
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
      status
    FROM sompo_telemetry_episodes
    WHERE public_id = ?
  `);

  const finishEpisodeStatement = db.prepare(`
    UPDATE sompo_telemetry_episodes
    SET status = ?, ended_at = ?, ended_ms = ?
    WHERE id = ? AND status = 'recording'
  `);

  const episodeSamplesStatement = db.prepare(`
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
      risco_inclinacao AS riscoInclinacao
    FROM sompo_telemetry_samples
    WHERE episode_id = ?
    ORDER BY observed_ms ASC, id ASC
  `);

  const queryStatement = db.prepare(`
    SELECT * FROM (
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
        risco_inclinacao AS riscoInclinacao
      FROM sompo_telemetry_samples
      WHERE source_kind = ? AND tractor_id = ? AND observed_ms >= ?
      ORDER BY observed_ms DESC
      LIMIT ?
    ) AS recent
    ORDER BY observedMs ASC
  `);

  const lastChanged = new Map();
  try {
    const rows = db.prepare(`
      SELECT source_kind AS sourceKind, tractor_id AS tractorId, MAX(observed_ms) AS lastMs
      FROM sompo_telemetry_samples
      GROUP BY source_kind, tractor_id
    `).all();
    for (const row of rows) {
      lastChanged.set(originKey(row.sourceKind, row.tractorId), Number(row.lastMs) || 0);
    }
  } catch (error) {
    rethrowSqlite(error, 'loadLastChanged');
  }

  let closed = false;

  function assertOpen() {
    if (closed) throw new Error('sompo_telemetry_history_closed');
  }

  function lookupLastMs(sourceKind, tractorId, pending) {
    const key = originKey(sourceKind, tractorId);
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
    const lastMs = lookupLastMs(row.sourceKind, row.tractorId, pending);
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
    );
    pending.set(originKey(row.sourceKind, row.tractorId), changedMs);
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

  function startEpisode({ kind, tractorId = '001', sourceKind = 'simulation', scenarioLabel = null } = {}) {
    assertOpen();
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

  function getEpisode(publicId) {
    const episode = requireEpisode(publicId);
    let samples;
    try {
      samples = episodeSamplesStatement.all(episode.id).map(mapSampleRow);
    } catch (error) {
      rethrowSqlite(error, 'episodeSamples');
    }
    return { episode, samples, summary: summarizeSompoEpisodeSamples(samples) };
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

  return {
    record,
    recordMany,
    query,
    summarize: summarizeSamples,
    summarizeEpisode: summarizeSompoEpisodeSamples,
    startEpisode,
    finishEpisode,
    getEpisode,
    close,
    dbPath: resolvedPath,
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
          const snapshot = normalizeSompoTelemetry(raw, { observedAt });
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
      const { episode, samples, summary } = history.getEpisode(req.params?.publicId);
      res.json({ ok: true, episode, samples, summary });
    } catch (error) {
      sendEpisodeError(res, error, 'Não foi possível ler o episódio de telemetria.');
    }
  };
}
