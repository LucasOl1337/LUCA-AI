export const SOMPO_GEOFENCE_SITE_VERSION: 1;
export interface SompoGeofenceHit {
  hazardKey: string;
  hazardLabel: string;
  bandId: string;
  bandLabel: string;
  bandMaxM: number;
  distanceM: number;
  bearingDeg: number | null;
  timeToHazardS: number | null;
  closestPoint: { x: number; z: number };
}
export interface SompoGeofenceResult {
  insideAllowed: boolean | null;
  nearest: SompoGeofenceHit | null;
  all: SompoGeofenceHit[];
  warnings: string[];
}
export function getSompoGeofenceSite(environmentId: string, totalTravelMeters: number): {
  synthetic: true;
  label: string;
  manifestRules: { synthetic: true; hazards: {
    role: string; category?: string; label: string; synthetic: true; justification: string;
    bands_m: { id: string; label: string; max_m: number }[];
  }[] };
  polygons: {
    id: string; role: 'allowed_area' | 'water' | 'hazard'; category?: string; synthetic: true;
    rings: { x: number; z: number }[][];
  }[];
};
