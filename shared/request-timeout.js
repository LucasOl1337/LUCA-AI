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

/** Status HTTP de borda/proxy que costumam ser transitórios (Cloudflare, tunnel, gateway). */
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527]);

function looksLikeCloudflareBody(bodyText) {
  return /<!doctype\s+html|cloudflare|cf-error-details|error code (?:52[0-7]|504|503)/i.test(String(bodyText || ''));
}

/**
 * Erros de rede/borda que não significam falha definitiva da rodada.
 * O job assíncrono no Express pode continuar; o cliente deve re-pollar.
 */
export function isTransientRequestError(error) {
  if (!error || typeof error !== 'object') return false;
  if (error instanceof RequestTimeoutError) return true;
  if (error instanceof RequestNetworkError) return true;
  if (error instanceof RequestHttpError) {
    if (TRANSIENT_HTTP_STATUSES.has(Number(error.status) || 0)) return true;
    if (looksLikeCloudflareBody(error.bodyText)) return true;
  }
  const name = String(error.name || '');
  if (name === 'RequestTimeoutError' || name === 'RequestNetworkError') return true;
  if (name === 'RequestHttpError') {
    if (TRANSIENT_HTTP_STATUSES.has(Number(error.status) || 0)) return true;
    if (looksLikeCloudflareBody(error.bodyText)) return true;
  }
  return false;
}

export function isEdgeTimeoutError(error) {
  if (!(error instanceof RequestHttpError) && String(error?.name || '') !== 'RequestHttpError') {
    return false;
  }
  const status = Number(error.status) || 0;
  if (status === 524) return true;
  return looksLikeCloudflareBody(error.bodyText);
}

export function buildApiErrorMessage(error, fallback = 'Falha ao falar com o runtime.') {
  if (error instanceof RequestTimeoutError || String(error?.name || '') === 'RequestTimeoutError') {
    const seconds = Math.max(1, Math.round(Number(error.timeoutMs || 0) / 1000) || 1);
    return `Tempo limite excedido (${seconds}s). O runtime nao respondeu a tempo.`;
  }
  if (error instanceof RequestHttpError || String(error?.name || '') === 'RequestHttpError') {
    if (isEdgeTimeoutError(error) || TRANSIENT_HTTP_STATUSES.has(Number(error.status) || 0)) {
      return 'A execução demorou além do limite da conexão. Ela pode continuar em segundo plano; acompanhe o progresso e tente atualizar em instantes.';
    }
    return error.bodyText
      ? `Runtime respondeu com erro (${error.status}): ${error.bodyText}`
      : `Runtime respondeu com erro HTTP ${error.status}.`;
  }
  if (error instanceof RequestNetworkError || String(error?.name || '') === 'RequestNetworkError') {
    return 'Falha de conexao com o runtime. Verifique a disponibilidade da API.';
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}
