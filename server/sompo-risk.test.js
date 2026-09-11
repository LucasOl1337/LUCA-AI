import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { assessSompoRisk, sompoRiskBriefing } from '../shared/sompo-risk.js';
import { currentSompoTelemetry, normalizeSompoTelemetry, buildSompoTelemetryMission, buildSompoEpisodeVisualData } from '../shared/sompo-telemetry.js';
import { sompoEpisodeHeadline } from './visual-stage.js';
import { sompoCollisionSampleOffsets, createSompoSimulationSnapshot } from '../shared/sompo-telemetry-simulator.js';
import { createSompoTelemetryHistory } from './sompo-telemetry-history.js';
import { createSompoTelemetrySource } from './sompo-telemetry-source.js';
import { registerSompoRiskRoutes } from './sompo-risk.js';

const context = { operation: 'campo', region: 'rural', incidents: 0 };
test('academic risk contributions match Python rule and do not replace collision flags', () => {
  const snapshot = createSompoSimulationSnapshot();
  const low = assessSompoRisk(snapshot, context);
  assert.equal(low.score, 12);
  const high = assessSompoRisk({ ...snapshot, readings: { ...snapshot.readings, temperature: 38, humidity: 90 } }, { operation: 'proximidade de agua', region: 'alagada', incidents: 5 });
  assert.equal(high.score, 91);
  assert.equal(high.level, 'Alto');
  assert.equal(high.factors.reduce((n, f) => n + f.contribution, 0), high.score);
  snapshot.risks.collision = true;
  assert.equal(assessSompoRisk(snapshot, context).score, 12);
  assert.match(sompoRiskBriefing(high), /independentemente do score/);
});

test('missing, stale, disconnected and invalid risk inputs never produce zero risk', () => {
  const snapshot = createSompoSimulationSnapshot();
  for (const value of [null, { ...snapshot, freshness: 'stale' }, { ...snapshot, connection: { state: 'reconnecting' } }, { ...snapshot, readings: { ...snapshot.readings, temperature: null } }, { ...snapshot, readings: { ...snapshot.readings, humidity: 101 } }]) assert.equal(assessSompoRisk(value, context).score, null);
  for (const ctx of [{}, { ...context, incidents: -1 }, { ...context, incidents: 0.5 }, { ...context, operation: 'unrecognized' }, { ...context, incidents: null }]) assert.equal(assessSompoRisk(snapshot, ctx).score, null);
});

test('missing sensor readings and flags survive normalization, SQL and reopening', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sompo-null-'));
  const dbPath = path.join(directory, 'test.db');
  let history;
  try {
    const snapshot = normalizeSompoTelemetry({ temperatura: 27, distancia: null, umidade: '', pitch: false, aceleracaoX: null });
    assert.equal(snapshot.readings.distance, null);
    assert.equal(snapshot.readings.humidity, null);
    assert.equal(snapshot.readings.pitch, null);
    assert.equal(snapshot.readings.acceleration.magnitude, null);
    assert.equal(snapshot.risks.collision, null);
    assert.equal(snapshot.status, 'unknown');
    assert.match(buildSompoTelemetryMission(snapshot), /distancia=não informado/);
    history = createSompoTelemetryHistory({ dbPath });
    history.record(snapshot); history.close();
    history = createSompoTelemetryHistory({ dbPath });
    const samples = history.query({ sourceKind: 'firebase', tractorId: '001' });
    assert.equal(samples[0].distancia, null);
    assert.equal(samples[0].riscoColisao, null);
    assert.equal(history.summarize(samples).stats.distancia.avg, null);
  } finally { history?.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('offline source makes no network request even when read is requested', async () => {
  const source = createSompoTelemetrySource({ enabled: false, fetchImpl: () => assert.fail('network requested') });
  source.start(); await assert.rejects(source.read(), /disabled/); source.stop();
});

test('browser age guard expires a frozen physical snapshot without changing simulation', () => {
  const sim = createSompoSimulationSnapshot();
  const physical = { ...sim, source: { ...sim.source, kind: 'firebase' }, changedAt: '2026-09-06T00:00:00Z' };
  const now = Date.parse(physical.changedAt);
  assert.equal(currentSompoTelemetry(physical, now + 14999).freshness, 'fresh');
  assert.equal(currentSompoTelemetry(physical, now + 15000).freshness, 'stale');
  assert.equal(assessSompoRisk(currentSompoTelemetry(physical, now + 15000), context).score, null);
  assert.equal(currentSompoTelemetry(sim, now + 60000), sim);
});

test('episode visual evidence preserves missing vectors and does not claim absent alert never fired', () => {
  const data = buildSompoEpisodeVisualData({
    first: { observedMs: 0, riscoColisao: null }, unknownCollisionCount: 2,
    impact: { offsetMs: 1000, accMagnitude: 12 }, spanMs: 1000,
    keySamples: [0, 1000].map(observedMs => ({ observedMs, distancia: null, accX: null, accY: null, accZ: null })),
  });
  assert.deepEqual(data.serie, [[0, null, null], [1000, null, null]]);
  assert.equal(sompoEpisodeHeadline(data), 'Flags incompletas: disparo do alerta não confirmado');
});

test('HTTP risk evaluation recomputes inputs, persists, isolates accounts and rejects stale physical telemetry', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sompo-risk-http-'));
  const dbPath = path.join(directory, 'test.db');
  let history = createSompoTelemetryHistory({ dbPath });
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.auth = { user: { id: req.headers['x-test-user'] || 'a' } }; next(); });
  registerSompoRiskRoutes(app, { saveAssessment: (...args) => history.saveAssessment(...args), listAssessments: (...args) => history.listAssessments(...args) }, { read: async () => ({ ...createSompoSimulationSnapshot(), freshness: 'stale' }) });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => { server.close(); history.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/sompo/risk`;
  const post = body => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const response = await post({ sourceKind: 'simulation', raw: { trator: 'SIM-001', temperatura: 27, umidade: 48 }, context, score: 100 });
  assert.equal(response.status, 201);
  const { evidence } = await response.json();
  assert.equal(evidence.assessment.score, 12);
  assert.equal(evidence.coverage, 'pending_no_policy');
  history.close(); history = createSompoTelemetryHistory({ dbPath });
  const list = await (await fetch(`${base}?trator=SIM-001&fonte=simulacao`)).json();
  assert.deepEqual(list.assessments[0], evidence);
  assert.equal((await (await fetch(`${base}?trator=SIM-001&fonte=simulacao`, { headers: { 'x-test-user': 'b' } })).json()).assessments.length, 0);
  assert.equal((await post({ sourceKind: 'firebase', context })).status, 422);
  assert.equal((await post({ sourceKind: 'simulation', raw: { temperatura: 27 }, context })).status, 422);
  assert.equal((await post({ sourceKind: 'other', context })).status, 400);
});

test('delayed script ticks retain every scheduled sample including the final point', () => {
  const offsets = [];
  for (const elapsed of [50, 790, 2300, 16000, 25000]) offsets.push(...sompoCollisionSampleOffsets(offsets.at(-1) ?? -Infinity, elapsed));
  assert.deepEqual(offsets, Array.from({ length: 45 }, (_, index) => index * 500));
});

test('independent episodes retain identical timestamps and deduplicate only within each episode after reopening', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sompo-overlap-'));
  const dbPath = path.join(directory, 'test.db');
  let history = createSompoTelemetryHistory({ dbPath });
  try {
    const first = history.startEpisode({ kind: 'colisao', tractorId: 'SIM-001' });
    const second = history.startEpisode({ kind: 'colisao', tractorId: 'SIM-001' });
    const sample = createSompoSimulationSnapshot();
    assert.equal(history.recordMany([sample], { episodeId: first.publicId }), 1);
    assert.equal(history.recordMany([sample], { episodeId: second.publicId }), 1);
    history.close(); history = createSompoTelemetryHistory({ dbPath });
    assert.equal(history.recordMany([sample], { episodeId: first.publicId }), 0);
    assert.equal(history.getEpisode(first.publicId).samples.length, 1);
    assert.equal(history.getEpisode(second.publicId).samples.length, 1);
  } finally { history.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
