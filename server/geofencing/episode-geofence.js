/**
 * Geofencing do episódio gravado no servidor (módulo server/geofencing). Recebe as amostras persistidas
 * (pos_x, pos_z, heading_deg, geofence_hazard, geofence_band) e o episódio, e devolve summary.geofence
 * para o dossiê (shared/geofencing/episode-dossier.js). Colunas e migração continuam em sompo-telemetry-history.js.
 */
import { getSompoAgriScenario } from '../../shared/sompo-agri-scenarios.js';
import { isSompoAgriScenarioId } from '../../shared/sompo-agri-brief.js';
import { getSompoAgriGeofenceSite } from '../../shared/geofencing/agri.js';
import { getGeofenceMachine } from '../../shared/geofencing/machine-profiles.js';
import { SOMPO_GEOFENCE_SITE_VERSION } from '../../shared/geofencing/sites.js';
import { computeGeofenceEpisodes } from '../../shared/geofencing/engine.js';
import { evaluateGeofence } from '../../shared/geofencing/radar.js';

const medianOf = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const roundAvg = (value) => (value === null || value === undefined ? null : Math.round(value * 100) / 100);

/**
 * Episódios de faixa do episódio gravado: o mesmo computeGeofenceEpisodes do laboratório sobre a série persistida
 * (posição de cena sintética marcada como fix '3d', inclinação gravada como roll_deg), com o talhão resolvido pelo
 * roteiro que o episódio lembra. Devolve null sem cenário agrícola com talhão ou sem amostras. É o que os agentes
 * recebem no dossiê: exposição por proximidade e margem em graus, nunca contato, causa ou rótulo da operação.
 */
export function summarizeEpisodeGeofence(samples, episode) {
  const scenarioId = episode?.scenarioId;
  if (!samples.length || !isSompoAgriScenarioId(scenarioId)) return null;
  const scenario = getSompoAgriScenario(scenarioId);
  // Desfecho desconhecido: sem adivinhar o padrão (o talhão é posicionado pelo percurso do desfecho).
  if (episode.outcomeId && !scenario.outcomes[episode.outcomeId]) return null;
  const outcomeId = episode.outcomeId || scenario.defaultOutcomeId;
  const site = getSompoAgriGeofenceSite(scenarioId, outcomeId);
  if (!site) return null;
  const machine = getGeofenceMachine(scenario.equipmentId);
  const originMs = samples[0].observedMs;
  const series = samples.map((sample) => ({
    elapsedMs: sample.observedMs - originMs, timestamp: sample.observedAt,
    x: sample.posX, z: sample.posZ, gnss_fix: sample.posX !== null && sample.posZ !== null ? '3d' : null, roll_deg: sample.roll,
  }));
  const intervals = series.slice(1).map((sample, index) => sample.elapsedMs - series[index].elapsedMs);
  const sampleIntervalMs = intervals.length ? medianOf(intervals) : 0;
  const { summary } = computeGeofenceEpisodes(series, site.polygons, site.manifestRules, `episodio:${episode.publicId}`, sampleIntervalMs, machine);
  // Coerência entre o radar gravado no instante e o recálculo pela geometria; bandeira = faixa mais interna alertável ou limite.
  let samplesWithPosition = 0, recordedBandMismatches = 0, alertSamples = 0;
  samples.forEach((sample, index) => {
    if (series[index].gnss_fix !== '3d') return;
    samplesWithPosition += 1;
    const result = evaluateGeofence({ x: sample.posX, z: sample.posZ, headingDeg: sample.headingDeg, rollDeg: sample.roll }, site.manifestRules, site.polygons, machine);
    const recorded = sample.geofenceBand ? `${sample.geofenceHazard}:${sample.geofenceBand}` : null;
    const recomputed = result.nearest ? `${result.nearest.hazardKey}:${result.nearest.bandId}` : null;
    if (recorded !== recomputed) recordedBandMismatches += 1;
    if (result.all.some((hit) => hit.alertable && hit.innermost) || result.machine?.bandId === 'acima') alertSamples += 1;
  });
  return {
    notice: 'Faixas são parâmetros declarados no talhão sintético, não distâncias de segurança calibradas. Episódios medem exposição por proximidade e margem em graus; não comprovam contato nem causa.',
    site: { environmentId: scenario.environmentId, label: site.label, synthetic: true, version: SOMPO_GEOFENCE_SITE_VERSION, scenarioId, outcomeId },
    machine: { equipmentId: machine.id, label: machine.label, maxRollDeg: machine.profile.max_roll_deg, synthetic: true },
    rules: site.manifestRules.hazards.map((rule) => ({
      role: rule.role, category: rule.category ?? null, label: rule.label, alertable: rule.alertable !== false,
      unit: rule.role === 'machine' ? 'deg' : 'm', bands: rule.bands_m.map((band) => ({ id: band.id, label: band.label, max: band.max_m })), justification: rule.justification ?? null,
    })),
    sampleIntervalMs, samplesWithPosition, recordedBandMismatches, alertSamples, alertMs: alertSamples * sampleIntervalMs,
    episodes: summary.episodes
      .map(({ id, hazardKey, hazardLabel, bandId, bandLabel, bandMaxM, alertable, startMs, endMs, observedMs, gapMs, minDistanceM, minDistanceAtMs, quality }) => ({
        id, hazardKey, hazardLabel, bandId, bandLabel, bandMax: bandMaxM, unit: hazardKey.startsWith('machine') ? 'deg' : 'm', alertable,
        startMs, endMs, observedMs, gapMs, minDistance: roundAvg(minDistanceM), minDistanceAtMs, quality,
      }))
      .sort((left, right) => left.startMs - right.startMs || left.hazardKey.localeCompare(right.hazardKey)),
    affectedArea: summary.affectedArea,
    warnings: summary.warnings,
  };
}
