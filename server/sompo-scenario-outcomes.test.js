import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOMPO_SIMULATION_SCENARIOS,
  SOMPO_RURAL_SCRIPTS,
  SOMPO_SCENARIO_OUTCOMES,
  SOMPO_COLLISION_OUTCOMES,
  SOMPO_COLLISION_SCRIPT,
  buildSompoScenarioRunBrief,
  createSompoCollisionScriptSnapshot,
  createSompoSimulationSnapshot,
  getSompoBrakingTravelMeters,
  getSompoCollisionOutcome,
  getSompoCollisionScriptPhase,
  getSompoCollisionVisualPose,
  getSompoRuralFrame,
  getSompoRuralTravelMeters,
  getSompoScenarioOutcomes,
  getSompoScenarioScript,
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
        assert.ok(frame.speedKph >= 0 && frame.speedKph <= 60);
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
  const v = 28 / 3.6;
  assert.equal(getSompoBrakingTravelMeters(0, 28), 0);
  assert.ok(Math.abs(getSompoBrakingTravelMeters(3_000, 28) - v * 3) < 1e-9);
  assert.ok(Math.abs(getSompoBrakingTravelMeters(12_000, 28) - (v * 3 + v)) < 1e-9);
  assert.equal(getSompoBrakingTravelMeters(12_000, 28), getSompoBrakingTravelMeters(60_000, 28));
});

test('roteiro de colisão parametrizado: padrão intacto, desvio e frenagem sem impacto', () => {
  assert.equal(SOMPO_COLLISION_OUTCOMES[0].id, 'impacto');
  for (let elapsedMs = 0; elapsedMs <= SOMPO_COLLISION_SCRIPT.totalMs; elapsedMs += 250) {
    assert.deepEqual(
      createSompoCollisionScriptSnapshot(elapsedMs, { observedAt }),
      createSompoCollisionScriptSnapshot(elapsedMs, { observedAt, outcomeId: 'impacto' }),
    );
    assert.equal(getSompoCollisionScriptPhase(elapsedMs), getSompoCollisionScriptPhase(elapsedMs, 'impacto'));
  }
  const plans = SOMPO_COLLISION_OUTCOMES.map((outcome) => getSompoCollisionOutcome(outcome.id));
  for (const plan of plans) {
    assert.equal(plan.frameMoments.length, 5);
    assert.equal(plan.phases[0].startMs, 0);
    assert.equal(plan.phases[plan.phases.length - 1].endMs, SOMPO_COLLISION_SCRIPT.totalMs);
    for (const moment of plan.frameMoments) {
      assert.ok(plan.phases.some((phase) => phase.id === moment.fase));
    }
  }
  assert.equal(getSompoCollisionOutcome('desconhecido').id, 'impacto');
  let nearMissPeak = 0;
  let brakePeak = 0;
  let nearMissMinDistance = Infinity;
  let brakeMinDistance = Infinity;
  for (let elapsedMs = 0; elapsedMs <= SOMPO_COLLISION_SCRIPT.totalMs; elapsedMs += 100) {
    const nearMiss = createSompoCollisionScriptSnapshot(elapsedMs, { observedAt, outcomeId: 'quase-acidente' });
    const braked = createSompoCollisionScriptSnapshot(elapsedMs, { observedAt, outcomeId: 'freada-a-tempo' });
    nearMissPeak = Math.max(nearMissPeak, nearMiss.readings.acceleration.magnitude);
    brakePeak = Math.max(brakePeak, braked.readings.acceleration.magnitude);
    nearMissMinDistance = Math.min(nearMissMinDistance, nearMiss.readings.distance);
    brakeMinDistance = Math.min(brakeMinDistance, braked.readings.distance);
  }
  const impactPeak = createSompoCollisionScriptSnapshot(14_750, { observedAt }).readings.acceleration.magnitude;
  assert.ok(impactPeak > 30, 'impacto mantém pico > 30 m/s²');
  assert.ok(nearMissPeak < 16 && brakePeak < 16, 'desfechos sem impacto não têm pulso de batida');
  assert.ok(nearMissMinDistance >= 20 && brakeMinDistance >= 35, 'nunca fecham a distância de contato');
  const nearMissEnd = createSompoCollisionScriptSnapshot(21_500, { observedAt, outcomeId: 'quase-acidente' });
  assert.equal(nearMissEnd.risks.collision, false);
  const brakedEnd = createSompoCollisionScriptSnapshot(21_500, { observedAt, outcomeId: 'freada-a-tempo' });
  assert.equal(brakedEnd.risks.collision, true, 'parado a 38 cm mantém alerta de proximidade');
  // Pose visual: avanço monotônico; só o desvio sai da faixa e retorna.
  for (const outcomeId of ['impacto', 'quase-acidente', 'freada-a-tempo']) {
    let previous = -1;
    let minLateral = 0;
    for (let elapsedMs = 0; elapsedMs <= SOMPO_COLLISION_SCRIPT.totalMs; elapsedMs += 250) {
      const pose = getSompoCollisionVisualPose(elapsedMs, outcomeId);
      assert.ok(pose.advance >= previous - 1e-6, `${outcomeId}: avanço nunca regride`);
      previous = pose.advance;
      minLateral = Math.min(minLateral, pose.lateral);
    }
    if (outcomeId === 'quase-acidente') {
      assert.ok(minLateral < -2, 'desvio cruza para a outra faixa');
      assert.ok(Math.abs(getSompoCollisionVisualPose(22_000, outcomeId).lateral) < 0.05, 'retorna à faixa');
    } else {
      assert.equal(minLateral, 0);
    }
  }
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
  assert.ok(cue('colisao-roteirizada', 13_500, 'skid-marks', 'freada-a-tempo'));
  assert.equal(cue('colisao-roteirizada', 15_000, 'impact-dust', 'freada-a-tempo'), undefined);
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
  assert.equal(buildSompoScenarioRunBrief('colisao-roteirizada', 'impacto', 0), null);
  assert.equal(buildSompoScenarioRunBrief('__proto__', 'x', 0), null);
});
