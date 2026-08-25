export class PersonaRunWatchError extends Error {
  runId: string;
  traceId: string;
  code: string;
  cause: unknown;
}

export interface PersonaRunStatus {
  status?: string;
  progress?: { revision: number; [key: string]: unknown } | null;
  result?: unknown;
  error?: { message?: string; code?: string } | null;
  traceId?: string;
}

export interface PersonaRunWatchOptions {
  runId: string;
  traceId?: string;
  getStatus: (runId: string) => Promise<PersonaRunStatus>;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  maxConsecutiveErrorMs?: number;
  maxBackoffMs?: number;
  isTransient?: (error: unknown) => boolean;
  onTransientError?: (error: unknown, info: { runId: string; consecutiveMs: number }) => void;
  onProgress?: (progress: { revision: number; [key: string]: unknown }) => void;
}

export function watchPersonaTeamRun(options: PersonaRunWatchOptions): Promise<unknown>;

export function startAndWatchPersonaTeamRun(
  options: Omit<PersonaRunWatchOptions, 'runId'> & {
    startRun: () => Promise<{ runId?: string; traceId?: string }>;
    maxStartAttempts?: number;
  },
): Promise<unknown>;
