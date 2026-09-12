// Contrato visual das faixas de proximidade: uma rampa por tipo de perigo, do mais interno (forte) ao mais externo (claro).
// Usado pela cena (textura e rastro), pela legenda e pelo painel. Nenhuma regra de distância vive aqui (SPEC regra 1).
import { resolveHazards, type GeofenceEpisode, type LabHazard } from '../../../shared/lab-geofence.js';
import type { LabCase } from '../../../shared/lab-telemetry.js';

const RAMPS: Record<'water' | 'hazard', string[]> = {
  water: ['#1b5e8a', '#3f8fbf', '#9ac8e2'],
  hazard: ['#8b4a1a', '#c9823e', '#e7c39a'],
};
export const ROUTE_COLOR = '#215f47';

export function hazardsOf(labCase: LabCase | null): LabHazard[] {
  if (!labCase?.manifest?.rules || !labCase.polygons.length) return [];
  return resolveHazards(labCase.manifest.rules, labCase.polygons);
}

// bandIndex = posição em hazard.bands (0 = mais interna).
export function bandColor(hazard: LabHazard, bandIndex: number): string {
  const ramp = RAMPS[hazard.polygon.role === 'water' ? 'water' : 'hazard'];
  const n = Math.max(1, hazard.bands.length - 1);
  return ramp[Math.round(bandIndex * (ramp.length - 1) / n)];
}

export function episodeAt(episodes: GeofenceEpisode[], hazardKey: string, elapsedMs: number): GeofenceEpisode | null {
  return episodes.find(e => e.hazardKey === hazardKey && e.startMs <= elapsedMs && (e.endMs === null || elapsedMs < e.endMs)) ?? null;
}

// Faixa mais interna entre todos os perigos no instante; null = fora de qualquer faixa.
export function innermostEpisodeAt(labCase: LabCase, elapsedMs: number): GeofenceEpisode | null {
  let best: GeofenceEpisode | null = null;
  for (const hazard of hazardsOf(labCase)) {
    const episode = episodeAt(labCase.geofence?.episodes ?? [], hazard.key, elapsedMs);
    if (episode && (!best || episode.bandMaxM < best.bandMaxM)) best = episode;
  }
  return best;
}

export function episodeColor(labCase: LabCase, episode: GeofenceEpisode): string {
  const hazard = hazardsOf(labCase).find(h => h.key === episode.hazardKey);
  if (!hazard) return ROUTE_COLOR;
  return bandColor(hazard, Math.max(0, hazard.bands.findIndex(b => b.id === episode.bandId)));
}
