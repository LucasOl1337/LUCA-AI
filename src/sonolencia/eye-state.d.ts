export const CLOSED_DURATION_MS: number;
export const MAX_FRAME_GAP_MS: number;
export const SENSITIVITY_THRESHOLDS: Readonly<{ low: number; normal: number; high: number }>;
export type EyeSample = { left: number; right: number } | null;
export type EyeReading = { status: 'unknown' | 'open' | 'closed' | 'alarm'; closedMs: number; alarm: boolean };
export function normalizeEyeClosure(score: number, threshold?: number): number;
export function createEyeMonitor(threshold?: number): {
  reset(): void;
  update(sample: EyeSample, at: number): EyeReading;
};
