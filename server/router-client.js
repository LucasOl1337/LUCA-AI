import {
  ROUTER_API_KEY,
  ROUTER_BASE_URL,
  ROUTER_MODEL,
  ROUTER_TIMEOUT_MS,
  ROUTER_IMAGE_TIMEOUT_MS,
  IMAGE_GENERATION_MODEL,
  assertAllowed9RouterModel,
  assertAllowedImageGenerationModel,
} from './config.js';

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

function splitPayloadLines(text) {
  return String(text || '').split(/\r?\n/);
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
    for (const line of splitPayloadLines(text)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const chunk = trimmed.slice('data:'.length).trim();
      if (!chunk || chunk === '[DONE]') continue;
      try {
        const data = JSON.parse(chunk);
        const content = extractChoiceContent(data);
        if (content) parts.push(content);
      } catch (error) {
        const nestedPrefix = findJsonPrefix(chunk);
        if (nestedPrefix) {
          try {
            const data = JSON.parse(nestedPrefix);
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

function mergeToolCallDelta(accumulator, deltaCalls) {
  for (const delta of deltaCalls) {
    const index = Number.isInteger(delta?.index) ? delta.index : accumulator.length;
    if (!accumulator[index]) {
      accumulator[index] = {
        id: delta?.id || `tool_${index + 1}`,
        type: delta?.type || 'function',
        function: { name: '', arguments: '' },
      };
    }
    const target = accumulator[index];
    if (delta?.id) target.id = delta.id;
    if (delta?.type) target.type = delta.type;
    if (delta?.function?.name) target.function.name = delta.function.name;
    if (typeof delta?.function?.arguments === 'string') {
      target.function.arguments += delta.function.arguments;
    }
  }
}

export function parseChatCompletionPayload(payloadText) {
  const text = String(payloadText || '').trim();
  if (!text) {
    return { content: 'Sem resposta textual do modelo.', toolCalls: [], finishReason: null, raw: null };
  }

  const tryObject = (data) => {
    const choice = data?.choices?.[0] || {};
    const message = choice?.message || {};
    const content = extractChoiceContent(data);
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls
      : Array.isArray(choice?.tool_calls)
        ? choice.tool_calls
        : [];
    return {
      content: content || '',
      toolCalls,
      finishReason: choice?.finish_reason || data?.finish_reason || null,
      raw: data,
    };
  };

  try {
    return tryObject(JSON.parse(text));
  } catch {
    const prefix = findJsonPrefix(text);
    if (prefix) {
      try {
        return tryObject(JSON.parse(prefix));
      } catch {
        // fall through to SSE
      }
    }

    const contentParts = [];
    const toolCalls = [];
    let finishReason = null;
    let raw = null;
    for (const line of splitPayloadLines(text)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const chunk = trimmed.slice('data:'.length).trim();
      if (!chunk || chunk === '[DONE]') continue;
      try {
        const data = JSON.parse(chunk);
        raw = data;
        const content = extractChoiceContent(data);
        if (content) contentParts.push(content);
        const choice = data?.choices?.[0] || {};
        const message = choice?.message || {};
        if (Array.isArray(message.tool_calls)) mergeToolCallDelta(toolCalls, message.tool_calls);
        // Claude/Anthropic via 9Router streams tool_calls fragmentados em delta,
        // com arguments fatiados em varios chunks — precisa acumular por index.
        if (Array.isArray(choice?.delta?.tool_calls)) mergeToolCallDelta(toolCalls, choice.delta.tool_calls);
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      } catch {
        // ignore partial SSE chunk
      }
    }
    const mergedToolCalls = toolCalls.filter((call) => call?.function?.name);
    if (contentParts.length || mergedToolCalls.length) {
      return {
        content: contentParts.join(''),
        toolCalls: mergedToolCalls,
        finishReason,
        raw,
      };
    }
    // Valid SSE that carried no text (e.g. budget spent on a reasoning block and
    // finish_reason=length). Degrade to an empty answer — re-parsing the raw
    // stream here used to throw a misleading "Unexpected token 'd'" JSON error.
    if (raw) {
      return { content: '', toolCalls: [], finishReason, raw };
    }
    return {
      content: extractChatCompletionContent(text),
      toolCalls: [],
      finishReason: null,
      raw: null,
    };
  }
}

/**
 * Low-level chat completion against 9Router.
 * Supports OpenAI-style tools/tool_choice and multi-turn messages.
 */
export async function call9RouterChat({
  messages,
  system,
  user,
  agentId,
  model = ROUTER_MODEL,
  maxTokens = 1200,
  temperature = 0.3,
  tools = null,
  toolChoice = undefined,
} = {}) {
  const route = assertAllowed9RouterModel(model);
  const headers = {
    'Content-Type': 'application/json',
  };
  if (ROUTER_API_KEY) headers.Authorization = `Bearer ${ROUTER_API_KEY}`;
  const url = `${ROUTER_BASE_URL}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS);

  const finalMessages = Array.isArray(messages) && messages.length
    ? messages
    : [
        { role: 'system', content: system || '' },
        { role: 'user', content: user || '' },
      ];

  const body = {
    model: route,
    messages: finalMessages,
    temperature,
    max_tokens: maxTokens,
  };
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
    if (toolChoice !== undefined) body.tool_choice = toolChoice;
  }
  if (agentId) body.user = String(agentId);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    const detail = aborted
      ? `timeout de ${Math.round(ROUTER_TIMEOUT_MS / 1000)}s`
      : (error instanceof Error ? error.message : String(error));
    throw new Error(`9router_unreachable ${url}: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`9router ${response.status}: ${text}`);
  }

  const text = await response.text();
  return parseChatCompletionPayload(text);
}

export async function call9Router({
  system,
  user,
  agentId,
  model = ROUTER_MODEL,
  maxTokens = 1200,
  tools = null,
  toolChoice = undefined,
  messages = null,
} = {}) {
  const result = await call9RouterChat({
    system,
    user,
    agentId,
    model,
    maxTokens,
    tools,
    toolChoice,
    messages,
  });
  return result.content || 'Sem resposta textual do modelo.';
}

/**
 * Text-to-image via 9Router OpenAI-compatible images API.
 * Models live in a separate whitelist from chat completions.
 */
export async function call9RouterImageGeneration({
  prompt,
  model = IMAGE_GENERATION_MODEL,
  n = 1,
  responseFormat = 'b64_json',
  aspectRatio = '16:9',
  resolution = '1k',
  timeoutMs = ROUTER_IMAGE_TIMEOUT_MS,
} = {}) {
  const route = assertAllowedImageGenerationModel(model);
  const text = String(prompt || '').trim();
  if (!text) throw new Error('image_prompt_required');

  const headers = { 'Content-Type': 'application/json' };
  if (ROUTER_API_KEY) headers.Authorization = `Bearer ${ROUTER_API_KEY}`;
  const url = `${ROUTER_BASE_URL}/images/generations`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs) || ROUTER_IMAGE_TIMEOUT_MS);

  const body = {
    model: route,
    prompt: text,
    n: Math.max(1, Math.min(4, Number(n) || 1)),
    response_format: responseFormat === 'url' ? 'url' : 'b64_json',
    aspect_ratio: String(aspectRatio || '16:9'),
    resolution: String(resolution || '1k'),
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    const detail = aborted
      ? `timeout de ${Math.round((Number(timeoutMs) || ROUTER_IMAGE_TIMEOUT_MS) / 1000)}s`
      : (error instanceof Error ? error.message : String(error));
    throw new Error(`9router_image_unreachable ${url}: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`9router_image ${response.status}: ${errText}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.data) ? payload.data : [];
  if (!items.length) throw new Error('9router_image_empty_response');

  return {
    model: route,
    images: items.map((item, index) => ({
      index,
      b64Json: typeof item?.b64_json === 'string' ? item.b64_json : null,
      url: typeof item?.url === 'string' ? item.url : null,
      revisedPrompt: typeof item?.revised_prompt === 'string' ? item.revised_prompt : null,
    })),
    raw: payload,
  };
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
