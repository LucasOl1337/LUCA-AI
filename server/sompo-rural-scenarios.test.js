import assert from 'node:assert/strict';
import test from 'node:test';
import { SOMPO_SIMULATION_SCENARIOS, SOMPO_RURAL_SCRIPTS, getSompoRuralFrame, getSompoScenarioScript, createSompoSimulationSnapshot } from '../shared/sompo-telemetry-simulator.js';

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
  // freada-a-tempo: o caminhão para (~7,4 s) com o animal ainda junto à pista,
  // saindo pelo acostamento — não vale o regime antigo em que ele já tinha ido embora.
  assert.ok(animal.animalZ > 1 && animal.animalZ < 3.5, `animal junto à pista na parada: ${animal.animalZ}`);
  assert.equal(animal.speedKph, 0); assert.equal(animal.collisionRisk, true);
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

test('desvios leem física real: nariz acompanha o vetor de movimento (slip-angle contido)', () => {
  // O palco renderiza nariz = yaw + atan2(lateralRate·dir, v): o yaw roteirizado
  // é o slip-angle. yaw grande demais (ou com sinal contra o deslocamento
  // lateral) produz o visual de "andar de lado" que este teste trava.
  // [cenário, desfecho, teto de |yaw|]. Em derrapagem (fishtail) o nariz gira
  // contra o deslize lateral por física, então só o teto se aplica a ela.
  const cases = [
    ['animal-crossing', 'desvio', 9, true],
    ['animal-crossing', 'freada-a-tempo', 2, true],
    ['animal-crossing', 'colisao', 2, true],
    ['driver-drowsiness', undefined, 5, true],
    ['driver-drowsiness', 'saida-de-pista', 5, true],
    ['driver-drowsiness', 'parada-descanso', 5, true],
    ['hard-braking', 'derrapagem', 15, false],
    ['hard-braking', 'obstaculo-na-pista', 2, true],
  ];
  for (const [scenarioId, outcomeId, maxYaw, steered] of cases) {
    const script = getSompoScenarioScript(scenarioId, outcomeId);
    for (let t = 0; t <= script.totalMs; t += 100) {
      const frame = getSompoRuralFrame(scenarioId, t, outcomeId);
      assert.ok(
        Math.abs(frame.yaw) <= maxYaw,
        `${scenarioId}/${outcomeId} t=${t}: |yaw|=${frame.yaw.toFixed(1)} acima de ${maxYaw}°`,
      );
      // Sob deslocamento lateral forte, o nariz lidera o movimento (mesmo
      // sinal de lateralRate) — nunca aponta contra a trajetória.
      if (steered && Math.abs(frame.lateralRate) >= 0.5 && frame.speedKph > 15) {
        assert.ok(
          frame.yaw * frame.lateralRate >= -1 || Math.abs(frame.yaw) <= 2,
          `${scenarioId}/${outcomeId} t=${t}: yaw=${frame.yaw.toFixed(1)} contra lateralRate=${frame.lateralRate.toFixed(2)}`,
        );
      }
    }
  }
});
