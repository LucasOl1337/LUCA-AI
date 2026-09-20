export type LabVehiclePose = {
  visible: boolean;
  studio: boolean;
  hasGps: boolean;
  hasAttitude: boolean;
  x: number;
  y: number;
  z: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
};

export function labVehiclePose(
  frame: {
    recordingGap?: boolean;
    position?: { x: number; z: number } | null;
    sample?: {
      heading_deg?: number | null;
      pitch_deg?: number | null;
      roll_deg?: number | null;
      imu_pitch_raw?: number | null;
      imu_roll_raw?: number | null;
    } | null;
  } | null | undefined,
  options?: { studio?: { x: number; y: number; z: number } },
): LabVehiclePose;
