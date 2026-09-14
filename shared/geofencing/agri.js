/**
 * Ponte entre o catálogo agrícola do /sompo e o geofencing (módulo shared/geofencing).
 * Posição da máquina em metros de cena, episódios de faixa da corrida inteira e o snapshot
 * enriquecido com radar e bandeira de proximidade. Tudo puro e função do relógio.
 *
 * Cenário sem talhão (getSompoAgriGeofenceSite → null) sai daqui exatamente como entrou:
 * o snapshot dos demais cenários não ganha campo nenhum.
 */
import {
  getSompoAgriFrame,
  getSompoAgriKeyframes,
  getSompoAgriScenario,
} from '../sompo-agri-scenarios.js';
import { createSompoAgriSimulationSnapshot, getSompoAgriTravelMeters } from '../sompo-agri-brief.js';
import { createSompoMotionPath } from '../sompo-motion.js';
import { evaluateGeofence } from './radar.js';
import { getSompoGeofenceSite } from './sites.js';
import { computeGeofenceEpisodes } from './engine.js';
import { getGeofenceMachine } from './machine-profiles.js';

const resolveOutcome = (scenario, outcomeId) => scenario.outcomes[outcomeId] || scenario.outcomes[scenario.defaultOutcomeId];

/** Origem em metros compartilhada pelo snapshot e pelo palco. */
export function getSompoAgriStartX(scenarioId, outcomeId) {
  const scenario = getSompoAgriScenario(scenarioId);
  return scenario.startX ?? -getSompoAgriTravelMeters(scenarioId, scenario.totalMs, outcomeId) / 2;
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
  return { x: (scenario.startX ?? -total.x / 2) + point.x, z: point.z + (useLateral ? frame.lateral : 0), headingDeg: 90 - frame.yaw };
}

/** Talhão ({ manifestRules, polygons, label }) do cenário, posicionado pelo percurso do desfecho; null nos cenários sem talhão. */
export function getSompoAgriGeofenceSite(scenarioId, outcomeId) {
  const scenario = getSompoAgriScenario(scenarioId);
  return getSompoGeofenceSite(scenario.environmentId, Math.abs(2 * getSompoAgriPosition(scenario.scenarioId, 0, outcomeId).x));
}

/** true só para cenários agrícolas com talhão mapeado. */
export function hasSompoAgriGeofence(scenarioId) {
  return getSompoAgriGeofenceSite(scenarioId) !== null;
}

// Episódios de faixa da corrida inteira de um desfecho, pelo mesmo motor do laboratório (computeGeofenceEpisodes).
// O roteiro é conhecido de ponta a ponta, então o painel mostra a corrida toda desde o primeiro quadro. As amostras
// levam a posição de cena marcada como fix sintético ('3d'), só para o motor aceitá-las; nada disso é persistido.
const runEpisodes = new Map();
/** Episódios de faixa (mapa e limite da máquina) do desfecho, ordenados por início; vazio nos cenários sem talhão. */
export function getSompoAgriGeofenceEpisodes(scenarioId, outcomeId, stepMs = 250) {
  if (!Number.isFinite(stepMs) || stepMs <= 0) throw new RangeError(`stepMs deve ser positivo: ${stepMs}`);
  const scenario = getSompoAgriScenario(scenarioId);
  const outcome = resolveOutcome(scenario, outcomeId);
  const key = `${scenario.scenarioId}:${outcome.id}:${stepMs}`;
  if (!runEpisodes.has(key)) {
    const site = getSompoAgriGeofenceSite(scenario.scenarioId, outcome.id);
    let episodes = [];
    if (site) {
      const samples = [];
      for (let t = 0; t <= scenario.totalMs; t += stepMs) {
        const { x, z } = getSompoAgriPosition(scenario.scenarioId, t, outcome.id);
        samples.push({ elapsedMs: t, timestamp: t, x, z, gnss_fix: '3d', roll_deg: getSompoAgriFrame(scenario.scenarioId, t, outcome.id).roll });
      }
      episodes = computeGeofenceEpisodes(samples, site.polygons, site.manifestRules, key, stepMs, getGeofenceMachine(scenario.equipmentId)).summary.episodes
        .sort((a, b) => a.startMs - b.startMs);
    }
    runEpisodes.set(key, Object.freeze(episodes.map(Object.freeze))); // campos escalares: congelar cada episódio basta
  }
  return runEpisodes.get(key);
}

/** Intervalo entre a amostra atual e a anterior usado pela tendência de aproximação do radar (ms). */
export const SOMPO_GEOFENCE_TREND_STEP_MS = 250;

/**
 * Bandeira de proximidade: faixa mais interna de qualquer perigo alertável (crítica na água, dentro na ribanceira) ou o
 * limite da máquina atingido. O declive (alertable: false) não acende sozinho. Atenção/elevada ficam no radar, não viram
 * alerta do ensaio. Olha `all`, não só `nearest`: dentro do declive, uma água a 4 m continua acendendo.
 */
export function sompoGeofenceProximity(geofence) {
  return !!geofence && (geofence.all.some(hit => hit.alertable && hit.innermost) || geofence.machine?.bandId === 'acima');
}

/**
 * Snapshot agrícola com posição de cena, radar (geofence) e bandeira de proximidade (risks.proximity).
 * Devolve o snapshot intocado quando o cenário não tem talhão.
 */
export function withSompoAgriGeofence(snapshot, scenarioId, outcomeId, elapsedMs = 0) {
  const site = getSompoAgriGeofenceSite(scenarioId, outcomeId);
  if (!site) return snapshot;
  const scenario = getSompoAgriScenario(scenarioId);
  const frame = getSompoAgriFrame(scenarioId, elapsedMs, outcomeId);
  const position = getSompoAgriPosition(scenarioId, elapsedMs, outcomeId);
  // Tendência de aproximação: o radar compara com a amostra de 250 ms atrás, recalculada do roteiro (sem estado no radar).
  const previous = elapsedMs >= SOMPO_GEOFENCE_TREND_STEP_MS ? { ...getSompoAgriPosition(scenarioId, elapsedMs - SOMPO_GEOFENCE_TREND_STEP_MS, outcomeId), elapsedMs: elapsedMs - SOMPO_GEOFENCE_TREND_STEP_MS } : undefined;
  const geofence = evaluateGeofence({ ...position, elapsedMs, previous, speedKph: frame.speedKph, rollDeg: frame.roll }, site.manifestRules, site.polygons, getGeofenceMachine(scenario.equipmentId));
  const proximity = sompoGeofenceProximity(geofence);
  return { ...snapshot, position, geofence, status: proximity ? 'alert' : snapshot.status, risks: { ...snapshot.risks, proximity } };
}

/** createSompoAgriSimulationSnapshot + withSompoAgriGeofence, para quem só quer o snapshot pronto. */
export function createSompoAgriGeofenceSnapshot(scenarioId, outcomeId, options = {}) {
  return withSompoAgriGeofence(createSompoAgriSimulationSnapshot(scenarioId, outcomeId, options), scenarioId, outcomeId, options.elapsedMs ?? 0);
}
