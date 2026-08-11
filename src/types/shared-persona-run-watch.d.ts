declare module '../../shared/persona-run-watch.js' {
  export class PersonaRunWatchError extends Error {
    runId: string;
    traceId: string;
    code: string;
    cause: unknown;
  }

  export function watchPersonaTeamRun(options: {
    runId: string;
    traceId?: string;
    getStatus: (runId: string) => Promise<{
      status?: string;
      result?: unknown;
      error?: { message?: string; code?: string } | null;
      traceId?: string;
    }>;
    wait?: (ms: number) => Promise<void>;
    now?: () => number;
    maxWaitMs?: number;
    pollIntervalMs?: number;
    maxConsecutiveErrorMs?: number;
    maxBackoffMs?: number;
    isTransient?: (error: unknown) => boolean;
    onTransientError?: (error: unknown, info: { runId: string; consecutiveMs: number }) => void;
  }): Promise<unknown>;
}
