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
  timeToHazardS: number | null;   // só com o perigo à frente (±20°) e aproximando; senão null
  closestPoint: LabPoint;
}
export interface SompoMachineHit {
  hazardKey: string;
  hazardLabel: string;
  bandId: string;
  bandLabel: string;
  bandMaxDeg: number;
  metric: 'roll_deg' | 'pitch_deg';
  valueDeg: number;               // inclinação medida, em módulo
  limitDeg: number;               // limite do perfil da máquina
  marginDeg: number;              // 0 = no limite ou acima
}
export interface SompoGeofenceResult {
  insideAllowed: boolean | null;
  nearest: SompoGeofenceHit | null;
  all: SompoGeofenceHit[];
  machine: SompoMachineHit | null;
  warnings: string[];
}

export function closestPointOnPolygon(point: LabPoint, polygon: LabPolygon): LabPoint & { distance: number };
export function forwardVector(headingDeg: number): LabPoint;
export function evaluateGeofence(state: { x: number; z: number; headingDeg?: number | null; speedKph?: number; rollDeg?: number | null; pitchDeg?: number | null }, rules: LabGeofenceRules, polygons: LabPolygon[], machine?: { profile?: Record<string, number | boolean> } | null): SompoGeofenceResult;
export function describeGeofence(result: SompoGeofenceResult | null | undefined): string;
export function describeMachineLimit(hit: SompoMachineHit | null | undefined): string;
