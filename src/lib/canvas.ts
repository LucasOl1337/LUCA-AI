import type {
  TemporaryDashboard,
  DashboardBlockData,
  Mission,
  ChatMessage,
  MissionFinalReport,
  GovernanceSummary,
  HeartbeatMonitor,
} from './types';

// Detecta canvas "operacional" (logs do sistema, fila, erros) que NÃO deve ser
// exibido como resultado bonito ao usuário — porta de main.jsx:727.
export function isOperationalCanvas(dashboard: TemporaryDashboard | null): boolean {
  if (!dashboard) return false;
  const normalize = (value: unknown) => String(value ?? '').toLowerCase();
  const headerText = normalize([dashboard.title, dashboard.subtitle, dashboard.layout].filter(Boolean).join(' '));
  const publicText = normalize(JSON.stringify(
    Object.fromEntries(Object.entries(dashboard).filter(([key]) => !['sourceAgentId', 'updatedAt'].includes(key))),
  ));

  const hasRuntimeMarker =
    /\b(fetch failed|9router|heartbeat|dashboard temporario|canvas gerado localmente)\b/.test(publicText) ||
    /\b(run|erro|falha)\b/.test(headerText);
  if (hasRuntimeMarker) return true;

  if (/\b(status|progresso|logs?)\s+(dos?\s+)?agentes?\b/.test(headerText)) return true;

  const blocks = resolveBlocks(dashboard);
  const hasAgentStatusBlock = blocks.some((block) => {
    const type = normalize(block.type);
    const title = normalize(block.title);
    const body = normalize(block.body);
    const value = normalize(block.value);
    const itemText = normalize(Array.isArray(block.items) ? JSON.stringify(block.items) : '');
    const labelText = [type, title].filter(Boolean).join(' ');
    const contentText = [body, value, itemText].filter(Boolean).join(' ');
    const isProcessBlock = /\b(status|progresso|logs?|tarefa|tarefas|heartbeat)\b/.test(labelText);
    const namesAgent = /\b(agentes?|supervisor|planejador|pesquisador|designer)\b/.test(labelText);
    const hasProcessState = /\b(ready|done|executando|conclu[ií]do|falha|erro|tarefas? conclu[ií]das?)\b/.test(contentText);

    return isProcessBlock && (namesAgent || hasProcessState);
  });

  return hasAgentStatusBlock;
}

export interface ChartItem {
  label: string;
  value: number;
}

export function normalizeChartItems(items: unknown[]): ChartItem[] {
  return items
    .map((item, index) => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        return {
          label: String(obj.label ?? obj.name ?? obj.title ?? `item ${index + 1}`),
          value: Number(obj.value ?? obj.count ?? 1) || 1,
        };
      }
      const text = String(item ?? '');
      const match = text.match(/^(.+?)[\s:=|-]+(\d+(?:\.\d+)?)$/);
      return {
        label: match ? match[1].trim() : text,
        value: match ? Number(match[2]) : 1,
      };
    })
    .filter((item) => item.label)
    .slice(0, 5);
}

const PIE_PALETTE = ['#C9A227', '#7FB3D5', '#1E4E8C', '#43d18a', '#b58cff'];

export function pieGradient(items: ChartItem[]): string {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  return items
    .map((item, index) => {
      const start = cursor;
      cursor += (item.value / total) * 100;
      return `${PIE_PALETTE[index % PIE_PALETTE.length]} ${start}% ${cursor}%`;
    })
    .join(', ');
}

export function formatTopicLabel(item: unknown): string {
  if (item && typeof item === 'object') {
    const obj = item as Record<string, string>;
    return String(obj.label ?? obj.title ?? obj.name ?? 'tópico');
  }
  return String(item);
}

// Resolve a lista de blocos a renderizar (metrics/panels → blocks) — porta de main.jsx:746.
export function resolveBlocks(dashboard: TemporaryDashboard): DashboardBlockData[] {
  const metrics = Array.isArray(dashboard.metrics) ? dashboard.metrics.slice(0, 4) : [];
  const panels = Array.isArray(dashboard.panels) ? dashboard.panels.slice(0, 4) : [];
  if (Array.isArray(dashboard.blocks)) return dashboard.blocks.slice(0, 12);
  return [
    ...metrics.map((m) => ({ type: 'metric', title: m.label, value: m.value })),
    ...panels.map((p) => ({ type: 'note', title: p.title, body: p.body })),
  ];
}

export function buildCanvasMarkdown(dashboard: TemporaryDashboard, mission?: Mission | null): string {
  const lines: string[] = [];
  lines.push(`# ${dashboard.title || 'Canvas executivo'}`);
  if (dashboard.subtitle) lines.push('', dashboard.subtitle);
  if (mission?.title) lines.push('', `Missao: ${mission.title}`);

  const metrics = Array.isArray(dashboard.metrics) ? dashboard.metrics : [];
  if (metrics.length) {
    lines.push('', '## Indicadores');
    metrics.forEach((metric) => lines.push(`- ${metric.label}: ${metric.value}`));
  }

  const blocks = resolveBlocks(dashboard);
  blocks.forEach((block) => {
    lines.push('', `## ${block.title || block.type || 'Bloco'}`);
    if (block.value !== undefined) lines.push(String(block.value));
    if (block.body) lines.push(block.body);
    const items = Array.isArray(block.items) ? block.items : [];
    items.forEach((item) => lines.push(`- ${formatTopicLabel(item)}`));
  });

  return lines.join('\n');
}

const REPORT_FILENAME_FALLBACK = 'relatorio-luca-ai';
const REPORT_FILENAME_MAX_LENGTH = 72;

export function normalizeReportSlug(input: unknown, fallback = REPORT_FILENAME_FALLBACK): string {
  const normalized = String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, REPORT_FILENAME_MAX_LENGTH);

  return normalized || fallback;
}

export function buildReportFilename(dashboard: TemporaryDashboard, mission?: Mission | null): string {
  return `${normalizeReportSlug(mission?.title || dashboard.title || dashboard.subtitle, REPORT_FILENAME_FALLBACK)}.md`;
}

export interface ReportContext {
  finalReport?: MissionFinalReport | null;
  chatMessages?: ChatMessage[];
  runStatus?: string | null;
  governance?: GovernanceSummary | null;
  heartbeatMonitor?: HeartbeatMonitor | null;
  archivedAt?: string | null;
  statusReason?: string | null;
}

function uniqueLines(values: string[], max = 8): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(normalized);
    if (items.length >= max) break;
  }
  return items;
}

function reportEvidenceLines(chatMessages: ChatMessage[] = []): string[] {
  return uniqueLines(
    chatMessages.flatMap((message) =>
      String(message.content ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /\b(evidencia|premissa|proxy|risco|lacuna|ponto forte|ponto fraco)\b/i.test(line))
        .map((line) => `- ${message.agentName}: ${line}`),
    ),
    6,
  );
}

export function buildReportText(dashboard: TemporaryDashboard, mission?: Mission | null, context: ReportContext = {}): string {
  const lines: string[] = [];
  lines.push(`# ${dashboard.title || 'Canvas executivo'}`);
  if (dashboard.subtitle) lines.push('', dashboard.subtitle);
  if (mission?.title) lines.push('', `Missao: ${mission.title}`);
  if (mission?.description) lines.push('', `Descricao: ${mission.description}`);
  if (mission?.success) lines.push('', `Criterio de sucesso: ${mission.success}`);
  if (context.archivedAt) lines.push('', `Arquivado em: ${context.archivedAt}`);
  if (context.runStatus || context.statusReason) lines.push('', `Status: ${context.runStatus || context.statusReason}`);

  if (context.finalReport?.summary) {
    lines.push('', '## Sintese executiva', context.finalReport.summary);
  }

  const findings = Array.isArray(context.finalReport?.findings) ? context.finalReport.findings.slice(0, 6) : [];
  if (findings.length) {
    lines.push('', '## Findings priorizados');
    findings.forEach((finding) => {
      const tags = [finding.basis, finding.importance].filter(Boolean).join(' · ');
      lines.push(`- ${finding.title || 'finding'}${tags ? ` (${tags})` : ''}: ${finding.detail || 'sem detalhe adicional'}`);
    });
  }

  const metrics = Array.isArray(dashboard.metrics) ? dashboard.metrics : [];
  if (metrics.length) {
    lines.push('', '## Indicadores');
    metrics.forEach((metric) => lines.push(`- ${metric.label}: ${metric.value}`));
  }

  const blocks = resolveBlocks(dashboard);
  blocks.forEach((block) => {
    lines.push('', `## ${block.title || block.type || 'Bloco'}`);
    if (block.value !== undefined) lines.push(String(block.value));
    if (block.body) lines.push(block.body);
    const items = Array.isArray(block.items) ? block.items : [];
    items.forEach((item) => lines.push(`- ${formatTopicLabel(item)}`));
  });

  const evidenceLines = reportEvidenceLines(context.chatMessages ?? []);
  if (evidenceLines.length) {
    lines.push('', '## Evidencias e premissas', ...evidenceLines);
  }

  const runtimeLines = [
    context.heartbeatMonitor?.status ? `- heartbeat: ${context.heartbeatMonitor.status}` : '',
    context.governance?.missionConcurrency?.blocked
      ? `- concorrencia: bloqueada por ${context.governance.missionConcurrency.unmatchedCount ?? 1} missao(oes) sem fechamento`
      : context.governance?.missionConcurrency ? '- concorrencia: livre' : '',
  ].filter(Boolean);
  if (runtimeLines.length) {
    lines.push('', '## Runtime e governanca', ...runtimeLines);
  }

  return lines.join('\n');
}

export function downloadTextReport(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
