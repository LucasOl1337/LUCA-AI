// Operational tools for LUCA agents. Fail closed on SSRF / bad schemes.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const DEFAULT_TIMEOUT_MS = Number(process.env.LUCA_TOOL_TIMEOUT_MS || 12000);
const MAX_BODY_CHARS = Number(process.env.LUCA_TOOL_MAX_BODY_CHARS || 24000);
const MAX_REDIRECTS = 3;

export const AGENT_TOOL_SPECS = [
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description:
        'Baixa uma pagina HTTP(S) publica e devolve titulo, status, texto legivel e trechos uteis. Use para inspecionar sites, docs e landing pages. Nao invente conteudo se puder buscar.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL absoluta http ou https' },
          max_chars: {
            type: 'integer',
            description: 'Limite de caracteres do texto extraido (padrao 8000, max 24000)',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'http_get_json',
      description:
        'Faz GET em uma URL publica e tenta interpretar JSON. Util para APIs e health endpoints abertos.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL absoluta http ou https' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Pesquisa fatos externos na web quando a URL ainda nao e conhecida. Devolve titulo, URL e trecho dos melhores resultados.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termos da pesquisa' },
          max_results: {
            type: 'integer',
            description: 'Quantidade de resultados (padrao 5, max 8)',
            minimum: 1,
            maximum: 8,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calc',
      description:
        'Calcula uma expressao aritmetica com +, -, *, /, %, ^ e parenteses sem executar codigo.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Expressao aritmetica' },
        },
        required: ['expression'],
      },
    },
  },
];

function isPrivateIp(ip) {
  const value = String(ip || '').trim().toLowerCase();
  if (!value) return true;
  if (value === '::1' || value === '0.0.0.0') return true;
  if (value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true;
  if (value.includes(':')) {
    // IPv6 mapped IPv4 ::ffff:x.x.x.x
    const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function assertPublicHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    const err = new Error('url_invalida');
    err.code = 'URL_INVALID';
    throw err;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    const err = new Error('somente_http_https');
    err.code = 'URL_SCHEME';
    throw err;
  }
  if (!parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) {
    const err = new Error('host_privado_bloqueado');
    err.code = 'URL_PRIVATE';
    throw err;
  }
  if (net.isIP(parsed.hostname) && isPrivateIp(parsed.hostname)) {
    const err = new Error('ip_privado_bloqueado');
    err.code = 'URL_PRIVATE';
    throw err;
  }
  return parsed;
}

async function assertPublicResolvedHost(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      const err = new Error('ip_privado_bloqueado');
      err.code = 'URL_PRIVATE';
      throw err;
    }
    return;
  }
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    const err = new Error('host_nao_resolvido');
    err.code = 'DNS_FAIL';
    throw err;
  }
  if (!records?.length) {
    const err = new Error('host_nao_resolvido');
    err.code = 'DNS_FAIL';
    throw err;
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      const err = new Error('ip_privado_bloqueado');
      err.code = 'URL_PRIVATE';
      throw err;
    }
  }
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return String(value || '').replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hex, name) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    return named[String(name || '').toLowerCase()] ?? entity;
  });
}

function htmlToText(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(html) {
  const raw = String(html || '');
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? htmlToText(titleMatch[1]) : '';
  const withoutScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  return { title, text: htmlToText(withoutScripts) };
}

function normalizeSearchResult(item) {
  const url = String(item?.url || '').trim();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  return {
    title: htmlToText(item?.title).slice(0, 300),
    url: parsed.toString(),
    snippet: htmlToText(item?.snippet).slice(0, 1200),
  };
}

function normalizeSearchResults(items, maxResults) {
  const results = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const result = normalizeSearchResult(item);
    if (!result || !result.title || seen.has(result.url)) continue;
    seen.add(result.url);
    results.push(result);
    if (results.length >= maxResults) break;
  }
  return results;
}

function parseDuckDuckGoResults(html, maxResults) {
  const blocks = String(html || '').split(/(?=<div[^>]+class=["'][^"']*\bresult\b[^"']*["'][^>]*>)/gi);
  const items = [];
  for (const block of blocks) {
    if (!/class=["'][^"']*\bresult\b/i.test(block)) continue;
    let resultAnchor = null;
    for (const match of block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (/class=["'][^"']*\bresult__a\b/i.test(match[1])) {
        resultAnchor = match;
        break;
      }
    }
    if (!resultAnchor) continue;
    const hrefMatch = resultAnchor[1].match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const rawHref = decodeHtmlEntities(hrefMatch[1]);
    let parsedHref;
    try {
      parsedHref = new URL(rawHref, 'https://html.duckduckgo.com');
    } catch {
      continue;
    }
    const url = parsedHref.searchParams.get('uddg') || parsedHref.toString();
    const snippetMatch = block.match(/<([a-z][\w-]*)\b[^>]*class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i);
    items.push({
      title: resultAnchor[2],
      url,
      snippet: snippetMatch?.[2] || '',
    });
  }
  return normalizeSearchResults(items, maxResults);
}

function getSearchProvider() {
  if (String(process.env.BRAVE_SEARCH_API_KEY || '').trim()) return 'brave';
  if (String(process.env.TAVILY_API_KEY || '').trim()) return 'tavily';
  return 'duckduckgo';
}

async function fetchSearch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const bodyText = (await response.text()).slice(0, MAX_BODY_CHARS);
    if (!response.ok) {
      const error = new Error(`search_http_${response.status}`);
      error.code = 'SEARCH_HTTP';
      throw error;
    }
    return bodyText;
  } finally {
    clearTimeout(timer);
  }
}

async function webSearch(query, maxResults, provider) {
  if (provider === 'brave') {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(maxResults));
    const body = await fetchSearch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': String(process.env.BRAVE_SEARCH_API_KEY).trim(),
      },
    });
    const data = JSON.parse(body);
    return normalizeSearchResults(data?.web?.results?.map((item) => ({
      title: item?.title,
      url: item?.url,
      snippet: item?.description,
    })), maxResults);
  }

  if (provider === 'tavily') {
    const body = await fetchSearch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: String(process.env.TAVILY_API_KEY).trim(),
        query,
        max_results: maxResults,
      }),
    });
    const data = JSON.parse(body);
    return normalizeSearchResults(data?.results?.map((item) => ({
      title: item?.title,
      url: item?.url,
      snippet: item?.content,
    })), maxResults);
  }

  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);
  const body = await fetchSearch(url.toString(), {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    },
  });
  return parseDuckDuckGoResults(body, maxResults);
}

function calcError(message = 'expressao_invalida') {
  const error = new Error(message);
  error.code = 'CALC_INVALID';
  return error;
}

function calculate(expression) {
  const source = String(expression ?? '');
  if (!source.trim() || source.length > 500 || /[^\d\s.+\-*/%^()]/.test(source)) {
    throw calcError();
  }
  let position = 0;

  const skipSpaces = () => {
    while (/\s/.test(source[position] || '')) position += 1;
  };
  const match = (operator) => {
    skipSpaces();
    if (source[position] !== operator) return false;
    position += 1;
    return true;
  };
  const ensureFinite = (value) => {
    if (!Number.isFinite(value)) throw calcError('resultado_nao_finito');
    return value;
  };

  const parseNumber = () => {
    skipSpaces();
    const number = source.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)?.[0];
    if (!number) throw calcError();
    position += number.length;
    return ensureFinite(Number(number));
  };

  let parseAddSubtract;
  const parsePrimary = () => {
    if (!match('(')) return parseNumber();
    const value = parseAddSubtract();
    if (!match(')')) throw calcError();
    return value;
  };
  const parsePower = () => {
    const left = parsePrimary();
    return match('^') ? ensureFinite(left ** parseUnary()) : left;
  };
  const parseUnary = () => {
    if (match('+')) return parseUnary();
    if (match('-')) return ensureFinite(-parseUnary());
    return parsePower();
  };
  const parseMultiplyDivide = () => {
    let value = parseUnary();
    while (true) {
      if (match('*')) value = ensureFinite(value * parseUnary());
      else if (match('/')) {
        const divisor = parseUnary();
        if (divisor === 0) throw calcError('divisao_por_zero');
        value = ensureFinite(value / divisor);
      } else if (match('%')) {
        const divisor = parseUnary();
        if (divisor === 0) throw calcError('divisao_por_zero');
        value = ensureFinite(value % divisor);
      } else return value;
    }
  };
  parseAddSubtract = () => {
    let value = parseMultiplyDivide();
    while (true) {
      if (match('+')) value = ensureFinite(value + parseMultiplyDivide());
      else if (match('-')) value = ensureFinite(value - parseMultiplyDivide());
      else return value;
    }
  };

  const value = parseAddSubtract();
  skipSpaces();
  if (position !== source.length) throw calcError();
  return ensureFinite(value);
}

async function fetchPublic(url, { timeoutMs = DEFAULT_TIMEOUT_MS, accept = '*/*' } = {}) {
  const parsed = assertPublicHttpUrl(url);
  await assertPublicResolvedHost(parsed.hostname);

  let current = parsed;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicResolvedHost(current.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: accept,
          'User-Agent': 'luca-ai-agent-tools/1.0 (+https://luca-ai.com.br)',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return { response, finalUrl: current.toString(), bodyText: '' };
        }
        current = new URL(location, current);
        assertPublicHttpUrl(current.toString());
        continue;
      }
      const bodyText = await response.text();
      return { response, finalUrl: current.toString(), bodyText };
    } finally {
      clearTimeout(timer);
    }
  }
  const err = new Error('muitos_redirects');
  err.code = 'REDIRECT_LIMIT';
  throw err;
}

export async function executeAgentTool(name, args = {}) {
  const tool = String(name || '').trim();
  try {
    if (tool === 'calc') {
      const expression = String(args.expression ?? '');
      return {
        ok: true,
        tool,
        expression,
        value: calculate(expression),
      };
    }

    if (tool === 'web_search') {
      const query = String(args.query || '').trim();
      if (!query || query.length > 500) {
        const error = new Error('query_invalida');
        error.code = 'SEARCH_INVALID';
        throw error;
      }
      const requested = Number(args.max_results);
      const maxResults = Number.isFinite(requested)
        ? Math.max(1, Math.min(8, Math.trunc(requested)))
        : 5;
      const provider = getSearchProvider();
      const results = await webSearch(query, maxResults, provider);
      return { ok: true, tool, query, provider, results };
    }

    if (tool === 'fetch_url') {
      const maxChars = Math.max(500, Math.min(MAX_BODY_CHARS, Number(args.max_chars) || 8000));
      const { response, finalUrl, bodyText } = await fetchPublic(args.url, {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      });
      const contentType = response.headers.get('content-type') || '';
      const { title, text } = contentType.includes('html') || /<html/i.test(bodyText)
        ? stripHtml(bodyText)
        : { title: '', text: String(bodyText || '').replace(/\s+/g, ' ').trim() };
      const clipped = text.slice(0, maxChars);
      return {
        ok: response.ok,
        tool,
        status: response.status,
        url: finalUrl,
        contentType,
        title,
        text: clipped,
        truncated: text.length > clipped.length,
        chars: clipped.length,
      };
    }

    if (tool === 'http_get_json') {
      const { response, finalUrl, bodyText } = await fetchPublic(args.url, {
        accept: 'application/json,text/plain;q=0.8,*/*;q=0.5',
      });
      let data = null;
      let parseError = null;
      try {
        data = JSON.parse(bodyText);
      } catch (error) {
        parseError = error?.message || String(error);
      }
      return {
        ok: response.ok && !parseError,
        tool,
        status: response.status,
        url: finalUrl,
        data,
        parseError,
        rawPreview: String(bodyText || '').slice(0, 1200),
      };
    }

    return { ok: false, tool, error: 'tool_desconhecida' };
  } catch (error) {
    return {
      ok: false,
      tool,
      ...(tool === 'calc' ? { expression: String(args.expression ?? ''), value: null } : {}),
      ...(tool === 'web_search' ? {
        query: String(args.query || '').trim(),
        provider: getSearchProvider(),
        results: [],
      } : {}),
      error: error?.message || String(error),
      code: error?.code || null,
    };
  }
}

export function extractUrlsFromText(value, limit = 5) {
  const text = String(value || '');
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  const cleaned = [];
  const seen = new Set();
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?)]+$/g, '');
    if (seen.has(url)) continue;
    try {
      assertPublicHttpUrl(url);
    } catch {
      continue;
    }
    seen.add(url);
    cleaned.push(url);
    if (cleaned.length >= limit) break;
  }
  return cleaned;
}
