import test from 'node:test';
import assert from 'node:assert/strict';
import { SOMPO_MAX_TRACTOR_AGRI_PARITY, SOMPO_MAX_TRACTOR_TRUCK_PARITY } from '../shared/sompo-max-tractor-scenarios.js';
import { SOMPO_SIMULATION_SCENARIOS } from '../shared/sompo-telemetry-simulator.js';
import { createSompoMotionPath } from '../shared/sompo-motion.js';
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
  'max-barn-approach',
  'max-field-bogging',
  'max-field-operation',
  'max-front-obstacle',
  'max-night-operation',
  'max-slope-rollover',
];

test('catálogo agrícola cobre as operações, os seis cases do MAX e os três equipamentos', () => {
  assert.deepEqual(Object.keys(SOMPO_AGRI_SCENARIOS).sort(), EXPECTED);
  assert.deepEqual(Object.keys(SOMPO_AGRI_EQUIPMENT).sort(), ['harvester', 'max-tractor', 'tractor']);
  assert.match(SOMPO_AGRI_EQUIPMENT['max-tractor'].assetUrl, /max-tractor\.glb$/);
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
      if (selectedOutcome.phases) {
        assert.ok(Object.isFrozen(selectedOutcome.phases), `${scenarioId}/${selectedOutcome.id}: fases do desfecho congeladas`);
        assert.equal(selectedOutcome.phases[0].startMs, 0);
        assert.equal(selectedOutcome.phases.at(-1).endMs, scenario.totalMs);
        selectedOutcome.phases.forEach((item, index) => {
          assert.equal(item.startMs, index ? selectedOutcome.phases[index - 1].endMs : 0, `${scenarioId}/${selectedOutcome.id}: fases contíguas`);
          assert.ok(item.endMs > item.startMs, `${scenarioId}/${selectedOutcome.id}: fase não vazia`);
        });
      }
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

test('desfechos abortivos rotulam a fase pelo estado real da máquina', () => {
  assert.equal(getSompoAgriFrame('agri-harvest-dust', 14_000, 'header-blockage').phaseLabel, 'Parada no talhão');
  assert.equal(getSompoAgriFrame('agri-harvest-dust', 8_000, 'header-blockage').phaseLabel, 'Embuchamento da plataforma');
  assert.equal(getSompoAgriFrame('agri-harvest-dust', 14_000, 'clean-pass').phaseLabel, 'Saída para o carreador');
  assert.equal(getSompoAgriFrame('agri-field-bogging', 15_000, 'deep-stall').phaseLabel, 'Imobilizado no talhão');
  assert.equal(getSompoAgriFrame('agri-field-bogging', 9_000, 'deep-stall').phaseLabel, 'Patinagem e afundamento');
  assert.equal(getSompoAgriFrame('agri-field-bogging', 15_000, 'assisted-recovery').phaseLabel, 'Recuo pela própria trilha');
  assert.equal(getSompoAgriFrame('agri-night-operation', 12_000, 'work-light-failure').phaseLabel, 'Aguardando iluminação');
  assert.equal(getSompoAgriFrame('agri-night-operation', 15_000, 'lit-pass').phaseLabel, 'Saída para o carreador');
});

test('desfechos felizes contam a prova: tracao volta, sinalizacao desde o inicio, sem flag', () => {
  const slipAt = (atMs) => {
    const frame = getSompoAgriFrame('agri-field-bogging', atMs, 'assisted-recovery');
    return Math.abs(frame.wheelSpeedKph) - Math.abs(frame.speedKph);
  };
  assert.ok(slipAt(7_000) > 10, 'a recuperação ainda mostra o sufoco da patinagem');
  assert.ok(slipAt(12_000) < slipAt(7_000), 'slip cai quando a máquina engata a saída');
  assert.ok(slipAt(15_000) <= 1, 'tração de volta: rodado quase igual ao avanço');
  const recovered = getSompoAgriFrame('agri-field-bogging', 16_000, 'assisted-recovery');
  assert.ok(recovered.roll <= 3.5 && recovered.sink <= 0.05, 'conjunto sai nivelado do atoleiro');
  const nightStart = getSompoAgriFrame('agri-night-operation', 500, 'lit-pass');
  assert.ok(nightStart.headlights >= 0.5 && nightStart.workLights >= 0.4, 'farol e projetores ligados do início');
  assert.ok(nightStart.beacon >= 1, 'giroflex sinalizando desde a inspeção');
  for (const [scenarioId, outcomeId] of [
    ['agri-harvest-dust', 'clean-pass'],
    ['agri-field-bogging', 'assisted-recovery'],
    ['agri-night-operation', 'lit-pass'],
  ]) {
    const scenario = getSompoAgriScenario(scenarioId);
    for (const atMs of [2_000, scenario.totalMs / 2, scenario.totalMs - 1]) {
      const frame = getSompoAgriFrame(scenarioId, atMs, outcomeId);
      assert.equal(frame.collisionRisk, false, `${scenarioId}/${outcomeId}: sem alerta de colisão`);
      assert.equal(frame.inclinationRisk, false, `${scenarioId}/${outcomeId}: sem alerta de inclinação`);
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

test('Trator MAX: seis cases próprios, sem canais de implemento', () => {
  const max = Object.values(SOMPO_AGRI_SCENARIOS).filter((item) => item.equipmentId === 'max-tractor');
  assert.deepEqual(max.map((item) => item.scenarioId).sort(), ['max-barn-approach', 'max-field-bogging', 'max-field-operation', 'max-front-obstacle', 'max-night-operation', 'max-slope-rollover']);
  for (const item of max) {
    assert.equal(item.distanceSensorPosition, 'front', `${item.scenarioId}: HC-SR04 na frente`);
    for (const selectedOutcome of Object.values(item.outcomes)) {
      for (const keyframe of selectedOutcome.keyframes) {
        for (const key of ['implementLift', 'implementRoll', 'implementYaw', 'hydraulicPressure']) {
          assert.ok(!(key in keyframe), `${item.scenarioId}/${selectedOutcome.id}: sem ${key}`);
        }
      }
    }
  }
  // Reaproveitados: mesmo roteiro de movimento do trator agrícola.
  for (const [maxId, sourceId] of [['max-slope-rollover', 'agri-tractor-rollover'], ['max-field-bogging', 'agri-field-bogging']]) {
    for (const outcomeId of Object.keys(SOMPO_AGRI_SCENARIOS[sourceId].outcomes)) {
      for (const atMs of [0, 5_000, 9_000, 16_000]) {
        const a = getSompoAgriFrame(maxId, atMs, outcomeId);
        const b = getSompoAgriFrame(sourceId, atMs, outcomeId);
        for (const key of ['speedKph', 'wheelSpeedKph', 'yaw', 'roll', 'pitch', 'sink', 'lateral', 'vertical', 'collisionRisk', 'inclinationRisk']) {
          assert.equal(a[key], b[key], `${maxId}/${outcomeId}/${atMs}: ${key}`);
        }
      }
    }
  }
  for (const atMs of [0, 9_000, 17_999]) {
    const frame = getSompoAgriFrame('max-field-operation', atMs, 'routine-pass');
    assert.equal(frame.collisionRisk, false);
    assert.equal(frame.inclinationRisk, false);
    assert.equal(frame.distance, 400, 'sem eco em alcance');
  }
  assert.equal(getSompoAgriFrame('max-field-operation', 3_000).speedKph, 8);
  assert.equal(getSompoAgriFrame('max-field-operation', 10_500).speedKph, 5);
});

test('Trator MAX: leitura do HC-SR04 bate com a distância geométrica até o fardo', () => {
  const scenario = getSompoAgriScenario('max-front-obstacle');
  assert.equal(scenario.obstacle.kind, 'hay-bale');
  for (const [outcomeId, finalCm, tolerance] of [['safe-stop', 40, 6], ['light-touch', 8, 4]]) {
    const path = createSompoMotionPath((atMs) => getSompoAgriFrame('max-front-obstacle', atMs, outcomeId), scenario.totalMs);
    const point = { x: 0, z: 0 };
    for (let atMs = 0; atMs <= scenario.totalMs; atMs += 100) {
      const frame = getSompoAgriFrame('max-front-obstacle', atMs, outcomeId);
      const gapCm = (scenario.obstacle.startGapM - path.sample(atMs, point).x) * 100;
      if (gapCm <= 390) assert.ok(Math.abs(frame.distance - gapCm) <= 10, `${outcomeId}/${atMs}: lido ${frame.distance}, geométrico ${gapCm.toFixed(1)}`);
      else assert.ok(frame.distance >= 380, `${outcomeId}/${atMs}: fora do alcance satura`);
      assert.ok(gapCm >= 0, `${outcomeId}/${atMs}: não atravessa o fardo`);
    }
    const end = getSompoAgriFrame('max-front-obstacle', scenario.totalMs, outcomeId);
    assert.equal(end.speedKph, 0);
    assert.ok(Math.abs(end.distance - finalCm) <= tolerance, `${outcomeId}: final ${end.distance} cm`);
    const alert = getSompoAgriFrame('max-front-obstacle', 7_000, outcomeId);
    assert.equal(alert.distance, 150, 'alerta a 150 cm');
    assert.equal(alert.collisionRisk, true);
    assert.equal(getSompoAgriFrame('max-front-obstacle', 6_000, outcomeId).collisionRisk, false);
  }
});

test('todo case agrícola tem destino no Trator MAX, com motivo quando não vira case', () => {
  const sources = Object.values(SOMPO_AGRI_SCENARIOS).filter((item) => item.equipmentId !== 'max-tractor').map((item) => item.scenarioId);
  assert.deepEqual(Object.keys(SOMPO_MAX_TRACTOR_AGRI_PARITY).sort(), sources.sort());
  for (const [id, entry] of Object.entries(SOMPO_MAX_TRACTOR_AGRI_PARITY)) {
    if (entry.status === 'adaptado') assert.equal(SOMPO_AGRI_SCENARIOS[entry.maxId]?.equipmentId, 'max-tractor', id);
    else assert.ok(entry.reason?.length > 10, id);
  }
  assert.equal(SOMPO_MAX_TRACTOR_AGRI_PARITY['agri-hydraulic-failure'].status, 'incompativel');
  assert.ok(Object.values(SOMPO_MAX_TRACTOR_AGRI_PARITY).every((entry) => entry.status !== 'pendente'), 'nenhum case agrícola fica pendente');
});

test('Trator MAX: galpão de frente mede a parede do fundo pela própria cinemática', () => {
  const scenario = getSompoAgriScenario('max-barn-approach');
  assert.equal(scenario.environmentId, 'farm-barn');
  assert.equal(scenario.obstacle.kind, 'barn-back-wall');
  // Face interna do fundo a 11,91 m do vão: o emissor começa do lado de fora.
  assert.ok(scenario.obstacle.startGapM > 11.91 + 2, 'começa antes do vão');
  for (const [outcomeId, finalCm, tolerance] of [['parked', 60, 4], ['wall-contact', 2, 1]]) {
    const path = createSompoMotionPath((atMs) => getSompoAgriFrame('max-barn-approach', atMs, outcomeId), scenario.totalMs);
    const point = { x: 0, z: 0 };
    for (let atMs = 0; atMs <= scenario.totalMs; atMs += 100) {
      const frame = getSompoAgriFrame('max-barn-approach', atMs, outcomeId);
      const gapCm = (scenario.obstacle.startGapM - path.sample(atMs, point).x) * 100;
      if (gapCm <= 390) assert.ok(Math.abs(frame.distance - Math.max(2, gapCm)) <= 10, `${outcomeId}/${atMs}: lido ${frame.distance}, geométrico ${gapCm.toFixed(1)}`);
      else assert.ok(frame.distance >= 380, `${outcomeId}/${atMs}: fora do alcance satura`);
      assert.ok(gapCm >= 0, `${outcomeId}/${atMs}: não atravessa a parede`);
    }
    const end = getSompoAgriFrame('max-barn-approach', scenario.totalMs, outcomeId);
    assert.equal(end.speedKph, 0);
    assert.ok(Math.abs(end.distance - finalCm) <= tolerance, `${outcomeId}: final ${end.distance} cm`);
    const alert = getSompoAgriFrame('max-barn-approach', 13_500, outcomeId);
    assert.ok(Math.abs(alert.distance - 150) <= 2, `alerta perto de 150 cm, lido ${alert.distance}`);
    assert.equal(alert.collisionRisk, true);
    assert.equal(getSompoAgriFrame('max-barn-approach', 12_000, outcomeId).collisionRisk, false);
    assert.equal(getSompoAgriFrame('max-barn-approach', 0, outcomeId).headlights, 1);
  }
});

test('Trator MAX: noite acende faróis e a falha apaga e para', () => {
  assert.equal(getSompoAgriScenario('max-night-operation').environmentId, 'row-crop-field-night');
  const lit = getSompoAgriFrame('max-night-operation', 8_000, 'lit-pass');
  assert.equal(lit.headlights, 1);
  assert.equal(lit.workLights, 1);
  assert.equal(lit.distance, 400);
  const dark = getSompoAgriFrame('max-night-operation', 14_000, 'light-failure');
  assert.equal(dark.headlights, 0);
  assert.equal(dark.speedKph, 0);
  assert.equal(getSompoAgriFrame('max-front-obstacle', 3_000, 'safe-stop').headlights, 1, 'obstáculo com farol aceso');
});

test('os 20 cases do caminhão têm destino no Trator MAX, com motivo', () => {
  assert.equal(Object.keys(SOMPO_SIMULATION_SCENARIOS).length, 20);
  assert.deepEqual(Object.keys(SOMPO_MAX_TRACTOR_TRUCK_PARITY).sort(), Object.keys(SOMPO_SIMULATION_SCENARIOS).sort());
  for (const [id, entry] of Object.entries(SOMPO_MAX_TRACTOR_TRUCK_PARITY)) {
    assert.ok(['adaptado', 'incompativel'].includes(entry.status), id);
    assert.ok(entry.reason.length > 20, `${id}: motivo`);
    if (entry.status === 'adaptado') {
      const target = SOMPO_AGRI_SCENARIOS[entry.maxId];
      assert.equal(target?.equipmentId, 'max-tractor', `${id}: aponta um case do MAX`);
      if (entry.outcomeId) assert.ok(target.outcomes[entry.outcomeId], `${id}: desfecho ${entry.outcomeId} existe`);
    } else assert.equal(entry.maxId, undefined, id);
  }
  // Velocidade de rodovia não vira case do MAX.
  for (const id of ['steep-descent', 'tire-blowout', 'aquaplaning', 'brake-failure', 'driver-drowsiness', 'fast-corner']) {
    assert.equal(SOMPO_MAX_TRACTOR_TRUCK_PARITY[id].status, 'incompativel', id);
  }
  // Calor: mesma temperatura ambiente do sensor, sem flag térmica.
  const hot = getSompoAgriFrame('max-field-operation', 10_500, 'hot-weather');
  assert.equal(hot.temperature, 43);
  assert.equal(hot.collisionRisk, false);
  assert.equal(hot.inclinationRisk, false);
});
