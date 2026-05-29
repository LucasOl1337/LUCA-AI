import type { DatabaseState, DatabaseItem } from './types';

export interface DatabaseLayer {
  id: 'rawResearch' | 'processing' | 'dashboardIntegration';
  index: string;
  title: string;
  status: string;
  visibility: string;
  rule: string;
  items: DatabaseItem[];
}

export function getRawResearch(database: DatabaseState): Record<string, unknown> | null {
  return (database?.layers?.rawResearch?.items?.[0]?.payload as Record<string, unknown>) ?? null;
}

export function getDatabaseLayers(database: DatabaseState): DatabaseLayer[] {
  const layers = database?.layers ?? {};
  return [
    {
      id: 'rawResearch',
      index: '01',
      title: 'pesquisa bruta',
      status: layers.rawResearch?.status ?? 'empty',
      visibility: layers.rawResearch?.dashboardVisibility ?? 'blocked',
      rule: layers.rawResearch?.rule ?? 'Base bruta interna. Não exibir no canvas.',
      items: layers.rawResearch?.items ?? [],
    },
    {
      id: 'processing',
      index: '02',
      title: 'processamento',
      status: layers.processing?.status ?? 'empty',
      visibility: layers.processing?.dashboardVisibility ?? 'blocked-until-filtered',
      rule: layers.processing?.rule ?? 'Informação curada e filtrada para agentes.',
      items: layers.processing?.items ?? [],
    },
    {
      id: 'dashboardIntegration',
      index: '03',
      title:
        layers.dashboardIntegration?.title
          ?.replace('Camada 3 - ', '')
          .replace(' e integracao no dashboard', '')
          .replace(' e integracao no canvas', '')
          .replace('Dashboard', 'Canvas') ?? 'pós-processamento',
      status: layers.dashboardIntegration?.status ?? 'empty',
      visibility:
        layers.dashboardIntegration?.dashboardVisibility === 'allowed-after-approval'
          ? 'visível após curadoria'
          : (layers.dashboardIntegration?.dashboardVisibility ?? 'visível após curadoria'),
      rule: layers.dashboardIntegration?.rule ?? 'Conteúdo claro e aprovado para pessoas de diferentes áreas.',
      items: layers.dashboardIntegration?.items ?? [],
    },
  ];
}

export function countDatabaseItems(database: DatabaseState): number {
  return getDatabaseLayers(database).reduce((total, layer) => total + layer.items.length, 0);
}

export interface ItemSummary {
  id: string;
  label: string;
  type: string;
  detail: string;
}

export function summarizeDatabaseItem(item: DatabaseItem): ItemSummary {
  const typeLabels: Record<string, string> = {
    'public-dashboard-summary': 'resumo amigável',
    'dashboard-panel': 'painel aprovado',
    'mission-archive': 'missão passada',
    'simulation-extension': 'simulação',
    'simulation-contract': 'contrato de simulação',
    'legacy-research-snapshot': 'pesquisa bruta',
  };
  return {
    id: item.id ?? item.label ?? 'item',
    label: item.label ?? item.title ?? item.id ?? 'item sem nome',
    type: typeLabels[item.type ?? ''] ?? item.type ?? 'registro',
    detail:
      item.publicView?.plainSummary ??
      (item.importedAt ? `importado em ${item.importedAt}` : (item.status ?? 'aguardando detalhe')),
  };
}

export interface LayerLink {
  label: string;
  url?: string;
  detail?: string;
}

export function getLayerLinks(database: DatabaseState, layer: DatabaseLayer): LayerLink[] {
  const raw = getRawResearch(database) as { reliableSources?: { label: string; url: string; use?: string }[] } | null;
  if (layer.id === 'rawResearch') {
    return [
      ...(raw?.reliableSources ?? []).map((s) => ({ label: s.label, url: s.url, detail: s.use })),
      ...(database?.reliableSources ?? []).map((s) => ({ label: s.label, url: s.url, detail: s.use })),
    ];
  }
  if (layer.id === 'processing') {
    return [
      ...(database?.simulations ?? []).map((i) => ({ label: i.title, url: i.path, detail: i.scenario ?? i.thesis })),
      ...(database?.methods ?? []).map((i) => ({ label: i.title, url: i.id, detail: i.objective })),
      ...(database?.procedures ?? []).map((i) => ({ label: i.title, url: i.id, detail: i.trigger })),
    ];
  }
  return [
    ...layer.items.flatMap((item) =>
      (item.publicView?.approvedLinks ?? []).map((link) => ({ label: link.label, url: link.target, detail: 'link aprovado para consulta' })),
    ),
    ...(database?.reports ?? []).map((i) => ({ label: i.title, url: i.path, detail: i.thesis })),
  ];
}

export interface PublicSection {
  key: string;
  label: string;
  value: string | string[];
}

export function getPublicRecordSections(item: DatabaseItem | null): PublicSection[] {
  const view = item?.publicView ?? (item?.payload as DatabaseItem['publicView']) ?? {};
  return [
    { key: 'plainSummary', label: 'resumo claro', value: view.plainSummary as string },
    { key: 'whyItMatters', label: 'por que importa', value: view.whyItMatters as string },
    { key: 'clearInformation', label: 'informações claras', value: view.clearInformation as string | string[] },
    { key: 'viewerQuestions', label: 'perguntas que ajuda a responder', value: view.viewerQuestions as string | string[] },
  ].filter((s) => s.value) as PublicSection[];
}

export function renderPayloadValue(value: unknown): string {
  if (value === null || value === undefined) return 'n/a';
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'object' && item
          ? ((item as Record<string, string>).label ?? (item as Record<string, string>).title ?? (item as Record<string, string>).target ?? 'item')
          : String(item),
      )
      .join(', ');
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .filter((item) => typeof item === 'string')
      .join(' ');
  }
  return String(value);
}

// ─── Obsidian deep-links (vault LUCA-AI) ───
export const databaseObsidianPages: Record<string, string> = {
  index: 'Index',
  rawResearch: 'Camada 01 - Pesquisa Bruta',
  processing: 'Camada 02 - Processamento',
  dashboardIntegration: 'Camada 03 - Canvas',
};

export function obsidianUrl(page: string): string {
  const params = new URLSearchParams({ vault: 'LUCA-AI', file: page });
  return `obsidian://open?${params.toString()}`;
}

export function getLayerObsidianPage(layerId: string): string {
  return databaseObsidianPages[layerId] ?? databaseObsidianPages.index;
}
