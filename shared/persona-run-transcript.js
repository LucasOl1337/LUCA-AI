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
  };
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
      timestamp,
    };
  }
  if (!run.finalDisplay?.content) return null;
  return {
    id: `final_${traceId}`,
    role: 'persona',
    name: run.finalDisplay.name || run.finalDisplay.slug,
    slug: run.finalDisplay.slug,
    model: run.finalDisplay.model,
    stage: run.finalDisplay.roleLabel || 'Exibição final',
    content: run.finalDisplay.content,
    status: 'ok',
    timestamp,
  };
}