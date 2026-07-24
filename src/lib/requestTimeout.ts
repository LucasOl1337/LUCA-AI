interface RequestJsonOptions extends RequestInit {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class RequestTimeoutError extends Error {
  constructor(message: string, public url = '', public timeoutMs = 0) {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

export class RequestHttpError extends Error {
  constructor(message: string, public url = '', public status = 0, public bodyText = '') {
    super(message);
    this.name = 'RequestHttpError';
  }
}

export class RequestNetworkError extends Error {
  constructor(message: string, public url = '') {
    super(message);
    this.name = 'RequestNetworkError';
  }
}

function compactText(value: unknown, max = 180): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function requestJson<T>(url: string, options: RequestJsonOptions = {}): Promise<T> {
  const { timeoutMs = 15000, fetchImpl = fetch, ...requestOptions } = options;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      ...requestOptions,
      signal: controller.signal,
    });
    if (!response.ok) {
      let bodyText = '';
      try {
        bodyText = compactText(await response.text());
      } catch {
        bodyText = '';
      }
      throw new RequestHttpError(`HTTP ${response.status} for ${url}`, url, response.status, bodyText);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof RequestHttpError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new RequestTimeoutError(`Request timed out for ${url}`, url, timeoutMs);
    }
    throw new RequestNetworkError(`Network request failed for ${url}`, url);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function buildApiErrorMessage(error: unknown, fallback = 'Falha ao falar com o runtime.'): string {
  if (error instanceof RequestTimeoutError) {
    return `Tempo limite excedido (${Math.max(1, Math.round(error.timeoutMs / 1000))}s). O runtime nao respondeu a tempo.`;
  }
  if (error instanceof RequestHttpError) {
    return error.bodyText
      ? `Runtime respondeu com erro (${error.status}): ${error.bodyText}`
      : `Runtime respondeu com erro HTTP ${error.status}.`;
  }
  if (error instanceof RequestNetworkError) return 'Falha de conexao com o runtime. Verifique a disponibilidade da API.';
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}
