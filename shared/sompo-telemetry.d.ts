export const SOMPO_TELEMETRY_PATH: '/trator/001/sensores';
export const SOMPO_MISSION_DOSSIER_DELIMITER: '--- DOSSIÊ TÉCNICO ---';

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

export interface SompoTelemetryHistoryStat {
  min: number | null;
  max: number | null;
  avg: number | null;
}

export interface SompoTelemetryHistorySample {
  id: number;
  tractorId: string;
  sourceKind: SompoTelemetrySourceKind;
  scenarioLabel: string | null;
  deviceTimestamp: number | null;
  observedAt: string;
  observedMs: number;
  distancia: number | null;
  temperatura: number | null;
  umidade: number | null;
  pitch: number | null;
  roll: number | null;
  accX: number | null;
  accY: number | null;
  accZ: number | null;
  rotX: number | null;
  rotY: number | null;
  rotZ: number | null;
  riscoColisao: boolean;
  riscoInclinacao: boolean;
}

export interface SompoTelemetryFlagTransition {
  at: string;
  flag: 'riscoColisao' | 'riscoInclinacao';
  from: boolean;
  to: boolean;
}

export interface SompoTelemetryHistorySummary {
  count: number;
  spanMs: number;
  first: SompoTelemetryHistorySample | null;
  last: SompoTelemetryHistorySample | null;
  stats: {
    distancia: SompoTelemetryHistoryStat;
    temperatura: SompoTelemetryHistoryStat;
    umidade: SompoTelemetryHistoryStat;
    pitch: SompoTelemetryHistoryStat;
    roll: SompoTelemetryHistoryStat;
    accMagnitude: SompoTelemetryHistoryStat;
    rotMagnitude: SompoTelemetryHistoryStat;
  };
  flagTransitions: SompoTelemetryFlagTransition[];
  keySamples: SompoTelemetryHistorySample[];
}

export interface SompoTelemetryHistory {
  samples: SompoTelemetryHistorySample[];
  summary: SompoTelemetryHistorySummary;
  windowMin?: number;
}

export interface SompoTelemetryHistoryResponse extends SompoTelemetryHistory {
  ok: boolean;
}

export interface SompoTelemetrySimulationRecordResponse {
  ok: boolean;
  recorded: number;
}

export function normalizeSompoTelemetry(
  raw: Record<string, unknown>,
  options?: { observedAt?: string },
): SompoTelemetrySnapshot;

export function buildSompoTelemetryMission(
  snapshot: SompoTelemetrySnapshot,
  teamLabel?: string,
  history?: SompoTelemetryHistory | null,
): string;
