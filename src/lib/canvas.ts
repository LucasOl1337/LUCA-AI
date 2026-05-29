import type { TemporaryDashboard, DashboardBlockData } from './types';

// Detecta canvas "operacional" (logs do sistema, fila, erros) que NÃO deve ser
// exibido como resultado bonito ao usuário — porta de main.jsx:727.
export function isOperationalCanvas(dashboard: TemporaryDashboard | null): boolean {
  if (!dashboard) return false;
  const { sourceAgentId, updatedAt, ...publicDashboard } = dashboard;
  void sourceAgentId;
  void updatedAt;
  const text = JSON.stringify(publicDashboard).toLowerCase();
  return (
    Boolean(dashboard.fallback) ||
    /\b(run|agentes?|supervisor|planejador|pesquisador|designer|fila|erro|fetch failed|dashboard temporario|canvas gerado localmente|9router|heartbeat|tarefas? conclu[ií]das?)\b/.test(text)
  );
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
  if (Array.isArray(dashboard.blocks)) return dashboard.blocks.slice(0, 6);
  return [
    ...metrics.map((m) => ({ type: 'metric', title: m.label, value: m.value })),
    ...panels.map((p) => ({ type: 'note', title: p.title, body: p.body })),
  ];
}
