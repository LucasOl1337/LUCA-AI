/**
 * Adaptador entre o catálogo agrícola (shared/sompo-agri-scenarios.js) e o
 * núcleo do simulador: snapshot de telemetria com proveniência correta,
 * deslocamento em forma fechada e resumo do ensaio para a bancada — tudo sem
 * alterar o módulo agrícola. Puro: frames e integrais são função do relógio.
 */
import {
  SOMPO_AGRI_EQUIPMENT,
  SOMPO_AGRI_SCENARIOS,
  getSompoAgriFrame,
  getSompoAgriKeyframes,
  getSompoAgriScenario,
} from './sompo-agri-scenarios.js';
import { createSompoSimulationSnapshot, sompoEpisodeFrameMoments } from './sompo-telemetry-simulator.js';
import { createSompoMotionPath } from './sompo-motion.js';
import { evaluateGeofence } from './sompo-geofence.js';
import { getSompoGeofenceSite } from './sompo-geofence-sites.js';
import { computeGeofenceEpisodes } from './lab-geofence.js';
export { describeGeofence, describeMachineLimit } from './sompo-geofence.js';

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
 * Deslocamento (m, com sinal) — mesma forma fechada do núcleo:
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

/** Origem em metros compartilhada pelo snapshot e pelo palco. */
export function getSompoAgriStartX(scenarioId, outcomeId) {
  return -getSompoAgriTravelMeters(scenarioId, getSompoAgriScenario(scenarioId).totalMs, outcomeId) / 2;
}

// Mesma posição que o palco 3D (createSompoAgriStage): rumo integrado por createSompoMotionPath, e o
// deslocamento lateral explícito só quando algum quadro do desfecho o pede, como lá. Tabela de 60 Hz construída uma vez por desfecho.
const motionPaths = new Map();
function motionPath(scenarioId, outcomeId) {
  const scenario = getSompoAgriScenario(scenarioId);
  const outcome = resolveOutcome(scenario, outcomeId);
  const key = `${scenario.scenarioId}:${outcome.id}`;
  if (!motionPaths.has(key)) {
    const path = createSompoMotionPath(at => getSompoAgriFrame(scenario.scenarioId, at, outcome.id), scenario.totalMs);
    const useLateral = getSompoAgriKeyframes(scenario.scenarioId, outcome.id).some(keyframe => Math.abs(keyframe.lateral) > 1e-3);
    motionPaths.set(key, { path, useLateral });
  }
  return motionPaths.get(key);
}
/** Posição da máquina em metros de cena no instante: x leste, z sul, rumo 0 = norte / 90 = leste. Igual à cena 3D. */
export function getSompoAgriPosition(scenarioId, elapsedMs = 0, outcomeId) {
  const scenario = getSompoAgriScenario(scenarioId);
  const outcome = resolveOutcome(scenario, outcomeId);
  const { path, useLateral } = motionPath(scenario.scenarioId, outcome.id);
  const total = path.sample(scenario.totalMs, { x: 0, z: 0 });
  const point = path.sample(elapsedMs, { x: 0, z: 0 });
  const frame = getSompoAgriFrame(scenario.scenarioId, elapsedMs, outcome.id);
  return { x: -total.x / 2 + point.x, z: point.z + (useLateral ? frame.lateral : 0), headingDeg: 90 - frame.yaw };
}

// Episódios de faixa da corrida inteira de um desfecho, pelo mesmo motor do laboratório (computeGeofenceEpisodes).
// O roteiro é conhecido de ponta a ponta, então o painel mostra a corrida toda desde o primeiro quadro. As amostras
// levam a posição de cena marcada como fix sintético ('3d'), só para o motor aceitá-las; nada disso é persistido.
const runEpisodes = new Map();
/** Episódios de faixa (mapa e limite da máquina) do desfecho, ordenados por início; vazio nos cenários sem talhão. */
export function getSompoAgriGeofenceEpisodes(scenarioId, outcomeId, stepMs = 250) {
  const scenario = getSompoAgriScenario(scenarioId);
  const outcome = resolveOutcome(scenario, outcomeId);
  const key = `${scenario.scenarioId}:${outcome.id}:${stepMs}`;
  if (!runEpisodes.has(key)) {
    const site = getSompoGeofenceSite(scenario.environmentId, Math.abs(2 * getSompoAgriPosition(scenario.scenarioId, 0, outcome.id).x));
    let episodes = [];
    if (site) {
      const samples = [];
      for (let t = 0; t <= scenario.totalMs; t += stepMs) {
        const { x, z } = getSompoAgriPosition(scenario.scenarioId, t, outcome.id);
        samples.push({ elapsedMs: t, timestamp: t, x, z, gnss_fix: '3d', roll_deg: getSompoAgriFrame(scenario.scenarioId, t, outcome.id).roll });
      }
      episodes = computeGeofenceEpisodes(samples, site.polygons, site.manifestRules, key, stepMs, SOMPO_AGRI_EQUIPMENT[scenario.equipmentId]).summary.episodes
        .sort((a, b) => a.startMs - b.startMs);
    }
    runEpisodes.set(key, Object.freeze(episodes));
  }
  return runEpisodes.get(key);
}

/** Snapshot agrícola com proveniência, posição de cena e radar sintético. */
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
  const snapshot = createSompoSimulationSnapshot({}, {
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
    },
  });
  const scenario = getSompoAgriScenario(scenarioId);
  const position = getSompoAgriPosition(scenarioId, elapsedMs, outcomeId);
  const site = getSompoGeofenceSite(scenario.environmentId, Math.abs(2 * getSompoAgriPosition(scenarioId, 0, outcomeId).x));
  // Só o cenário de geofencing tem talhão; nos demais o snapshot leva position e geofence = null (campos só adicionados).
  const geofence = site ? evaluateGeofence({ ...position, speedKph: frame.speedKph, rollDeg: frame.roll }, site.manifestRules, site.polygons, SOMPO_AGRI_EQUIPMENT[scenario.equipmentId]) : null;
  // Bandeira de proximidade: só a faixa mais interna (crítica na água, dentro no declive/ribanceira) ou o limite da
  // máquina atingido. Atenção/elevada ficam no radar, não viram alerta do ensaio. Eleva status como as flags do firmware.
  const proximity = !!geofence && (['critica', 'dentro'].includes(geofence.nearest?.bandId ?? '') || geofence.machine?.bandId === 'acima');
  return { ...snapshot, position, geofence, status: proximity ? 'alert' : snapshot.status, risks: { ...snapshot.risks, proximity } };
}

/**
 * Plano de episódio de um desfecho agrícola — mesmo contrato de
 * getSompoEpisodePlan: todo desfecho agrícola é roteirizado (keyframes), então
 * o plano só é nulo quando o cenário não existe.
 */
export function getSompoAgriEpisodePlan(scenarioId, outcomeId) {
  if (!isSompoAgriScenarioId(scenarioId)) return null;
  const scenario = getSompoAgriScenario(scenarioId);
  const outcome = resolveOutcome(scenario, outcomeId);
  const phaseAt = (atMs) => scenario.phases.find((phase) => atMs < phase.endMs) ?? scenario.phases.at(-1);
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
    phases: scenario.phases,
    frameMoments: Object.freeze(sompoEpisodeFrameMoments(points, scenario.totalMs, scenario.phases.at(-1).id)),
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
  const phases = scenario.phases.map((phase) => {
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
