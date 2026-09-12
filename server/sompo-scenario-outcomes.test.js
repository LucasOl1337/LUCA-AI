import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOMPO_SIMULATION_SCENARIOS,
  SOMPO_RURAL_SCRIPTS,
  SOMPO_SCENARIO_OUTCOMES,
  SOMPO_BRAKING_SCRIPT,
  buildSompoScenarioRunBrief,
  createSompoSimulationSnapshot,
  getSompoBrakingTravelMeters,
  getSompoEpisodePlan,
  getSompoRuralFrame,
  getSompoRuralTravelMeters,
  getSompoScenarioOutcomes,
  getSompoScenarioScript,
  sompoEpisodeFrameMoments,
} from '../shared/sompo-telemetry-simulator.js';
import { getSompoScenarioEffects } from '../shared/sompo-scenario-effects.js';

const observedAt = '2026-09-11T12:00:00.000Z';

test('todos os 20 cenários têm desfechos declarativos; o padrão preserva o comportamento canônico', () => {
  const scenarioIds = Object.keys(SOMPO_SIMULATION_SCENARIOS);
  assert.deepEqual(Object.keys(SOMPO_SCENARIO_OUTCOMES).sort(), scenarioIds.sort());
  for (const scenarioId of scenarioIds) {
    const outcomes = getSompoScenarioOutcomes(scenarioId);
    assert.ok(Object.isFrozen(outcomes) && outcomes.length >= 2, `${scenarioId}: pelo menos 2 desfechos`);
    assert.equal(new Set(outcomes.map((item) => item.id)).size, outcomes.length, `${scenarioId}: ids únicos`);
    for (const outcome of outcomes) {
      assert.ok(outcome.label.length > 0 && outcome.description.length > 0);
    }
    // Desfecho padrão = roteiro canônico existente (ou cenário manual sem roteiro).
    const canonical = SOMPO_RURAL_SCRIPTS[scenarioId] ?? null;
    assert.equal(getSompoScenarioScript(scenarioId, outcomes[0].id), canonical);
    assert.equal(getSompoScenarioScript(scenarioId, undefined), canonical);
    assert.equal(getSompoScenarioScript(scenarioId, 'desfecho-inexistente'), canonical);
    // Todo desfecho alternativo tem roteiro próprio, congelado e determinístico.
    for (const outcome of outcomes.slice(1)) {
      const script = getSompoScenarioScript(scenarioId, outcome.id);
      assert.ok(script && script !== canonical, `${scenarioId}/${outcome.id}: roteiro próprio`);
      assert.ok(Object.isFrozen(script) && Object.isFrozen(script.keyframes));
      assert.equal(script.keyframes[0].atMs, 0);
      for (let elapsedMs = 0; elapsedMs <= script.totalMs + 500; elapsedMs += 500) {
        const frame = getSompoRuralFrame(scenarioId, elapsedMs, outcome.id);
        assert.deepEqual(frame, getSompoRuralFrame(scenarioId, elapsedMs, outcome.id));
        assert.ok(frame.phaseLabel.length > 0);
        assert.ok(frame.speedKph >= 0 && frame.speedKph <= 120);
        for (const key of ['distance', 'temperature', 'humidity', 'pitch', 'roll']) {
          assert.ok(Number.isFinite(frame[key]), `${scenarioId}/${outcome.id}: ${key}`);
        }
        const snapshot = createSompoSimulationSnapshot(
          { scenarioId, outcomeId: outcome.id },
          { elapsedMs, observedAt },
        );
        assert.deepEqual(snapshot, createSompoSimulationSnapshot({ scenarioId, outcomeId: outcome.id }, { elapsedMs, observedAt }));
        assert.equal(snapshot.source.outcomeId, outcome.id);
        assert.equal(snapshot.source.outcomeLabel, outcome.label);
        assert.equal(snapshot.risks.collision, frame.collisionRisk);
        assert.equal(snapshot.risks.inclination, frame.inclinationRisk);
        assert.match(snapshot.source.scenarioLabel, new RegExp(` · ${outcome.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      }
    }
    // O desfecho padrão não muda o rótulo nem o contrato antigo.
    const plain = createSompoSimulationSnapshot({ scenarioId }, { elapsedMs: 4_000, observedAt });
    assert.equal(plain.source.scenarioLabel, SOMPO_SIMULATION_SCENARIOS[scenarioId].label);
    assert.equal(plain.source.outcomeId, outcomes[0].id);
  }
});

test('desfechos alternativos terminam em estados fisicamente distintos', () => {
  const done = (scenarioId, outcomeId) => {
    const script = getSompoScenarioScript(scenarioId, outcomeId);
    return getSompoRuralFrame(scenarioId, script.totalMs, outcomeId);
  };
  const animalHit = done('animal-crossing', 'colisao');
  assert.equal(animalHit.speedKph, 0);
  assert.ok(animalHit.distance <= 10);
  assert.equal(animalHit.collisionRisk, true);
  const animalMiss = done('animal-crossing', 'desvio');
  assert.equal(animalMiss.collisionRisk, false);
  assert.ok(animalMiss.speedKph > 0 && animalMiss.distance >= 200);
  const recovered = done('rollover', 'recuperacao');
  assert.equal(recovered.inclinationRisk, false);
  assert.ok(Math.abs(recovered.roll) < 5 && recovered.speedKph > 0);
  assert.equal(done('tire-blowout', 'tombamento').roll, 76);
  const escape = done('brake-failure', 'area-de-escape');
  assert.equal(escape.speedKph, 0);
  assert.equal(escape.collisionRisk, false);
  assert.ok(done('brake-failure', 'colisao').distance <= 10);
  assert.ok(done('engine-fire', 'fogo-contido').smoke <= 0.05);
  assert.equal(done('engine-fire', 'fogo-alastra').temperature, 70);
  assert.ok(done('bogged-down', 'desatola').speedKph > 0);
  assert.equal(done('bogged-down', 'afunda-mais').inclinationRisk, true);
  assert.equal(done('shifted-load', 'tomba-parado').roll, 64);
  assert.equal(done('steep-climb', 'perda-de-tracao').direction, -1);
});

test('deslocamento em forma fechada bate com a integral numérica do perfil de velocidade', () => {
  for (const [scenarioId, outcomes] of Object.entries(SOMPO_SCENARIO_OUTCOMES)) {
    for (const outcome of outcomes) {
      const script = getSompoScenarioScript(scenarioId, outcome.id);
      if (!script) {
        assert.equal(getSompoRuralTravelMeters(scenarioId, 8_000, outcome.id), null);
        continue;
      }
      let numeric = 0;
      const stepMs = 20;
      for (let t = 0; t < script.totalMs; t += stepMs) {
        const a = getSompoRuralFrame(scenarioId, t, outcome.id);
        const b = getSompoRuralFrame(scenarioId, t + stepMs, outcome.id);
        numeric += ((a.speedKph * a.direction) + (b.speedKph * b.direction)) / 2 / 3.6 * (stepMs / 1000);
        const closed = getSompoRuralTravelMeters(scenarioId, t + stepMs, outcome.id);
        assert.ok(Math.abs(closed - numeric) < 0.35, `${scenarioId}/${outcome.id} t=${t + stepMs}: ${closed} vs ${numeric}`);
      }
      // Depois do roteiro, mantém a velocidade final (parado permanece parado).
      const atEnd = getSompoRuralTravelMeters(scenarioId, script.totalMs, outcome.id);
      const after = getSompoRuralTravelMeters(scenarioId, script.totalMs + 2_000, outcome.id);
      const last = script.keyframes[script.keyframes.length - 1];
      assert.ok(Math.abs(after - atEnd - (last.speedKph * last.direction / 3.6 * 2)) < 1e-9);
    }
  }
  // Frenagem cossenoidal: 3 s constantes + integral do pulso = metade da rampa.
  // A 80 km/h a parada leva ~4,9 s e ~55 m — distância real de emergência.
  const v = 80 / 3.6;
  const brakeSeconds = (v / 4.5);
  assert.equal(getSompoBrakingTravelMeters(0, 80), 0);
  assert.ok(Math.abs(getSompoBrakingTravelMeters(3_000, 80) - v * 3) < 1e-9);
  assert.ok(Math.abs(getSompoBrakingTravelMeters(12_000, 80) - (v * 3 + v * brakeSeconds / 2)) < 1e-9);
  assert.ok(Math.abs(getSompoBrakingTravelMeters(8_000, 80) - (v * 3 + v * brakeSeconds / 2)) < 1e-9);
  const stopDistance = v * brakeSeconds / 2;
  assert.ok(stopDistance > 45 && stopDistance < 65, `parada de 80 km/h ≈ 55 m: ${stopDistance}`);
  assert.equal(getSompoBrakingTravelMeters(12_000, 80), getSompoBrakingTravelMeters(60_000, 80));
});

test('plano de episódio genérico: todo desfecho roteirizado grava; desfecho manual não', () => {
  for (const [scenarioId, outcomes] of Object.entries(SOMPO_SCENARIO_OUTCOMES)) {
    for (const outcome of outcomes) {
      const plan = getSompoEpisodePlan(scenarioId, outcome.id);
      const script = getSompoScenarioScript(scenarioId, outcome.id);
      const isBraking = !script && scenarioId === 'hard-braking';
      if (!script && !isBraking) {
        assert.equal(plan, null, `${scenarioId}/${outcome.id}: desfecho manual não gera plano`);
        continue;
      }
      const totalMs = isBraking ? SOMPO_BRAKING_SCRIPT.totalMs : script.totalMs;
      assert.equal(plan.kind, 'roteiro');
      assert.equal(plan.catalog, 'rural');
      assert.equal(plan.scenarioId, scenarioId);
      assert.equal(plan.outcomeId, outcome.id);
      assert.equal(plan.outcomeLabel, outcome.label);
      assert.equal(plan.totalMs, totalMs);
      assert.ok(plan.sampleIntervalMs > 0);
      assert.equal(plan.phases[0].startMs, 0, `${scenarioId}/${outcome.id}: fase inicial no t0`);
      assert.equal(plan.phases.at(-1).endMs, totalMs, `${scenarioId}/${outcome.id}: última fase fecha o roteiro`);
      assert.ok(plan.frameMoments.length >= 2 && plan.frameMoments.length <= 5);
      for (const moment of plan.frameMoments) {
        assert.ok(moment.offsetMs >= 0 && moment.offsetMs < totalMs);
        assert.ok(plan.phases.some((phase) => phase.id === moment.fase), `${scenarioId}/${outcome.id}: momento "${moment.label}" pertence a uma fase`);
      }
      for (let index = 1; index < plan.frameMoments.length; index += 1) {
        assert.ok(plan.frameMoments[index].offsetMs >= plan.frameMoments[index - 1].offsetMs);
      }
    }
  }
  assert.equal(getSompoEpisodePlan('normal', 'livre'), null);
  assert.equal(getSompoEpisodePlan('cenario-inexistente', 'x'), null);
  // Desfecho desconhecido cai no padrão do cenário (mesmo comportamento do relógio).
  const fallback = getSompoEpisodePlan('rollover', 'desfecho-inexistente');
  assert.equal(fallback.outcomeId, SOMPO_SCENARIO_OUTCOMES.rollover[0].id);
});

test('sompoEpisodeFrameMoments: primeiro e último instante sempre entram; o último é grampeado antes do fim', () => {
  const points = [
    { offsetMs: 0, fase: 'a', label: 'Abertura' },
    { offsetMs: 3_000, fase: 'b', label: 'Meio' },
    { offsetMs: 9_500, fase: 'c', label: 'Quase fim' },
  ];
  const moments = sompoEpisodeFrameMoments(points, 10_000, 'c');
  assert.equal(moments[0].offsetMs, 0);
  assert.equal(moments.at(-1).offsetMs, 9_500);
  assert.equal(moments.at(-1).label, 'Final do episódio');
  assert.ok(moments.length <= 5);
  assert.equal(sompoEpisodeFrameMoments([], 5_000, 'fim').length, 1);
  // Pontos depois do grampeamento final são descartados.
  const trimmed = sompoEpisodeFrameMoments([{ offsetMs: 4_999, fase: 'x', label: 'Tarde' }], 5_000, 'fim');
  assert.equal(trimmed.length, 1);
  assert.equal(trimmed[0].label, 'Final do episódio');
});

test('coreografia por desfecho: impacto do animal, fogo contido e cena padrão intocada', () => {
  const cue = (id, time, effect, outcomeId) => getSompoScenarioEffects(id, time, outcomeId).cues.find((item) => item.effect === effect);
  assert.ok(cue('animal-crossing', 6_000, 'impact-dust', 'colisao'));
  assert.ok(cue('animal-crossing', 20_000, 'animal', 'colisao'), 'animal permanece em cena após o impacto');
  assert.ok(getSompoScenarioEffects('animal-crossing', 13_000, 'colisao').focusX > 0, 'foco não decai com trilha sem fim');
  assert.equal(cue('animal-crossing', 6_000, 'impact-dust'), undefined, 'desfecho padrão sem poeira de impacto');
  assert.equal(cue('animal-crossing', 6_000, 'impact-dust', 'freada-a-tempo'), undefined);
  assert.equal(cue('engine-fire', 12_000, 'engine-fire', 'fogo-contido'), undefined, 'extintor encerra as chamas');
  assert.ok(cue('engine-fire', 12_000, 'engine-fire', 'fogo-alastra'));
  // Determinismo e intensidades válidas nas variantes.
  for (const [scenarioId, outcomes] of Object.entries(SOMPO_SCENARIO_OUTCOMES)) {
    for (const outcome of outcomes) {
      for (const time of [0, 4_000, 9_000, 16_000]) {
        const frame = getSompoScenarioEffects(scenarioId, time, outcome.id);
        assert.deepEqual(frame, getSompoScenarioEffects(scenarioId, time, outcome.id));
        assert.ok(frame.cues.every((item) => item.intensity >= 0 && item.intensity <= 1));
      }
    }
  }
});

test('resumo do ensaio para a bancada: fases, flags e deslocamento; nulo para cenário desconhecido', () => {
  const brief = buildSompoScenarioRunBrief('animal-crossing', 'colisao', 14_000);
  assert.equal(brief.scripted, true);
  assert.equal(brief.completed, true);
  assert.equal(brief.outcomeLabel, 'Colisão com o animal');
  assert.ok(brief.phases.length >= 5 && brief.phases[0].atMs === 0);
  assert.ok(brief.flagTransitions.some((item) => item.flag === 'riscoColisao' && item.to === true));
  assert.ok(brief.travelMeters > 0);
  const manual = buildSompoScenarioRunBrief('normal', 'livre', 5_000);
  assert.equal(manual.scripted, false);
  assert.equal(manual.travelMeters, null);
  const braking = buildSompoScenarioRunBrief('hard-braking', 'sem-impacto', 12_000);
  assert.equal(braking.scripted, true);
  assert.ok(braking.travelMeters > 0 && braking.phases.length === 3);
  assert.equal(buildSompoScenarioRunBrief('cenario-inexistente', 'impacto', 0), null);
  assert.equal(buildSompoScenarioRunBrief('__proto__', 'x', 0), null);
});
