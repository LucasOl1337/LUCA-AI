import type { LabEvent, LabPolygon, LabPoint, LabSample } from './lab-telemetry.js';

export interface LabBandRule { id: string; label?: string; max_m: number }
export interface LabHazardRule {
  role: 'water' | 'hazard' | 'machine';
  category?: string;
  metric?: 'roll_deg' | 'pitch_deg';   // role machine: sinal do CSV comparado ao limite (padrão roll_deg)
  limit_deg?: number;                  // role machine: limite fixo; ausente = machine.profile.max_<metric>
  label?: string;
  bands_m: LabBandRule[];
  justification?: string;
  alertable?: boolean;                 // false = contexto territorial: não acende alerta sozinho (padrão true)
}
export interface LabGeofenceRules { water_warning_distance_m?: number; hazards?: LabHazardRule[]; [key: string]: unknown }
export interface LabHazard {
  key: string;
  label: string;
  justification: string | null;
  bands: LabBandRule[];
  reach: number;
  polygon: LabPolygon | null;          // null = perigo de máquina (sem geometria; faixas em graus de margem)
  box: { minX: number; minZ: number; maxX: number; maxZ: number } | null;
  metric: string | null;
  limit: number | null;
  unit: 'm' | 'deg';
  alertable: boolean;
}
export interface GeofenceEpisode {
  id: string;                 // `${caseId}:geo:${hazardKey}:${bandId}:${startMs}`
  hazardKey: string;          // role + category + polygon id
  hazardLabel: string;
  bandId: string; bandLabel: string; bandMaxM: number;
  alertable: boolean;         // regra do perigo (false = contexto territorial)
  startMs: number; endMs: number | null;      // null = aberto no fim da observação
  observedMs: number;         // soma dos intervalos com posição válida
  gapMs: number;              // intervalos sem GNSS dentro do episódio
  minDistanceM: number; minDistanceAtMs: number;
  sampleCount: number;
  quality: 'observado' | 'com-lacuna' | 'aberto-no-fim';
}
export interface GeofenceSummary {
  episodes: GeofenceEpisode[];
  affectedArea: { hazardKey: string; bandId: string; areaM2: number; shareOfAllowed: number; method: `grade ${number} m` }[];
  grid: LabBandGrid | null;   // a mesma grade que somou a área; a cena pinta a partir dela
  rulesVersion: string;       // hash do bloco rules usado
  warnings: string[];
}
export interface LabBandGrid {
  minX: number; minZ: number; cellM: number; cols: number; rows: number;
  inside: Uint8Array;         // 1 = célula dentro de allowed_area
  bands: Int16Array[];         // por perigo: índice da faixa em hazards[h].bands, -1 = nenhuma
}
export function classifyBand<T extends LabBandRule>(distanceM: number, bands: T[]): T | null;
export function resolveHazards(rules: LabGeofenceRules | null | undefined, polygons: LabPolygon[], machine?: { profile?: Record<string, number | undefined> } | null): LabHazard[] & { warnings: string[] };
export function computeGeofenceEpisodes(samples: LabSample[], polygons: LabPolygon[], rules: LabGeofenceRules, caseId: string, sampleIntervalMs?: number, machine?: { profile?: Record<string, number | undefined> } | null): { summary: GeofenceSummary; events: LabEvent[] };
export function bandGrid(polygons: LabPolygon[], hazards: LabHazard[], cellM?: number): LabBandGrid | null;
export function affectedArea(polygons: LabPolygon[], hazards: LabHazard[], cellM?: number): GeofenceSummary['affectedArea'];
export type { LabPoint };
