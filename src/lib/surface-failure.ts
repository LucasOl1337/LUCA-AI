export type SurfaceFailureKind = 'offline' | 'forbidden' | 'server';

function errorName(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  return String((error as { name?: string }).name || '');
}

function errorStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  return Number((error as { status?: number }).status || 0);
}

export function surfaceFailureKind(error: unknown): SurfaceFailureKind {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const name = errorName(error);
  if (name === 'RequestNetworkError' || name === 'TypeError') return 'offline';
  const status = errorStatus(error);
  if (status === 401 || status === 403) return 'forbidden';
  return 'server';
}

export function pickFailureCopy<T>(
  error: unknown,
  copy: { offline: T; forbidden: T; server: T },
): T {
  return copy[surfaceFailureKind(error)];
}
