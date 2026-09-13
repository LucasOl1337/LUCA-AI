export const SOMPO_GEOFENCE_SITE_VERSION: 3;
export type { SompoGeofenceHit, SompoGeofenceResult } from './sompo-geofence.js';
export function getSompoGeofenceSite(environmentId: string, totalTravelMeters: number): null | {
  synthetic: true;
  label: string;
  manifestRules: { synthetic: true; hazards: {
    role: 'water' | 'hazard' | 'machine'; category?: string; metric?: 'roll_deg' | 'pitch_deg'; label: string; synthetic: true; justification: string;
    bands_m: { id: string; label: string; max_m: number }[];
  }[] };
  polygons: {
    id: string; role: 'allowed_area' | 'water' | 'hazard'; category?: string; synthetic: true;
    rings: { x: number; z: number }[][];
  }[];
};
export function geofenceFieldRelief(x: number, z: number): number;
export function geofenceOperacaoRelief(x: number, z: number): number;
