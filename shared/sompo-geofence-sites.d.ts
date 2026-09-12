export const SOMPO_GEOFENCE_SITE_VERSION: 1;
export type { SompoGeofenceHit, SompoGeofenceResult } from './sompo-geofence.js';
export function getSompoGeofenceSite(environmentId: string, totalTravelMeters: number): {
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
