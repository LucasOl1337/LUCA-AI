import { ROUTER_API_KEY, ROUTER_BASE_URL, ROUTER_MODEL, ROUTER_TIMEOUT_MS } from './config.js';

function extractChoiceContent(data) {
  return normalizeModelContent(
    data?.choices?.[0]?.message?.content
      ?? data?.choices?.[0]?.delta?.content
      ?? data?.choices?.[0]?.text
      ?? data?.content
      ?? data?.output_text
      ?? data?.response
      ?? data?.candidates?.[0]?.content?.parts
      ?? '',
  );
}

function normalizeModelContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        if (typeof item?.content === 'string') return item.content;
        if (typeof item?.output_text === 'string') return item.output_text;
        return '';
      })
      .join('');
  }
  if (typeof value?.text === 'string') return value.text;
  if (typeof value?.content === 'string') return value.content;
  return '';
}

function findJsonPrefix(text) {
  const source = String(text || '').trimStart();
  if (!source || !['{', '['].includes(source[0])) return '';

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const opener = stack.pop();
      if ((char === '}' && opener !== '{') || (char === ']' && opener !== '[')) return '';
      if (stack.length === 0) return source.slice(0, index + 1);
    }
  }

  return '';
}

export function extractChatCompletionContent(payloadText) {
  const text = String(payloadText || '').trim();
  if (!text) return 'Sem resposta textual do modelo.';

  try {
    const data = JSON.parse(text);
    return extractChoiceContent(data) || 'Sem resposta textual do modelo.';
  } catch (jsonError) {
    const prefix = findJsonPrefix(text);
    if (prefix) {
      const data = JSON.parse(prefix);
      const content = extractChoiceContent(data);
      if (content) return content;
    }

    const parts = [];
    const parseErrors = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const chunk = trimmed.slice('data:'.length).trim();
      if (!chunk || chunk === '[DONE]') continue;
      try {
        const data = JSON.parse(chunk);
        const content = extractChoiceContent(data);
        if (content) parts.push(content);
      } catch (error) {
        const prefix = findJsonPrefix(chunk);
        if (prefix) {
          try {
            const data = JSON.parse(prefix);
            const content = extractChoiceContent(data);
            if (content) parts.push(content);
            continue;
          } catch {
            // Preserve the original parse error below.
          }
        }
        parseErrors.push(error);
      }
    }
    if (parts.length) return parts.join('') || 'Sem resposta textual do modelo.';
    if (parseErrors.length) throw parseErrors[0];
    throw jsonError;
  }
}

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

  const text = await response.text();
  return extractChatCompletionContent(text);
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
