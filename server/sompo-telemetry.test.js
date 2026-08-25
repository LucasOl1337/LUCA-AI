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

function sseHarness() {
  const encoder = new TextEncoder();
  let controller;
  const body = new ReadableStream({
    start(nextController) {
      controller = nextController;
    },
  });
  return {
    response: {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body,
    },
    emit(event, data) {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    },
    close() {
      controller.close();
    },
  };
}

function waitFor(predicate, timeoutMs = 1_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('condition_timeout'));
        return;
      }
      setTimeout(check, 5);
    }
    check();
  });
}

test('normaliza o contrato real do ESP32 e mantém flags determinísticas', () => {
  const snapshot = normalizeSompoTelemetry(RAW, { observedAt: '2026-08-21T14:00:00.000Z' });

  assert.equal(snapshot.tractorId, '001');
  assert.equal(snapshot.status, 'alert');
  assert.deepEqual(snapshot.risks, { collision: true, inclination: false });
  assert.equal(snapshot.readings.distance, 70.66);
  assert.equal(snapshot.readings.acceleration.x, 10.01);
  assert.ok(snapshot.readings.acceleration.magnitude > 10);
  assert.equal(snapshot.source.kind, 'firebase');
  assert.equal(snapshot.source.path, '/trator/001/sensores');
});

test('mantém uma assinatura SSE e publica put/patch sem novo GET', async (t) => {
  const stream = sseHarness();
  let fetchCalls = 0;
  const received = [];
  const source = createSompoTelemetrySource({
    fetchImpl: async (_url, options) => {
      fetchCalls += 1;
      assert.equal(options.headers.Accept, 'text/event-stream');
      return stream.response;
    },
    staleAfterMs: 60_000,
  });
  t.after(() => source.stop());
  source.subscribe((snapshot) => received.push(snapshot));

  source.start();
  stream.emit('put', { path: '/', data: RAW });
  await waitFor(() => received.length >= 1);
  assert.equal(received.at(-1).readings.distance, 70.66);
  assert.equal(received.at(-1).connection.state, 'live');

  stream.emit('patch', { path: '/', data: { distancia: 41.25, timestamp: 887010 } });
  await waitFor(() => received.at(-1)?.readings.distance === 41.25);
  assert.equal(received.at(-1).deviceTimestamp, 887010);
  assert.equal(received.at(-1).freshness, 'fresh');
  assert.equal(fetchCalls, 1);
});

test('reconecta a assinatura preservando o último snapshot e sinaliza o transporte', async (t) => {
  const first = sseHarness();
  const second = sseHarness();
  const responses = [first.response, second.response];
  const received = [];
  let fetchCalls = 0;
  const source = createSompoTelemetrySource({
    fetchImpl: async () => responses[fetchCalls++],
    reconnectDelayMs: 0,
    staleAfterMs: 60_000,
  });
  t.after(() => source.stop());
  source.subscribe((snapshot) => received.push(snapshot));

  source.start();
  first.emit('put', { path: '/', data: RAW });
  await waitFor(() => received.at(-1)?.connection.state === 'live');
  first.close();
  await waitFor(() => fetchCalls === 2);
  assert.ok(received.some((snapshot) => snapshot.connection.state === 'reconnecting'));

  second.emit('patch', { path: '/', data: { distancia: 33, timestamp: 887100 } });
  await waitFor(() => received.at(-1)?.readings.distance === 33);
  assert.equal(received.at(-1).connection.state, 'live');
});

test('marca snapshot parado como stale e volta a fresh quando o dispositivo muda', async () => {
  let time = Date.parse('2026-08-21T14:00:00.000Z');
  const stream = sseHarness();
  const source = createSompoTelemetrySource({
    fetchImpl: async () => stream.response,
    now: () => time,
    staleAfterMs: 10_000,
  });
  let latest = null;
  source.subscribe((snapshot) => { latest = snapshot; });
  source.start();
  stream.emit('put', { path: '/', data: RAW });

  const first = await source.read();
  assert.equal(first.freshness, 'checking');

  time += 11_000;
  const stale = await source.read();
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.unchangedForMs, 11_000);

  time += 1_000;
  stream.emit('patch', { path: '/', data: { timestamp: 887001, distancia: 48.2 } });
  await waitFor(() => latest?.readings.distance === 48.2);
  const fresh = await source.read();
  assert.equal(fresh.freshness, 'fresh');
  assert.equal(fresh.unchangedForMs, 0);
  assert.equal(fresh.readings.distance, 48.2);
  source.stop();
});

test('briefing da bancada explicita alertas, frescor e lacunas de unidade', () => {
  const snapshot = {
    ...normalizeSompoTelemetry(RAW, { observedAt: '2026-08-21T14:00:00.000Z' }),
    connection: {
      state: 'live',
      connectedAt: '2026-08-21T13:59:58.000Z',
      lastEventAt: '2026-08-21T14:00:00.000Z',
      retryAttempt: 0,
    },
  };
  const mission = buildSompoTelemetryMission(snapshot, 'Risco Agro');

  assert.match(mission, /riscoColisao=true/);
  assert.match(mission, /riscoInclinacao=false/);
  assert.match(mission, /Timestamp bruto do dispositivo: 886909/);
  assert.match(mission, /não vieram no JSON/);
  assert.match(mission, /Equipe selecionada para avaliar: Risco Agro/);
  assert.match(mission, /Canal do runtime: conectado em tempo real/);
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
