export interface LabTerrainReference {
  url: string;
  sha256: string;
  bbox: [number, number, number, number];
  vertical_datum: string;
  attribution: string;
  resolution_m: number;
  [key: string]: unknown;
}
export interface LabTerrain {
  version: 1;
  crs: 'EPSG:4326';
  unit: 'm';
  registration: 'pixel-center';
  vertical_datum: string;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  values: number[];
  minimum: number;
  maximum: number;
}
export function parseLabTerrain(data: unknown, reference: LabTerrainReference): LabTerrain;
export function createTerrainSampler(grid: LabTerrain, origin: [number, number]): (x: number, z: number) => number | null;
