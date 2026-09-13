/**
 * Adaptador entre o catálogo agrícola (shared/sompo-agri-scenarios.js) e o
 * núcleo do simulador: snapshot de telemetria com proveniência correta,
 * deslocamento em forma fechada e resumo do ensaio para a bancada: tudo sem
 * alterar o módulo agrícola. Puro: frames e integrais são função do relógio.
 */
import {
  SOMPO_AGRI_SCENARIOS,
  getSompoAgriFrame,
  getSompoAgriOutcomePhases,
  getSompoAgriScenario,
} from './sompo-agri-scenarios.js';
import { createSompoSimulationSnapshot, sompoEpisodeFrameMoments } from './sompo-telemetry-simulator.js';

const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const round1 = (value) => Math.round(value * 10) / 10;

export function isSompoAgriScenarioId(scenarioId) {
  return typeof scenarioId === 'string' && Object.hasOwn(SOMPO_AGRI_SCENARIOS, scenarioId);
}

/** Lista ordenada de desfechos (o padrão primeiro), no formato do núcleo. */
export function getSompoAgriOutcomes(scenarioId) {
  const scenario = getSompoAgriScenario(scenarioId);
  const all = Object.values(scenario.outcomes);
  const ordered = [
    scenario.outcomes[scenario.defaultOutcomeId],
    ...all.filter((item) => item.id !== scenario.defaultOutcomeId),
  ];
  return ordered.map(({ id, label, description }) => ({ id, label, description }));
}

function resolveOutcome(scenario, outcomeId) {
  return scenario.outcomes[outcomeId] || scenario.outcomes[scenario.defaultOutcomeId];
}

/** Keyframes em cascata (mesma semântica do getSompoAgriFrame) com os campos de movimento. */
function cascadedKeyframes(scenario, outcome) {
  const base = {
    atMs: 0,
    speedKph: scenario.speedKph,
    distance: scenario.distance,
    direction: 1,
    collisionRisk: scenario.collisionRisk,
    inclinationRisk: scenario.inclinationRisk,
  };
  const frames = [];
  for (const keyframe of outcome.keyframes) {
    for (const key of Object.keys(base)) {
      if (keyframe[key] !== undefined) base[key] = keyframe[key];
    }
    base.atMs = keyframe.atMs;
    frames.push({ ...base });
  }
  return frames;
}

/**
 * Deslocamento (m, com sinal): mesma forma fechada do núcleo:
 * ∫ smoothstep = p³ − p⁴/2 sobre speedKph·direction por segmento. Válida porque
 * o catálogo agrícola garante troca de direção só entre pontas imobilizadas.
 */
export function getSompoAgriTravelMeters(scenarioId, elapsedMs = 0, outcomeId) {
  const scenario = getSompoAgriScenario(scenarioId);
  const outcome = resolveOutcome(scenario, outcomeId);
  const frames = cascadedKeyframes(scenario, outcome);
  const elapsed = Math.max(0, finite(elapsedMs, 0));
  let travel = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const from = frames[index - 1];
    const to = frames[index];
    const segmentMs = to.atMs - from.atMs;
    if (segmentMs <= 0) continue;
    const speedFrom = (from.speedKph / 3.6) * from.direction;
    const speedTo = (to.speedKph / 3.6) * to.direction;
    const progress = clamp((elapsed - from.atMs) / segmentMs, 0, 1);
    travel += (segmentMs / 1000) * ((speedFrom * progress)
      + ((speedTo - speedFrom) * ((progress ** 3) - ((progress ** 4) / 2))));
    if (elapsed <= to.atMs) return travel;
  }
  const last = frames[frames.length - 1];
  return travel + (((elapsed - scenario.totalMs) / 1000) * ((last.speedKph / 3.6) * last.direction));
}

/**
 * Snapshot de telemetria do ensaio agrícola: o frame roteirizado entra como
 * scriptFrame (faixas amplas de roll, gravidade rotacionada, taxas do roteiro)
 * e a proveniência aponta o cenário/desfecho agrícolas reais.
 */
export function createSompoAgriSimulationSnapshot(scenarioId, outcomeId, {
  observedAt = new Date().toISOString(),
  elapsedMs = 0,
  connectedAt,
} = {}) {
  const frame = getSompoAgriFrame(scenarioId, elapsedMs, outcomeId);
  const scriptFrame = {
    ...frame,
    lateralAcceleration: (frame.speedKph / 3.6) * frame.yawRate * (Math.PI / 180),
  };
  return createSompoSimulationSnapshot({}, {
    observedAt,
    elapsedMs,
    connectedAt,
    scriptFrame,
    sourceOverride: {
      scenarioId: frame.scenarioId,
      scenarioLabel: frame.outcomeId === getSompoAgriScenario(scenarioId).defaultOutcomeId
        ? frame.scenarioLabel
        : `${frame.scenarioLabel} · ${frame.outcomeLabel}`,
      outcomeId: frame.outcomeId,
      outcomeLabel: frame.outcomeLabel,
      distanceSensorPosition: frame.distanceSensorPosition,
    },
  });
}

/**
 * Plano de episódio de um desfecho agrícola: mesmo contrato de
 * getSompoEpisodePlan: todo desfecho agrícola é roteirizado (keyframes), então
 * o plano só é nulo quando o cenário não existe.
 */
export function getSompoAgriEpisodePlan(scenarioId, outcomeId) {
  if (!isSompoAgriScenarioId(scenarioId)) return null;
  const scenario = getSompoAgriScenario(scenarioId);
  const outcome = resolveOutcome(scenario, outcomeId);
  const phases = getSompoAgriOutcomePhases(scenario, outcome);
  const phaseAt = (atMs) => phases.find((phase) => atMs < phase.endMs) ?? phases.at(-1);
  const points = outcome.keyframes.map((keyframe) => {
    const phase = phaseAt(keyframe.atMs);
    return { offsetMs: keyframe.atMs, fase: phase.id, label: phase.label };
  });
  return Object.freeze({
    kind: 'roteiro',
    catalog: 'agri',
    scenarioId: scenario.scenarioId,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    scenarioLabel: outcome.id === scenario.defaultOutcomeId ? scenario.label : `${scenario.label} · ${outcome.label}`,
    totalMs: scenario.totalMs,
    sampleIntervalMs: scenario.sampleIntervalMs,
    phases,
    frameMoments: Object.freeze(sompoEpisodeFrameMoments(points, scenario.totalMs, phases.at(-1).id)),
  });
}

/** Resumo do ensaio agrícola no mesmo contrato de buildSompoScenarioRunBrief. */
export function buildSompoAgriRunBrief(scenarioId, outcomeId, elapsedMs = 0) {
  if (!isSompoAgriScenarioId(scenarioId)) return null;
  const scenario = getSompoAgriScenario(scenarioId);
  const outcome = resolveOutcome(scenario, outcomeId);
  const frames = cascadedKeyframes(scenario, outcome);
  const elapsed = Math.max(0, finite(elapsedMs, 0));
  const frameAt = (atMs) => frames.findLast?.((frame) => frame.atMs <= atMs)
    ?? [...frames].reverse().find((frame) => frame.atMs <= atMs)
    ?? frames[0];
  const phases = getSompoAgriOutcomePhases(scenario, outcome).map((phase) => {
    const state = frameAt(phase.startMs);
    return {
      atMs: phase.startMs,
      label: phase.label,
      speedKph: round1(state.speedKph),
      distance: Math.round(state.distance),
      collisionRisk: state.collisionRisk,
      inclinationRisk: state.inclinationRisk,
    };
  });
  const flagTransitions = [];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    for (const [key, flag] of [['collisionRisk', 'riscoColisao'], ['inclinationRisk', 'riscoInclinacao']]) {
      if (previous[key] !== current[key]) {
        flagTransitions.push({ atMs: current.atMs, flag, from: previous[key], to: current[key] });
      }
    }
  }
  return {
    scenarioId: scenario.scenarioId,
    scenarioLabel: scenario.label,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    outcomeDescription: outcome.description,
    elapsedMs: Math.round(elapsed),
    scripted: true,
    totalMs: scenario.totalMs,
    completed: elapsed >= scenario.totalMs,
    travelMeters: round1(getSompoAgriTravelMeters(scenarioId, elapsed, outcome.id)),
    phases,
    flagTransitions,
  };
}
