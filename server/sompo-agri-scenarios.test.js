import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOMPO_AGRI_EQUIPMENT,
  SOMPO_AGRI_SCENARIOS,
  getSompoAgriFrame,
  getSompoAgriScenario,
  toSompoSimulationControls,
} from '../shared/sompo-agri-scenarios.js';

const EXPECTED = [
  'agri-barn-maneuver',
  'agri-field-bogging',
  'agri-geofencing',
  'agri-geofencing-operacao',
  'agri-harvest-dust',
  'agri-hydraulic-failure',
  'agri-night-operation',
  'agri-tractor-rollover',
];

test('catálogo agrícola cobre as seis operações e os dois equipamentos', () => {
  assert.deepEqual(Object.keys(SOMPO_AGRI_SCENARIOS).sort(), EXPECTED);
  assert.deepEqual(Object.keys(SOMPO_AGRI_EQUIPMENT).sort(), ['harvester', 'tractor']);
  assert.match(SOMPO_AGRI_EQUIPMENT.tractor.assetUrl, /generated-agri-tractor\.glb$/);
  assert.match(SOMPO_AGRI_EQUIPMENT.harvester.assetUrl, /generated-agri-harvester\.glb$/);
});

test('fases e desfechos são explícitos, contínuos e congelados', () => {
  for (const [scenarioId, scenario] of Object.entries(SOMPO_AGRI_SCENARIOS)) {
    assert.ok(Object.isFrozen(scenario), `${scenarioId}: cenário congelado`);
    assert.ok(Object.isFrozen(scenario.phases), `${scenarioId}: fases congeladas`);
    assert.equal(scenario.phases[0].startMs, 0);
    assert.equal(scenario.phases.at(-1).endMs, scenario.totalMs);
    scenario.phases.forEach((item, index) => {
      assert.equal(item.startMs, index ? scenario.phases[index - 1].endMs : 0, `${scenarioId}: fases contíguas`);
      assert.ok(item.endMs > item.startMs, `${scenarioId}: fase não vazia`);
    });
    assert.ok(Object.hasOwn(scenario.outcomes, scenario.defaultOutcomeId));
    assert.ok(Object.keys(scenario.outcomes).length >= 2, `${scenarioId}: múltiplos desfechos`);
    for (const selectedOutcome of Object.values(scenario.outcomes)) {
      assert.equal(selectedOutcome.keyframes[0].atMs, 0, `${scenarioId}/${selectedOutcome.id}: começa em zero`);
      assert.equal(selectedOutcome.keyframes.at(-1).atMs, scenario.totalMs, `${scenarioId}/${selectedOutcome.id}: estado final explícito`);
      assert.ok(selectedOutcome.keyframes.every((frame, index) => !index || frame.atMs > selectedOutcome.keyframes[index - 1].atMs));
    }
  }
});

test('amostragem é determinística, segura em limites e compatível com controles existentes', () => {
  const numericFields = [
    'speedKph', 'distance', 'temperature', 'humidity', 'pitch', 'roll', 'roughness',
    'yaw', 'lateral', 'vertical', 'dust', 'mud', 'sink', 'cropCut', 'headerSpeed',
    'implementLift', 'implementRoll', 'implementYaw', 'hydraulicPressure',
    'headlights', 'workLights', 'accelerationX', 'yawRate', 'pitchRate', 'rollRate',
  ];
  for (const [scenarioId, scenario] of Object.entries(SOMPO_AGRI_SCENARIOS)) {
    for (const outcomeId of Object.keys(scenario.outcomes)) {
      for (const elapsedMs of [-1_000, 0, 3_333, scenario.totalMs, scenario.totalMs + 5_000]) {
        const first = getSompoAgriFrame(scenarioId, elapsedMs, outcomeId);
        const second = getSompoAgriFrame(scenarioId, elapsedMs, outcomeId);
        assert.deepEqual(first, second, `${scenarioId}/${outcomeId}/${elapsedMs}: puro`);
        for (const field of numericFields) assert.ok(Number.isFinite(first[field]), `${scenarioId}: ${field}`);
        assert.equal(first.outcomeId, outcomeId);
        assert.equal(first.equipmentId, scenario.equipmentId);
        const controls = toSompoSimulationControls(first);
        assert.deepEqual(Object.keys(controls).sort(), [
          'collisionRisk', 'distance', 'humidity', 'inclinationRisk', 'pitch', 'roll',
          'roughness', 'scenarioId', 'speedKph', 'temperature',
        ]);
      }
    }
  }
});

test('ids desconhecidos têm fallback fechado e não escolhem desfecho ao acaso', () => {
  assert.equal(getSompoAgriScenario('unknown').scenarioId, 'agri-harvest-dust');
  assert.equal(getSompoAgriFrame('agri-tractor-rollover', 12_000, 'unknown').outcomeId, 'controlled-stop');
});

test('troca de direção só acontece entre pontas imobilizadas', () => {
  for (const [scenarioId, scenario] of Object.entries(SOMPO_AGRI_SCENARIOS)) {
    for (const selectedOutcome of Object.values(scenario.outcomes)) {
      let speedKph = scenario.speedKph;
      let direction = 1;
      for (const [index, keyframe] of selectedOutcome.keyframes.entries()) {
        const nextSpeedKph = keyframe.speedKph ?? speedKph;
        const nextDirection = keyframe.direction ?? direction;
        if (index > 0 && nextDirection !== direction) {
          assert.equal(speedKph, 0, `${scenarioId}/${selectedOutcome.id}: para antes de inverter`);
          assert.equal(nextSpeedKph, 0, `${scenarioId}/${selectedOutcome.id}: parte só após inverter`);
        }
        speedKph = nextSpeedKph;
        direction = nextDirection;
      }
    }
  }
});
