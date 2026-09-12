import type { LabGeofenceRules } from './lab-geofence.js';
import type { LabPolygon, LabPoint } from './lab-telemetry.js';

export interface SompoGeofenceHit {
  hazardKey: string;
  hazardLabel: string;
  bandId: string;
  bandLabel: string;
  bandMaxM: number;
  distanceM: number;
  bearingDeg: number | null;      // 0 = à frente, +90 = à direita, -90 = à esquerda, ±180 = atrás; null sem rumo ou dentro do perigo
  timeToHazardS: number | null;   // null quando a máquina não se aproxima
  closestPoint: LabPoint;
}
export interface SompoGeofenceResult {
  insideAllowed: boolean | null;
  nearest: SompoGeofenceHit | null;
  all: SompoGeofenceHit[];
  warnings: string[];
}
export interface SompoSafeLane { z: number; offsetM: number; points: LabPoint[] }

export function closestPointOnPolygon(point: LabPoint, polygon: LabPolygon): LabPoint & { distance: number };
export function forwardVector(headingDeg: number): LabPoint;
export function evaluateGeofence(state: { x: number; z: number; headingDeg?: number | null; speedKph?: number }, rules: LabGeofenceRules, polygons: LabPolygon[]): SompoGeofenceResult;
export function describeGeofence(result: SompoGeofenceResult | null | undefined): string;
export function suggestSafeLane(options: { xStart: number; xEnd: number; preferredZ?: number; maxOffsetM?: number; cellM?: number }, rules: LabGeofenceRules, polygons: LabPolygon[]): SompoSafeLane | null;
