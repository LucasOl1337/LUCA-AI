function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function blockText(block = {}) {
  return normalizeText([
    block?.title,
    block?.value,
    block?.body,
    ...(Array.isArray(block?.items)
      ? block.items.map((item) => (typeof item === 'string' ? item : `${item?.label || ''} ${item?.value || ''}`))
      : []),
  ].join(' '));
}

const REQUIRED_EXECUTIVE_DASHBOARD_CONCEPTS = [
  {
    title: 'Dor e evidencias',
    matches: (block) => /\b(dor|evidencia|evidencias|risco principal|premissa|proxy|fonte|sinais)\b/.test(block.text),
  },
  {
    title: 'Ranking de risco',
    matches: (block) => /\b(ranking|prioridade|prioridades|top 5|top5|risco|apolice|apolices|carteira critica)\b/.test(block.text)
      || (block.type === 'tower' && block.itemsCount > 0),
  },
  {
    title: 'Plano preventivo',
    matches: (block) => /\b(plano preventivo|acao concreta|acoes recomendadas|proxima acao|vistoria|monitoramento|coleta|responsavel|dono)\b/.test(block.text),
  },
  {
    title: 'Valor para seguradora',
    matches: (block) => /\b(valor para seguradora|impacto|proxy|financeir|premio|valor segurado|indenizac|sinistralidade|projecao|pendente|lacuna)\b/.test(block.text),
  },
  {
    title: 'Criterio de sucesso',
    matches: (block) => /\b(criterio|criterios|sucesso|meta|metas|aprovacao|aprovado|publicar|publicado|validar|validado)\b/.test(block.text),
  },
];

export function executiveDashboardContractIssues(dashboard = {}) {
  const blocks = Array.isArray(dashboard?.blocks) ? dashboard.blocks : [];
  const normalizedBlocks = blocks.map((block) => ({
    type: normalizeText(block?.type),
    title: normalizeText(block?.title),
    text: blockText(block),
    itemsCount: Array.isArray(block?.items) ? block.items.filter(Boolean).length : 0,
  }));
  const issues = [];

  if (!Array.isArray(dashboard?.metrics) || dashboard.metrics.length < 4) {
    issues.push('faltam 4 metricas executivas');
  }
  if (blocks.length < REQUIRED_EXECUTIVE_DASHBOARD_CONCEPTS.length) {
    issues.push('faltam os 5 blocos obrigatorios do canvas');
  }

  for (const concept of REQUIRED_EXECUTIVE_DASHBOARD_CONCEPTS) {
    if (!normalizedBlocks.some((block) => concept.matches(block))) {
      issues.push(`falta bloco: ${concept.title}`);
    }
  }
  return issues;
}

export function executiveDashboardContractTitles() {
  return REQUIRED_EXECUTIVE_DASHBOARD_CONCEPTS.map((concept) => concept.title);
}
