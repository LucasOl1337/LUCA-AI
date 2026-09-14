import type { FleetMachine } from './sompo-fleet.js';
export const SOMPO_FLEET_DEMO_LABEL: string;
export interface FleetDemoEpisode {
  id: string; tractorId: string; machineName: string; sourceKind: 'simulation'; synthetic: true;
  scenarioId: string; outcomeId: string; scenarioLabel: string; outcomeLabel: string; eventType: string;
  startedAt: string; month: string; durationMs: number; peakAcceleration: number; peakOffsetMs: number;
  firstAlertMs: number | null; alertDelayMs: number | null; prevented: boolean; preventionBasis: string;
}
export interface FleetDemo { label: string; synthetic: true; season: string; machines: FleetMachine[]; episodes: FleetDemoEpisode[] }
export function buildSompoFleetDemo(): FleetDemo;
