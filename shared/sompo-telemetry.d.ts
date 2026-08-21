export const SOMPO_TELEMETRY_PATH: '/trator/001/sensores';

export type SompoTelemetryFreshness = 'checking' | 'fresh' | 'stale';
export type SompoTelemetryStatus = 'normal' | 'alert';

export interface SompoTelemetryVector {
  x: number | null;
  y: number | null;
  z: number | null;
  magnitude: number | null;
}

export interface SompoTelemetrySnapshot {
  tractorId: string;
  observedAt: string;
  changedAt: string;
  unchangedForMs: number;
  freshness: SompoTelemetryFreshness;
  deviceTimestamp: number | null;
  status: SompoTelemetryStatus;
  risks: {
    collision: boolean;
    inclination: boolean;
  };
  readings: {
    distance: number | null;
    temperature: number | null;
    humidity: number | null;
    pitch: number | null;
    roll: number | null;
    acceleration: SompoTelemetryVector;
    rotation: SompoTelemetryVector;
  };
  source: {
    provider: string;
    path: string;
  };
}

export interface SompoTelemetryResponse {
  ok: boolean;
  telemetry: SompoTelemetrySnapshot;
}

export function normalizeSompoTelemetry(
  raw: Record<string, unknown>,
  options?: { observedAt?: string },
): SompoTelemetrySnapshot;

export function buildSompoTelemetryMission(
  snapshot: SompoTelemetrySnapshot,
  teamLabel?: string,
): string;
