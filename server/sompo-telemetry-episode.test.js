import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';
import {
  createSompoTelemetryEpisodeFinishHttpHandler,
  createSompoTelemetryEpisodeGetHttpHandler,
  createSompoTelemetryEpisodeStartHttpHandler,
  createSompoTelemetryHistory,
  createSompoTelemetrySimulationHttpHandler,
  SOMPO_TELEMETRY_EPISODE_KEY_SAMPLES_MAX,
  SOMPO_TELEMETRY_EPISODE_RECORDING_TIMEOUT_MS,
  summarizeSompoEpisodeSamples,
} from './sompo-telemetry-history.js';

const BASE_ISO = '2026-08-26T12:00:00.000Z';
const BASE_MS = Date.parse(BASE_ISO);

function tempDb() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sompo-ep-'));
  return {
    directory,
    dbPath: path.join(directory, 'sompo-telemetry.db'),
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
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

function scriptedRaw(index, { acc = 9.8, distancia, collision = false } = {}) {
  return {
    trator: 'SIM-001',
    timestamp: index * 1_000,
    distancia: distancia ?? (210 - (index * 10)),
    temperatura: 27,
    umidade: 48,
    pitch: 1.5,
    roll: 0.5,
    aceleracaoX: 0,
    aceleracaoY: 0,
    aceleracaoZ: acc,
    rotacaoX: 0,
    rotacaoY: 0,
    rotacaoZ: 0,
    riscoColisao: collision,
    riscoInclinacao: false,
  };
}

function simSnapshotAt(raw, iso) {
  const snapshot = normalizeSompoTelemetry(raw, { observedAt: iso });
  snapshot.source = {
    ...snapshot.source,
    kind: 'simulation',
    provider: 'Simulador 3D local',
    path: 'simulation://sompo',
    scenarioLabel: 'Colisão frontal roteirizada',
  };
  return snapshot;
}

/** 20 amostras roteirizadas, 1 s de passo, pico de |acc|=32 no índice 10, flag ligando no impacto. */
function scriptedSnapshots() {
  return Array.from({ length: 20 }, (_, index) => simSnapshotAt(
    scriptedRaw(index, {
      acc: index === 10 ? 32 : 9.8,
      collision: index >= 10,
    }),
    new Date(BASE_MS + (index * 1_000)).toISOString(),
  ));
}

function flatSample(index, { acc = 9.8, collision = false } = {}) {
  const observedMs = BASE_MS + (index * 500);
  return {
    id: index + 1,
    episodeId: 1,
    tractorId: 'SIM-001',
    sourceKind: 'simulation',
    scenarioLabel: null,
    deviceTimestamp: index * 500,
    observedAt: new Date(observedMs).toISOString(),
    observedMs,
    distancia: 200 - index,
    temperatura: 27,
    umidade: 48,
    pitch: 1.5,
    roll: 0.5,
    accX: 0,
    accY: 0,
    accZ: acc,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    riscoColisao: collision,
    riscoInclinacao: false,
  };
}

test('episódio: start → recordMany → finish → getEpisode com fases, pico e vínculo das amostras', (t) => {
  const { dbPath, cleanup } = tempDb();
  let clock = BASE_MS;
  const history = createSompoTelemetryHistory({ dbPath, now: () => clock });
  t.after(() => {
    history.close();
    cleanup();
  });

  const episode = history.startEpisode({
    kind: 'colisao',
    tractorId: 'SIM-001',
    sourceKind: 'simulation',
    scenarioLabel: 'Colisão frontal roteirizada',
  });
  assert.ok(episode.publicId.length > 0);
  assert.equal(episode.kind, 'colisao');
  assert.equal(episode.status, 'recording');
  assert.equal(episode.startedAt, BASE_ISO);

  assert.equal(history.recordMany(scriptedSnapshots(), { episodeId: episode.publicId }), 20);
  // amostra fora do episódio não entra no caso isolado
  assert.equal(history.recordMany([
    simSnapshotAt(scriptedRaw(30, {}), new Date(BASE_MS + 30_000).toISOString()),
  ]), 1);

  clock = BASE_MS + 25_000;
  const finished = history.finishEpisode(episode.publicId, { status: 'complete' });
  assert.equal(finished.status, 'complete');
  assert.equal(finished.durationMs, 25_000);
  assert.ok(finished.endedAt);

  const detail = history.getEpisode(episode.publicId);
  assert.equal(detail.episode.status, 'complete');
  assert.equal(detail.samples.length, 20);
  assert.ok(detail.samples.every((sample) => sample.episodeId === detail.episode.id));
  for (let index = 1; index < detail.samples.length; index += 1) {
    assert.ok(detail.samples[index - 1].observedMs <= detail.samples[index].observedMs);
  }

  const summary = detail.summary;
  assert.equal(summary.count, 20);
  assert.equal(summary.impact.index, 10);
  assert.equal(summary.impact.offsetMs, 10_000);
  assert.equal(summary.impact.accMagnitude, 32);
  assert.deepEqual(summary.phases.map((phase) => phase.id), ['aproximacao', 'impacto', 'pos-impacto']);
  const [approach, impact, post] = summary.phases;
  assert.equal(approach.startIndex, 0);
  assert.equal(impact.startIndex, 10);
  assert.equal(impact.endIndex, 10);
  assert.equal(post.endIndex, 19);
  assert.equal(approach.endIndex + 1, impact.startIndex);
  assert.equal(impact.endIndex + 1, post.startIndex);
  assert.equal(impact.riscoColisao, true);
  assert.equal(approach.riscoColisao, false);
  assert.equal(approach.stats.distancia.max, 210);
  assert.equal(post.stats.distancia.min, 20);
  assert.ok(summary.keySamples.length <= SOMPO_TELEMETRY_EPISODE_KEY_SAMPLES_MAX);
  assert.equal(summary.keySamples[0].id, detail.samples[0].id);
  assert.equal(summary.keySamples.at(-1).id, detail.samples.at(-1).id);
  assert.ok(summary.keySamples.some((sample) => sample.id === detail.samples[10].id));
});

test('episódio valida kind, rejeita finish duplicado e amostras fora de gravação', (t) => {
  const { dbPath, cleanup } = tempDb();
  const history = createSompoTelemetryHistory({ dbPath, now: () => BASE_MS });
  t.after(() => {
    history.close();
    cleanup();
  });

  assert.throws(
    () => history.startEpisode({ kind: 'derrapagem' }),
    (error) => error.status === 400 && error.code === 'sompo_telemetry_episode_kind_invalid',
  );

  const episode = history.startEpisode({ kind: 'colisao' });
  history.finishEpisode(episode.publicId);
  assert.throws(
    () => history.finishEpisode(episode.publicId),
    (error) => error.status === 400 && error.code === 'sompo_telemetry_episode_not_recording',
  );
  assert.throws(
    () => history.recordMany(scriptedSnapshots(), { episodeId: episode.publicId }),
    (error) => error.status === 400 && error.code === 'sompo_telemetry_episode_not_recording',
  );
  assert.throws(
    () => history.recordMany(scriptedSnapshots(), { episodeId: 'nao-existe' }),
    (error) => error.status === 400 && error.code === 'sompo_telemetry_episode_not_found',
  );
  assert.throws(
    () => history.getEpisode('nao-existe'),
    (error) => error.status === 404 && error.code === 'sompo_telemetry_episode_not_found',
  );
});

test('migração idempotente: DB pré-existente sem episode_id ganha a coluna e preserva os dados', (t) => {
  const { dbPath, cleanup } = tempDb();
  t.after(() => cleanup());

  // Esquema do commit 07dc535 — sem episode_id e sem tabela de episódios.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE sompo_telemetry_samples (
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
    CREATE INDEX sompo_telemetry_samples_source_observed
      ON sompo_telemetry_samples (source_kind, observed_ms);
  `);
  legacy.prepare(`
    INSERT INTO sompo_telemetry_samples (
      tractor_id, source_kind, scenario_label, device_timestamp, observed_at, observed_ms,
      distancia, temperatura, umidade, pitch, roll,
      acc_x, acc_y, acc_z, rot_x, rot_y, rot_z, risco_colisao, risco_inclinacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('001', 'firebase', null, 1000, BASE_ISO, BASE_MS, 70.66, 28.6, 37, 0.06, -0.54, 10.01, -0.08, 0.61, -0.04, -0.03, -0.02, 1, 0);
  legacy.close();

  const history = createSompoTelemetryHistory({ dbPath, now: () => BASE_MS + 60_000 });
  const inspect = new DatabaseSync(dbPath);
  const columns = inspect.prepare('PRAGMA table_info(sompo_telemetry_samples)').all();
  inspect.close();
  assert.ok(columns.some((column) => column.name === 'episode_id'), 'coluna episode_id migrada');

  const preserved = history.query({ sourceKind: 'firebase', tractorId: '001', windowMs: 5 * 60_000 });
  assert.equal(preserved.length, 1);
  assert.equal(preserved[0].distancia, 70.66);
  assert.equal(preserved[0].episodeId, null);

  const episode = history.startEpisode({ kind: 'colisao' });
  assert.equal(history.recordMany([
    simSnapshotAt(scriptedRaw(0, {}), new Date(BASE_MS + 61_000).toISOString()),
  ], { episodeId: episode.publicId }), 1);
  assert.equal(history.getEpisode(episode.publicId).samples.length, 1);
  history.close();

  // Reabrir é idempotente: nada quebra nem duplica coluna.
  const reopened = createSompoTelemetryHistory({ dbPath, now: () => BASE_MS + 120_000 });
  const recheck = new DatabaseSync(dbPath);
  const again = recheck.prepare('PRAGMA table_info(sompo_telemetry_samples)').all();
  recheck.close();
  assert.equal(again.filter((column) => column.name === 'episode_id').length, 1);
  reopened.close();
});

test('episódio recording esquecido há mais de 10 min vira aborted na leitura', (t) => {
  const { dbPath, cleanup } = tempDb();
  let clock = BASE_MS;
  const history = createSompoTelemetryHistory({ dbPath, now: () => clock });
  t.after(() => {
    history.close();
    cleanup();
  });

  const episode = history.startEpisode({ kind: 'colisao' });
  clock = BASE_MS + SOMPO_TELEMETRY_EPISODE_RECORDING_TIMEOUT_MS + 1_000;
  const detail = history.getEpisode(episode.publicId);
  assert.equal(detail.episode.status, 'aborted');
  assert.ok(detail.episode.endedAt);
  assert.throws(
    () => history.recordMany(scriptedSnapshots(), { episodeId: episode.publicId }),
    (error) => error.code === 'sompo_telemetry_episode_not_recording',
  );
});

test('decimação adaptativa: série longa respeita o teto 30 e densifica ao redor do pico', () => {
  const samples = Array.from({ length: 80 }, (_, index) => flatSample(index, {
    acc: index === 40 ? 32 : (index === 39 || index === 41 ? 20 : 9.8),
    collision: index >= 40,
  }));
  const summary = summarizeSompoEpisodeSamples(samples);
  assert.equal(summary.impact.index, 40);
  assert.ok(summary.keySamples.length <= SOMPO_TELEMETRY_EPISODE_KEY_SAMPLES_MAX);
  const keyIds = new Set(summary.keySamples.map((sample) => sample.id));
  assert.ok(keyIds.has(samples[0].id), 'primeira presente');
  assert.ok(keyIds.has(samples.at(-1).id), 'última presente');
  for (let index = 38; index <= 42; index += 1) {
    assert.ok(keyIds.has(samples[index].id), `vizinhança do pico (${index}) presente`);
  }
  for (const transition of summary.flagTransitions) {
    assert.ok(
      summary.keySamples.some((sample) => sample.observedAt === transition.at),
      'transição de flag presente nas amostras-chave',
    );
  }
  assert.deepEqual(summarizeSompoEpisodeSamples([]).phases, []);
  assert.equal(summarizeSompoEpisodeSamples([]).impact, null);
});

test('endpoints de episódio: lifecycle 200 e erros 400/404 claros', async (t) => {
  const { dbPath, cleanup } = tempDb();
  let clock = BASE_MS;
  const history = createSompoTelemetryHistory({ dbPath, now: () => clock });
  t.after(() => {
    history.close();
    cleanup();
  });
  const startHandler = createSompoTelemetryEpisodeStartHttpHandler(history);
  const finishHandler = createSompoTelemetryEpisodeFinishHttpHandler(history);
  const getHandler = createSompoTelemetryEpisodeGetHttpHandler(history);
  const simulationHandler = createSompoTelemetrySimulationHttpHandler(history, { now: () => clock });

  const badKind = mockRes();
  await startHandler({ body: { kind: 'derrapagem' } }, badKind);
  assert.equal(badKind.statusCode, 400);
  assert.equal(badKind.body.error, 'sompo_telemetry_episode_kind_invalid');

  const started = mockRes();
  await startHandler({ body: { kind: 'colisao', trator: 'SIM-001', scenarioLabel: 'Colisão frontal roteirizada' } }, started);
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.ok, true);
  const publicId = started.body.episode.publicId;
  assert.ok(publicId);

  const badEpisodeBatch = mockRes();
  await simulationHandler({
    body: { samples: [scriptedRaw(0, {})], episodeId: 'nao-existe' },
  }, badEpisodeBatch);
  assert.equal(badEpisodeBatch.statusCode, 400);
  assert.equal(badEpisodeBatch.body.error, 'sompo_telemetry_episode_not_found');

  const batch = mockRes();
  await simulationHandler({
    body: {
      samples: Array.from({ length: 20 }, (_, index) => ({
        ...scriptedRaw(index, { acc: index === 10 ? 32 : 9.8, collision: index >= 10 }),
        observedAt: new Date(BASE_MS + (index * 1_000)).toISOString(),
      })),
      episodeId: publicId,
    },
  }, batch);
  assert.equal(batch.statusCode, 200);
  assert.equal(batch.body.recorded, 20);
  assert.equal(batch.body.episodeId, publicId);

  clock = BASE_MS + 20_000;
  const finished = mockRes();
  await finishHandler({ params: { publicId }, body: {} }, finished);
  assert.equal(finished.statusCode, 200);
  assert.equal(finished.body.episode.status, 'complete');
  assert.equal(finished.body.summary.count, 20);
  assert.equal(finished.body.summary.impact.index, 10);

  const doubleFinish = mockRes();
  await finishHandler({ params: { publicId }, body: {} }, doubleFinish);
  assert.equal(doubleFinish.statusCode, 400);
  assert.equal(doubleFinish.body.error, 'sompo_telemetry_episode_not_recording');

  const afterFinishBatch = mockRes();
  await simulationHandler({
    body: { samples: [scriptedRaw(0, {})], episodeId: publicId },
  }, afterFinishBatch);
  assert.equal(afterFinishBatch.statusCode, 400);
  assert.equal(afterFinishBatch.body.error, 'sompo_telemetry_episode_not_recording');

  const fetched = mockRes();
  await getHandler({ params: { publicId } }, fetched);
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.body.samples.length, 20);
  assert.deepEqual(fetched.body.summary.phases.map((phase) => phase.id), ['aproximacao', 'impacto', 'pos-impacto']);

  const missing = mockRes();
  await getHandler({ params: { publicId: 'nao-existe' } }, missing);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body.error, 'sompo_telemetry_episode_not_found');
});
