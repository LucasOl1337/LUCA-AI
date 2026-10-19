import type { SompoTelemetrySnapshot } from './sompo-telemetry.js';
export interface SompoCargoLimits { temperature: number; humidity: number }
export const SOMPO_CARGO_LIMITS: SompoCargoLimits;
export interface PhysicalInteractionState {
  live: boolean; distance: number | null; angle: number; proximity: number;
  collision: boolean; inclination: boolean; shock: number; cargo: boolean;
  heat: boolean; damp: boolean; labels: string[];
  severity: 'offline' | 'danger' | 'attention' | 'clear';
}
export const SOMPO_PANEL_BANDS: Readonly<{ attentionCm: number; dangerCm: number; inclinationDeg: number }>;
export interface PhysicalRiskInput {
  distance?: number | null; pitch?: number | null; roll?: number | null;
  collisionFlag?: boolean | null; inclinationFlag?: boolean | null;
}
export interface PhysicalRiskBands {
  distance: number | null; angle: number; proximity: number;
  collision: boolean; inclination: boolean;
  proximityLevel: 'unavailable' | 'clear' | 'attention' | 'danger';
}
export function physicalRiskBands(input?: PhysicalRiskInput): PhysicalRiskBands;
export interface PhysicalFrame { at: number; snapshot: SompoTelemetrySnapshot; effects: PhysicalInteractionState }
export function physicalInteractionState(snapshot?: SompoTelemetrySnapshot | null, previous?: SompoTelemetrySnapshot | null, limits?: SompoCargoLimits): PhysicalInteractionState;
export function appendPhysicalFrame(frames: PhysicalFrame[], frame: PhysicalFrame): PhysicalFrame[];
export function physicalReplayFrame(frames: PhysicalFrame[], offsetMs: number): PhysicalFrame | null;
