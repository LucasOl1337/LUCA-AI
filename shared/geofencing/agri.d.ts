import type { SompoTelemetrySnapshot } from '../sompo-telemetry.js';
import type { SompoGeofenceResult } from './radar.js';
import type { GeofenceEpisode, LabGeofenceRules } from './engine.js';
import type { LabPolygon } from '../lab-telemetry.js';

export interface SompoAgriPosition { x: number; z: number; headingDeg: number }
export type SompoAgriGeofenceSnapshot = SompoTelemetrySnapshot & {
  position: SompoAgriPosition;
  geofence: SompoGeofenceResult;
  risks: SompoTelemetrySnapshot['risks'] & { proximity: boolean };
};
/** Snapshot que pode ou não ter passado pelo geofencing (cenário sem talhão sai intocado). */
export type SompoAgriMaybeGeofenceSnapshot = SompoTelemetrySnapshot & Partial<Pick<SompoAgriGeofenceSnapshot, 'position' | 'geofence'>>;

export const SOMPO_GEOFENCE_TREND_STEP_MS: number;
export function getSompoAgriStartX(scenarioId: string, outcomeId?: string): number;
export function getSompoAgriPosition(scenarioId: string, elapsedMs?: number, outcomeId?: string): SompoAgriPosition;
export function getSompoAgriGeofenceSite(scenarioId: string, outcomeId?: string): { manifestRules: LabGeofenceRules; polygons: LabPolygon[]; label: string } | null;
export function hasSompoAgriGeofence(scenarioId: string): boolean;
export function getSompoAgriGeofenceEpisodes(scenarioId: string, outcomeId?: string, stepMs?: number): readonly GeofenceEpisode[];
export function sompoGeofenceProximity(geofence: SompoGeofenceResult | null | undefined): boolean;
export function withSompoAgriGeofence<T extends SompoTelemetrySnapshot>(snapshot: T, scenarioId: string, outcomeId?: string, elapsedMs?: number): T | (T & SompoAgriGeofenceSnapshot);
export function createSompoAgriGeofenceSnapshot(
  scenarioId: string,
  outcomeId?: string,
  options?: { observedAt?: string; elapsedMs?: number; connectedAt?: string },
): SompoAgriMaybeGeofenceSnapshot;
