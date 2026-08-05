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

function stripHtml(html) {
  const raw = String(html || '');
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
  const withoutScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const text = withoutScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text };
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
