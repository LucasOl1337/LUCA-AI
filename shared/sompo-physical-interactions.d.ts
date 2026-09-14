import type { SompoTelemetrySnapshot } from './sompo-telemetry.js';
export interface SompoCargoLimits { temperature: number; humidity: number }
export const SOMPO_CARGO_LIMITS: SompoCargoLimits;
export interface PhysicalInteractionState {
  live: boolean; distance: number | null; angle: number; proximity: number;
  collision: boolean; inclination: boolean; shock: number; cargo: boolean;
  heat: boolean; damp: boolean; labels: string[];
  severity: 'offline' | 'danger' | 'attention' | 'clear';
}
export interface PhysicalFrame { at: number; snapshot: SompoTelemetrySnapshot; effects: PhysicalInteractionState }
export function physicalInteractionState(snapshot?: SompoTelemetrySnapshot | null, previous?: SompoTelemetrySnapshot | null, limits?: SompoCargoLimits): PhysicalInteractionState;
export function appendPhysicalFrame(frames: PhysicalFrame[], frame: PhysicalFrame): PhysicalFrame[];
export function physicalReplayFrame(frames: PhysicalFrame[], offsetMs: number): PhysicalFrame | null;
