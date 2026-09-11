import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';
import { convertSompoDataset, SOMPO_EXPORT_MAX_SAMPLES } from '../shared/sompo-lab-export.js';
import { LAB_COLUMNS, LAB_ESP32_COLUMNS, parseLabCase } from '../shared/lab-telemetry.js';
import { createSompoTelemetryHistory, createSompoTelemetryExportHttpHandler } from './sompo-telemetry-history.js';

const START = Date.parse('2026-09-09T12:00:00.000Z');
function snapshot(index, { tractorId = '001', sourceKind = 'firebase', raw = {} } = {}) {
  const result = normalizeSompoTelemetry({ trator: tractorId, timestamp: index, temperatura: 28, umidade: 62, ...raw }, { observedAt: new Date(START + index * 1000).toISOString() });
  result.source.kind = sourceKind;
  return result;
}
function memoryHistory(t, now = START + 3000_000) {
  const history = createSompoTelemetryHistory({ dbPath: ':memory:', now: () => now });
  t.after(() => history.close());
  return history;
}
function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}
async function exportRequest(history, query) {
  const res = response();
  await createSompoTelemetryExportHttpHandler(history)({ query }, res);
  return res;
}
function parsed(converted) { return parseLabCase(converted.csv, converted); }

test('exporta toda janela >2000, isola origem/máquina e faz roundtrip JSON → CSV → replay', async t => {
  const history = memoryHistory(t);
  history.recordMany(Array.from({ length: 2501 }, (_, index) => snapshot(index)));
  history.record(snapshot(2502, { sourceKind: 'simulation' }));
  history.record(snapshot(2503, { tractorId: '002' }));
  history.record(snapshot(3601)); // Future observation must not leak past the exported window.
  assert.equal(history.query({ sourceKind: 'firebase', windowMs: 3600_000 }).length, 2000);
  const res = await exportRequest(history, { fonte: 'firebase', trator: '001', janelaMin: '60', format: 'json' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 2501);
  assert.equal(res.body.timestampBasis, 'server_received');
  assert.equal(res.body.synthetic, false);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.match(res.headers['Content-Disposition'], /\.json"$/);
  assert.ok(res.body.samples.every(row => row.sourceKind === 'firebase' && row.tractorId === '001'));
  assert.equal(res.body.samples[0].observedAt, new Date(START).toISOString());
  assert.equal(res.body.samples.at(-1).deviceTimestamp, 2500);
  const lab = parsed(convertSompoDataset(JSON.parse(JSON.stringify(res.body))));
  assert.equal(lab.samples.length, 2501);
  assert.equal(lab.synthetic, false);
  assert.equal(lab.samples[0].ambient_temp_c, 28);
  assert.equal(lab.samples[0].coolant_temp_c, null);
  assert.equal(lab.samples[0].latitude_deg, null);
  assert.equal(lab.samples[0].engine_rpm, null);
});

test('preserva null, flags, IMU sem unidade inventada e sentinela ultrassônica no JSON', async t => {
  const history = memoryHistory(t);
  history.recordMany([
    snapshot(0, { raw: { temperatura: null, umidade: null, distancia: 999, pitch: 4, roll: -3, aceleracaoX: 10.2, rotacaoZ: 12, riscoColisao: true, riscoInclinacao: null } }),
    snapshot(1, { raw: { distancia: 75, riscoColisao: false, riscoInclinacao: true } }),
  ]);
  const dataset = (await exportRequest(history, { janelaMin: 60 })).body;
  assert.equal(dataset.samples[0].distancia, 999);
  assert.equal(dataset.samples[0].temperatura, null);
  assert.equal(dataset.samples[0].riscoInclinacao, null);
  assert.ok(Number.isInteger(dataset.samples[0].id));
  const converted = convertSompoDataset(dataset);
  const lab = parsed(converted);
  const first = lab.samples[0];
  assert.equal(first.ambient_temp_c, null);
  assert.equal(first.relative_humidity_pct, null);
  assert.equal(first.obstacle_distance_cm, null);
  assert.equal(first.ultrasonic_echo_valid, false);
  assert.equal(first.imu_pitch_raw, 4);
  assert.equal(first.imu_roll_raw, -3);
  assert.equal(first.acceleration_x_raw, 10.2);
  assert.equal(first.rotation_z_raw, 12);
  assert.equal(first.pitch_deg, null);
  assert.equal(first.roll_deg, null);
  assert.equal(first.yaw_rate_deg_s, null);
  assert.equal(first.collision_warning_active, true);
  assert.equal(first.inclination_warning_active, null);
  assert.equal(lab.samples[1].obstacle_distance_cm, 75);
  assert.equal(lab.samples[1].ultrasonic_echo_valid, null);
  assert.ok(converted.manifest.conversion_warnings.some(warning => warning.includes('999')));
  assert.equal(lab.events.find(event => event.type === 'device_collision_warning').transition, 'start');
  const csvResponse = await exportRequest(history, { janelaMin: 60, format: 'csv' });
  assert.equal(csvResponse.statusCode, 200);
  assert.match(csvResponse.headers['Content-Type'], /text\/csv/);
  assert.equal(parseLabCase(csvResponse.body).samples[1].inclination_warning_active, true);
});

test('episódio exporta sua série inteira com rótulo sintético e rejeita seleção de origem incompatível', async t => {
  const history = memoryHistory(t);
  const episode = history.startEpisode({ kind: 'colisao', sourceKind: 'simulation', tractorId: 'sim-01' });
  history.recordMany([snapshot(1, { sourceKind: 'simulation', tractorId: 'sim-01' }), snapshot(2, { sourceKind: 'simulation', tractorId: 'sim-01' })], { episodeId: episode.publicId });
  const res = await exportRequest(history, { episodeId: episode.publicId });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.episode.publicId, episode.publicId);
  assert.equal(res.body.sourceKind, 'simulation');
  assert.equal(res.body.timestampBasis, 'simulator_observed');
  assert.equal(res.body.synthetic, true);
  const lab = parsed(convertSompoDataset(res.body));
  assert.equal(lab.synthetic, true);
  assert.equal(lab.machineId, 'sim-01');
  assert.equal(parsed(convertSompoDataset(history.getEpisode(episode.publicId))).samples.length, 2);
  assert.equal((await exportRequest(history, { episodeId: episode.publicId, fonte: 'firebase' })).statusCode, 400);
  assert.equal((await exportRequest(history, { episodeId: 'missing' })).statusCode, 404);
});

test('conversor ordena, deduplica somente amostras exatas e preserva identificadores com vírgula e aspas', t => {
  const history = memoryHistory(t);
  const tractorId = 'ESP32, "bancada"';
  history.recordMany([snapshot(1, { tractorId }), snapshot(2, { tractorId })]);
  const samples = history.query({ sourceKind: 'firebase', tractorId, windowMs: 3600_000 });
  const converted = convertSompoDataset({ samples: [samples[1], { ...samples[0] }, samples[0]] });
  assert.equal(parsed(converted).machineId, tractorId);
  assert.equal(parsed(converted).samples.length, 2);
  assert.equal(converted.manifest.removed_exact_duplicates, 1);
  assert.equal(converted.csv.split('\n')[0], [...LAB_COLUMNS, ...LAB_ESP32_COLUMNS].join(','));
  assert.throws(() => convertSompoDataset({ samples: [samples[0], { ...samples[0], temperatura: 80 }] }), /mesmo observedAt/);
  assert.throws(() => convertSompoDataset({ samples: [samples[0], { ...samples[1], sourceKind: 'simulation' }] }), /origens diferentes/);
  assert.throws(() => convertSompoDataset({ samples: [samples[0], { ...samples[1], tractorId: 'outro' }] }), /máquinas/);
});

test('rejeita relógio, unidades, flags e metadados contraditórios antes de criar CSV', t => {
  const history = memoryHistory(t);
  history.recordMany([snapshot(1), snapshot(2)]);
  const samples = history.query({ sourceKind: 'firebase', windowMs: 3600_000 });
  for (const observedAt of ['SESS_000002', '2026-09-09T12:00:02-03:00', '2026-02-30T12:00:00Z', null]) {
    assert.throws(() => convertSompoDataset({ samples: [samples[0], { ...samples[1], observedAt }] }), /observedAt/);
  }
  assert.throws(() => convertSompoDataset({ samples: [samples[0], { ...samples[1], observedMs: START }] }), /contradiz/);
  assert.throws(() => convertSompoDataset({ samples: [samples[0], { ...samples[1], temperatura: '28 C' }] }), /número ou null/);
  assert.throws(() => convertSompoDataset({ samples: [samples[0], { ...samples[1], riscoColisao: 'false' }] }), /true, false ou null/);
  assert.throws(() => convertSompoDataset({ samples, synthetic: true }), /synthetic/);
  assert.throws(() => convertSompoDataset({ samples, count: 50 }), /contagem/);
  assert.throws(() => convertSompoDataset({ samples, timestampBasis: 'device_utc' }), /base temporal/);
  assert.throws(() => convertSompoDataset({ samples: [samples[0]] }), /duas amostras/);
  assert.throws(() => convertSompoDataset({ timestamp: 1, distancia: 75 }), /dataset JSON SOMPO/);
});

test('limite é explícito: exportação grande retorna 413 sem retornar série parcial', async t => {
  const history = memoryHistory(t, START + (SOMPO_EXPORT_MAX_SAMPLES + 1) * 1000);
  history.recordMany(Array.from({ length: SOMPO_EXPORT_MAX_SAMPLES + 1 }, (_, index) => snapshot(index)));
  const res = await exportRequest(history, { janelaMin: 240 });
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.error, 'sompo_export_too_large');
  assert.equal(res.body.samples, undefined);
  assert.match(res.body.message, /janela menor/);
  const smaller = await exportRequest(history, { janelaMin: 1 });
  assert.equal(smaller.statusCode, 200);
  assert.equal(smaller.body.count, 60);
  assert.equal((await exportRequest(history, { janelaMin: 241 })).statusCode, 400);
  assert.equal((await exportRequest(history, { format: 'xlsx' })).statusCode, 400);
  assert.equal((await exportRequest(history, { fonte: 'desconhecida' })).statusCode, 400);
});

test('valores físicos fora do contrato retornam erro de conversão 400 legível', async t => {
  const history = memoryHistory(t);
  history.recordMany([snapshot(0), snapshot(1, { raw: { umidade: 101, distancia: -1 } })]);
  const res = await exportRequest(history, { janelaMin: 60, format: 'csv' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'sompo_export_invalid_dataset');
  assert.match(res.body.message, /fora do intervalo/);
  assert.equal((await exportRequest(history, { janelaMin: 60, format: 'json' })).statusCode, 200);
});
