import assert from 'node:assert/strict';
import test from 'node:test';
import { SOMPO_SIMULATION_SCENARIOS, SOMPO_RURAL_SCRIPTS, getSompoRuralFrame, createSompoSimulationSnapshot } from '../shared/sompo-telemetry-simulator.js';

const observedAt = '2026-09-11T12:00:00.000Z';

test('dez sinistros rurais mantêm o contrato, fases e amostras determinísticas', () => {
  assert.equal(Object.keys(SOMPO_RURAL_SCRIPTS).length, 10);
  assert.equal(Object.keys(SOMPO_SIMULATION_SCENARIOS).length, 20);
  for (const [id, script] of Object.entries(SOMPO_RURAL_SCRIPTS)) {
    const controls = SOMPO_SIMULATION_SCENARIOS[id];
    assert.ok(Object.isFrozen(script) && Object.isFrozen(script.keyframes));
    assert.equal(script.keyframes[0].atMs, 0);
    for (let elapsedMs = 0; elapsedMs <= script.totalMs + 1000; elapsedMs += 250) {
      const snapshot = createSompoSimulationSnapshot(controls, { elapsedMs, observedAt });
      const frame = getSompoRuralFrame(id, elapsedMs);
      assert.deepEqual(snapshot, createSompoSimulationSnapshot(controls, { elapsedMs, observedAt }));
      assert.equal(snapshot.source.scenarioId, id);
      assert.equal(snapshot.source.kind, 'simulation');
      assert.equal(snapshot.risks.collision, frame.collisionRisk);
      assert.equal(snapshot.risks.inclination, frame.inclinationRisk);
      assert.ok(Math.abs(snapshot.readings.roll - frame.roll) <= controls.roughness * 0.34 + 1.6);
      assert.ok(frame.phaseLabel.length > 0);
      assert.ok(frame.speedKph >= 0 && frame.speedKph <= 120);
      for (const key of ['distance', 'temperature', 'humidity', 'pitch', 'roll']) assert.ok(Number.isFinite(snapshot.readings[key]), `${id}: ${key}`);
      for (const key of ['acceleration', 'rotation']) for (const value of Object.values(snapshot.readings[key])) assert.ok(Number.isFinite(value));
    }
    assert.deepEqual(getSompoRuralFrame(id, 1e9), getSompoRuralFrame(id, script.totalMs), 'roteiro mantém o estado final');
    assert.deepEqual(getSompoRuralFrame(id, -1), getSompoRuralFrame(id, 0));
  }
});

test('casos têm consequências distintas na telemetria e no movimento', () => {
  const rollover = createSompoSimulationSnapshot({ scenarioId: 'rollover' }, { elapsedMs: 12_000, observedAt });
  assert.equal(rollover.readings.roll, 82);
  assert.ok(rollover.readings.acceleration.y > 9.6);
  assert.ok(rollover.readings.acceleration.z < 1.5);
  assert.deepEqual(rollover.risks, { collision: true, inclination: true });
  assert.equal(getSompoRuralFrame('rollover', 12_000).speedKph, 0);
  const rain = getSompoRuralFrame('aquaplaning', 4_000);
  assert.equal(rain.rain, 1); assert.ok(Math.abs(rain.yawRate) > 1);
  const animal = getSompoRuralFrame('animal-crossing', 8_000);
  assert.ok(animal.animalZ > 3.2); assert.equal(animal.speedKph, 0); assert.equal(animal.collisionRisk, true);
  assert.ok(getSompoRuralFrame('brake-failure', 10_000).speedKph > getSompoRuralFrame('brake-failure', 0).speedKph);
  const fire = getSompoRuralFrame('engine-fire', 12_000);
  assert.equal(fire.speedKph, 0); assert.equal(fire.smoke, 1); assert.equal(fire.temperature, 62);
  assert.equal(getSompoRuralFrame('tight-reverse', 4_000).direction, -1);
  const mud = getSompoRuralFrame('bogged-down', 8_000);
  assert.equal(mud.speedKph, 0); assert.ok(mud.wheelSpeedKph > 0 && mud.sink > 0);
  assert.ok(getSompoRuralFrame('fast-corner', 6_000).inclinationRisk);
  assert.ok(getSompoRuralFrame('driver-drowsiness', 3_000).yaw > 0);
  assert.ok(getSompoRuralFrame('driver-drowsiness', 6_000).yaw < 0);
  assert.ok(getSompoRuralFrame('tire-blowout', 3_000).roughness > 4);
  assert.equal(getSompoRuralFrame('missing'), null);
  assert.equal(getSompoRuralFrame('constructor'), null);
});
