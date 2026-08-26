import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';

export const SOMPO_TELEMETRY_HISTORY_DEFAULT_LIMIT = 2000;
export const SOMPO_TELEMETRY_HISTORY_DEFAULT_WINDOW_MIN = 15;
export const SOMPO_TELEMETRY_HISTORY_MAX_WINDOW_MIN = 240;
export const SOMPO_TELEMETRY_SIMULATION_MAX_BATCH = 50;

const SOURCE_KINDS = new Set(['firebase', 'simulation']);
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
  return String(error?.message || '').startsWith('sompo_telemetry_') || Number(error?.status) === 400;
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
  } catch (error) {
    rethrowSqlite(error, 'open');
  }

  const insertStatement = db.prepare(`
    INSERT INTO sompo_telemetry_samples (
      tractor_id, source_kind, scenario_label, device_timestamp,
      observed_at, observed_ms,
      distancia, temperatura, umidade, pitch, roll,
      acc_x, acc_y, acc_z, rot_x, rot_y, rot_z,
      risco_colisao, risco_inclinacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const queryStatement = db.prepare(`
    SELECT * FROM (
      SELECT
        id,
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

  function insertSnapshot(snapshot, pending) {
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

  function recordMany(snapshots) {
    assertOpen();
    if (!Array.isArray(snapshots)) throw new Error('sompo_telemetry_samples_required');
    const pending = new Map();
    db.exec('BEGIN IMMEDIATE');
    try {
      let recorded = 0;
      for (const snapshot of snapshots) {
        if (insertSnapshot(snapshot, pending)) recorded += 1;
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

      const recorded = history.recordMany(snapshots);
      res.json({ ok: true, recorded });
    } catch (error) {
      sendHistoryError(res, error, 'Não foi possível gravar o histórico simulado.');
    }
  };
}
