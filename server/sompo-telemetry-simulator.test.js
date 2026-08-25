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

  assert.match(mission, /^\[SIMULAÇÃO\] Telemetria SOMPO/);
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
