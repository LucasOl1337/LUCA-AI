const technicalTerms = [
  'component',
  'heroImage',
  'publicAssets',
  'imageManifest',
  'payload',
  'schema',
  'endpoint',
  'JSON',
  'API',
];

const audienceProfiles = [
  'lideranca',
  'operacao',
  'campo',
  'corretor',
  'produto',
];

function sentence(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function buildDashboardSummary({ database, item }) {
  const firstCase = database.firstCase ?? {};
  const reports = database.reports ?? [];
  const mainReport = reports[0] ?? {};
  const metrics = firstCase.primaryMetrics ?? [];
  const metricText = metrics
    .slice(0, 3)
    .map((metric) => `${metric.value} ${metric.label}`)
    .join(', ');

  return {
    title: item.publicTitle ?? 'Painel Sompo 001 para decisao de campo',
    audience: audienceProfiles,
    plainSummary: sentence(
      item.plainSummary ??
      'Mostra o caso de soja no Rio Grande do Sul em linguagem simples, com foco em risco, evidencia faltante e proximo passo de campo.',
    ),
    whyItMatters: sentence(
      item.whyItMatters ??
      'Ajuda pessoas de areas diferentes a entenderem o que esta acontecendo, qual caso merece prioridade e qual decisao ainda depende de dados melhores.',
    ),
    clearInformation: [
      firstCase.title ? `Caso acompanhado: ${firstCase.title}.` : null,
      firstCase.region && firstCase.crop ? `Recorte: ${firstCase.crop} no ${firstCase.region}.` : null,
      metricText ? `Numeros simples do caso: ${metricText}.` : null,
      mainReport.thesis ? sentence(mainReport.thesis) : null,
    ].filter(Boolean),
    viewerQuestions: [
      'Qual area precisa de atencao primeiro?',
      'Qual informacao falta antes de decidir?',
      'Qual acao pode reduzir atraso ou retrabalho?',
    ],
    approvedLinks: [
      { label: 'Resumo do caso Sompo 001', target: 'Camada 03 - Dashboard' },
      { label: 'Cenario estruturado', target: firstCase.scenarioPath ?? 'Simulations/sompo-field-risk-001/scenario.json' },
      { label: 'Validacao do caso', target: firstCase.validationPath ?? 'Simulations/sompo-field-risk-001/validation.md' },
    ],
  };
}

export function publicFriendlyPostProcess(database) {
  const layers = database.layers ?? {};
  const dashboardLayer = layers.dashboardIntegration;
  if (!dashboardLayer) return database;

  const items = (dashboardLayer.items ?? []).map((item) => {
    const publicView = buildDashboardSummary({ database, item });
    return {
      id: item.id,
      label: publicView.title,
      type: 'public-dashboard-summary',
      importedAt: item.importedAt,
      status: 'ready',
      publicView,
      payload: publicView,
    };
  });

  return {
    ...database,
    layers: {
      ...layers,
      dashboardIntegration: {
        ...dashboardLayer,
        title: 'Camada 3 - pos-processamento amigavel',
        rule: 'Conteudo pronto para pessoas de diferentes areas: claro, amigavel, sem chaves tecnicas e sem informacao indefinida.',
        curationEngine: {
          id: 'public-friendly-post-processing',
          ownerAgent: 'database',
          script: 'server/publication-engine.js',
          hiddenTerms: technicalTerms,
        },
        items,
      },
    },
  };
}

export function assertPublicFriendlyItem(item) {
  const text = JSON.stringify(item);
  const leaked = technicalTerms.filter((term) => text.includes(term));
  return {
    ok: leaked.length === 0,
    leaked,
  };
}
