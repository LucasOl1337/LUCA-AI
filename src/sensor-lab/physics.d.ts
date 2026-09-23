export type SensorScenarioId = 'encosta' | 'curva' | 'frenada' | 'buraco';
export type SensorRiskLevel = 'estavel' | 'atencao' | 'risco' | 'tombou';

export interface Vec3 { x: number; y: number; z: number }

export interface SensorScenarioParam {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  digits: number;
}

export interface SensorScenario {
  id: SensorScenarioId;
  label: string;
  key: string;
  param: SensorScenarioParam;
}

export interface SensorTimeline {
  periodS: number;
  tipAtS: number | null;
  alertAtS: number | null;
  attentionAtS: number | null;
  peakRatio: number;
}

export interface MemsAxis {
  nm: number;
  gapFraction: number;
  plusFF: number;
  minusFF: number;
  deltaFF: number;
  counts: number;
}

export interface MemsReading { x: MemsAxis; y: MemsAxis; z: MemsAxis }

export interface SensorFlags {
  riscoInclinacao: boolean;
  frenagemBrusca: boolean;
  impacto: boolean;
}

export interface SensorReading {
  id: SensorScenarioId;
  param: number;
  t: number;
  loopT: number;
  periodS: number;
  phase: string;
  speedKph: number;
  road: { rollDeg: number; pitchDeg: number };
  body: { rollDeg: number; pitchDeg: number; heaveM: number };
  tip: { deg: number; side: number };
  curve: { k: number; radiusM: number };
  lateralG: number;
  ratio: number;
  force: Vec3;
  forceG: Vec3;
  gyroDps: Vec3;
  level: SensorRiskLevel;
  flags: SensorFlags;
  alertLeadS: number | null;
  timeline: SensorTimeline;
  mems: MemsReading;
}

export interface TelemetryPacket {
  aceleracaoX: number;
  aceleracaoY: number;
  aceleracaoZ: number;
  rotacaoX: number;
  rotacaoY: number;
  rotacaoZ: number;
  riscoInclinacao: boolean;
}

export const G: number;
export const MEMS: Readonly<{
  resonanceHz: number;
  proofMassUg: number;
  gapUm: number;
  fingerPairs: number;
  overlapUm: number;
  thicknessUm: number;
  fullScaleG: number;
  adcBits: number;
  sampleHz: number;
  gyroDriveKHz: number;
}>;
export const NM_PER_G: number;
export const SPRING_N_PER_M: number;
export const C0_FF: number;
export const COUNTS_PER_G: number;
export const REAL_GAP_PER_G: number;
export const VISUAL_GAP_PER_G: number;
export const VISUAL_GAIN: number;
export const TRUCK: Readonly<{
  trackM: number;
  cgHeightM: number;
  wheelbaseM: number;
  rolloverG: number;
  rollGradientDegPerG: number;
  pitchGradientDegPerG: number;
  curveRadiusM: number;
  cruiseKph: number;
}>;
export const THRESHOLDS: Readonly<{
  attention: number;
  alert: number;
  hardBrakeG: number;
  brakeAttentionG: number;
  impactG: number;
  impactAttentionG: number;
}>;
export const SLOPE_TIP_DEG: number;
export const SENSOR_SCENARIOS: readonly SensorScenario[];

export function getSensorScenario(id: string): SensorScenario;
export function scenarioTimeline(id: SensorScenarioId, param: number): SensorTimeline;
export function scenarioPeriod(id: SensorScenarioId, param: number): number;
export function memsResponse(force: Vec3): MemsReading;
export function sampleSensorLab(id: SensorScenarioId, param: number, t: number): SensorReading;
export function telemetryPacket(reading: SensorReading): TelemetryPacket;
