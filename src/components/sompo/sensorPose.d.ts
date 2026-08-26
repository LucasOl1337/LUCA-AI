export type SompoEulerOrder = 'YZX';

export interface SompoAxisCalibration {
  invertPitch: boolean;
  invertRoll: boolean;
  invertYaw: boolean;
  swapPitchRoll: boolean;
}

export interface SompoSensorPoseReading {
  pitch?: number | null;
  roll?: number | null;
  yawRate?: number | null;
  currentHeading?: number;
  deltaSeconds?: number;
}

export interface SompoSensorPose {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  order: SompoEulerOrder;
}

export const SOMPO_EULER_ORDER: SompoEulerOrder;
export const SOMPO_YAW_NOISE_FLOOR_DPS: number;
export const DEFAULT_SOMPO_AXIS_CALIBRATION: Readonly<SompoAxisCalibration>;
export function sensorReadingToPose(
  reading: SompoSensorPoseReading,
  calibration?: SompoAxisCalibration,
): SompoSensorPose;
