export const SOMPO_TELEMETRY_PATH: '/trator/001/sensores';

export type SompoTelemetryFreshness = 'checking' | 'fresh' | 'stale';
export type SompoTelemetryStatus = 'normal' | 'alert';
export type SompoTelemetryConnectionState = 'connecting' | 'live' | 'reconnecting' | 'stopped';
export type SompoTelemetrySourceKind = 'firebase' | 'simulation';

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
  connection: {
    state: SompoTelemetryConnectionState;
    connectedAt: string | null;
    lastEventAt: string | null;
    retryAttempt: number;
  };
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
    kind: SompoTelemetrySourceKind;
    provider: string;
    path: string;
    scenarioId?: string;
    scenarioLabel?: string;
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
