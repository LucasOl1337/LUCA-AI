const DECISION_PACKAGE_SCHEMA = 'luca.decision-package.v1';

function contribution(reply = {}, fallbackRole = 'participant') {
  return {
    slug: String(reply.slug || ''),
    name: String(reply.name || reply.slug || ''),
    model: String(reply.model || ''),
    role: String(reply.workflowRoleLabel || fallbackRole),
    ok: reply.ok === true,
    content: reply.ok === true ? String(reply.content || '') : null,
    error: reply.ok === true ? null : String(reply.error || 'persona_failed'),
  };
}

function verdictFromResult(result = {}) {
  const source = result.mode === 'individual'
    ? result.judge
    : result.mode === 'workflow'
      ? result.finalDisplay
      : null;
  if (!source?.content) return null;
  return {
    slug: String(source.slug || ''),
    name: String(source.name || source.slug || ''),
    model: String(source.model || ''),
    summary: String(source.content),
  };
}

export function buildDecisionPackage(job = {}, { objective = '' } = {}) {
  const complete = job.status === 'complete' && job.result && typeof job.result === 'object';
  const result = complete ? job.result : {};
  const contributions = complete
    ? (Array.isArray(result.replies) ? result.replies : []).map((reply) => contribution(reply))
    : [];
  const team = complete && Array.isArray(result.team)
    ? result.team.map((member) => ({
        slug: String(member.slug || ''),
        name: String(member.name || member.slug || ''),
        model: String(member.model || ''),
        cached: Boolean(member.cached),
        stale: Boolean(member.stale),
        error: member.error ? String(member.error) : null,
      }))
    : [];

  return {
    schema: DECISION_PACKAGE_SCHEMA,
    deliberationId: String(job.runId || ''),
    traceId: String(job.traceId || ''),
    status: String(job.status || 'running'),
    objective: String(objective || ''),
    verdict: complete ? verdictFromResult(result) : null,
    contributions,
    engine: {
      mode: complete ? String(result.mode || '') || null : null,
      team,
    },
    timing: {
      startedAt: job.startedAt || null,
      completedAt: job.completedAt || null,
      durationMs: complete && Number.isFinite(Number(result.durationMs))
        ? Number(result.durationMs)
        : null,
    },
    error: job.status === 'failed' && job.error
      ? {
          code: String(job.error.code || 'deliberation_failed'),
          message: String(job.error.message || 'Falha na deliberação.'),
        }
      : null,
  };
}
