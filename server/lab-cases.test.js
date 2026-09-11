import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createAuthService } from './auth.js';
import { registerLabCaseRoutes } from './lab-cases.js';
import { convertSompoDataset } from '../shared/sompo-lab-export.js';
import { parseLabCase } from '../shared/lab-telemetry.js';

const fixtureDir = path.resolve('datasets/laboratorio-virtual-v1');
const jsonFixture = (name) => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));
const source = (fileName = '03-aquecimento-e-falha-gps.csv') => ({
  name: 'Investigação preservada', sourceName: fileName,
  rawCsv: fs.readFileSync(path.join(fixtureDir, fileName), 'utf8'),
  metadata: jsonFixture('manifest.json'), map: jsonFixture('mapa.geojson'), schema: jsonFixture('schema.json'),
});
const validResponse = {
  summary: 'Há medições a revisar; a telemetria não comprova uma causa.',
  limitations: ['Falta inspeção física.'], additionalInformation: ['Histórico de manutenção.'],
  hypotheses: [{
    title: 'Condição de operação a verificar', explanation: 'A medição pode ser confrontada com o histórico.',
    evidence: [{ sampleIndex: 0, description: 'Temperatura registrada na primeira amostra.', fields: ['coolant_temp_c'] }],
    limitations: ['Uma leitura não explica causalidade.'], additionalInformation: ['Inspeção.'],
  }],
};

test('ESP32 JSON conversion survives Lab save/reload and supplies sensor evidence to analysis', async (t) => {
  const samples = [0, 1, 2].map(i => ({
    tractorId: 'ESP32-001', sourceKind: 'firebase', observedAt: `2026-09-09T12:00:0${i * 2}.000Z`,
    deviceTimestamp: i * 2000, temperatura: i === 1 ? null : 28, umidade: 60,
    distancia: i === 2 ? 999 : 80 - i * 60, accX: 9.8, accY: null, accZ: 0,
    rotX: 0, rotY: 0, rotZ: 0.2, pitch: 3, roll: -2,
    riscoColisao: i === 0 ? false : i === 1 ? true : null, riscoInclinacao: false,
  }));
  const converted = convertSompoDataset({ samples });
  const calls = [];
  const { request, register } = await fixture(t, { chat: async (args) => {
    calls.push(args);
    return { content: JSON.stringify({ summary: 'Alerta registrado pelo dispositivo.', limitations: ['Sem confirmação de acidente.'], additionalInformation: ['Inspeção.'], hypotheses: [{
      title: 'Obstáculo indicado pelo sensor', explanation: 'Confrontar leitura e flag com a inspeção.',
      evidence: [{ sampleIndex: 1, description: 'Distância frontal e flag registradas.', fields: ['obstacle_distance_cm', 'collision_warning_active', 'acceleration_x_raw'] }],
      limitations: ['Unidades IMU não confirmadas.'], additionalInformation: ['Calibração.'],
    }] }), toolCalls: [], finishReason: 'stop' };
  } });
  const cookie = await register('esp32');
  const saved = await request('/api/lab/cases', { cookie, body: { name: 'Ensaio ESP32', sourceName: converted.fileName, rawCsv: converted.csv, metadata: converted.manifest, schema: converted.schema } });
  assert.equal(saved.status, 201);
  const root = `/api/lab/cases/${saved.body.case.id}`;
  const restored = (await request(root, { cookie })).body.case;
  const parsed = parseLabCase(restored.rawCsv, { fileName: restored.sourceName, manifest: restored.metadata, schema: restored.schema });
  assert.equal(parsed.hasEsp32, true);
  assert.equal(parsed.synthetic, false);
  assert.equal(parsed.samples[1].ambient_temp_c, null);
  assert.equal(parsed.samples[2].obstacle_distance_cm, null);
  assert.equal(parsed.samples[2].ultrasonic_echo_valid, false);
  assert.equal(parsed.samples[2].collision_warning_active, null);
  assert.ok(parsed.samples.every(s => s.coolant_temp_c === null && s.x === null));
  const result = await request(`${root}/analyses`, { cookie, body: {} });
  assert.equal(result.status, 201);
  assert.equal(calls.length, 4);
  const evidence = JSON.parse(calls[0].user).telemetry;
  assert.equal(evidence.sensorProfile, 'esp32');
  assert.equal(evidence.units.acceleration_x_raw, 'unidade de origem');
  assert.equal(evidence.events.find(e => e.type === 'device_collision_warning').elapsedMs, 2000);
  assert.equal(result.body.analysis.hypotheses[0].evidence[0].values.obstacle_distance_cm, 20);
});

async function fixture(t, { chat } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-lab-test-'));
  const authPath = path.join(directory, 'auth.json');
  const servers = [];
  const launch = async () => {
    const app = express();
    app.use(express.json({ limit: '8mb' }));
    const auth = createAuthService({ dataPath: authPath });
    auth.registerRoutes(app);
    app.use('/api', auth.requireUser);
    registerLabCaseRoutes(app, { dataDir: directory, ...(chat ? { chat } : {}) });
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise((resolve) => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const base = await launch();
  const request = async (url, { cookie, body, method = body ? 'POST' : 'GET' } = {}) => {
    const response = await fetch(`${base}${url}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const register = async (name) => (await request('/api/auth/register', { body: { name, email: `${name}@lab.test`, password: 'test-password-2026' } })).cookie;
  t.after(async () => {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    // The absolute temp directory was created by this test and is the only cleanup target.
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('luca-lab-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { request, register, launch, directory };
}

test('real farm association persists with ESP32 and remains distinct from the original case after restart', { skip: fs.existsSync('public/datasets/frying-pan-farm/mapa.geojson') ? false : 'Pacote Fairfax local ausente (redistribuição restrita)' }, async (t) => {
  const { request, register, launch } = await fixture(t);
  const cookie = await register('farm');
  const metadata = JSON.parse(fs.readFileSync('public/datasets/frying-pan-farm/manifest.json', 'utf8'));
  const map = JSON.parse(fs.readFileSync('public/datasets/frying-pan-farm/mapa.geojson', 'utf8'));
  const converted = convertSompoDataset({ samples: [0, 1].map(i => ({ tractorId: 'ESP32-001', sourceKind: 'firebase', observedAt: `2026-09-09T12:00:0${i}.000Z`, temperatura: 29 })) });
  const source = { sourceName: converted.fileName, name: 'Fazenda real / ESP32', rawCsv: converted.csv, schema: converted.schema, metadata: converted.manifest };
  const original = await request('/api/lab/cases', { cookie, body: source });
  const saved = await request('/api/lab/cases', { cookie, body: { ...source, metadata: { ...source.metadata, ...metadata }, map } });
  assert.equal(saved.status, 201);
  assert.notEqual(saved.body.case.id, original.body.case.id);
  const restoredBase = await launch();
  const restored = await (await fetch(`${restoredBase}/api/lab/cases/${saved.body.case.id}`, { headers: { cookie } })).json();
  assert.deepEqual(restored.case.map, map);
  assert.deepEqual(restored.case.metadata.satellite, metadata.satellite);
  assert.deepEqual(restored.case.metadata.terrain, metadata.terrain);
  assert.equal(restored.case.rawCsv, converted.csv);
  const parsed = parseLabCase(restored.case.rawCsv, { manifest: restored.case.metadata, map: restored.case.map, schema: restored.case.schema });
  assert.ok(parsed.samples.every(sample => sample.x === null && sample.z === null));
  assert.equal(parsed.polygons.length, 5);
  assert.equal(parsed.events.some(e => ['near_water', 'outside_fence'].includes(e.type)), false);
  assert.equal((await request(`/api/lab/cases/${original.body.case.id}`, { cookie })).body.case.map, null);
});

test('lab HTTP preserves raw CSV, association and human versions across reload with account isolation', async (t) => {
  const { request, register, launch, directory } = await fixture(t);
  assert.equal((await request('/api/lab/cases')).status, 401);
  assert.equal((await request('/api/lab/cases', { body: source() })).status, 401);
  const alice = await register('alice');
  const bob = await register('bob');
  const data = source();
  const created = await request('/api/lab/cases', { cookie: alice, body: { ...data, ownerUserId: 'bob' } });
  assert.equal(created.status, 201);
  const record = created.body.case;
  assert.equal(record.rawCsv, data.rawCsv);
  assert.equal(record.sampleCount, 6001);
  assert.equal(record.durationMs, 600000);
  assert.deepEqual(record.metadata, data.metadata);
  assert.deepEqual(record.map, data.map);
  assert.deepEqual(record.schema, data.schema);
  const again = await request('/api/lab/cases', { cookie: alice, body: { ...data, name: 'Outro título', metadata: Object.fromEntries(Object.entries(data.metadata).reverse()) } });
  assert.equal(again.body.case.id, record.id);
  const root = `/api/lab/cases/${record.id}`;
  assert.equal((await request(root, { cookie: bob })).status, 404);
  assert.deepEqual((await request('/api/lab/cases', { cookie: bob })).body.cases, []);
  assert.equal((await request(`${root}/analyses`, { cookie: bob, body: {} })).status, 404);
  assert.equal((await request(`${root}/conclusions`, { cookie: bob, body: {} })).status, 404);
  const conclusion = { observations: 'Solicito confirmação em oficina.', category: 'inconclusive', action: 'Solicitar inspeção', hypothesisReviews: [] };
  const first = await request(`${root}/conclusions`, { cookie: alice, body: { ...conclusion, reviewer: { id: 'bob' } } });
  const second = await request(`${root}/conclusions`, { cookie: alice, body: { ...conclusion, observations: 'Histórico solicitado.' } });
  assert.equal(first.status, 201);
  assert.equal(second.body.conclusion.version, 2);
  assert.equal(second.body.case.conclusions[0].observations, conclusion.observations);
  assert.equal(second.body.conclusion.reviewer.name, 'alice');
  assert.notEqual(second.body.conclusion.reviewer.id, 'bob');
  const restoredBase = await launch();
  const restored = await (await fetch(`${restoredBase}${root}`, { headers: { cookie: alice } })).json();
  assert.equal(restored.case.rawCsv, data.rawCsv);
  assert.equal(restored.case.conclusions.length, 2);
  assert.equal(restored.case.events.length, record.events.length);
  const list = await request('/api/lab/cases', { cookie: alice });
  assert.equal(list.body.cases[0].conclusionCount, 2);
  assert.equal(list.body.cases[0].rawCsv, undefined);
  assert.ok(fs.readdirSync(path.join(directory, 'workspaces')).every((name) => /^[a-f0-9]{32}$/.test(name)));
});

test('lab rejects invalid CSV and conclusion references while opening all three bundled cases', async (t) => {
  const { request, register } = await fixture(t);
  const cookie = await register('validation');
  assert.equal((await request('/api/lab/cases', { cookie, body: { ...source(), rawCsv: 'timestamp,engine_rpm\nbad,not-a-number' } })).status, 400);
  assert.equal((await request('/api/lab/cases', { cookie, body: { ...source(), rawCsv: 'x'.repeat(5 * 1024 * 1024 + 1) } })).status, 400);
  const records = [];
  for (const filename of ['01-operacao-normal.csv', '02-cerca-e-agua.csv', '03-aquecimento-e-falha-gps.csv']) {
    const response = await request('/api/lab/cases', { cookie, body: source(filename) });
    assert.equal(response.status, 201);
    records.push(response.body.case);
  }
  assert.equal(records[0].events.length, 0);
  assert.ok(records[1].events.some((event) => event.type === 'outside_fence'));
  assert.ok(records[2].events.some((event) => event.type === 'gnss_unavailable'));
  const root = `/api/lab/cases/${records[0].id}/conclusions`;
  const conclusion = { observations: 'Em revisão.', category: 'inconclusive', action: 'Solicitar inspeção', hypothesisReviews: [] };
  assert.equal((await request(root, { cookie, body: { ...conclusion, category: 'operator_fault' } })).status, 400);
  assert.equal((await request(root, { cookie, body: { ...conclusion, hypothesisReviews: [{ analysisId: 'unknown', hypothesisId: 'operation-1', stance: 'agree' }] } })).status, 400);
});

test('lab AI uses four real call boundaries, validates temporal references and preserves analysis versions', async (t) => {
  const calls = [];
  let invalid = false;
  const chat = async (args) => {
    calls.push(args);
    const result = structuredClone(validResponse);
    if (invalid) result.hypotheses[0].evidence[0].sampleIndex = 999999;
    return { content: JSON.stringify(result), toolCalls: [], finishReason: 'stop' };
  };
  const { request, register } = await fixture(t, { chat });
  const cookie = await register('analysis');
  const data = source();
  data.metadata.expectedEvents = 'SECRET_GABARITO_NOT_FOR_ANALYSIS';
  data.metadata.rules.expected = 'SECRET_RULE_GABARITO_NOT_FOR_ANALYSIS';
  const saved = await request('/api/lab/cases', { cookie, body: data });
  const root = `/api/lab/cases/${saved.body.case.id}`;
  const result = await request(`${root}/analyses`, { cookie, body: { focus: 'Verifique o arrefecimento.' } });
  assert.equal(result.status, 201);
  assert.equal(calls.length, 4);
  assert.deepEqual(result.body.analysis.axes.map((axis) => axis.id), ['operation', 'mechanical', 'environment', 'review']);
  assert.equal(result.body.analysis.hypotheses.length, 4);
  assert.ok(calls.every((call) => call.tools === null && !call.user.includes('SECRET_')));
  assert.equal(JSON.parse(calls[3].user).priorAxes.length, 3);
  const evidence = result.body.analysis.hypotheses[0].evidence[0];
  assert.equal(evidence.elapsedMs, 0);
  assert.equal(evidence.timestamp, data.rawCsv.split(/\r?\n/)[1].split(',')[0]);
  assert.ok(Number.isFinite(evidence.values.coolant_temp_c));
  assert.equal(result.body.analysis.confidence, undefined);
  const conclusion = await request(`${root}/conclusions`, { cookie, body: {
    observations: 'Hipótese requer inspeção.', category: 'inconclusive', action: 'Solicitar inspeção',
    hypothesisReviews: [{ analysisId: result.body.analysis.id, hypothesisId: 'mechanical-1', stance: 'disagree', note: 'Falta histórico.' }],
  } });
  assert.equal(conclusion.status, 201);
  invalid = true;
  const failed = await request(`${root}/analyses`, { cookie, body: {} });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.analysis.status, 'unavailable');
  assert.deepEqual(failed.body.analysis.hypotheses, []);
  assert.equal(failed.body.case.analyses.length, 2);
  assert.equal(failed.body.case.analyses[0].status, 'completed');
  assert.equal(failed.body.case.conclusions.length, 1);
});

test('router network outage is persisted as unavailable and retry creates a new version, never a fake analysis', async (t) => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/chat/completions')) {
      attempts += 1;
      assert.equal(JSON.parse(options.body).tools, undefined);
      throw new TypeError('fetch failed: ECONNREFUSED');
    }
    return originalFetch(url, options);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const { request, register, launch } = await fixture(t);
  const cookie = await register('outage');
  const saved = await request('/api/lab/cases', { cookie, body: source() });
  const root = `/api/lab/cases/${saved.body.case.id}`;
  for (let version = 1; version <= 2; version += 1) {
    const result = await request(`${root}/analyses`, { cookie, body: {} });
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'lab_ai_unavailable');
    assert.equal(result.body.analysis.version, version);
    assert.equal(result.body.analysis.status, 'unavailable');
    assert.deepEqual(result.body.analysis.hypotheses, []);
    assert.ok(result.body.analysis.axes.every((axis) => axis.status === 'unavailable'));
  }
  assert.equal(attempts, 6);
  const restoredBase = await launch();
  const restored = await (await fetch(`${restoredBase}${root}`, { headers: { cookie } })).json();
  assert.equal(restored.case.analyses.length, 2);
  assert.ok(restored.case.analyses.every((analysis) => analysis.status === 'unavailable'));
});

test('an in-flight analysis cannot duplicate and does not overwrite a concurrent human conclusion', async (t) => {
  let resolveCalls;
  const gate = new Promise((resolve) => { resolveCalls = resolve; });
  const chat = async () => {
    await gate;
    return { content: JSON.stringify(validResponse), toolCalls: [], finishReason: 'stop' };
  };
  const { request, register } = await fixture(t, { chat });
  const cookie = await register('concurrent');
  const saved = await request('/api/lab/cases', { cookie, body: source() });
  const root = `/api/lab/cases/${saved.body.case.id}`;
  const pending = request(`${root}/analyses`, { cookie, body: {} });
  for (let i = 0; i < 30; i += 1) {
    const current = await request(root, { cookie });
    if (current.body.case.analyses[0]?.status === 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal((await request(`${root}/analyses`, { cookie, body: {} })).status, 409);
  const conclusion = await request(`${root}/conclusions`, { cookie, body: { observations: 'Registrada durante investigação.', category: 'inconclusive', action: 'Aguardar inspeção.' } });
  assert.equal(conclusion.status, 201);
  resolveCalls();
  const completed = await pending;
  assert.equal(completed.status, 201);
  assert.equal(completed.body.case.conclusions.length, 1);
});
