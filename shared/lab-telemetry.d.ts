export interface LabSample {
  timestamp: string;
  machine_id: string;
  synthetic: boolean;
  latitude_deg: number | null;
  longitude_deg: number | null;
  gnss_fix: '3d' | 'no_fix' | null;
  gnss_horizontal_accuracy_m: number | null;
  ground_speed_kmh: number | null;
  heading_deg: number | null;
  roll_deg: number | null;
  pitch_deg: number | null;
  yaw_rate_deg_s: number | null;
  engine_rpm: number | null;
  engine_load_pct: number | null;
  coolant_temp_c: number | null;
  oil_pressure_kpa: number | null;
  fuel_rate_l_h: number | null;
  battery_voltage_v: number | null;
  ambient_temp_c: number | null;
  relative_humidity_pct: number | null;
  brake_pressed: boolean | null;
  pto_engaged: boolean | null;
  coolant_warning_active: boolean | null;
  obstacle_distance_cm: number | null;
  ultrasonic_echo_valid: boolean | null;
  imu_pitch_raw: number | null;
  imu_roll_raw: number | null;
  acceleration_x_raw: number | null;
  acceleration_y_raw: number | null;
  acceleration_z_raw: number | null;
  rotation_x_raw: number | null;
  rotation_y_raw: number | null;
  rotation_z_raw: number | null;
  collision_warning_active: boolean | null;
  inclination_warning_active: boolean | null;
  device_timestamp: number | null;
  timeMs: number;
  elapsedMs: number;
  x: number | null;
  z: number | null;
}
export type LabEventType = 'outside_fence' | 'near_water' | 'coolant_warning' | 'gnss_unavailable' | 'device_collision_warning' | 'device_inclination_warning';
export interface LabEvent {
  id: string;
  type: LabEventType;
  transition: 'start' | 'end';
  elapsedMs: number;
  timestamp: string;
  title: string;
  description: string;
  evidence: Record<string, string | number | boolean | null>;
}
export interface LabPoint { x: number; z: number }
export interface LabPolygon { id: string; role: 'property_boundary' | 'allowed_area' | 'water'; rings: LabPoint[][] }
export interface LabManifest {
  version?: string | number;
  synthetic?: boolean;
  machine?: { id: string; model?: string; implement?: string };
  duration_s?: number;
  export_rate_hz?: number;
  coordinate_reference?: string;
  local_origin?: [number, number];
  map_warning?: string;
  site?: { id: string; name: string; [key: string]: unknown };
  satellite?: { url: string; bbox: [number, number, number, number]; attribution: string; crs?: 'EPSG:4326'; resolution_m?: number; [key: string]: unknown };
  terrain?: import('./lab-terrain.js').LabTerrainReference;
  rules?: { water_warning_distance_m?: number; coolant_warning_c?: number; purpose?: string };
  files?: { file: string; samples: number; sha256?: string }[];
  [key: string]: unknown;
}
export interface LabMap {
  type: 'FeatureCollection';
  features: { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown[] } }[];
}
export interface LabSite {
  manifest: LabManifest | null;
  map: LabMap | null;
  origin: [number, number];
  polygons: LabPolygon[];
  warnings: string[];
}
export interface LabSchema {
  version: number;
  missing_value: string;
  delimiter: string;
  decimal: string;
  encoding: string;
  fields: { name: string; unit: string; origin: string; meaning: string; real_acquisition?: string }[];
}
export interface LabCase {
  id: string;
  title: string;
  fileName: string;
  rawCsv: string;
  machineId: string;
  synthetic: boolean;
  samples: LabSample[];
  hasEsp32: boolean;
  startedAt: string;
  durationMs: number;
  sampleIntervalMs: number;
  events: LabEvent[];
  warnings: string[];
  manifest: LabManifest | null;
  map: LabMap | null;
  schema: LabSchema | null;
  origin: [number, number];
  polygons: LabPolygon[];
}
export interface LabReplayFrame {
  elapsedMs: number;
  sample: LabSample;
  sampleIndex: number;
  position: LabPoint | null;
  hasGps: boolean;
  gap: boolean;
  gpsGap: boolean;
  recordingGap: boolean;
  activeEvents: LabEvent[];
}
export const LAB_COLUMNS: string[];
export const LAB_ESP32_COLUMNS: string[];
export const LAB_UNITS: Record<string, string>;
export function parseLabCase(csv: string, options?: { fileName?: string; manifest?: unknown; map?: unknown; schema?: unknown }): LabCase;
export function parseLabSite(manifest?: unknown, map?: unknown, fallbackOrigin?: [number, number]): LabSite;
export function associateLabSite(manifest: unknown, site: LabSite): { manifest: LabManifest; map: LabMap | null };
export function getReplayFrame(labCase: LabCase, elapsedMs: number): LabReplayFrame;
export function formatLabTime(ms: number): string;
export function toLocalCoordinate(longitude: number, latitude: number, origin: [number, number]): LabPoint;
