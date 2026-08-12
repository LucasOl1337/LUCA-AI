export const MISSION_DOMAINS = Object.freeze(['general', 'insurance', 'code', 'sports']);

export const MISSION_DOMAIN_LABELS = Object.freeze({
  general: 'Geral',
  insurance: 'Seguro',
  code: 'Codigo',
  sports: 'Esporte',
});

const DOMAIN_SIGNALS = Object.freeze({
  insurance: [
    'sompo', 'sinistro', 'apolice', 'apólice', 'underwriting', 'franquia', 'indeniza',
    'zarc', 'granizo', 'geada', 'seguro', 'seguradora', 'penhor', 'lavoura', 'talhao',
    'talhão', 'produtor rural', 'premio da apolice', 'prêmio', 'cosseguro', 'resseguro',
    'vistoria', 'laudo agr', 'custeio agricola', 'custeio agrícola',
  ],
  code: [
    'typescript', 'javascript', 'python', 'refactor', 'refator', 'pull request', 'endpoint',
    'compile', 'typecheck', 'stack trace', 'repositorio', 'repositório', 'github',
    'bug no', 'corrigir o bug', 'teste unitario', 'teste unitário', 'api rest',
    'worktree', 'commit', 'deploy', 'wrangler', 'express',
  ],
  sports: [
    'placar', 'campeonato', 'jogador', 'escalacao', 'escalação', 'odds', 'aposta esportiva',
    'futebol', 'brasileirao', 'brasileirão', 'nba', 'ufc', 'ranking de clubes',
    'gol contra', 'cartao vermelho', 'cartão vermelho', 'classificacao do campeonato',
  ],
});

export function normalizeMissionDomain(value) {
  const domain = String(value || '').trim().toLowerCase();
  return MISSION_DOMAINS.includes(domain) ? domain : '';
}

export function classifyMissionDomain(missionText) {
  const text = String(missionText || '').toLowerCase();
  if (!text.trim()) return 'general';
  let best = 'general';
  let bestHits = 0;
  for (const domain of ['insurance', 'code', 'sports']) {
    let hits = 0;
    for (const signal of DOMAIN_SIGNALS[domain]) {
      if (text.includes(signal)) hits += 1;
    }
    if (hits > bestHits) {
      best = domain;
      bestHits = hits;
    }
  }
  return bestHits > 0 ? best : 'general';
}

export function resolveMissionDomain(missionText, options = {}) {
  const override = normalizeMissionDomain(options.domain);
  if (options.domainOverride && override) {
    return { domain: override, domainSource: 'override' };
  }
  return { domain: classifyMissionDomain(missionText), domainSource: 'auto' };
}

export function formatDomainBriefing(domain, domainSource = 'auto') {
  const id = normalizeMissionDomain(domain) || 'general';
  const source = domainSource === 'override' ? 'override manual' : 'triagem automatica';
  const label = MISSION_DOMAIN_LABELS[id] || MISSION_DOMAIN_LABELS.general;
  const playbook = {
    general: [
      'Trate o pedido pelo merito. Nao force jargao de outro dominio.',
      'Separe evidencia, premissa e o que ainda falta.',
    ],
    insurance: [
      'Nao invente valores financeiros; marque pendente quando faltar dado.',
      'Separe evidencia, premissa, lacuna e proxima acao operacional (triagem, vistoria, underwriting, sinistro).',
      'Nao use linguagem de material ficticio.',
    ],
    code: [
      'Fale de arquivos, contratos e risco de regressao. Nao invente diffs que nao foram dados.',
      'Prefira a correcao mais segura e o criterio de verificacao (teste, typecheck, smoke).',
    ],
    sports: [
      'Nao invente placar, estatistica ou lesao. Se o fato nao veio na missao ou na busca, declare a lacuna.',
      'Separe fato observado, inferencia e palpite.',
    ],
  }[id];
  return `Formato desta missao (triagem LUCA, ${source}): ${label}.
- ${playbook.join('\n- ')}`;
}
