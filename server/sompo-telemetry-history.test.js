import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';
import {
  createSompoTelemetryHistory,
  createSompoTelemetryHistoryHttpHandler,
  createSompoTelemetrySimulationHttpHandler,
  defaultSompoTelemetryDbPath,
  SOMPO_TELEMETRY_SIMULATION_MAX_BATCH,
} from './sompo-telemetry-history.js';

const RAW = {
  aceleracaoX: 10.01,
  aceleracaoY: -0.08,
  aceleracaoZ: 0.61,
  distancia: 70.66,
  pitch: 0.06,
  riscoColisao: true,
  riscoInclinacao: false,
  roll: -0.54,
  rotacaoX: -0.04,
  rotacaoY: -0.03,
  rotacaoZ: -0.02,
  temperatura: 28.6,
  timestamp: 886909,
  trator: '001',
  umidade: 37,
};

function tempDb() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sompo-hist-'));
  return {
    directory,
    dbPath: path.join(directory, 'sompo-telemetry.db'),
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function snapshotAt(raw, iso, extra = {}) {
  const base = normalizeSompoTelemetry(raw, { observedAt: iso });
  return {
    ...base,
    changedAt: iso,
    ...extra,
    source: { ...base.source, ...(extra.source || {}) },
    readings: { ...base.readings, ...(extra.readings || {}) },
    risks: { ...base.risks, ...(extra.risks || {}) },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test('caminho default do DB é global em LUCA_DATA_DIR, não por workspace', () => {
  const previous = process.env.LUCA_DATA_DIR;
  try {
    delete process.env.LUCA_DATA_DIR;
    assert.equal(defaultSompoTelemetryDbPath(), path.join('.luca', 'sompo-telemetry.db'));
    process.env.LUCA_DATA_DIR = path.join('var', 'lib', 'luca-ai');
    assert.equal(defaultSompoTelemetryDbPath(), path.join('var', 'lib', 'luca-ai', 'sompo-telemetry.db'));
  } finally {
    if (previous === undefined) delete process.env.LUCA_DATA_DIR;
    else process.env.LUCA_DATA_DIR = previous;
  }
});

test('grava, ignora reconexão com o mesmo changedAt e consulta a janela em ordem', (t) => {
  const { dbPath, cleanup } = tempDb();
  let clock = Date.parse('2026-08-26T12:00:00.000Z');
  const history = createSompoTelemetryHistory({ dbPath, now: () => clock });
  t.after(() => {
    history.close();
    cleanup();
  });

  const first = snapshotAt(RAW, '2026-08-26T12:00:00.000Z');
  assert.equal(history.record(first), true);
  assert.equal(history.record({ ...first, freshness: 'stale', unchangedForMs: 16_000 }), false);
  assert.equal(history.record({ ...first, connection: { ...first.connection, state: 'reconnecting' } }), false);

  const second = snapshotAt({ ...RAW, distancia: 41.25, timestamp: 887010, riscoColisao: false }, '2026-08-26T12:00:03.000Z');
  assert.equal(history.record(second), true);

  const samples = history.query({
    sourceKind: 'firebase',
    tractorId: '001',
    windowMs: 15 * 60_000,
  });
  assert.equal(samples.length, 2);
  assert.equal(samples[0].distancia, 70.66);
  assert.equal(samples[1].distancia, 41.25);
  assert.equal(samples[0].riscoColisao, true);
  assert.equal(samples[1].riscoColisao, false);
  assert.ok(samples[0].observedMs < samples[1].observedMs);
});

test('query respeita a janela temporal e o limite, mais recente primeiro depois cronológico', (t) => {
  const { dbPath, cleanup } = tempDb();
  let clock = Date.parse('2026-08-26T12:20:00.000Z');
  const history = createSompoTelemetryHistory({ dbPath, now: () => clock });
  t.after(() => {
    history.close();
    cleanup();
  });

  history.record(snapshotAt(RAW, '2026-08-26T12:00:00.000Z'));
  history.record(snapshotAt({ ...RAW, distancia: 60 }, '2026-08-26T12:10:00.000Z'));
  history.record(snapshotAt({ ...RAW, distancia: 50 }, '2026-08-26T12:18:00.000Z'));
  history.record(snapshotAt({ ...RAW, distancia: 40 }, '2026-08-26T12:19:00.000Z'));

  const windowed = history.query({
    sourceKind: 'firebase',
    tractorId: '001',
    windowMs: 5 * 60_000,
  });
  assert.deepEqual(windowed.map((sample) => sample.distancia), [50, 40]);

  const limited = history.query({
    sourceKind: 'firebase',
    tractorId: '001',
    windowMs: 30 * 60_000,
    limit: 2,
  });
  assert.deepEqual(limited.map((sample) => sample.distancia), [50, 40]);
});

test('summarize calcula agregados, transições de flag e keySamples com extremos', (t) => {
  const { dbPath, cleanup } = tempDb();
  const history = createSompoTelemetryHistory({ dbPath, now: () => Date.parse('2026-08-26T12:05:00.000Z') });
  t.after(() => {
    history.close();
    cleanup();
  });

  for (let index = 0; index < 25; index += 1) {
    const iso = new Date(Date.parse('2026-08-26T12:00:00.000Z') + (index * 1000)).toISOString();
    const collision = index === 10;
    const inclination = index >= 18;
    history.record(snapshotAt({
      ...RAW,
      distancia: 50 + index,
      pitch: index * 0.1,
      riscoColisao: collision,
      riscoInclinacao: inclination,
      timestamp: 1000 + index,
    }, iso));
  }

  const samples = history.query({ sourceKind: 'firebase', tractorId: '001', windowMs: 15 * 60_000 });
  const summary = history.summarize(samples);
  assert.equal(summary.count, 25);
  assert.equal(summary.spanMs, 24_000);
  assert.equal(summary.first.distancia, 50);
  assert.equal(summary.last.distancia, 74);
  assert.equal(summary.stats.distancia.min, 50);
  assert.equal(summary.stats.distancia.max, 74);
  assert.equal(summary.stats.distancia.avg, 62);
  assert.ok(summary.stats.accMagnitude.avg > 0);
  assert.ok(summary.flagTransitions.some((item) => item.flag === 'riscoColisao' && item.from === false && item.to === true));
  assert.ok(summary.flagTransitions.some((item) => item.flag === 'riscoColisao' && item.from === true && item.to === false));
  assert.ok(summary.flagTransitions.some((item) => item.flag === 'riscoInclinacao' && item.to === true));
  assert.ok(summary.keySamples.length <= 20);
  assert.equal(summary.keySamples[0].id, summary.first.id);
  assert.equal(summary.keySamples.at(-1).id, summary.last.id);
  const keyIds = new Set(summary.keySamples.map((sample) => sample.id));
  for (const transition of summary.flagTransitions) {
    assert.ok(
      summary.keySamples.some((sample) => sample.observedAt === transition.at),
      `transição ${transition.flag} em ${transition.at} deveria estar em keySamples`,
    );
  }
  assert.ok(keyIds.size === summary.keySamples.length);
  assert.deepEqual(history.summarize([]), {
    count: 0,
    spanMs: 0,
    first: null,
    last: null,
    stats: {
      distancia: { min: null, max: null, avg: null },
      temperatura: { min: null, max: null, avg: null },
      umidade: { min: null, max: null, avg: null },
      pitch: { min: null, max: null, avg: null },
      roll: { min: null, max: null, avg: null },
      accMagnitude: { min: null, max: null, avg: null },
      rotMagnitude: { min: null, max: null, avg: null },
    },
    flagTransitions: [],
    keySamples: [],
  });
});

test('GET /history devolve samples+summary e rejeita fonte inválida', async (t) => {
  const { dbPath, cleanup } = tempDb();
  const history = createSompoTelemetryHistory({
    dbPath,
    now: () => Date.parse('2026-08-26T12:00:10.000Z'),
  });
  t.after(() => {
    history.close();
    cleanup();
  });
  history.record(snapshotAt({ ...RAW, distancia: 33 }, '2026-08-26T12:00:01.000Z', {
    source: { kind: 'simulation', provider: 'Simulador 3D local', path: 'simulation://sompo' },
  }));

  const handler = createSompoTelemetryHistoryHttpHandler(history);
  const ok = mockRes();
  await handler({ query: { fonte: 'simulacao', janelaMin: '15', trator: '001' } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.windowMin, 15);
  assert.equal(ok.body.samples.length, 1);
  assert.equal(ok.body.summary.count, 1);
  assert.equal(ok.body.samples[0].distancia, 33);

  const bad = mockRes();
  await handler({ query: { fonte: 'mqtt' } }, bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.error, 'sompo_telemetry_history_invalid_fonte');

  const fail = mockRes();
  const broken = createSompoTelemetryHistoryHttpHandler({
    query() { throw new Error('disk_full'); },
    summarize() { return {}; },
  });
  await broken({ query: {} }, fail);
  assert.equal(fail.statusCode, 500);
  assert.equal(fail.body.error, 'sompo_telemetry_history_unavailable');
});

test('POST /simulation valida o lote, grava simulation e não persiste item inválido', async (t) => {
  const { dbPath, cleanup } = tempDb();
  let clock = Date.parse('2026-08-26T15:00:00.000Z');
  const history = createSompoTelemetryHistory({ dbPath, now: () => clock });
  t.after(() => {
    history.close();
    cleanup();
  });
  const handler = createSompoTelemetrySimulationHttpHandler(history, { now: () => clock });

  const ok = mockRes();
  await handler({
    body: {
      samples: [
        { ...RAW, distancia: 80, timestamp: 1, scenarioLabel: 'Obstáculo frontal', observedAt: '2026-08-26T15:00:00.000Z' },
        { ...RAW, distancia: 40, timestamp: 2, riscoColisao: true, observedAt: '2026-08-26T15:00:02.000Z' },
        { ...RAW, distancia: 20, timestamp: 3, observedAt: '2026-08-26T15:00:04.000Z' },
      ],
    },
  }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.recorded, 3);

  const stored = history.query({ sourceKind: 'simulation', tractorId: '001', windowMs: 15 * 60_000 });
  assert.equal(stored.length, 3);
  assert.equal(stored[0].sourceKind, 'simulation');
  assert.equal(stored[0].scenarioLabel, 'Obstáculo frontal');
  assert.equal(stored[1].riscoColisao, true);

  const invalid = mockRes();
  await handler({
    body: {
      samples: [
        { ...RAW, distancia: 99, observedAt: '2026-08-26T15:00:10.000Z' },
        { trator: '001' },
      ],
    },
  }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.error, 'sompo_telemetry_simulation_invalid_item');
  assert.equal(invalid.body.index, 1);
  assert.equal(history.query({ sourceKind: 'simulation', tractorId: '001', windowMs: 15 * 60_000 }).length, 3);

  const tooBig = mockRes();
  await handler({
    body: { samples: Array.from({ length: SOMPO_TELEMETRY_SIMULATION_MAX_BATCH + 1 }, () => RAW) },
  }, tooBig);
  assert.equal(tooBig.statusCode, 400);
  assert.equal(tooBig.body.error, 'sompo_telemetry_simulation_batch_too_large');

  const missing = mockRes();
  await handler({ body: {} }, missing);
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.body.error, 'sompo_telemetry_simulation_invalid_body');
});
