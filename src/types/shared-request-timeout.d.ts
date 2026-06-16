declare module '../../shared/request-timeout.js' {
  export class RequestTimeoutError extends Error {
    url: string;
    timeoutMs: number;
  }

  export class RequestHttpError extends Error {
    url: string;
    status: number;
    bodyText: string;
  }

  export class RequestNetworkError extends Error {
    url: string;
  }

  export function requestJson<T = unknown>(
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      cache?: RequestCache;
      timeoutMs?: number;
      fetchImpl?: typeof fetch;
    },
  ): Promise<T>;

  export function buildApiErrorMessage(error: unknown, fallback?: string): string;
}
