import type { SompoTelemetrySnapshot } from './sompo-telemetry.js';

export type SompoSimulationScenarioId =
  | 'normal' | 'obstacle' | 'inclination' | 'rough-road'
  | 'hard-braking' | 'steep-climb' | 'steep-descent'
  | 'yard-maneuver' | 'shifted-load' | 'hot-weather'
  | 'rollover' | 'tire-blowout' | 'animal-crossing' | 'aquaplaning' | 'brake-failure'
  | 'engine-fire' | 'tight-reverse' | 'bogged-down' | 'driver-drowsiness' | 'fast-corner';

export interface SompoSimulationControls {
  scenarioId: SompoSimulationScenarioId;
  outcomeId?: string;
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

/** Frame roteirizado externo (mesmo formato dos frames rurais) para catálogos como o agrícola. */
export interface SompoExternalScriptFrame extends Omit<SompoSimulationControls, 'scenarioId' | 'outcomeId'> {
  scenarioId?: string;
  accelerationX?: number;
  yawRate?: number;
  pitchRate?: number;
  rollRate?: number;
  lateralAcceleration?: number;
  [key: string]: unknown;
}

export interface SompoSimulationSnapshotOptions {
  observedAt?: string;
  elapsedMs?: number;
  connectedAt?: string;
  scriptFrame?: SompoExternalScriptFrame | null;
  sourceOverride?: {
    scenarioId?: string;
    scenarioLabel?: string;
    outcomeId?: string;
    outcomeLabel?: string;
  } | null;
}

export const SOMPO_SIMULATION_SCENARIOS: Readonly<Record<SompoSimulationScenarioId, Readonly<SompoSimulationScenario>>>;

export function getSompoSimulationScenario(
  scenarioId?: SompoSimulationScenarioId,
): SompoSimulationScenario;

export function createSompoSimulationSnapshot(
  controls?: Partial<SompoSimulationControls>,
  options?: SompoSimulationSnapshotOptions,
): SompoTelemetrySnapshot;

export interface SompoScenarioOutcome {
  id: string;
  label: string;
  description: string;
}

export const SOMPO_SCENARIO_OUTCOMES: Readonly<Record<SompoSimulationScenarioId, readonly Readonly<SompoScenarioOutcome>[]>>;

export function getSompoScenarioOutcomes(scenarioId?: string): readonly Readonly<SompoScenarioOutcome>[];

export interface SompoEpisodePhase {
  readonly id: string;
  readonly label: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface SompoEpisodeFrameMoment {
  readonly offsetMs: number;
  readonly fase: string;
  readonly label: string;
}

export interface SompoEpisodePlan {
  readonly kind: 'roteiro';
  readonly catalog: 'rural' | 'agri';
  readonly scenarioId: string;
  readonly outcomeId: string;
  readonly outcomeLabel: string;
  readonly scenarioLabel: string;
  readonly totalMs: number;
  readonly sampleIntervalMs: number;
  readonly phases: readonly SompoEpisodePhase[];
  readonly frameMoments: readonly SompoEpisodeFrameMoment[];
}

export function sompoEpisodeFrameMoments(
  points: readonly { offsetMs: number; fase: string; label: string }[],
  totalMs: number,
  finalPhase: string,
  max?: number,
): SompoEpisodeFrameMoment[];

export function sompoEpisodeSampleOffsets(lastMs: number, elapsedMs: number, intervalMs: number, totalMs: number): number[];

export function getSompoEpisodePlan(scenarioId: string, outcomeId?: string | null): SompoEpisodePlan | null;

export interface SompoScenarioRunBriefPhase {
  atMs: number;
  label: string;
  speedKph: number | null;
  distance: number | null;
  collisionRisk: boolean;
  inclinationRisk: boolean;
}

export interface SompoScenarioRunBrief {
  scenarioId: SompoSimulationScenarioId;
  scenarioLabel: string;
  outcomeId: string;
  outcomeLabel: string;
  outcomeDescription: string;
  elapsedMs: number;
  scripted: boolean;
  totalMs: number | null;
  completed: boolean | null;
  travelMeters: number | null;
  phases: SompoScenarioRunBriefPhase[];
  flagTransitions: { atMs: number; flag: 'riscoColisao' | 'riscoInclinacao'; from: boolean; to: boolean }[];
}

export function buildSompoScenarioRunBrief(
  scenarioId: string,
  outcomeId?: string | null,
  elapsedMs?: number,
): SompoScenarioRunBrief | null;

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
  lateralRate: number;
  animalRate: number;
  pitchRate: number;
  rollRate: number;
  lateralAcceleration: number;
}
export const SOMPO_RURAL_SCRIPTS: Readonly<Partial<Record<SompoSimulationScenarioId, Readonly<{
  scenarioId: SompoSimulationScenarioId;
  totalMs: number;
  keyframes: readonly Readonly<Omit<SompoRuralFrame, 'accelerationX' | 'yawRate' | 'lateralRate' | 'pitchRate' | 'rollRate' | 'lateralAcceleration' | 'animalRate'>>[];
}>>>>;
export function getSompoRuralFrame(scenarioId: string, elapsedMs?: number, outcomeId?: string): SompoRuralFrame | null;

export interface SompoRuralScript {
  scenarioId: SompoSimulationScenarioId;
  totalMs: number;
  keyframes: readonly Readonly<Omit<SompoRuralFrame, 'accelerationX' | 'yawRate' | 'lateralRate' | 'pitchRate' | 'rollRate' | 'lateralAcceleration' | 'animalRate'>>[];
}

export function getSompoScenarioScript(scenarioId: string, outcomeId?: string | null): Readonly<SompoRuralScript> | null;

export function getSompoRuralTravelMeters(scenarioId: string, elapsedMs?: number, outcomeId?: string | null): number | null;

export function getSompoBrakingTravelMeters(elapsedMs?: number, initialSpeedKph?: number): number;
