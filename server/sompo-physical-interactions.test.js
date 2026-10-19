import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';
import { physicalInteractionState, physicalRiskBands, SOMPO_PANEL_BANDS, appendPhysicalFrame, physicalReplayFrame } from '../shared/sompo-physical-interactions.js';
const snapshot = (raw = {}) => {
  const result = normalizeSompoTelemetry({ trator: '001', timestamp: 1000, distancia: 250, pitch: 0, roll: 0, aceleracaoX: 9.81, aceleracaoY: 0, aceleracaoZ: 0, temperatura: 23, umidade: 50, riscoColisao: false, riscoInclinacao: false, ...raw });
  result.connection.state = 'live'; result.freshness = 'fresh';
  return result;
};
test('proximity is graded and never invents an obstacle from missing echo', () => {
  for (const distance of [null, 0, -1, 999, Infinity]) {
    const state = physicalInteractionState(snapshot({ distancia: distance }));
    assert.equal(state.distance, null); assert.equal(state.proximity, 0); assert.equal(state.collision, false);
  }
  assert.equal(physicalInteractionState(snapshot({ distancia: 150 })).severity, 'attention');
  assert.equal(physicalInteractionState(snapshot({ distancia: 100 })).severity, 'danger');
  assert.ok(physicalInteractionState(snapshot({ distancia: 40 })).proximity > physicalInteractionState(snapshot({ distancia: 150 })).proximity);
});
test('stale or disconnected readings suppress every active effect', () => {
  const reading = snapshot({ distancia: 20, pitch: 40, temperatura: 40, umidade: 90, riscoColisao: true });
  for (const stale of [true, false]) {
    reading.freshness = stale ? 'stale' : 'fresh'; reading.connection.state = stale ? 'live' : 'reconnecting';
    const result = physicalInteractionState(reading);
    assert.equal(result.severity, 'offline'); assert.deepEqual(result.labels, []); assert.equal(result.shock, 0);
  }
});
test('rotation of gravity alone does not trigger a shock; abrupt magnitude change does', () => {
  const before = snapshot();
  assert.equal(physicalInteractionState(snapshot({ timestamp: 1200, aceleracaoX: 0, aceleracaoZ: 9.81 }), before).shock, 0);
  assert.ok(physicalInteractionState(snapshot({ timestamp: 1200, aceleracaoX: 20 }), before).shock > .5);
  for (const timestamp of [1000, 0, 5000]) assert.equal(physicalInteractionState(snapshot({ timestamp, aceleracaoX: 20 }), before).shock, 0);
});
test('environment limits are configurable and device flags remain untouched', () => {
  const reading = snapshot({ temperatura: 29, umidade: 70, pitch: 22 });
  const before = JSON.stringify(reading);
  assert.equal(physicalInteractionState(reading).cargo, false);
  assert.equal(physicalInteractionState(reading, null, { temperature: 28, humidity: 65 }).cargo, true);
  assert.equal(physicalInteractionState(reading).inclination, true);
  assert.equal(JSON.stringify(reading), before);
});
test('replay is bounded and holds actual samples without fabricating measurements', () => {
  let frames = [];
  for (let i = 0; i < 1000; i++) frames = appendPhysicalFrame(frames, { at: i * 10, snapshot: snapshot(), effects: {} });
  assert.equal(frames.length, 600);
  assert.equal(physicalReplayFrame(frames, 15), frames[1]);
  assert.equal(physicalReplayFrame(frames, Infinity), frames.at(-1));
  assert.equal(physicalReplayFrame([], 0), null);
  frames = appendPhysicalFrame(frames, { at: 50000, snapshot: snapshot(), effects: {} });
  assert.equal(frames.length, 1);
});
test('physicalRiskBands: faixas do painel com os casos exatos, sem trava de fonte', () => {
  const level = (distance, collisionFlag = false) => physicalRiskBands({ distance, collisionFlag }).proximityLevel;
  assert.equal(level(201), 'clear');
  assert.equal(level(200), 'clear');
  assert.equal(level(199), 'attention');
  assert.equal(level(151), 'attention');
  assert.equal(level(150), 'attention');
  assert.equal(level(150, true), 'danger');
  assert.equal(level(101), 'attention');
  assert.equal(level(100), 'danger');
  assert.equal(level(2), 'danger');
  for (const distance of [null, 0, -1, 999, Infinity, NaN]) assert.equal(level(distance), 'unavailable');
  assert.equal(level(null, true), 'danger');
  const tilt = (pitch, roll, inclinationFlag = false) => physicalRiskBands({ pitch, roll, inclinationFlag }).inclination;
  assert.equal(tilt(0, 19.9), false);
  assert.equal(tilt(0, 20), true);
  assert.equal(tilt(-20, 0), true);
  assert.equal(tilt(0, -19.9), false);
  assert.equal(tilt(0, 0, true), true);
  assert.equal(tilt(null, NaN), false);
  assert.equal(physicalRiskBands({ pitch: 3, roll: -21.5 }).angle, 21.5);
  assert.deepEqual(SOMPO_PANEL_BANDS, { attentionCm: 200, dangerCm: 100, inclinationDeg: 20 });
});
test('physicalInteractionState segue igual com o classificador extraído', () => {
  const live = physicalInteractionState(snapshot({ distancia: 150, riscoColisao: true, roll: 20 }));
  assert.equal(live.collision, true); assert.equal(live.inclination, true); assert.equal(live.severity, 'danger');
  assert.equal(live.proximity, physicalRiskBands({ distance: 150 }).proximity);
  const simulated = snapshot({ distancia: 50, riscoColisao: true }); simulated.source.kind = 'simulation';
  assert.equal(physicalInteractionState(simulated).severity, 'offline');
});
