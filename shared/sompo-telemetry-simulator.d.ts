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

export type SompoCollisionScriptPhaseId = 'aproximacao' | 'impacto' | 'pos-impacto';

export interface SompoCollisionScriptPhase {
  id: SompoCollisionScriptPhaseId;
  label: string;
  startMs: number;
  endMs: number;
}

export interface SompoCollisionScript {
  kind: 'colisao';
  scenarioId: string;
  label: string;
  description: string;
  totalMs: number;
  sampleIntervalMs: number;
  phases: readonly SompoCollisionScriptPhase[];
}

export const SOMPO_COLLISION_SCRIPT: Readonly<SompoCollisionScript>;

export function getSompoCollisionScriptPhase(elapsedMs: number): SompoCollisionScriptPhaseId;

export function createSompoCollisionScriptSnapshot(
  elapsedMs: number,
  options?: { observedAt?: string; connectedAt?: string },
): SompoTelemetrySnapshot;
