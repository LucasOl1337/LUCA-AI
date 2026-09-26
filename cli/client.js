import { setTimeout as delay } from 'node:timers/promises';
import { CliError, numberOption } from './io.js';

export function apiUrl(origin, route) {
  if (!route.startsWith('/api/') || /[\\#]/.test(route)) throw new CliError('invalid_path', 'O caminho deve começar com /api/ e não conter fragmentos ou barras invertidas.');
  const url = new URL(route, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/')) throw new CliError('invalid_path', 'O caminho deve permanecer em /api/ da origem selecionada.');
  return url;
}

export function createClient(config, options, signal) {
  return async function request(method, route, { body, headers = {}, timeout, binary = false, allowJobFailure = false } = {}) {
    const url = apiUrl(config.url, route);
    const controller = AbortSignal.timeout(timeout ?? numberOption(options.timeout, 'timeout', 30000));
    const combined = signal ? AbortSignal.any([signal, controller]) : controller;
    const machineRoute = /^\/api\/deliberations(?:\/[^/]+)?$/.test(url.pathname);
    const authHeaders = config.machineToken && machineRoute
      ? { Authorization: `Bearer ${config.machineToken}` }
      : config.cookie ? { Cookie: config.cookie } : {};
    let response;
    let bytes;
    try {
      response = await fetch(url, {
        method, redirect: 'manual', signal: combined,
        headers: { Accept: 'application/json', 'User-Agent': 'luca-cli', ...authHeaders, ...(body !== undefined && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
      });
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (signal?.aborted) throw new CliError('interrupted', 'Comando interrompido; jobs já aceitos continuam no servidor.', 130);
      throw new CliError(combined.aborted ? 'request_timeout' : 'network_error', combined.aborted ? 'Requisição excedeu o timeout. Uma mutação pode ter sido aceita; consulte o estado antes de reenviar.' : `Não foi possível acessar ${url.origin}.`, 4, { cause: error.cause?.code || error.code });
    }
    let payload;
    const isJson = /(?:application\/json|\+json)(?:;|$)/i.test(response.headers.get('content-type') || '');
    if (isJson && method !== 'HEAD' && response.status !== 204) {
      try { payload = JSON.parse(bytes.toString('utf8')); }
      catch { throw new CliError('invalid_response', 'O servidor devolveu JSON inválido.', 1, { status: response.status }); }
    }
    if (!response.ok) {
      const status = response.status;
      throw new CliError('http_error', typeof payload?.message === 'string' ? payload.message : typeof payload?.error === 'string' ? payload.error : `HTTP ${status}`, [401, 403].includes(status) ? 3 : 1, { status, response: payload, retryAfter: response.headers.get('retry-after') || undefined });
    }
    if (!isJson && !binary && method !== 'HEAD' && response.status !== 204) throw new CliError('unexpected_content_type', 'Esperava JSON. Confira a origem/rota; pode ser um fallback HTML. Para arquivos use --output.', 1, { status: response.status, contentType: response.headers.get('content-type') });
    if (payload?.ok === false && !(allowJobFailure && payload.status === 'failed')) throw new CliError('api_error', typeof payload.error === 'string' ? payload.error : payload.error?.message || payload.message || 'A operação retornou ok=false.', 1, { status: response.status, response: payload });
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('luca_session='));
    if (cookie) {
      const pair = cookie.split(';')[0];
      await config.setCookie(pair === 'luca_session=' ? '' : pair);
      config.cookie = pair === 'luca_session=' ? '' : pair;
    }
    return binary ? bytes : payload ?? { ok: true, status: response.status };
  };
}

export async function waitForJob(request, kind, initial, options, signal) {
  const id = kind === 'team' ? initial.runId : initial.deliberationId;
  if (!id) throw new CliError('invalid_job', 'A resposta não contém o ID do job.', 1);
  const route = kind === 'team' ? `/api/luca-ai/persona-team/runs/${encodeURIComponent(id)}` : `/api/deliberations/${encodeURIComponent(id)}`;
  const deadline = Date.now() + numberOption(options['wait-timeout'], 'wait-timeout', 1800000);
  const interval = numberOption(options.interval, 'interval', 1000, 100, 60000);
  let result = initial;
  let pollDelay = interval;
  const resume = kind === 'team' ? `luca team status ${id} --wait` : `luca deliberations get ${id} --wait`;
  // Emit the accepted ID before polling so a disconnect never hides it.
  process.stderr.write(`${JSON.stringify({ event: 'job', id, status: initial.status, resume })}\n`);
  while (result.status === 'running' || result.status === 'queued') {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new CliError('wait_timeout', 'Tempo de espera esgotado; o job continua no servidor.', 4, { id, resume });
    try { await delay(Math.min(pollDelay, remaining), undefined, { signal }); }
    catch { throw new CliError('interrupted', 'Espera interrompida; o job continua no servidor.', 130, { id, resume }); }
    if (Date.now() >= deadline) throw new CliError('wait_timeout', 'Tempo de espera esgotado; o job continua no servidor.', 4, { id, resume });
    try {
      result = await request('GET', route, { timeout: Math.min(numberOption(options.timeout, 'timeout', 30000), Math.max(1, deadline - Date.now())), allowJobFailure: true });
      pollDelay = interval;
    } catch (error) {
      // Reads may be retried. The accepted POST is never repeated.
      if (error.exitCode === 4 || [429, 502, 503, 504].includes(error.details?.status)) {
        const retryAfter = error.details?.retryAfter;
        const retryMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
        pollDelay = Math.max(interval, Number.isFinite(retryMs) ? retryMs : 0, Math.min(10000, pollDelay * 2));
        continue;
      }
      error.details = { ...error.details, id, resume };
      throw error;
    }
  }
  if (result.status === 'failed') throw new CliError('job_failed', 'A execução falhou.', 5, { id, result });
  if (result.status !== 'complete') throw new CliError('invalid_job_status', 'Status de job desconhecido.', 1, { id, result });
  return result;
}
