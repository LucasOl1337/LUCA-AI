export function primaryMissionText(mission = {}) {
  return String(mission?.description || mission?.title || '').trim();
}

export function missionFullText(mission = {}) {
  return `${primaryMissionText(mission)}\n${String(mission?.success || '')}`.trim();
}

function normalizeMissionText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function missionRequestsAllAgents(mission = {}) {
  const text = missionFullText(mission).toLowerCase();
  return /\b(todos os agentes|todos agentes|todas? os agentes|cada agente|agentes devem|agentes precisam)\b/i.test(text);
}

export function missionNeedsSupervisorJudgment(mission = {}) {
  const text = missionFullText(mission).toLowerCase();
  return /\b(escolh(er|a|am|em)|avali(ar|e|em)|julgar|decid(ir|e|a)|melhor|vencedor|vencedora|nota)\b/i.test(text);
}

const STOPWORDS = new Set([
  'para', 'com', 'sem', 'uma', 'umas', 'uns', 'esse', 'essa', 'essas', 'esses',
  'como', 'sobre', 'entre', 'pelos', 'pelas', 'porque', 'quando', 'onde', 'qual',
  'quais', 'deve', 'devem', 'precisa', 'precisam', 'missao', 'missão', 'titulo',
  'critico', 'critica', 'criterio', 'sucesso', 'executivo', 'executiva', 'gerar',
  'analise', 'análise', 'caso', 'real', 'dados', 'dado', 'briefing', 'usuario',
  'apresentacao', 'apresentação', 'sompo', 'seguradora', 'risco', 'riscos',
]);

function normalizeEvidenceText(value = '') {
  return normalizeMissionText(value).replace(/\s+/g, ' ').trim();
}

export function extractMissionEvidenceTokens(mission = {}, limit = 12) {
  const raw = normalizeMissionText(missionFullText(mission));
  const seen = new Set();
  const tokens = [];
  for (const token of raw.match(/[a-z0-9-]{4,}/g) || []) {
    if (STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= limit) break;
  }
  return tokens;
}

export function textMentionsMissionEvidence(text = '', mission = {}) {
  const normalized = normalizeMissionText(text);
  return extractMissionEvidenceTokens(mission).some((token) => normalized.includes(token));
}

export function extractMissionQuantitativeAnchors(mission = {}, limit = 8) {
  const raw = normalizeEvidenceText(missionFullText(mission));
  if (!raw) return [];

  const patterns = [
    /\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|km|ha|kg|t|ton|tons|%|h|hs|horas?|dias?)\b/g,
    /\b\d+(?:[.,]\d+)?\s*(?:eventos?|sinistros?|falhas?|pragas?|talhoes?|talhao|sensores?)\b/g,
    /\btop\s*5\b/g,
  ];

  const anchors = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern)) {
      const anchor = String(match[0] || '').trim();
      if (!anchor || seen.has(anchor)) continue;
      seen.add(anchor);
      anchors.push(anchor);
      if (anchors.length >= limit) return anchors;
    }
  }
  return anchors;
}

export function textMentionsMissionQuantitativeEvidence(text = '', mission = {}) {
  const normalized = normalizeEvidenceText(text);
  const anchors = extractMissionQuantitativeAnchors(mission);
  return anchors.some((anchor) => normalized.includes(anchor));
}

function clipEvidence(value = '', max = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const candidate = text.slice(0, max).trimEnd();
  const sentenceCut = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('; '), candidate.lastIndexOf(': '));
  if (sentenceCut > Math.floor(max * 0.55)) return candidate.slice(0, sentenceCut + 1).trim();
  const wordCut = candidate.lastIndexOf(' ');
  return (wordCut > Math.floor(max * 0.55) ? candidate.slice(0, wordCut) : candidate).trim();
}

function firstRawMatch(rawText = '', patterns = []) {
  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match?.[0]) return clipEvidence(match[0]);
  }
  return '';
}

export function extractAgroClimateEvidence(mission = {}, { max = 8 } = {}) {
  const rawText = missionFullText(mission).replace(/\r/g, '\n');
  const normalized = normalizeMissionText(rawText);
  if (!rawText.trim()) return [];

  const evidence = [];
  const seen = new Set();
  const append = (id, label, value) => {
    const clean = clipEvidence(value || label);
    const key = `${id}:${normalizeEvidenceText(clean)}`;
    if (!clean || seen.has(key)) return;
    seen.add(key);
    evidence.push({ id, label, value: clean, basis: 'evidencia' });
  };

  const inmet = firstRawMatch(rawText, [/\bINMET\b[^\n.]{0,180}(?:\.)?/i]);
  if (inmet) append('inmet', 'INMET', inmet);

  const conab = firstRawMatch(rawText, [/\bCONAB\b[^\n.]{0,140}(?:\.)?/i]);
  if (conab) append('conab', 'CONAB', conab);

  const zarcRule = firstRawMatch(rawText, [
    /Portaria\s+SPA\/MAPA[^\n.;]{0,140}/iu,
    /\bZARC\b[^\n.;]{0,140}/i,
  ]);
  if (zarcRule) append('zarc-rule', 'ZARC', zarcRule);

  const window = firstRawMatch(rawText, [
    /\b(?:pr[oó]ximas?\s+)?4\s*a\s*8\s+semanas\b/iu,
    /\b(?:pr[oó]ximas?\s+)?4-8\s+semanas\b/iu,
  ]);
  if (window) append('monitoring-window', 'janela de monitoramento', window);

  const hydric = firstRawMatch(rawText, [
    /d[eé]ficit\s+h[ií]drico[^\n.;]{0,140}/iu,
    /estiagem[^\n.;]{0,140}/iu,
    /seca[^\n.;]{0,120}/iu,
  ]);
  if (hydric) append('water-deficit', 'deficit hidrico', hydric);

  const rainfall = firstRawMatch(rawText, [
    /chuvas?\s+\d+(?:[,.]\d+)?\s*a\s*\d+(?:[,.]\d+)?\s*mm\s+abaixo[^\n.;]{0,120}/iu,
    /\d+(?:[,.]\d+)?\s*a\s*\d+(?:[,.]\d+)?\s*mm\s+abaixo[^\n.;]{0,120}/iu,
  ]);
  if (rainfall) append('rainfall-deficit', 'chuva abaixo da media', rainfall);

  const productivity = firstRawMatch(rawText, [
    /queda\s+de\s+produtividade\s+de\s+at[eé]\s+\d+(?:[,.]\d+)?%[^\n.;]{0,120}/iu,
    /queda\s+de\s+\d+(?:[,.]\d+)?%\s+na\s+produtividade[^\n.;]{0,120}/iu,
    /produtividade[^\n.;]{0,80}\d+(?:[,.]\d+)?%[^\n.;]{0,80}/iu,
  ]);
  if (productivity) append('productivity-loss', 'queda de produtividade', productivity);

  const locationRules = [
    ['francisco-beltrao', 'Francisco Beltrao', /Francisco\s+Beltr[aã]o/iu],
    ['oeste-pr', 'Oeste PR', /\bOeste\b[^\n.;]{0,35}(?:Paran[aá]|PR)?/iu],
    ['sudoeste-pr', 'Sudoeste PR', /\bSudoeste\b[^\n.;]{0,35}(?:Paran[aá]|PR)?/iu],
    ['centro-sul-pr', 'Centro-Sul PR', /\bCentro[-\s]Sul\b[^\n.;]{0,35}(?:Paran[aá]|PR)?/iu],
    ['sul-ms', 'Sul MS', /\bsul\s+do\s+Mato\s+Grosso\s+do\s+Sul\b|\bSul\s+MS\b/iu],
  ];
  for (const [id, label, pattern] of locationRules) {
    if (pattern.test(rawText)) append(id, label, label);
  }

  if (!evidence.length && /\b(clima|climatic|safra|milho|agro|zarc|inmet|conab)\b/.test(normalized)) {
    const anchors = extractMissionQuantitativeAnchors(mission, 3);
    for (const anchor of anchors) append(`quant-${anchor}`, 'sinal quantitativo', anchor);
  }

  return evidence.slice(0, max);
}

const INSURANCE_EVIDENCE_CATEGORIES = [
  {
    id: 'telemetry',
    label: 'telemetria',
    missionPattern: /\b(telemetria|sensor|umidade|chuva|clima|vazao|irrigacao|irrigac|temperatura)\b/,
    textPattern: /\b(telemetria|sensor|umidade|chuva|vazao|irrigacao|temperatura|anomalia)\b/,
  },
  {
    id: 'claims_csv',
    label: 'csv/sinistros',
    missionPattern: /\b(csv|sinistros|eventos|ocorrencias|talhao|talhoes|recorrencia|frequencia)\b/,
    textPattern: /\b(csv|sinistro|sinistros|evento|eventos|ocorrencia|ocorrencias|talhao|talhoes|frequencia)\b/,
  },
  {
    id: 'rural_asset',
    label: 'ativo rural',
    missionPattern: /\b(fazenda|rural|safra|lavoura|propriedade|plantio)\b/,
    textPattern: /\b(fazenda|rural|safra|lavoura|propriedade|talhao|operacao)\b/,
  },
  {
    id: 'financial_gap',
    label: 'lacuna financeira',
    missionPattern: /\b(financeir[a-z]*|finance[a-z]*|premio|premios|custo|custos|margem|receita|perda|perdas|economia|roi|retorno|valor|valores)\b/,
    textPattern: /\b(financeir[a-z]*|premio|premios|custo|custos|margem|receita|perda|perdas|economia|roi|retorno|valor|valores|sem dado financeiro|dado financeiro pendente)\b/,
  },
];

export function evaluateInsuranceEvidenceCoverage(text = '', mission = {}) {
  const missionText = normalizeMissionText(missionFullText(mission));
  const evidenceText = normalizeMissionText(text);
  const quantitativeAnchors = extractMissionQuantitativeAnchors(mission);
  const normalizedEvidenceText = normalizeEvidenceText(text);
  const required = INSURANCE_EVIDENCE_CATEGORIES.filter((category) => category.missionPattern.test(missionText));
  const matched = required.filter((category) => category.textPattern.test(evidenceText));
  const missing = required.filter((category) => !category.textPattern.test(evidenceText));
  const mentionsGap = /\b(lacuna|premissa|pendente|pendentes|necessita|falt(a|am)|sem dado|sem base|incerteza)\b/.test(evidenceText);
  const matchedQuantitativeAnchors = quantitativeAnchors.filter((anchor) => normalizedEvidenceText.includes(anchor));
  return {
    required: required.map((category) => category.label),
    matched: matched.map((category) => category.label),
    missing: missing.map((category) => category.label),
    matchedCount: matched.length,
    requiredCount: required.length,
    requiresFinancialGap: required.some((category) => category.id === 'financial_gap'),
    mentionsGap,
    quantitativeAnchors,
    matchedQuantitativeAnchors,
    requiresQuantitativeEvidence: quantitativeAnchors.length > 0,
  };
}
