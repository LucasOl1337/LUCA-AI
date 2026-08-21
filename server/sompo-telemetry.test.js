import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSompoTelemetryMission,
  normalizeSompoTelemetry,
} from '../shared/sompo-telemetry.js';
import {
  createSompoTelemetryHttpHandler,
  createSompoTelemetrySource,
} from './sompo-telemetry-source.js';

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

function response(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('normaliza o contrato real do ESP32 e mantém flags determinísticas', () => {
  const snapshot = normalizeSompoTelemetry(RAW, { observedAt: '2026-08-21T14:00:00.000Z' });

  assert.equal(snapshot.tractorId, '001');
  assert.equal(snapshot.status, 'alert');
  assert.deepEqual(snapshot.risks, { collision: true, inclination: false });
  assert.equal(snapshot.readings.distance, 70.66);
  assert.equal(snapshot.readings.acceleration.x, 10.01);
  assert.ok(snapshot.readings.acceleration.magnitude > 10);
  assert.equal(snapshot.source.path, '/trator/001/sensores');
});

test('marca snapshot parado como stale e volta a fresh quando o dispositivo muda', async () => {
  let time = Date.parse('2026-08-21T14:00:00.000Z');
  let raw = { ...RAW };
  const source = createSompoTelemetrySource({
    fetchImpl: async () => response(raw),
    now: () => time,
    cacheMs: 0,
    staleAfterMs: 10_000,
  });

  const first = await source.read();
  assert.equal(first.freshness, 'checking');

  time += 11_000;
  const stale = await source.read();
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.unchangedForMs, 11_000);

  time += 1_000;
  raw = { ...raw, timestamp: 887001, distancia: 48.2 };
  const fresh = await source.read();
  assert.equal(fresh.freshness, 'fresh');
  assert.equal(fresh.unchangedForMs, 0);
  assert.equal(fresh.readings.distance, 48.2);
});

test('briefing da bancada explicita alertas, frescor e lacunas de unidade', () => {
  const snapshot = normalizeSompoTelemetry(RAW, { observedAt: '2026-08-21T14:00:00.000Z' });
  const mission = buildSompoTelemetryMission(snapshot, 'Risco Agro');

  assert.match(mission, /riscoColisao=true/);
  assert.match(mission, /riscoInclinacao=false/);
  assert.match(mission, /Timestamp bruto do dispositivo: 886909/);
  assert.match(mission, /não vieram no JSON/);
  assert.match(mission, /Equipe selecionada para avaliar: Risco Agro/);
});

test('handler entrega snapshot normalizado e falha fechado quando Firebase cai', async () => {
  let payload = null;
  const okHandler = createSompoTelemetryHttpHandler({
    read: async () => normalizeSompoTelemetry(RAW),
  });
  await okHandler({}, {
    json(value) { payload = value; },
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.telemetry.tractorId, '001');

  let statusCode = 0;
  const failHandler = createSompoTelemetryHttpHandler({
    read: async () => { throw new Error('firebase_down'); },
  });
  await failHandler({}, {
    status(value) { statusCode = value; return this; },
    json(value) { payload = value; },
  });
  assert.equal(statusCode, 502);
  assert.equal(payload.error, 'sompo_telemetry_unavailable');
});
