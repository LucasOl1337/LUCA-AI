import type { SompoTelemetrySnapshot } from './sompo-telemetry.js';

export type SompoSimulationScenarioId = 'normal' | 'obstacle' | 'inclination' | 'rough-road';

export interface SompoSimulationControls {
  scenarioId: SompoSimulationScenarioId;
  speedKph: number;
  distance: number;
  temperature: number;
  humidity: number;
  pitch: number;
  roll: number;
  roughness: number;
  collisionRisk: boolean;
  inclinationRisk: boolean;
}

export interface SompoSimulationScenario extends SompoSimulationControls {
  label: string;
  description: string;
}

export interface SompoSimulationSnapshotOptions {
  observedAt?: string;
  elapsedMs?: number;
  connectedAt?: string;
}

export const SOMPO_SIMULATION_SCENARIOS: Readonly<Record<SompoSimulationScenarioId, Readonly<SompoSimulationScenario>>>;

export function getSompoSimulationScenario(
  scenarioId?: SompoSimulationScenarioId,
): SompoSimulationScenario;

export function createSompoSimulationSnapshot(
  controls?: Partial<SompoSimulationControls>,
  options?: SompoSimulationSnapshotOptions,
): SompoTelemetrySnapshot;
