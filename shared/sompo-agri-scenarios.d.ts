import type { SompoSimulationControls } from './sompo-telemetry-simulator.js';

export type SompoAgriEquipmentId = 'tractor' | 'harvester';
export type SompoAgriScenarioId =
  | 'agri-harvest-dust'
  | 'agri-tractor-rollover'
  | 'agri-hydraulic-failure'
  | 'agri-field-bogging'
  | 'agri-barn-maneuver'
  | 'agri-night-operation'
  | 'agri-geofencing';
export type SompoAgriEnvironmentId =
  | 'row-crop-field'
  | 'sloped-field'
  | 'muddy-field'
  | 'farm-barn'
  | 'row-crop-field-night'
  | 'geofence-field';

export interface SompoAgriEquipment {
  readonly id: SompoAgriEquipmentId;
  readonly label: string;
  readonly assetUrl: string;
  readonly provenanceUrl: string;
  readonly nominalSizeM: Readonly<{ length: number; width: number; height: number }>;
  readonly forwardAxis: '+X';
  readonly profile: Readonly<{ max_roll_deg: number; synthetic: true }>;
}

export interface SompoAgriPhase {
  readonly id: string;
  readonly label: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface SompoAgriKeyframe extends Partial<SompoAgriVisualFrame> {
  readonly atMs: number;
}

export interface SompoAgriOutcome {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly keyframes: readonly Readonly<SompoAgriKeyframe>[];
}

export interface SompoAgriScenario extends Omit<SompoSimulationControls, 'scenarioId'> {
  readonly scenarioId: SompoAgriScenarioId;
  readonly label: string;
  readonly description: string;
  readonly equipmentId: SompoAgriEquipmentId;
  readonly environmentId: SompoAgriEnvironmentId;
  readonly defaultOutcomeId: string;
  readonly totalMs: number;
  readonly sampleIntervalMs: number;
  readonly phases: readonly Readonly<SompoAgriPhase>[];
  readonly outcomes: Readonly<Record<string, Readonly<SompoAgriOutcome>>>;
}

export interface SompoAgriVisualFrame extends Omit<SompoSimulationControls, 'scenarioId'> {
  scenarioId: SompoAgriScenarioId;
  atMs: number;
  scenarioLabel: string;
  equipmentId: SompoAgriEquipmentId;
  environmentId: SompoAgriEnvironmentId;
  outcomeId: string;
  outcomeLabel: string;
  phaseId: string;
  phaseLabel: string;
  yaw: number;
  lateral: number;
  vertical: number;
  direction: number;
  wheelSpeedKph: number | null;
  dust: number;
  mud: number;
  sink: number;
  cropCut: number;
  headerSpeed: number;
  implementLift: number;
  implementRoll: number;
  implementYaw: number;
  hydraulicPressure: number;
  shudder: number;
  headlights: number;
  workLights: number;
  brakeLights: number;
  beacon: number;
  engineSmoke: number;
  accelerationX: number;
  yawRate: number;
  pitchRate: number;
  rollRate: number;
  implementLiftRate: number;
}

export const SOMPO_AGRI_EQUIPMENT: Readonly<Record<SompoAgriEquipmentId, Readonly<SompoAgriEquipment>>>;
export const SOMPO_AGRI_SCENARIOS: Readonly<Record<SompoAgriScenarioId, Readonly<SompoAgriScenario>>>;

export function getSompoAgriScenario(scenarioId?: string): Readonly<SompoAgriScenario>;
export function getSompoAgriFrame(scenarioId: string, elapsedMs?: number, outcomeId?: string): SompoAgriVisualFrame;
export function toSompoSimulationControls(frame: SompoAgriVisualFrame): Omit<SompoSimulationControls, 'scenarioId'> & { scenarioId: SompoAgriScenarioId };
export function getSompoAgriKeyframes(scenarioId: string, outcomeId?: string): readonly Readonly<SompoAgriVisualFrame>[];
