import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOMPO_AGRI_SCENARIOS,
  getSompoAgriFrame,
  getSompoAgriScenario,
} from '../shared/sompo-agri-scenarios.js';
import {
  buildSompoAgriRunBrief,
  createSompoAgriSimulationSnapshot,
  getSompoAgriOutcomes,
  getSompoAgriTravelMeters,
  isSompoAgriScenarioId,
} from '../shared/sompo-agri-brief.js';

const observedAt = '2026-09-11T15:00:00.000Z';

test('desfechos agrícolas em lista ordenada com o padrão primeiro', () => {
  for (const scenario of Object.values(SOMPO_AGRI_SCENARIOS)) {
    const outcomes = getSompoAgriOutcomes(scenario.scenarioId);
    assert.equal(outcomes.length, Object.keys(scenario.outcomes).length);
    assert.equal(outcomes[0].id, scenario.defaultOutcomeId);
    for (const outcome of outcomes) assert.ok(outcome.label.length > 0 && outcome.description.length > 0);
  }
  assert.equal(isSompoAgriScenarioId('agri-harvest-dust'), true);
  assert.equal(isSompoAgriScenarioId('normal'), false);
  assert.equal(isSompoAgriScenarioId('__proto__'), false);
});

test('deslocamento agrícola em forma fechada bate com a integral numérica dos frames', () => {
  for (const scenario of Object.values(SOMPO_AGRI_SCENARIOS)) {
    for (const outcome of Object.values(scenario.outcomes)) {
      let numeric = 0;
      const stepMs = 20;
      for (let t = 0; t < scenario.totalMs; t += stepMs) {
        const a = getSompoAgriFrame(scenario.scenarioId, t, outcome.id);
        const b = getSompoAgriFrame(scenario.scenarioId, t + stepMs, outcome.id);
        numeric += ((a.speedKph * a.direction) + (b.speedKph * b.direction)) / 2 / 3.6 * (stepMs / 1000);
        const closed = getSompoAgriTravelMeters(scenario.scenarioId, t + stepMs, outcome.id);
        assert.ok(
          Math.abs(closed - numeric) < 0.35,
          `${scenario.scenarioId}/${outcome.id} t=${t + stepMs}: ${closed} vs ${numeric}`,
        );
      }
    }
  }
  // A manobra no barracão anda de ré: deslocamento final negativo.
  assert.ok(getSompoAgriTravelMeters('agri-barn-maneuver', 15_000, 'parked') < -4);
});

test('snapshot agrícola: proveniência correta, roll amplo e gravidade rotacionada', () => {
  const options = { elapsedMs: 10_000, observedAt };
  const rolled = createSompoAgriSimulationSnapshot('agri-tractor-rollover', 'side-rollover', options);
  assert.deepEqual(rolled, createSompoAgriSimulationSnapshot('agri-tractor-rollover', 'side-rollover', options));
  assert.equal(rolled.source.scenarioId, 'agri-tractor-rollover');
  assert.equal(rolled.source.outcomeId, 'side-rollover');
  assert.match(rolled.source.scenarioLabel, / · Tombamento lateral$/);
  assert.ok(rolled.readings.roll > 70, 'roll do tombamento não é grampeado em ±25°');
  assert.ok(rolled.readings.acceleration.z < 3, 'gravidade sai do eixo Z quando o trator deita');
  assert.ok(rolled.readings.acceleration.y > 8.5, 'gravidade aparece no eixo lateral');
  assert.deepEqual(rolled.risks, { collision: true, inclination: true });
  // Desfecho padrão mantém o rótulo simples do cenário.
  const clean = createSompoAgriSimulationSnapshot('agri-harvest-dust', undefined, { elapsedMs: 5_000, observedAt });
  assert.equal(clean.source.scenarioLabel, getSompoAgriScenario('agri-harvest-dust').label);
  assert.equal(clean.source.outcomeId, 'clean-pass');
  assert.equal(clean.source.kind, 'simulation');
  const frame = getSompoAgriFrame('agri-harvest-dust', 5_000, 'clean-pass');
  assert.equal(clean.risks.collision, frame.collisionRisk);
  assert.ok(Math.abs(clean.readings.pitch - frame.pitch) <= frame.roughness * 0.28 + 0.01);
});

test('resumo do ensaio agrícola no contrato da bancada; nulo para id desconhecido', () => {
  const brief = buildSompoAgriRunBrief('agri-barn-maneuver', 'post-contact', 15_000);
  assert.equal(brief.scripted, true);
  assert.equal(brief.completed, true);
  assert.equal(brief.outcomeLabel, 'Contato com pilar');
  assert.equal(brief.phases.length, 3);
  assert.ok(brief.phases.every((phase) => typeof phase.label === 'string' && Number.isFinite(phase.atMs)));
  assert.ok(brief.flagTransitions.some((item) => item.flag === 'riscoColisao' && item.to === true));
  assert.ok(brief.travelMeters < 0, 'ré articulada percorre metros negativos');
  assert.equal(buildSompoAgriRunBrief('normal', 'x', 0), null);
  assert.equal(buildSompoAgriRunBrief('__proto__', 'x', 0), null);
});
