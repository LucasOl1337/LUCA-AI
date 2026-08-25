import { randomUUID } from 'node:crypto';

function publicJob(job) {
  return {
    runId: job.runId,
    traceId: job.traceId,
    status: job.status,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    progress: job.progress,
    result: job.result,
    error: job.error,
  };
}

function publicError(error) {
  return {
    code: String(error?.code || 'persona_run_failed'),
    message: String(error?.message || error || 'Falha ao executar a rodada de personas.'),
    ...(error?.details && typeof error.details === 'object' ? error.details : {}),
  };
}

export function createPersonaRunJobStore({
  idFactory = randomUUID,
  now = () => new Date(),
  schedule = (task) => setImmediate(task),
  maxJobs = 200,
} = {}) {
  const jobs = new Map();

  function prune() {
    if (jobs.size < maxJobs) return;
    for (const [runId, job] of jobs) {
      if (job.status === 'running') continue;
      jobs.delete(runId);
      if (jobs.size < maxJobs) return;
    }
  }

  function start({ ownerId, traceId, execute }) {
    const normalizedOwnerId = String(ownerId || '').trim();
    if (!normalizedOwnerId) throw new Error('workspace_user_required');
    if (typeof execute !== 'function') throw new Error('persona_run_execute_required');

    prune();
    const runId = idFactory();
    const job = {
      runId,
      ownerId: normalizedOwnerId,
      traceId: String(traceId || runId),
      status: 'running',
      startedAt: now().toISOString(),
      completedAt: null,
      progress: null,
      result: null,
      error: null,
    };
    jobs.set(runId, job);

    schedule(() => {
      const reportProgress = (value) => {
        if (job.status !== 'running' || !value || typeof value !== 'object') return;
        const revision = Number(job.progress?.revision || 0) + 1;
        job.progress = {
          ...value,
          revision,
          updatedAt: now().toISOString(),
        };
      };
      Promise.resolve()
        .then(() => execute(publicJob(job), reportProgress))
        .then((result) => {
          job.status = 'complete';
          job.result = result;
          job.completedAt = now().toISOString();
        })
        .catch((error) => {
          job.status = 'failed';
          job.error = publicError(error);
          job.completedAt = now().toISOString();
        });
    });

    return publicJob(job);
  }

  function get(runId, ownerId) {
    const job = jobs.get(String(runId || ''));
    if (!job || job.ownerId !== String(ownerId || '').trim()) return null;
    return publicJob(job);
  }

  function findByTraceId(traceId, ownerId) {
    const cleanTraceId = String(traceId || '').trim();
    const cleanOwnerId = String(ownerId || '').trim();
    if (!cleanTraceId || !cleanOwnerId) return null;
    for (const job of jobs.values()) {
      if (job.ownerId === cleanOwnerId && job.traceId === cleanTraceId) {
        return publicJob(job);
      }
    }
    return null;
  }

  return { start, get, findByTraceId };
}
