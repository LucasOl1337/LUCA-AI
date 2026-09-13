import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOMPO_SIMULATION_SCENARIOS,
  createSompoSimulationSnapshot,
} from '../shared/sompo-telemetry-simulator.js';
import { buildSompoTelemetryMission } from '../shared/sompo-telemetry.js';

const FIXED_TIME = '2026-08-25T12:00:00.000Z';

test('simulador produz o mesmo contrato com proveniência sintética explícita', () => {
  const snapshot = createSompoSimulationSnapshot({}, {
    observedAt: FIXED_TIME,
    elapsedMs: 1_250,
  });

  assert.equal(snapshot.tractorId, 'SIM-001');
  assert.equal(snapshot.source.kind, 'simulation');
  assert.equal(snapshot.source.provider, 'Simulador 3D local');
  assert.equal(snapshot.connection.state, 'live');
  assert.equal(snapshot.freshness, 'fresh');
  assert.equal(snapshot.deviceTimestamp, 1_250);
  assert.equal(snapshot.observedAt, FIXED_TIME);
  assert.equal(snapshot.connection.connectedAt, '2026-08-25T11:59:58.750Z');
  assert.equal(snapshot.source.scenarioLabel, 'Operação normal');
  assert.ok(Number.isFinite(snapshot.readings.acceleration.magnitude));
  assert.ok(Number.isFinite(snapshot.readings.rotation.magnitude));
});

test('presets comandam flags sem inventar limiares do firmware', () => {
  const normal = createSompoSimulationSnapshot(SOMPO_SIMULATION_SCENARIOS.normal);
  const obstacle = createSompoSimulationSnapshot(SOMPO_SIMULATION_SCENARIOS.obstacle);
  const inclination = createSompoSimulationSnapshot(SOMPO_SIMULATION_SCENARIOS.inclination);

  assert.deepEqual(normal.risks, { collision: false, inclination: false });
  assert.equal(normal.status, 'normal');
  assert.deepEqual(obstacle.risks, { collision: true, inclination: false });
  assert.equal(obstacle.status, 'alert');
  assert.deepEqual(inclination.risks, { collision: false, inclination: true });

  const manualFlag = createSompoSimulationSnapshot({
    ...SOMPO_SIMULATION_SCENARIOS.normal,
    distance: 5,
    pitch: 25,
    roll: 25,
    collisionRisk: false,
    inclinationRisk: false,
  });
  assert.deepEqual(manualFlag.risks, { collision: false, inclination: false });
  assert.equal(manualFlag.source.scenarioLabel, 'Operação normal · ajustado manualmente');
});

test('briefing da simulação não apresenta dados sintéticos como fatos físicos', () => {
  const snapshot = createSompoSimulationSnapshot(SOMPO_SIMULATION_SCENARIOS.obstacle, {
    observedAt: FIXED_TIME,
    elapsedMs: 2_000,
  });
  const mission = buildSompoTelemetryMission(snapshot, 'Risco Agro');

  assert.match(mission, /\[Ensaio no simulador\]/);
  assert.match(mission, /\[SIMULAÇÃO\] Telemetria SOMPO/);
  assert.match(mission, /dados sintéticos; não enviados ao Firebase/);
  assert.match(mission, /Flags sintéticas selecionadas no cenário/);
  assert.match(mission, /Estado do gerador local: ativo no navegador/);
  assert.match(mission, /Amostra disponível no LUCA/);
  assert.match(mission, /nunca como evidência do equipamento físico/);
  assert.doesNotMatch(mission, /Canal do runtime:/);
  assert.doesNotMatch(mission, /Última mudança observada pelo runtime/);
  assert.doesNotMatch(mission, /Alertas determinísticos enviados pelo dispositivo/);
  assert.doesNotMatch(mission, /flags de colisão e inclinação como fatos do firmware/);
});

test('cenários rurais são completos, distintos e determinísticos no contrato existente', () => {
  const added = ['hard-braking', 'steep-climb', 'steep-descent', 'yard-maneuver', 'shifted-load', 'hot-weather'];
  for (const scenarioId of added) {
    const profile = SOMPO_SIMULATION_SCENARIOS[scenarioId];
    assert.equal(profile.scenarioId, scenarioId);
    assert.ok(profile.label.length > 0 && profile.description.length > 0);
    assert.ok(Object.isFrozen(profile));
    for (const elapsedMs of [0, 3_000, 4_000, 5_000, 12_000, 90_000]) {
      const options = { observedAt: FIXED_TIME, elapsedMs };
      const snapshot = createSompoSimulationSnapshot(profile, options);
      assert.deepEqual(snapshot, createSompoSimulationSnapshot(profile, options));
      assert.equal(snapshot.source.scenarioId, scenarioId);
      assert.equal(snapshot.source.scenarioLabel, profile.label);
      assert.deepEqual(snapshot.risks, { collision: profile.collisionRisk, inclination: profile.inclinationRisk });
      assert.deepEqual(Object.keys(snapshot.readings).sort(), ['acceleration', 'distance', 'humidity', 'pitch', 'roll', 'rotation', 'speedKph', 'temperature', 'wheelSpeedKph']);
      for (const key of ['distance', 'temperature', 'humidity', 'pitch', 'roll']) {
        assert.ok(Number.isFinite(snapshot.readings[key]), `${scenarioId}: ${key}`);
      }
      for (const key of ['acceleration', 'rotation']) {
        const { x, y, z, magnitude } = snapshot.readings[key];
        assert.ok(Math.abs(magnitude - Math.hypot(x, y, z)) < 0.025);
      }
    }
  }
  const read = (scenarioId) => createSompoSimulationSnapshot({ scenarioId }, { observedAt: FIXED_TIME }).readings;
  assert.ok(read('steep-climb').pitch > 20);
  assert.ok(read('steep-descent').pitch < -20);
  assert.ok(read('shifted-load').roll > 18);
  assert.ok(read('yard-maneuver').distance < 60);
  assert.ok(read('hot-weather').temperature >= 43 && read('hot-weather').humidity < 20);
});

test('frenagem desacelera sem impacto e mantém repouso sem reinício implícito', async () => {
  const { getSompoBrakingScriptState: state, SOMPO_BRAKING_SCRIPT: script } = await import('../shared/sompo-telemetry-simulator.js');
  assert.equal(state(-100).phaseId, 'deslocamento');
  assert.equal(state(2_999).speedKph, 80);
  assert.equal(state(3_000).phaseId, 'frenagem');
  // 80→0 km/h com desaceleração média ~4,5 m/s²: ~4,94 s e ~55 m de frenagem.
  const brakeEndMs = 3_000 + (80 / 3.6 / 4.5) * 1_000;
  const midBrake = Math.round(3_000 + (brakeEndMs - 3_000) / 2);
  assert.ok(Math.abs(state(midBrake).speedKph - 40) < 2);
  assert.ok(state(midBrake).accelerationX < -6);
  assert.ok(state(8_000).phaseId === 'repouso');
  assert.equal(state(8_000).speedKph, 0);
  assert.deepEqual(state(1e8), state(script.totalMs));
  assert.deepEqual(state(NaN), state(0));

  // Deceleration must explain the actual speed loss, not just animate a pulse.
  let integratedVelocity = 0;
  for (let ms = 3_000; ms < brakeEndMs; ms += 10) integratedVelocity += state(ms + 5).accelerationX * 0.01;
  assert.ok(Math.abs(integratedVelocity + 80 / 3.6) < 0.05);

  const during = createSompoSimulationSnapshot({ scenarioId: 'hard-braking' }, { elapsedMs: midBrake, observedAt: FIXED_TIME });
  assert.ok(during.readings.acceleration.x < -5.9);
  assert.ok(during.readings.pitch < -3);
  assert.equal(during.risks.collision, false);
  const stopped = createSompoSimulationSnapshot({ scenarioId: 'hard-braking' }, { elapsedMs: 20_000, observedAt: FIXED_TIME });
  assert.deepEqual(stopped.readings.acceleration, { x: 0, y: 0, z: 9.81, magnitude: 9.81 });
  assert.equal(stopped.readings.rotation.magnitude, 0);
  assert.equal(stopped.readings.pitch, 1);
  const manual = createSompoSimulationSnapshot({ scenarioId: 'hard-braking', pitch: -25, collisionRisk: true }, { elapsedMs: midBrake, observedAt: FIXED_TIME });
  assert.equal(manual.readings.pitch, -25);
  assert.equal(manual.risks.collision, true);
  assert.match(manual.source.scenarioLabel, /ajustado manualmente/);
});
