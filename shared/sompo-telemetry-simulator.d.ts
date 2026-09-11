import type { SompoTelemetrySnapshot } from './sompo-telemetry.js';

export type SompoSimulationScenarioId =
  | 'normal' | 'obstacle' | 'inclination' | 'rough-road'
  | 'hard-braking' | 'steep-climb' | 'steep-descent'
  | 'yard-maneuver' | 'shifted-load' | 'hot-weather'
  | 'rollover' | 'tire-blowout' | 'animal-crossing' | 'aquaplaning' | 'brake-failure'
  | 'engine-fire' | 'tight-reverse' | 'bogged-down' | 'driver-drowsiness' | 'fast-corner';

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

export interface SompoCollisionFrameMoment {
  offsetMs: number;
  fase: SompoCollisionScriptPhaseId;
  label: string;
}

export const SOMPO_COLLISION_FRAME_MOMENTS: readonly Readonly<SompoCollisionFrameMoment>[];

export function getSompoCollisionScriptPhase(elapsedMs: number): SompoCollisionScriptPhaseId;

export function createSompoCollisionScriptSnapshot(
  elapsedMs: number,
  options?: { observedAt?: string; connectedAt?: string },
): SompoTelemetrySnapshot;

export type SompoBrakingScriptPhaseId = 'deslocamento' | 'frenagem' | 'repouso';

export const SOMPO_BRAKING_SCRIPT: Readonly<{
  scenarioId: 'hard-braking';
  totalMs: number;
  phases: readonly Readonly<{
    id: SompoBrakingScriptPhaseId;
    label: string;
    startMs: number;
    endMs: number;
  }>[];
}>;

export interface SompoBrakingScriptState {
  phaseId: SompoBrakingScriptPhaseId;
  phaseLabel: string;
  speedKph: number;
  accelerationX: number;
  pitchOffset: number;
  pitchRate: number;
}

export function getSompoBrakingScriptState(
  elapsedMs: number,
  initialSpeedKph?: number,
): SompoBrakingScriptState;

export interface SompoRuralFrame extends SompoSimulationScenario {
  atMs: number;
  phaseLabel: string;
  yaw: number;
  lateral: number;
  rain: number;
  smoke: number;
  sink: number;
  animalZ: number;
  wheelSpeedKph: number | null;
  direction: number;
  accelerationX: number;
  yawRate: number;
  pitchRate: number;
  rollRate: number;
  lateralAcceleration: number;
}
export const SOMPO_RURAL_SCRIPTS: Readonly<Partial<Record<SompoSimulationScenarioId, Readonly<{
  scenarioId: SompoSimulationScenarioId;
  totalMs: number;
  keyframes: readonly Readonly<Omit<SompoRuralFrame, 'accelerationX' | 'yawRate' | 'pitchRate' | 'rollRate' | 'lateralAcceleration'>>[];
}>>>>;
export function getSompoRuralFrame(scenarioId: string, elapsedMs?: number): SompoRuralFrame | null;
