export type FleetOrigin = 'firebase' | 'simulation';
export interface FleetAlert { count: number; durationMs: number; knownMs: number }
export interface FleetJourney {
  id: string; startedAt: string; endedAt: string; sampleCount: number; durationMs: number; observedMs: number; gapMs: number;
  peakAcceleration: number | null; maxInclination: number | null;
  alerts: Record<'riscoColisao' | 'riscoInclinacao', FleetAlert>;
}
export interface FleetMachine extends Omit<FleetJourney, 'id' | 'startedAt' | 'endedAt'> {
  tractorId: string; sourceKind: FleetOrigin; journeys: FleetJourney[];
  months: { month: string; sampleCount: number; riscoColisao: number; riscoInclinacao: number }[];
}
export interface FleetEpisode {
  publicId: string; tractorId: string; sourceKind: FleetOrigin; scenarioLabel: string | null; status: string;
  startedAt: string; endedAt: string | null; sampleCount: number;
  peakAcceleration: number | null; peakAt: string | null;
  phases: { id: string; label: string; startedAt: string; endedAt: string; durationMs: number }[];
  frameCount: number;
}
export interface FleetData {
  generatedAt: string; journeyGapMs: number; observedGapMs: number; method: string;
  origins: { sourceKind: FleetOrigin; machines: FleetMachine[] }[];
  episodes: FleetEpisode[];
}
export const FLEET_JOURNEY_GAP_MS: number;
export const FLEET_OBSERVED_GAP_MS: number;
export function aggregateSompoFleet(rows: Iterable<Record<string, unknown>>): Omit<FleetData, 'generatedAt' | 'episodes'>;
