export class RequestTimeoutError extends Error {
  constructor(message, { url = '', timeoutMs = 0 } = {}) {
    super(message);
    this.name = 'RequestTimeoutError';
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export class RequestHttpError extends Error {
  constructor(message, { url = '', status = 0, bodyText = '' } = {}) {
    super(message);
    this.name = 'RequestHttpError';
    this.url = url;
    this.status = status;
    this.bodyText = bodyText;
  }
}

export class RequestNetworkError extends Error {
  constructor(message, { url = '' } = {}) {
    super(message);
    this.name = 'RequestNetworkError';
    this.url = url;
  }
}

function compactText(value, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function requestJson(url, options = {}) {
  const {
    method = 'GET',
    headers,
    body,
    cache = 'no-store',
    timeoutMs = 15000,
    fetchImpl = globalThis.fetch,
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch_unavailable');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body,
      cache,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      throw new RequestTimeoutError(`Request timed out for ${url}`, { url, timeoutMs });
    }
    throw new RequestNetworkError(`Network request failed for ${url}`, { url });
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    let bodyText = '';
    try {
      bodyText = compactText(await response.text());
    } catch {
      bodyText = '';
    }
    throw new RequestHttpError(`HTTP ${response.status} for ${url}`, {
      url,
      status: response.status,
      bodyText,
    });
  }

  return response.json();
}

export function buildApiErrorMessage(error, fallback = 'Falha ao falar com o runtime.') {
  if (error instanceof RequestTimeoutError) {
    const seconds = Math.max(1, Math.round(error.timeoutMs / 1000));
    return `Tempo limite excedido (${seconds}s). O runtime nao respondeu a tempo.`;
  }
  if (error instanceof RequestHttpError) {
    return error.bodyText
      ? `Runtime respondeu com erro (${error.status}): ${error.bodyText}`
      : `Runtime respondeu com erro HTTP ${error.status}.`;
  }
  if (error instanceof RequestNetworkError) {
    return 'Falha de conexao com o runtime. Verifique a disponibilidade da API.';
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}
