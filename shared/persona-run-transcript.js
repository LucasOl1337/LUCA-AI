function safePart(value, fallback = 'item') {
  return String(value || '').replace(/[^\w-]+/g, '').slice(0, 40) || fallback;
}

/** Trace-derived ids: browser e servidor descrevem a MESMA rodada com o mesmo id. */
export function personaRunTraceId(run = {}) {
  return safePart(run.traceId || Date.now(), 'run');
}

export function personaRunOperatorEntryId(run = {}) {
  return `op_${personaRunTraceId(run)}`;
}

function replyEntry(reply, { id, timestamp, stage, phase, content } = {}) {
  const raw = String(content ?? reply?.content ?? '').trim();
  const text = reply?.ok
    ? raw || 'Sem resposta textual da persona.'
    : `Falha ao rodar esta persona: ${reply?.error || raw || 'erro desconhecido'}`;
  return {
    id,
    role: 'persona',
    name: reply?.name || reply?.slug || 'Persona',
    slug: reply?.slug || undefined,
    model: reply?.model || undefined,
    stage: stage || undefined,
    phase: phase || undefined,
    content: text,
    status: reply?.ok ? 'ok' : 'error',
    timestamp: reply?.completedAt || timestamp,
    startedAt: reply?.startedAt || undefined,
    completedAt: reply?.completedAt || undefined,
    durationMs: Number.isFinite(reply?.durationMs) ? Math.max(0, reply.durationMs) : undefined,
  };
}

export function formatPersonaRunDuration(value) {
  const durationMs = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(durationMs) || durationMs < 0) return '—';
  if (durationMs < 100) return '<0,1 s';
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} s`;
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
}

export function transcriptEntriesFromPersonaRun(run = {}) {
  const timestamp = String(run.generatedAt || new Date().toISOString());
  const traceId = personaRunTraceId(run);
  const entries = [];
  const steps = Array.isArray(run.steps) ? run.steps : [];
  if (steps.length) {
    for (const step of steps) {
      const stage = step?.roleLabel || step?.roleId || '';
      for (const reply of (step?.replies || [])) {
        const isVisual = step?.roleId === 'visual' && reply?.ok;
        const entry = replyEntry(reply, {
          id: `r_${traceId}_${safePart(reply?.slug, 'persona')}_${safePart(step?.roleId, 'step')}_${entries.length}`,
          timestamp,
          stage,
          phase: reply?.phase || step?.phase,
          content: isVisual
            ? run.visualPack?.summary || 'Plano de artefatos enviado para materialização (gráficos, relatório e imagens).'
            : undefined,
        });
        if (entry) entries.push(entry);
      }
    }
    return entries;
  }
  for (const reply of (run.replies || [])) {
    const entry = replyEntry(reply, {
      id: `r_${traceId}_${safePart(reply?.slug, 'persona')}_${entries.length}`,
      timestamp,
      stage: reply?.workflowRoleLabel,
      phase: reply?.phase,
    });
    if (entry) entries.push(entry);
  }
  return entries;
}

export function finalEntryFromPersonaRun(run = {}) {
  const timestamp = String(run.generatedAt || new Date().toISOString());
  const traceId = personaRunTraceId(run);
  if (run.mode === 'individual' && run.judge?.content) {
    return {
      id: `judge_${traceId}`,
      role: 'persona',
      name: run.judge.name || run.judge.slug,
      slug: run.judge.slug,
      model: run.judge.model,
      phase: run.judge.phase || 'judge',
      stage: 'Juiz',
      content: run.judge.content,
      status: run.judge.ok ? 'ok' : 'error',
      timestamp: run.judge.completedAt || timestamp,
      startedAt: run.judge.startedAt || undefined,
      completedAt: run.judge.completedAt || undefined,
      durationMs: Number.isFinite(run.judge.durationMs) ? Math.max(0, run.judge.durationMs) : undefined,
    };
  }
  if (!run.finalDisplay?.content) return null;
  const finalReply = (Array.isArray(run.steps) ? run.steps : [])
    .flatMap((step) => Array.isArray(step?.replies) ? step.replies : [])
    .find((reply) => (
      reply?.slug === run.finalDisplay.slug
      && String(reply?.content || '').trim() === String(run.finalDisplay.content || '').trim()
    )) || (Array.isArray(run.replies) ? run.replies : [])
    .find((reply) => (
      reply?.slug === run.finalDisplay.slug
      && String(reply?.content || '').trim() === String(run.finalDisplay.content || '').trim()
    ));
  return {
    id: `final_${traceId}`,
    role: 'persona',
    name: run.finalDisplay.name || run.finalDisplay.slug,
    slug: run.finalDisplay.slug,
    model: run.finalDisplay.model,
    stage: run.finalDisplay.roleLabel || 'Exibição final',
    content: run.finalDisplay.content,
    status: 'ok',
    timestamp: finalReply?.completedAt || timestamp,
    startedAt: finalReply?.startedAt || undefined,
    completedAt: finalReply?.completedAt || undefined,
    durationMs: Number.isFinite(finalReply?.durationMs) ? Math.max(0, finalReply.durationMs) : undefined,
  };
}
