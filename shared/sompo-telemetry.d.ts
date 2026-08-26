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
  episodeId?: number | null;
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
  episodeId?: string;
}

export type SompoTelemetryEpisodeKind = 'colisao';
export type SompoTelemetryEpisodeStatus = 'recording' | 'complete' | 'aborted';
export type SompoTelemetryEpisodePhaseId = 'aproximacao' | 'impacto' | 'pos-impacto';

export interface SompoTelemetryEpisode {
  id: number;
  publicId: string;
  kind: string;
  tractorId: string | null;
  sourceKind: string | null;
  scenarioLabel: string | null;
  startedAt: string;
  startedMs: number;
  endedAt: string | null;
  endedMs: number | null;
  status: SompoTelemetryEpisodeStatus;
  durationMs: number | null;
}

export interface SompoTelemetryEpisodePhase {
  id: SompoTelemetryEpisodePhaseId | string;
  label: string;
  startIndex: number;
  endIndex: number;
  sampleCount: number;
  startAt: string;
  endAt: string;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  riscoColisao: boolean;
  riscoInclinacao: boolean;
  stats: {
    distancia: SompoTelemetryHistoryStat;
    pitch: SompoTelemetryHistoryStat;
    roll: SompoTelemetryHistoryStat;
    accMagnitude: SompoTelemetryHistoryStat;
  };
}

export interface SompoTelemetryEpisodeImpact {
  index: number;
  at: string;
  offsetMs: number;
  accMagnitude: number | null;
}

export interface SompoTelemetryEpisodeSummary extends SompoTelemetryHistorySummary {
  impact: SompoTelemetryEpisodeImpact | null;
  phases: SompoTelemetryEpisodePhase[];
}

export interface SompoTelemetryEpisodeFrame {
  seq: number;
  fase: string | null;
  label: string | null;
  offsetMs: number | null;
  mimeType: string;
  size: number;
  url: string;
}

/** Frame na missão: metadados + flag de anexado (false = registrado mas fora do orçamento de anexos). */
export interface SompoTelemetryEpisodeMissionFrame {
  seq: number;
  fase?: string | null;
  label?: string | null;
  offsetMs?: number | null;
  attached?: boolean;
}

export interface SompoTelemetryEpisodeStartResponse {
  ok: boolean;
  episode: SompoTelemetryEpisode;
}

export interface SompoTelemetryEpisodeFinishResponse {
  ok: boolean;
  episode: SompoTelemetryEpisode;
  summary: SompoTelemetryEpisodeSummary;
}

export interface SompoTelemetryEpisodeResponse {
  ok: boolean;
  episode: SompoTelemetryEpisode;
  samples: SompoTelemetryHistorySample[];
  summary: SompoTelemetryEpisodeSummary;
  frames: SompoTelemetryEpisodeFrame[];
}

export interface SompoTelemetryEpisodeFramesUploadResponse {
  ok: boolean;
  episode: SompoTelemetryEpisode;
  frames: SompoTelemetryEpisodeFrame[];
  added: number;
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

export function buildSompoEpisodeMission(
  episode: SompoTelemetryEpisode,
  samples: SompoTelemetryHistorySample[],
  summary: SompoTelemetryEpisodeSummary,
  teamLabel?: string,
  frames?: SompoTelemetryEpisodeMissionFrame[],
): string;

export const SOMPO_EPISODE_VISUAL_DATA_MARKER: string;

/** Série compacta do episódio para a peça visual: [tMs, distanciaCm|null, accMs2|null]. */
export interface SompoEpisodeVisualData {
  tipo: 'sompo-episodio-colisao';
  duracaoMs: number;
  impactoMs: number | null;
  picoAccMs2: number | null;
  flagMs: number | null;
  flagDesdeInicio: boolean;
  serie: [number, number | null, number | null][];
}

export function buildSompoEpisodeVisualData(
  summary: SompoTelemetryEpisodeSummary,
): SompoEpisodeVisualData | null;

export function parseSompoEpisodeVisualData(
  missionText: string,
): SompoEpisodeVisualData | null;
