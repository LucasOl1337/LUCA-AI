export interface SompoMotionKeyframe { atMs: number; speedKph: number; direction?: number; wheelSpeedKph?: number | null; headerSpeed?: number; }
export function integrateSompoMotion(frames: readonly SompoMotionKeyframe[], elapsedMs: number, channel?: 'speedKph' | 'wheelSpeedKph' | 'headerSpeed', signed?: boolean): number;
export function sompoSteeringAngle(speedKph: number, direction: number, yawRate: number, wheelbase: number, rearSteer?: boolean): number;
export function createSompoMotionPath(sample: (atMs: number) => { speedKph: number; direction: number; yaw: number }, totalMs: number): { sample<T extends { x: number; z: number }>(atMs: number, target: T): T };
