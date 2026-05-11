import { ROUTER_API_KEY, ROUTER_BASE_URL, ROUTER_MODEL, ROUTER_TIMEOUT_MS } from './config.js';

export async function call9Router({ system, user, agentId, model = ROUTER_MODEL, maxTokens = 1200 }) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (ROUTER_API_KEY) headers.Authorization = `Bearer ${ROUTER_API_KEY}`;
  const url = `${ROUTER_BASE_URL}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    const detail = aborted ? `timeout de ${Math.round(ROUTER_TIMEOUT_MS / 1000)}s` : (error instanceof Error ? error.message : String(error));
    throw new Error(`9router_unreachable ${url}: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`9router ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? 'Sem resposta textual do modelo.';
}

export async function check9RouterHealth(timeoutMs = 1500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${ROUTER_BASE_URL}/models`, {
      method: 'GET',
      headers: ROUTER_API_KEY ? { Authorization: `Bearer ${ROUTER_API_KEY}` } : undefined,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, url: ROUTER_BASE_URL };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      url: ROUTER_BASE_URL,
      error: aborted ? `timeout de ${timeoutMs}ms` : (error instanceof Error ? error.message : String(error)),
    };
  } finally {
    clearTimeout(timeout);
  }
}
