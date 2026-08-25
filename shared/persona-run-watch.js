import { isTransientRequestError } from './request-timeout.js';

export class PersonaRunWatchError extends Error {
  constructor(message, { runId = '', traceId = '', code = 'persona_run_watch_failed', cause = null } = {}) {
    super(message);
    this.name = 'PersonaRunWatchError';
    this.runId = runId;
    this.traceId = traceId;
    this.code = code;
    this.cause = cause;
  }
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acompanha um job assíncrono de persona-team com tolerância a 524/timeout/rede.
 * Falhas transitórias de borda NÃO abortam a rodada — só estouro de prazo ou
 * erros consecutivos longos demais.
 */
export async function watchPersonaTeamRun({
  runId,
  traceId = '',
  getStatus,
  wait = defaultWait,
  now = () => Date.now(),
  maxWaitMs = 30 * 60 * 1000,
  pollIntervalMs = 1500,
  maxConsecutiveErrorMs = 3 * 60 * 1000,
  maxBackoffMs = 8000,
  isTransient = isTransientRequestError,
  onTransientError = null,
  onProgress = null,
} = {}) {
  const cleanRunId = String(runId || '').trim();
  if (!cleanRunId) {
    throw new PersonaRunWatchError('runId ausente para acompanhar a rodada.', {
      code: 'persona_run_id_required',
    });
  }
  if (typeof getStatus !== 'function') {
    throw new PersonaRunWatchError('getStatus é obrigatório.', {
      runId: cleanRunId,
      traceId,
      code: 'persona_run_get_status_required',
    });
  }

  const deadline = now() + Math.max(1_000, Number(maxWaitMs) || 0);
  let consecutiveErrorStartedAt = null;
  let backoffMs = Math.max(250, Number(pollIntervalMs) || 1500);
  let lastError = null;
  let lastProgressRevision = 0;

  while (now() < deadline) {
    try {
      const job = await getStatus(cleanRunId);
      consecutiveErrorStartedAt = null;
      backoffMs = Math.max(250, Number(pollIntervalMs) || 1500);
      lastError = null;

      const progressRevision = Number(job?.progress?.revision || 0);
      if (progressRevision > lastProgressRevision && typeof onProgress === 'function') {
        lastProgressRevision = progressRevision;
        try {
          onProgress(job.progress);
        } catch {
          // A tela e observadora: falha de render nao interrompe o job do servidor.
        }
      }

      const status = String(job?.status || '').trim();
      if (status === 'complete' && job?.result) {
        return job.result;
      }
      if (status === 'failed') {
        const message = String(job?.error?.message || 'A rodada de personas falhou durante a execução.');
        throw new PersonaRunWatchError(message, {
          runId: cleanRunId,
          traceId: String(job?.traceId || traceId || ''),
          code: String(job?.error?.code || 'persona_run_failed'),
          cause: job?.error || null,
        });
      }
      await wait(Math.max(250, Number(pollIntervalMs) || 1500));
    } catch (error) {
      if (error instanceof PersonaRunWatchError) throw error;
      if (!isTransient(error)) {
        throw error;
      }

      lastError = error;
      if (consecutiveErrorStartedAt == null) consecutiveErrorStartedAt = now();
      if (typeof onTransientError === 'function') {
        try {
          onTransientError(error, {
            runId: cleanRunId,
            consecutiveMs: now() - consecutiveErrorStartedAt,
          });
        } catch {
          // callback is best-effort
        }
      }

      const consecutiveMs = now() - consecutiveErrorStartedAt;
      if (consecutiveMs >= Math.max(5_000, Number(maxConsecutiveErrorMs) || 0)) {
        throw new PersonaRunWatchError(
          'A conexão com o runtime ficou instável por tempo demais. A rodada pode continuar em segundo plano — atualize em instantes ou reabra a sessão.',
          {
            runId: cleanRunId,
            traceId,
            code: 'persona_run_edge_unstable',
            cause: lastError,
          },
        );
      }

      await wait(backoffMs);
      backoffMs = Math.min(Math.round(backoffMs * 1.5), Math.max(1000, Number(maxBackoffMs) || 8000));
    }
  }

  throw new PersonaRunWatchError(
    'A rodada continua em segundo plano e excedeu o tempo de acompanhamento desta tela.',
    {
      runId: cleanRunId,
      traceId,
      code: 'persona_run_watch_timeout',
      cause: lastError,
    },
  );
}

/**
 * Interface do observer HTTP: aceita (com retry idempotente por trace) e acompanha
 * a rodada. O servidor continua sendo o owner das transicoes e da persistencia.
 */
export async function startAndWatchPersonaTeamRun({
  startRun,
  traceId = '',
  maxStartAttempts = 2,
  isTransient = isTransientRequestError,
  ...watchOptions
} = {}) {
  if (typeof startRun !== 'function') {
    throw new PersonaRunWatchError('startRun é obrigatório.', {
      traceId,
      code: 'persona_run_start_required',
    });
  }

  let accepted = null;
  let lastError = null;
  const attempts = Math.max(1, Number(maxStartAttempts) || 1);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      accepted = await startRun();
      break;
    } catch (error) {
      if (!isTransient(error)) throw error;
      lastError = error;
    }
  }

  if (!accepted?.runId) {
    throw new PersonaRunWatchError(
      lastError
        ? 'A borda não confirmou o aceite, mas a rodada pode ter iniciado. Atualize a sessão antes de reenviar.'
        : 'Runtime aceitou a rodada sem runId.',
      {
        traceId,
        code: lastError ? 'persona_run_acceptance_unknown' : 'persona_run_id_required',
        cause: lastError,
      },
    );
  }

  return watchPersonaTeamRun({
    ...watchOptions,
    runId: accepted.runId,
    traceId: String(accepted.traceId || traceId || accepted.runId),
    isTransient,
  });
}
