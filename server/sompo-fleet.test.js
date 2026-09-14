import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import express from 'express';
import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';
import { createSompoTelemetryHistory, createSompoTelemetryFleetHttpHandler } from './sompo-telemetry-history.js';
import { buildSompoFleetDemo, SOMPO_FLEET_DEMO_LABEL } from '../shared/sompo-fleet-demo.js';
import { getSompoAgriEpisodePlan } from '../shared/sompo-agri-brief.js';
import { getSompoEpisodePlan } from '../shared/sompo-telemetry-simulator.js';

const start = Date.parse('2026-01-01T10:00:00Z');
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-fleet-'));
  let clock = start;
  const history = createSompoTelemetryHistory({ dbPath: path.join(dir, 'telemetry.db'), framesDir: path.join(dir, 'frames'), now: () => clock });
  t.after(() => { history.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { history, setClock: value => { clock = value; } };
}
function sample(ms, { tractorId = '001', sourceKind = 'firebase', collision = false, inclination = false, accX = 3, accY = 4, accZ = 0, roll = -12 } = {}) {
  const observedAt = new Date(ms).toISOString();
  const snapshot = normalizeSompoTelemetry({ trator: tractorId, timestamp: ms, distancia: 100, temperatura: 25, umidade: 40, pitch: 5, roll, aceleracaoX: accX, aceleracaoY: accY, aceleracaoZ: accZ, riscoColisao: collision, riscoInclinacao: inclination }, { observedAt });
  return { ...snapshot, changedAt: observedAt, risks: { collision, inclination }, source: { ...snapshot.source, kind: sourceKind } };
}

test('fleet separates origins/machines/journeys and counts continuous alerts once', t => {
  const { history } = setup(t);
  for (const [offset, flag] of [[0, false], [5000, true], [10000, true], [15000, false]]) history.record(sample(start + offset, { collision: flag }));
  history.record(sample(start + 35_000, { inclination: true })); // inside journey, outside observed cadence
  history.record(sample(start + 636_000, { inclination: true })); // new journey
  history.record(sample(start, { sourceKind: 'simulation' }));
  history.record(sample(start, { tractorId: '002' }));
  const data = history.fleet();
  const physical = data.origins.find(o => o.sourceKind === 'firebase').machines;
  const machine = physical.find(m => m.tractorId === '001');
  assert.equal(physical.length, 2);
  assert.equal(data.origins.find(o => o.sourceKind === 'simulation').machines.length, 1);
  assert.equal(machine.journeys.length, 2);
  assert.equal(machine.sampleCount, 6);
  assert.equal(machine.durationMs, 35000);
  assert.equal(machine.observedMs, 15000);
  assert.equal(machine.gapMs, 20000);
  assert.deepEqual(machine.alerts.riscoColisao, { count: 1, durationMs: 10000, knownMs: 15000 });
  assert.equal(machine.alerts.riscoInclinacao.count, 2);
  assert.equal(machine.peakAcceleration, 5);
  assert.equal(machine.maxInclination, 12);
  assert.equal(machine.months[0].riscoColisao, 1);
});

test('unknown flags and partial IMU remain unknown, not measured zero', t => {
  const { history } = setup(t);
  history.record(sample(start, { collision: null, inclination: null, accX: null, roll: null }));
  history.record(sample(start + 5000, { collision: true, inclination: null, accX: null, roll: null }));
  const machine = history.fleet().origins[0].machines[0];
  assert.equal(machine.alerts.riscoColisao.count, 1);
  assert.equal(machine.alerts.riscoColisao.knownMs, 0);
  assert.equal(machine.alerts.riscoInclinacao.count, 0);
  assert.equal(machine.peakAcceleration, null);
});

test('aggregation includes old data beyond 2000 rows and exposes no raw samples', t => {
  const { history, setClock } = setup(t);
  const samples = Array.from({ length: 2100 }, (_, i) => sample(start + i * 500));
  history.recordMany(samples);
  setClock(Date.parse('2026-09-01T00:00:00Z'));
  const data = history.fleet();
  assert.equal(data.origins[0].machines[0].sampleCount, 2100);
  assert.equal(data.origins[0].machines[0].journeys.length, 1);
  assert.equal(Object.hasOwn(data, 'samples'), false);
  assert.equal(data.origins[0].machines[0].observedMs, 2099 * 500);
});

test('episode copies are not double-counted and latest completed episode includes peak/phases', t => {
  const { history, setClock } = setup(t);
  const episode = history.startEpisode({ kind: 'roteiro', tractorId: '001', sourceKind: 'firebase', scenarioLabel: 'Curva no campo' });
  history.record(sample(start));
  history.recordMany([sample(start), sample(start + 500, { accX: 8 })], { episodeId: episode.publicId });
  setClock(start + 1000);
  history.finishEpisode(episode.publicId, { status: 'complete' });
  const data = history.fleet();
  assert.equal(data.origins[0].machines[0].sampleCount, 2);
  assert.equal(data.episodes[0].publicId, episode.publicId);
  assert.equal(data.episodes[0].status, 'complete');
  assert.equal(data.episodes[0].sampleCount, 2);
  assert.equal(data.episodes[0].scenarioLabel, 'Curva no campo');
  assert.ok(data.episodes[0].peakAcceleration > 8);
  assert.ok(data.episodes[0].phases.every(p => p.startedAt && p.endedAt));
  assert.equal(Object.hasOwn(data.episodes[0], 'samples'), false);
});

test('fleet HTTP requires authentication and returns the complete aggregation', async t => {
  const { history } = setup(t);
  const app = express();
  app.use((req, _res, next) => { if (req.headers['x-test-user']) req.auth = { user: { id: 'fixture' } }; next(); });
  app.get('/api/sompo/telemetry/fleet', createSompoTelemetryFleetHttpHandler(history));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/sompo/telemetry/fleet`;
  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers: { 'x-test-user': 'fixture' } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.episodes, []);
  assert.deepEqual(payload.origins.map(o => o.sourceKind), ['firebase', 'simulation']);
});

test('demo has 30 deterministic runs on three actual simulator machines across four months', () => {
  const demo = buildSompoFleetDemo();
  assert.deepEqual(demo, buildSompoFleetDemo());
  assert.equal(demo.label, SOMPO_FLEET_DEMO_LABEL);
  assert.equal(demo.synthetic, true);
  assert.equal(demo.machines.length, 3);
  assert.equal(demo.episodes.length, 30);
  assert.equal(new Set(demo.episodes.map(e => e.month)).size, 4);
  assert.equal(demo.machines.reduce((n, m) => n + m.journeys.length, 0), 30);
  for (const e of demo.episodes) {
    const plan = e.scenarioId.startsWith('agri-') ? getSompoAgriEpisodePlan(e.scenarioId, e.outcomeId) : getSompoEpisodePlan(e.scenarioId, e.outcomeId);
    assert.equal(plan.outcomeId, e.outcomeId);
    assert.equal(e.alertDelayMs, e.firstAlertMs === null ? null : e.firstAlertMs - e.peakOffsetMs);
    assert.ok(e.peakAcceleration >= 0);
    assert.equal(e.synthetic, true);
  }
  assert.ok(demo.episodes.some(e => e.prevented));
  assert.ok(demo.episodes.some(e => !e.prevented));
});

const require = createRequire(import.meta.url);
function loadTs(file, imports = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(compiled, { exports, require: id => imports[id] ?? require(id) });
  return exports;
}
test('mission fits runtime limit and JSON attachment keeps origins/episode evidence distinct', t => {
  const { history } = setup(t);
  history.record(sample(start));
  const cases = loadTs('../src/lib/sompo-cases.ts');
  const { buildSompoFleetMission, buildSompoFleetEvidence } = loadTs('../src/lib/sompo-fleet-mission.ts', { './sompo-cases': cases });
  const data = history.fleet(), demo = buildSompoFleetDemo();
  const expanded = { ...data, origins: ['firebase', 'simulation'].map(sourceKind => ({ sourceKind, machines: Array.from({ length: 4 }, (_, i) => ({ ...demo.machines[i % 3], tractorId: `MAQUINA-${i}`, sourceKind })) })) };
  assert.ok(buildSompoFleetMission(expanded, demo).length <= 6000);
  const mission = buildSompoFleetMission(data, demo);
  assert.ok(mission.length <= 6000, `mission length ${mission.length}`);
  const json = JSON.parse(mission.split('BEGIN_SOMPO_FLEET_JSON\n\n')[1].split('\n\nEND_SOMPO_FLEET_JSON')[0]);
  assert.equal(json.demonstracao.episodios, 30);
  assert.equal(json.instalacao[0].origem, 'firebase');
  assert.equal(json.instalacao[0].maquinas[0].amostras, 1);
  const evidence = buildSompoFleetEvidence(data, demo);
  assert.equal(evidence.cooperativeContext.id, 'carteira-renovacao-cooperativa');
  assert.equal(evidence.demonstration.episodes.length, 30);
  assert.ok(mission.includes('Lacuna financeira:'));
  assert.ok(mission.includes('Não some'));
});
