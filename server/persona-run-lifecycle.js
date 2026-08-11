export class PersonaRunLifecycleError extends Error {
  constructor(code, message, { status = 409, details = null } = {}) {
    super(message || code);
    this.name = 'PersonaRunLifecycleError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clean(value) {
  return String(value || '').trim();
}

function interruptedMeta(run) {
  return {
    runId: run.runId,
    traceId: run.traceId || run.runId,
    errorCode: 'persona_run_interrupted',
    errorMessage: 'A rodada foi interrompida por reinicio do runtime e pode ser reenviada.',
  };
}

/**
 * Owner unico das transicoes accepted -> running -> persisted -> complete/failed.
 * Job memory e chat duravel sao adapters internos; Express apenas traduz HTTP.
 */
export function createPersonaRunLifecycle({
  jobs,
  sessions,
  runInOwnerContext = (_ownerId, task) => task(),
} = {}) {
  if (typeof jobs?.start !== 'function'
    || typeof jobs?.get !== 'function'
    || typeof jobs?.findByTraceId !== 'function') {
    throw new Error('persona_run_lifecycle_job_adapter_required');
  }
  if (typeof sessions?.get !== 'function'
    || typeof sessions?.markRunning !== 'function'
    || typeof sessions?.complete !== 'function'
    || typeof sessions?.fail !== 'function'
    || typeof sessions?.find !== 'function') {
    throw new Error('persona_run_lifecycle_session_adapter_required');
  }
  if (typeof runInOwnerContext !== 'function') {
    throw new Error('persona_run_lifecycle_owner_adapter_required');
  }

  function inOwner(ownerId, task) {
    return runInOwnerContext(ownerId, task);
  }

  function persistedRun(ownerId, runId) {
    return inOwner(ownerId, () => sessions.find(runId));
  }

  function failInterrupted(ownerId, run) {
    inOwner(ownerId, () => sessions.fail(run.sessionId, interruptedMeta(run)));
    return persistedRun(ownerId, run.runId);
  }

  function start({ ownerId, input = {}, execute } = {}) {
    const cleanOwnerId = clean(ownerId);
    const traceId = clean(input.traceId);
    const sessionId = clean(input.sessionId);
    if (!cleanOwnerId) throw new PersonaRunLifecycleError('workspace_user_required', 'Workspace sem owner.', { status: 401 });
    if (!traceId) throw new PersonaRunLifecycleError('persona_run_trace_required', 'traceId ausente.', { status: 400 });
    if (typeof execute !== 'function') {
      throw new PersonaRunLifecycleError('persona_run_execute_required', 'Executor da rodada ausente.', { status: 500 });
    }

    const existingJob = jobs.findByTraceId(traceId, cleanOwnerId);
    if (existingJob) return { ...existingJob, reused: true };

    if (sessionId) {
      const session = inOwner(cleanOwnerId, () => sessions.get(sessionId));
      const active = session?.activePersonaRun;
      const last = session?.lastPersonaRun;

      if (clean(last?.traceId) === traceId && clean(last?.runId)) {
        const persisted = persistedRun(cleanOwnerId, last.runId);
        if (persisted) return { ...persisted, reused: true };
      }

      if (active?.status === 'running' && clean(active.runId)) {
        const activeJob = jobs.get(active.runId, cleanOwnerId);
        if (clean(active.traceId) === traceId) {
          if (activeJob) return { ...activeJob, reused: true };
          const interrupted = failInterrupted(cleanOwnerId, { ...active, sessionId });
          if (interrupted) return { ...interrupted, reused: true };
        } else if (activeJob) {
          throw new PersonaRunLifecycleError(
            'persona_run_already_running',
            'Esta sessao ja possui uma rodada em andamento.',
            { details: { runId: active.runId, traceId: active.traceId } },
          );
        } else {
          failInterrupted(cleanOwnerId, { ...active, sessionId });
        }
      }
    }

    const job = jobs.start({
      ownerId: cleanOwnerId,
      traceId,
      execute: (jobMeta) => inOwner(cleanOwnerId, async () => {
        try {
          const result = await execute(jobMeta);
          if (sessionId) {
            const saved = sessions.complete(sessionId, result, {
              runId: jobMeta.runId,
              traceId: jobMeta.traceId,
              startedAt: jobMeta.startedAt,
              completedAt: result?.generatedAt,
            });
            if (!saved) {
              const error = new Error('A sessao nao confirmou a persistencia da rodada.');
              error.code = 'persona_run_persistence_failed';
              throw error;
            }
          }
          return result;
        } catch (error) {
          if (sessionId) {
            try {
              sessions.fail(sessionId, {
                runId: jobMeta.runId,
                traceId: jobMeta.traceId,
                errorCode: error?.code || 'persona_run_failed',
                errorMessage: error?.message || String(error),
              });
            } catch {
              // O job ainda deve expor a falha original se o adapter duravel falhar.
            }
          }
          throw error;
        }
      }),
    });

    if (sessionId) {
      inOwner(cleanOwnerId, () => sessions.markRunning(sessionId, {
        runId: job.runId,
        traceId: job.traceId,
        startedAt: job.startedAt,
      }));
    }
    return job;
  }

  function get(runId, ownerId) {
    const cleanRunId = clean(runId);
    const cleanOwnerId = clean(ownerId);
    if (!cleanRunId || !cleanOwnerId) return null;
    const live = jobs.get(cleanRunId, cleanOwnerId);
    if (live) return live;
    const persisted = persistedRun(cleanOwnerId, cleanRunId);
    if (persisted?.status !== 'running') return persisted;
    return failInterrupted(cleanOwnerId, persisted);
  }

  return { start, get };
}
