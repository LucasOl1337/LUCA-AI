// Cliente Kamui do LUCA-AI (Kamui-awareness, ref. Maestro).
//
// REGRA DURA: este modulo so faz LEITURA de tethers irmaos via Kamui.
// O LUCA-AI consome personas do Yume como agentes, mas NUNCA escreve no Yume.
// Por isso aqui so existem helpers GET. Nao adicione POST/PUT/DELETE para Yume.
//
// Padrao: nunca chamar o Yume direto. Sempre via {KAMUI_BASE}/kamui/<tether>/<path>,
// o que gera echo/observabilidade no Kamui e evita URLs hardcoded de irmaos.

export const KAMUI_BASE = (process.env.KAMUI_BASE || 'http://127.0.0.1:1338').replace(/\/+$/, '');
const CALLER = 'luca';
const USER_AGENT = 'luca-ai-service (kamui-client)';
const DEFAULT_TIMEOUT_MS = Number(process.env.KAMUI_TIMEOUT_MS || 8000);

export class KamuiError extends Error {
  constructor(message, { status = null, endpoint = null } = {}) {
    super(message);
    this.name = 'KamuiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

async function kamuiGet(path, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = `${KAMUI_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Kamui-Caller': CALLER,
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
    const text = await resp.text();
    let envelope;
    try {
      envelope = text ? JSON.parse(text) : {};
    } catch {
      envelope = { ok: false, error: 'resposta nao-JSON do Kamui' };
    }
    if (!resp.ok) {
      throw new KamuiError(`Kamui HTTP ${resp.status} em ${path}`, { status: resp.status, endpoint: path });
    }
    if (envelope && envelope.ok === false) {
      throw new KamuiError(envelope.error || `tether respondeu erro em ${path}`, { status: envelope.status ?? null, endpoint: path });
    }
    // KamuiCallResult: { ok, tether, endpoint, status, data, elapsed_ms }
    return envelope && Object.prototype.hasOwnProperty.call(envelope, 'data') ? envelope.data : envelope;
  } catch (error) {
    if (error instanceof KamuiError) throw error;
    const aborted = error?.name === 'AbortError';
    throw new KamuiError(
      aborted ? `timeout (${timeoutMs}ms) ao chamar ${path}` : (error?.message || String(error)),
      { endpoint: path },
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Yume — SOMENTE LEITURA. Personas do Yume viram agentes do LUCA-AI.
// ---------------------------------------------------------------------------

/** Lista personas do Yume. -> { personas: [{ slug, name, model, ... }] } */
export async function listYumePersonas() {
  const data = await kamuiGet('/kamui/yume/personas');
  return Array.isArray(data?.personas) ? data.personas : [];
}

/** Detalhe completo de uma persona. -> { persona: {...} } */
export async function fetchYumePersona(slug) {
  const data = await kamuiGet(`/kamui/yume/personas/${encodeURIComponent(slug)}`);
  return data?.persona ?? data;
}

/** System prompt composto da persona. -> { slug, name, model, system_prompt, ... } */
export async function fetchYumePersonaSystemPrompt(slug) {
  return kamuiGet(`/kamui/yume/personas/${encodeURIComponent(slug)}/system-prompt`);
}

/** Version-check leve para cache. -> { slug, version, updated_at } */
export async function getYumePersonaVersion(slug) {
  return kamuiGet(`/kamui/yume/personas/${encodeURIComponent(slug)}/version`);
}

/** Verifica se o Kamui esta acessivel (best-effort, nao lanca). */
export async function isKamuiReachable(timeoutMs = 1500) {
  try {
    await kamuiGet('/kamui/yume/health', { timeoutMs });
    return true;
  } catch {
    return false;
  }
}
