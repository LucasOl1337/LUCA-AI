function clip(text, max = 1200) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 3).trimEnd()}...` : value;
}

function compactId(value, fallback = 'unknown') {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || fallback;
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

function textFromFinding(finding = {}) {
  const title = finding?.title || finding?.label || 'finding';
  const detail = finding?.detail || finding?.body || finding?.value || '';
  const tags = [finding?.basis, finding?.importance].filter(Boolean).join(' / ');
  return clip(`${title}: ${detail}${tags ? ` (${tags})` : ''}`, 700);
}

function memoryItem(kind, content, { contactKey = '', source = 'luca.mission.report', importance = 0.6, metadata = {} } = {}) {
  const item = {
    kind,
    content: clip(content, 900),
    source,
    importance,
    metadata,
  };
  if (kind.startsWith('individual_')) item.contact_key = contactKey;
  return item;
}

function reportSummaryLines(report = {}) {
  const lines = [];
  if (report?.summary) lines.push(`Sintese: ${report.summary}`);
  if (Array.isArray(report?.findings) && report.findings.length) {
    lines.push('Findings:');
    for (const finding of report.findings.slice(0, 4)) lines.push(`- ${textFromFinding(finding)}`);
  }
  if (Array.isArray(report?.evidenceTrail) && report.evidenceTrail.length) {
    lines.push('Evidencias:');
    for (const evidence of report.evidenceTrail.slice(0, 4)) lines.push(String(evidence));
  }
  if (Array.isArray(report?.runtimeLines) && report.runtimeLines.length) {
    lines.push('Runtime:');
    for (const runtimeLine of report.runtimeLines.slice(0, 3)) lines.push(String(runtimeLine));
  }
  return clip(lines.join('\n'), 1800);
}

export function buildYumeMemoryEvent({
  mission = {},
  report = {},
  flows = [],
  archivedAt = '',
  status = '',
  source = 'luca.mission.report',
} = {}) {
  const missionId = compactId(mission?.id || report?.missionId || report?.title || Date.now(), 'mission');
  const title = clip(mission?.title || report?.title || 'Missao LUCA-AI', 140);
  const contactKey = `luca:mission:${missionId}`;
  const occurredAt = archivedAt || mission?.completedAt || mission?.activatedAt || new Date().toISOString();
  const missionText = [
    title,
    mission?.description ? `Briefing: ${mission.description}` : '',
    mission?.success ? `Criterio de sucesso: ${mission.success}` : '',
    status ? `Status: ${status}` : '',
  ].filter(Boolean).join('\n');
  const reportText = reportSummaryLines(report) || report?.markdown || report?.summary || 'Relatorio operacional gerado sem resumo textual.';
  const flowTypes = uniqueStrings(
    (Array.isArray(flows) ? flows : [])
      .flatMap((flow) => (Array.isArray(flow?.steps) ? flow.steps : []))
      .map((step) => step?.type),
    10,
  );
  const flowSummary = flowTypes.length ? `Trilha operacional: ${flowTypes.join(' -> ')}` : '';
  const extractedMemories = [
    memoryItem('individual_long_term', `${title}. ${clip(report?.summary || mission?.description || 'Missao operacional registrada.', 420)}`, {
      contactKey,
      source,
      importance: 0.82,
      metadata: { mission_id: missionId, status: status || null, memory_role: 'mission_summary' },
    }),
    ...uniqueStrings((report?.findings || []).map(textFromFinding), 5).map((content) => memoryItem('individual_long_term', content, {
      contactKey,
      source,
      importance: 0.74,
      metadata: { mission_id: missionId, memory_role: 'finding' },
    })),
    ...uniqueStrings(report?.evidenceTrail || [], 4).map((content) => memoryItem('individual_long_term', String(content).replace(/^-+\s*/, ''), {
      contactKey,
      source,
      importance: 0.68,
      metadata: { mission_id: missionId, memory_role: 'evidence' },
    })),
  ].filter((item) => item.content);

  return {
    source,
    source_event_id: missionId,
    contact_key: contactKey,
    contact_label: title,
    conversation_id: contactKey,
    occurred_at: occurredAt,
    commit_short_term: true,
    messages: [
      {
        role: 'user',
        content: clip(missionText, 1200),
        message_id: `${missionId}:briefing`,
        created_at: mission?.activatedAt || occurredAt,
        metadata: { kind: 'mission_brief', mission_id: missionId },
      },
      {
        role: 'assistant',
        content: clip([reportText, flowSummary].filter(Boolean).join('\n\n'), 2200),
        message_id: `${missionId}:report`,
        created_at: occurredAt,
        metadata: { kind: 'mission_report', mission_id: missionId, status: status || null },
      },
    ],
    extracted_memories: extractedMemories,
    metadata: {
      source_project: 'LUCA-AI',
      source_pattern: 'yume-hybrid-memory-contract',
      mission_id: missionId,
      report_title: report?.title || title,
      flow_count: Array.isArray(flows) ? flows.length : 0,
    },
  };
}
