import test from 'node:test';
import assert from 'node:assert/strict';
import {
  C0_FF,
  COUNTS_PER_G,
  G,
  NM_PER_G,
  SENSOR_SCENARIOS,
  SLOPE_TIP_DEG,
  SPRING_N_PER_M,
  THRESHOLDS,
  memsResponse,
  sampleSensorLab,
  scenarioTimeline,
  telemetryPacket,
} from '../src/sensor-lab/physics.js';
import { formatAppUrl, parseAppLocation } from '../shared/app-location.js';

const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} fora de ${expected} ± ${tolerance}`);

test('a massa de prova segue a ordem de grandeza de um MEMS real', () => {
  near(NM_PER_G, 8.2, 0.05, 'nm por g');
  near(SPRING_N_PER_M, 11.9, 0.1, 'mola');
  near(C0_FF, 273, 1, 'capacitância de repouso');
  assert.equal(COUNTS_PER_G, 16384);
  const oneG = memsResponse({ x: G, y: 0, z: 0 });
  near(Math.abs(oneG.x.deltaFF), 3.2, 0.05, 'ΔC em 1 g');
  assert.ok(oneG.x.nm < 0, 'a massa fica para trás da aceleração');
});

test('parado e nivelado o sensor lê só a gravidade', () => {
  const reading = sampleSensorLab('encosta', 0, 0);
  assert.deepEqual(telemetryPacket(reading), {
    aceleracaoX: 0, aceleracaoY: 0, aceleracaoZ: 1, rotacaoX: 0, rotacaoY: 0, rotacaoZ: 0, riscoInclinacao: false,
  });
  near(reading.mems.z.nm, -NM_PER_G, 1e-9, 'massa cede sob o próprio peso');
  assert.equal(reading.mems.z.counts, COUNTS_PER_G);
  assert.equal(reading.level, 'estavel');
});

test('na encosta a razão lateral é a tangente e o tombamento vem no limiar', () => {
  near(SLOPE_TIP_DEG, 21.8, 0.05, 'ângulo de tombamento');
  const mild = sampleSensorLab('encosta', 8, 0.2);
  near(mild.lateralG, Math.tan((8 * Math.PI) / 180), 1e-9, 'tan 8°');
  assert.equal(mild.level, 'estavel');
  assert.ok(mild.mems.y.nm < 0, 'massa escorrega morro abaixo (para a direita)');
  assert.equal(sampleSensorLab('encosta', 18, 0.2).level, 'risco');
  assert.equal(sampleSensorLab('encosta', 21, 5).tip.deg, 0);
  const tipped = sampleSensorLab('encosta', 24, 3);
  assert.equal(tipped.phase, 'tombado');
  assert.ok(tipped.flags.riscoInclinacao);
});

test('na curva a velocidade decide entre estável, aviso e tombamento', () => {
  const at = (kph) => sampleSensorLab('curva', kph, 5.5);
  assert.equal(at(40).level, 'estavel');
  assert.equal(at(50).level, 'atencao');
  assert.equal(at(54).level, 'risco');
  near(at(50).lateralG, (50 / 3.6) ** 2 / 65 / G, 1e-9, 'v²/R');
  assert.ok(at(50).gyroDps.z > 10, 'giroscópio vê a guinada');

  const timeline = scenarioTimeline('curva', 60);
  assert.ok(timeline.tipAtS !== null && timeline.alertAtS !== null);
  assert.ok(timeline.alertAtS < timeline.tipAtS, 'o aviso vem antes do tombamento');
  const tipped = sampleSensorLab('curva', 60, timeline.tipAtS + 2);
  assert.equal(tipped.level, 'tombou');
  near(tipped.forceG.y, 1, 0.05, 'deitado, a gravidade aparece no eixo lateral');
  assert.equal(scenarioTimeline('curva', 50).tipAtS, null);
});

test('frenada e buraco levantam as bandeiras certas', () => {
  const soft = sampleSensorLab('frenada', 0.2, 3);
  const hard = sampleSensorLab('frenada', 0.55, 3);
  assert.equal(soft.flags.frenagemBrusca, false);
  assert.equal(hard.flags.frenagemBrusca, true);
  assert.ok(hard.mems.x.nm > 0, 'na frenada a massa vai para a frente');
  near(hard.forceG.x, -0.55, 0.06, 'desaceleração medida');

  const small = scenarioTimeline('buraco', 3);
  const deep = scenarioTimeline('buraco', 12);
  assert.equal(small.alertAtS, null);
  assert.ok(deep.alertAtS !== null && deep.peakRatio > 1);
  assert.equal(sampleSensorLab('buraco', 12, deep.alertAtS + 0.1).flags.impacto, true);
});

test('a leitura é função pura do relógio e respeita os limites do cenário', () => {
  for (const scenario of SENSOR_SCENARIOS) {
    const a = sampleSensorLab(scenario.id, scenario.param.value, 3.217);
    const b = sampleSensorLab(scenario.id, scenario.param.value, 3.217);
    assert.deepEqual(a, b);
    for (const value of Object.values(a.forceG)) assert.ok(Number.isFinite(value));
  }
  assert.equal(sampleSensorLab('curva', 999, 1).param, 70);
  assert.equal(sampleSensorLab('desconhecido', Number.NaN, 1).id, 'curva');
  assert.ok(THRESHOLDS.attention < THRESHOLDS.alert);
});

test('a rota /sensor abre o laboratório', () => {
  assert.equal(parseAppLocation('/sensor').page, 'sensor');
  assert.equal(parseAppLocation('/sensor/').page, 'sensor');
  assert.equal(formatAppUrl({ page: 'sensor', caso: 'antigo' }), '/sensor');
});
