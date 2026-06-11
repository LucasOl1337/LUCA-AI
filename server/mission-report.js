function clip(text, max = 220) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function uniqueStrings(values, max = 8) {
  const seen = new Set();
  const list = [];
  for (const value of values || []) {
    const normalized = String(value ?? '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(normalized);
    if (list.length >= max) break;
  }
  return list;
}

function normalizeFinding(raw = {}) {
  return {
    title: clip(raw?.title || raw?.label || '', 96),
    detail: clip(raw?.detail || raw?.body || raw?.value || '', 180),
    basis: clip(raw?.basis || '', 24),
    importance: clip(raw?.importance || '', 24),
  };
}

function linesFromMessage(message = {}) {
  return String(message?.content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractEvidenceTrail(chatMessages = [], limit = 8) {
  const evidence = [];
  for (const message of chatMessages) {
    const agent = String(message?.agentName || message?.agentId || 'agente').trim();
    for (const line of linesFromMessage(message)) {
      if (!/\b(evidencia|premissa|proxy|risco|ponto forte|ponto fraco|lacuna)\b/i.test(line)) continue;
      evidence.push(`- ${agent}: ${clip(line, 220)}`);
      if (evidence.length >= limit) return evidence;
    }
  }
  return evidence;
}

function extractFindings(finalReport = {}) {
  const findings = Array.isArray(finalReport?.findings) ? finalReport.findings : [];
  return findings.map(normalizeFinding).filter((finding) => finding.title || finding.detail).slice(0, 6);
}

function formatFindings(findings = []) {
  return findings.map((finding) => {
    const tags = [finding.basis, finding.importance].filter(Boolean).join(' · ');
    const suffix = tags ? ` (${tags})` : '';
    return `- ${finding.title || 'finding'}${suffix}: ${finding.detail || 'sem detalhe adicional'}`;
  });
}

function formatFlow(flow = {}) {
  const headerBits = [
    flow.traceId ? `trace ${flow.traceId}` : 'janela inferida',
    flow.source ? `source ${flow.source}` : '',
    flow.stepCount ? `${flow.stepCount} evento(s)` : '',
    Number.isFinite(flow.totalMs) ? `${flow.totalMs} ms` : '',
  ].filter(Boolean);
  const lines = [`- ${headerBits.join(' · ')}`];
  for (const step of Array.isArray(flow.steps) ? flow.steps.slice(0, 4) : []) {
    lines.push(`  - ${step.type}${step.source ? ` · ${step.source}` : ''}`);
  }
  return lines;
}

function formatRuntime(governance = {}, heartbeatMonitor = {}, run = {}) {
  const lines = [];
  if (run?.status) lines.push(`- run: ${run.status}`);
  if (heartbeatMonitor?.status || heartbeatMonitor?.updatedAt) {
    lines.push(`- heartbeat: ${heartbeatMonitor?.status || 'unknown'}${heartbeatMonitor?.updatedAt ? ` · ${heartbeatMonitor.updatedAt}` : ''}`);
  }
  const concurrency = governance?.missionConcurrency;
  if (concurrency?.blocked) {
    lines.push(`- concorrencia: bloqueada por ${concurrency.unmatchedCount ?? 1} missao(oes) sem fechamento`);
  } else if (concurrency) {
    lines.push('- concorrencia: livre');
  }
  return lines;
}

export function buildMissionReport({
  mission = {},
  dashboard = null,
  run = {},
  finalReport = null,
  chatMessages = [],
  governance = null,
  heartbeatMonitor = null,
  flows = [],
  evidence = [],
  archivedAt = '',
  status = '',
} = {}) {
  const findings = extractFindings(finalReport || {});
  const runtimeLines = formatRuntime(governance || {}, heartbeatMonitor || {}, run || {});
  const evidenceTrail = [
    ...extractEvidenceTrail(chatMessages, 6),
    ...uniqueStrings(Array.isArray(evidence) ? evidence.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.title || item.label || item.body || JSON.stringify(item);
      return '';
    }) : [], 3).map((item) => `- arquivo: ${clip(item, 220)}`),
  ].slice(0, 8);

  const lines = [];
  const title = mission?.title || dashboard?.title || 'Relatorio operacional LUCA-AI';
  lines.push(`# ${title}`);
  if (dashboard?.subtitle) lines.push('', dashboard.subtitle);
  if (mission?.description) lines.push('', `Missao: ${mission.description}`);
  if (mission?.success) lines.push('', `Criterio de sucesso: ${mission.success}`);
  if (archivedAt) lines.push('', `Arquivado em: ${archivedAt}`);
  if (status || run?.status) lines.push('', `Status: ${status || run?.status}`);

  const summary = clip(finalReport?.summary || dashboard?.subtitle || mission?.description || '', 320);
  if (summary) lines.push('', '## Sintese executiva', summary);

  if (findings.length) {
    lines.push('', '## Findings priorizados', ...formatFindings(findings));
  }

  if (evidenceTrail.length) {
    lines.push('', '## Evidencias e premissas', ...evidenceTrail);
  }

  if (runtimeLines.length) {
    lines.push('', '## Runtime e governanca', ...runtimeLines);
  }

  const flowLines = Array.isArray(flows)
    ? flows.slice(0, 2).flatMap((flow) => formatFlow(flow))
    : [];
  if (flowLines.length) {
    lines.push('', '## Trilha operacional', ...flowLines);
  }

  return {
    title,
    summary,
    findings,
    evidenceTrail,
    runtimeLines,
    markdown: lines.join('\n'),
    source: ['tars-agent-evidence-pattern', 'tars-event-flow-pattern'],
  };
}
