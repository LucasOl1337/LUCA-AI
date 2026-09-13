// Contrato visual das faixas de proximidade: uma rampa por tipo de perigo, do mais interno (forte) ao mais externo (claro).
// Usado pela cena (textura e rastro), pela legenda e pelo painel. Nenhuma regra de distância vive aqui (SPEC regra 1).
import { resolveHazards, type GeofenceEpisode, type LabHazard } from '../../../shared/geofencing/index.js';
import type { LabCase } from '../../../shared/lab-telemetry.js';

const RAMPS: Record<'water' | 'hazard', string[]> = {
  water: ['#1b5e8a', '#3f8fbf', '#9ac8e2'],
  hazard: ['#8b4a1a', '#c9823e', '#e7c39a'],
};
export const ROUTE_COLOR = '#215f47';

export function hazardsOf(labCase: LabCase | null): LabHazard[] {
  if (!labCase?.manifest?.rules || !labCase.polygons.length) return [];
  return resolveHazards(labCase.manifest.rules, labCase.polygons, labCase.manifest.machine ?? null);
}

// bandIndex = posição em hazard.bands (0 = mais interna).
export function bandColor(hazard: LabHazard, bandIndex: number): string {
  const ramp = RAMPS[hazard.polygon?.role === 'water' ? 'water' : 'hazard'];
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

// Zonas de inclinação derivadas do relevo para UMA máquina: 2 = inclinação do terreno ≥ limite da máquina, 1 = a até
// marginDeg do limite, 0 = fora. Mesma grade das faixas (célula a célula), para cena e minimapa pintarem igual.
// sampleTerrain(x, z) devolve altura em metros ou null fora da cobertura.
export function slopeZones(grid: { minX: number; minZ: number; cellM: number; cols: number; rows: number; inside: Uint8Array }, sampleTerrain: (x: number, z: number) => number | null, limitDeg: number, marginDeg = 5): Uint8Array {
  const zones = new Uint8Array(grid.cols * grid.rows);
  const d = grid.cellM;
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    const cell = row * grid.cols + col;
    if (!grid.inside[cell]) continue;
    const x = grid.minX + (col + 0.5) * d, z = grid.minZ + (row + 0.5) * d;
    const east = sampleTerrain(x + d, z), west = sampleTerrain(x - d, z), south = sampleTerrain(x, z + d), north = sampleTerrain(x, z - d);
    if (east === null || west === null || south === null || north === null) continue;
    const slopeDeg = Math.atan(Math.hypot((east - west) / (2 * d), (south - north) / (2 * d))) * 180 / Math.PI;
    zones[cell] = slopeDeg >= limitDeg ? 2 : slopeDeg >= limitDeg - marginDeg ? 1 : 0;
  }
  return zones;
}
export const SLOPE_ZONE_COLORS = ['', '#e7c39a', '#8b4a1a']; // 1 = próximo do limite, 2 = acima do limite (mesma rampa do perigo de declive)
export function machineRollLimit(labCase: LabCase | null): number | null {
  const profile = (labCase?.manifest?.machine as { profile?: { max_roll_deg?: unknown } } | undefined)?.profile;
  return typeof profile?.max_roll_deg === 'number' && Number.isFinite(profile.max_roll_deg) ? profile.max_roll_deg : null;
}
