export const DROWSINESS_VIDEO_CONSTRAINTS: MediaTrackConstraints;

export type CameraQuality = {
  label: string;
  width: number;
  height: number;
  frameRate: number;
};

export function findPreferredCamera(devices: MediaDeviceInfo[]): MediaDeviceInfo | null;
export function openPreferredCamera(mediaDevices: MediaDevices): Promise<MediaStream>;
export function describeCameraStream(stream: MediaStream): CameraQuality;
export function formatCameraQuality(quality: CameraQuality): string;
