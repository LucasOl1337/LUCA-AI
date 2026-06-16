import {
  missionLooksInsuranceLike,
} from './agent-playbooks.js';
import {
  evaluateInsuranceEvidenceCoverage,
  extractAgroClimateEvidence,
  missionFullText,
} from './mission-intent.js';

const DEFAULT_MUST_SHOW = ['dor central', 'prioridades', 'acoes recomendadas', 'criterios de sucesso'];
const DEFAULT_BLOCKS = ['metric', 'tower', 'topics', 'note'];
const DEFAULT_AVOID = ['detalhes operacionais', 'logs', 'agentes', 'modelo', 'erros tecnicos', 'chat'];
const IMPORTANCE_VALUES = new Set(['alta', 'media', 'baixa']);
const BASIS_VALUES = new Set(['evidencia', 'premissa', 'proxy']);
const MISSION_DELIVERABLE_RULES = [
  {
    id: 'microrregioes-prioritarias',
    pattern: /\b(microrregi[aã]o|microrregioes|microrregiões|oeste|sudoeste|centro-sul|centro sul|regi[aã]o|regioes)\b/,
    mustShow: 'microrregioes prioritarias',
    finding: {
      title: 'Microrregioes priorizadas',
      detail: 'O canvas deve explicitar quais microrregioes ou regioes ficaram no topo do risco para orientar underwriting, corretor e vistoria.',
      importance: 'alta',
      basis: 'premissa',
    },
    chartHint: 'Mostre mapa de risco ou ranking regional com microrregioes priorizadas.',
  },
  {
    id: 'mapa-de-risco',
    pattern: /\b(mapa de risco|mapa|heatmap|geograf)\b/,
    mustShow: 'mapa de risco',
    finding: {
      title: 'Mapa de risco obrigatorio',
      detail: 'Quando o briefing pedir leitura territorial, o canvas precisa traduzir o risco em mapa, faixa regional ou agrupamento geografico defensavel.',
      importance: 'media',
      basis: 'premissa',
    },
    chartHint: 'Prefira mapa de risco, heatmap regional ou quadro geografico sintetico.',
  },
  {
    id: 'validacao-zarc',
    pattern: /\b(zarc|portaria|janela de plantio|fora da janela)\b/,
    mustShow: 'validacao zarc',
    finding: {
      title: 'Validacao ZARC',
      detail: 'O relatorio final deve indicar a verificacao da janela ZARC, o risco de negativa de cobertura e a pendencia de apolices fora da regra.',
      importance: 'alta',
      basis: 'premissa',
    },
    chartHint: 'Inclua bloco de conformidade ZARC com status, pendencia ou lista priorizada.',
  },
  {
    id: 'ranking-apolices',
    pattern: /\b(apolice|apolices|apólice|apólices|valor segurado)\b/,
    mustShow: 'ranking de apolices',
    finding: {
      title: 'Ranking de apolices',
      detail: 'A decisao executiva precisa ordenar as apolices mais criticas por exposicao, frequencia ou valor segurado quando o briefing trouxer esse pedido.',
      importance: 'alta',
      basis: 'premissa',
    },
    chartHint: 'Monte ranking de apolices ou carteira critica com valor segurado, risco e status.',
  },
  {
    id: 'sinistralidade-indenizacao',
    pattern: /\b(sinistralidade|indeniza[cç][aã]o|indenizacoes|indenizações|projec[aã]o de indeniza[cç][aã]o|projecao de indenizacao)\b/,
    mustShow: 'projecao de indenizacoes',
    finding: {
      title: 'Projecao de indenizacoes',
      detail: 'Se a missao pedir sinistralidade ou indenizacao, o canvas deve mostrar a melhor estimativa defensavel, faixa de cenario ou lacuna explicitada.',
      importance: 'alta',
      basis: 'proxy',
    },
    chartHint: 'Mostre faixa de sinistralidade ou projecao de indenizacoes, rotulando proxy quando faltar base completa.',
  },
  {
    id: 'sinistralidade-esperada',
    pattern: /\b(sinistralidade|sinistro esperado|sinistros esperados|acionamento de sinistro|risco de acionamento)\b/,
    mustShow: 'sinistralidade esperada',
    finding: {
      title: 'Sinistralidade esperada',
      detail: 'A leitura executiva deve explicitar a melhor faixa defensavel de sinistralidade ou de acionamento esperado, mesmo quando ainda depender de proxy ou consolidacao complementar.',
      importance: 'alta',
      basis: 'proxy',
    },
    chartHint: 'Mostre faixa de sinistralidade esperada, probabilidade de acionamento ou cenario de perda com rotulo de proxy quando faltar base integral.',
  },
  {
    id: 'cronograma-monitoramento',
    pattern: /\b(cronograma|monitoramento|4 a 8 semanas|4-8 semanas|4 semanas|8 semanas)\b/,
    mustShow: 'cronograma de monitoramento',
    finding: {
      title: 'Cronograma de monitoramento',
      detail: 'A leitura executiva deve fechar com janela de acompanhamento, cadencia de revisao e proxima rodada operacional.',
      importance: 'media',
      basis: 'premissa',
    },
    chartHint: 'Inclua cronograma de monitoramento com janela, dono e proximo checkpoint.',
  },
  {
    id: 'alertas-operacionais',
    pattern: /\b(alerta|alertas|corretor|corretores|comunicado|comunicados|aviso de sinistro|forca de venda)\b/,
    mustShow: 'alertas operacionais',
    finding: {
      title: 'Alertas operacionais',
      detail: 'A entrega executiva deve orientar quais alertas preventivos, comunicados ou acionamentos precisam seguir para corretores, campo ou sinistros.',
      importance: 'media',
      basis: 'premissa',
    },
    chartHint: 'Inclua alertas operacionais com publico, gatilho e acao esperada para corretores, underwriting ou sinistros.',
  },
  {
    id: 'pacote-evidencias',
    pattern: /\b(evidenc|foto|fotos|document|documento|documentos|anexo|anexos|laudo|laudos|prova|provas|vistoria fotografica)\b/,
    mustShow: 'pacote de evidencias',
    finding: {
      title: 'Pacote de evidencias',
      detail: 'Quando a missao pedir evidencias, fotos ou documentos, o canvas deve mostrar checklist documental, cobertura ja coletada e lacunas criticas para sustentar a decisao.',
      importance: 'alta',
      basis: 'evidencia',
    },
    chartHint: 'Inclua checklist de evidencias com status documental, lacunas e proxima coleta.',
  },
  {
    id: 'fila-operacional',
    pattern: /\b(dashboard operacional|fila|backlog|sla|tempo medio|tempo médio|aging|triagem|severidade|prioridade operacional)\b/,
    mustShow: 'fila operacional',
    finding: {
      title: 'Fila operacional',
      detail: 'Se a missao envolver operacao, backlog ou SLA, a leitura executiva deve materializar fila priorizada, severidade, aging ou capacidade de resposta.',
      importance: 'media',
      basis: 'premissa',
    },
    chartHint: 'Use status board ou ranking de fila com severidade, aging, SLA e dono.',
  },
  {
    id: 'gatilhos-preventivos',
    pattern: /\b(gatilho|gatilhos|prevenc|preventiv|mitigac|mitiga[cç][aã]o|evitar sinistro|evitar perdas|conten[cç][aã]o)\b/,
    mustShow: 'gatilhos preventivos',
    finding: {
      title: 'Gatilhos preventivos',
      detail: 'Em prevencao de sinistros, o canvas deve fechar com gatilhos claros de acionamento, responsavel e janela de resposta antes do evento virar perda.',
      importance: 'media',
      basis: 'premissa',
    },
    chartHint: 'Explique gatilhos preventivos com condicao de disparo, dono e prazo de resposta.',
  },
];

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function compactText(value = '', max = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const candidate = text.slice(0, max).trimEnd();
  const sentenceCut = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('; '), candidate.lastIndexOf(': '));
  if (sentenceCut > Math.floor(max * 0.55)) return candidate.slice(0, sentenceCut + 1).trim();
  const wordCut = candidate.lastIndexOf(' ');
  return (wordCut > Math.floor(max * 0.55) ? candidate.slice(0, wordCut) : candidate).trim();
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueStrings(values = [], { max = 8 } = {}) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || '').trim();
    const key = normalizeText(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= max) break;
  }
  return result;
}

function inferBasis(value = '') {
  const text = normalizeText(value);
  if (/\b(evidencia|arquivo|csv|telemetria|inspecao|dado real)\b/.test(text)) return 'evidencia';
  if (/\b(proxy|estimativa|estimado|aproximado)\b/.test(text)) return 'proxy';
  return 'premissa';
}

export function parseSupervisorFinalReportOutput(output = '') {
  const text = String(output || '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const candidate = fenced ?? (start >= 0 && end > start ? text.slice(start, end + 1) : text);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export function missionBulletItems(value = '', { max = 6 } = {}) {
  const text = String(value || '').trim();
  if (!text) return [];
  const normalized = text
    .replace(/\r/g, '\n')
    .replace(/[;|]+/g, '\n')
    .replace(/\.\s+(?=[A-Z0-9])/g, '.\n');
  const items = normalized
    .split('\n')
    .map((line) => line.replace(/^\s*[-*0-9.)]+\s*/, '').trim())
    .filter(Boolean);
  return uniqueStrings(items, { max });
}

function inferMustShowFromMission(mission = {}, coverage = null) {
  const mustShow = [...DEFAULT_MUST_SHOW];
  const text = normalizeText(missionFullText(mission));
  const agroClimateEvidence = extractAgroClimateEvidence(mission);
  if (/\b(top 5|top5|cinco|ranking)\b/.test(text)) mustShow.push('top 5');
  if (missionLooksInsuranceLike(mission)) {
    mustShow.push('ativo exposto', 'risco priorizado', 'evidencias');
  }
  if (agroClimateEvidence.length) {
    mustShow.push('evidencias agroclimaticas');
  }
  if (coverage?.requiresFinancialGap) {
    mustShow.push('impacto ou proxy');
    mustShow.push('lacuna financeira ou proxy');
  }
  if (/\b(valor para seguradora|impacto financeiro|impacto economico|financeir|premio|valor segurado|economia|roi|retorno)\b/.test(text)) {
    mustShow.push('impacto ou proxy');
  }
  if (coverage?.matched.includes('telemetria') || coverage?.required.includes('telemetria')) {
    mustShow.push('telemetria');
  }
  if (coverage?.matched.includes('csv/sinistros') || coverage?.required.includes('csv/sinistros')) {
    mustShow.push('csv de sinistros');
  }
  for (const rule of MISSION_DELIVERABLE_RULES) {
    if (rule.pattern.test(text)) mustShow.push(rule.mustShow);
  }
  return uniqueStrings(mustShow, { max: 20 });
}

function inferMissionChartHints(mission = {}) {
  const text = normalizeText(missionFullText(mission));
  const hints = MISSION_DELIVERABLE_RULES
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.chartHint);
  if (extractAgroClimateEvidence(mission).length) {
    hints.unshift('Mostre evidencias agroclimaticas do briefing separadas de proxies: fonte, metrica, regiao e janela de monitoramento.');
  }
  return uniqueStrings(hints, { max: 6 });
}

function findingsText(findings = []) {
  return normalizeText(
    findings
      .map((finding) => `${finding?.title || ''} ${finding?.detail || ''}`)
      .join(' '),
  );
}

function injectInsuranceContractFindings(findings = [], mission = {}, coverage = null) {
  const result = [...findings];
  const missionText = normalizeText(missionFullText(mission));
  const agroClimateEvidence = extractAgroClimateEvidence(mission);
  const appendIfMissing = ({ pattern, title, detail, importance = 'alta', basis = 'premissa' }) => {
    if (result.length >= 8) return;
    if (pattern.test(findingsText(result))) return;
    result.push({ title, detail: compactText(detail, 1200), importance, basis });
  };

  if (agroClimateEvidence.length) {
    appendIfMissing({
      pattern: /\b(inmet|conab|deficit hidrico|chuva abaixo|produtividade|zarc|francisco beltrao|safra|climatic)\b/,
      title: 'Evidencias agroclimaticas',
      detail: compactText(`Sinais do briefing para sustentar underwriting agricola: ${agroClimateEvidence.map((item) => item.value).join('; ')}.`, 1200),
      importance: 'alta',
      basis: 'evidencia',
    });
  }

  if (coverage?.matched.includes('telemetria') || coverage?.required.includes('telemetria')) {
    appendIfMissing({
      pattern: /\b(telemetria|sensor|umidade|chuva|vazao|irrigacao|anomalia)\b/,
      title: 'Telemetria prioritaria',
      detail: 'A telemetria precisa aparecer como sinal objetivo para priorizar risco, anomalia ou deterioracao operacional no ativo monitorado.',
      basis: coverage?.matched.includes('telemetria') ? 'evidencia' : 'premissa',
    });
  }

  if (coverage?.matched.includes('csv/sinistros') || coverage?.required.includes('csv/sinistros')) {
    appendIfMissing({
      pattern: /\b(csv|sinistro|sinistros|talhao|talhoes|recorrenc|frequencia)\b/,
      title: 'Recorrencia de sinistros',
      detail: 'O CSV de sinistros deve sustentar a leitura de recorrencia, concentracao por talhao e priorizacao do risco operacional.',
      basis: coverage?.matched.includes('csv/sinistros') ? 'evidencia' : 'premissa',
    });
  }

  if (coverage?.requiresFinancialGap) {
    appendIfMissing({
      pattern: /\b(financeir|premio|valor segurado|proxy|lacuna financeira|dado financeiro|roi|retorno|margem|receita|economia)\b/,
      title: 'Lacuna financeira explicitada',
      detail: 'Se premio, valor segurado, custo evitado ou ROI nao estiverem disponiveis, o relatorio deve assumir a lacuna e orientar decisao por proxy ate a coleta minima.',
      basis: coverage?.mentionsGap ? 'proxy' : 'premissa',
    });
  }

  if (/\b(top 5|top5|cinco|ranking)\b/.test(missionText)) {
    appendIfMissing({
      pattern: /\b(top 5|top5|ranking|priorizad|prioridade)\b/,
      title: 'Ranking decisorio',
      detail: 'A missao pede ranking objetivo; o canvas final precisa ordenar os itens criticos em top 5 defensavel para underwriting ou prevencao.',
      importance: 'media',
      basis: 'premissa',
    });
  }

  for (const rule of MISSION_DELIVERABLE_RULES) {
    if (!rule.pattern.test(missionText)) continue;
    appendIfMissing({
      pattern: new RegExp(escapeRegExp(normalizeText(rule.mustShow)).replace(/\s+/g, '\\s+')),
      ...rule.finding,
    });
  }

  return result.slice(0, 8);
}

function normalizeFindings(findings = [], contributions = []) {
  const parsed = Array.isArray(findings) ? findings : [];
  const normalized = parsed
    .map((finding, index) => {
      const title = compactText(finding?.title || `Prioridade ${index + 1}`, 120);
      const detail = compactText(finding?.detail || finding?.summary || finding?.description || title, 1200);
      return {
        title,
        importance: IMPORTANCE_VALUES.has(String(finding?.importance || '').trim()) ? String(finding.importance).trim() : (index < 2 ? 'alta' : 'media'),
        basis: BASIS_VALUES.has(String(finding?.basis || '').trim()) ? String(finding.basis).trim() : inferBasis(`${title} ${detail}`),
        detail,
      };
    })
    .filter((finding) => finding.title && finding.detail);
  if (normalized.length) return normalized.slice(0, 6);

  return contributions.slice(0, 4).map((message, index) => {
    const detail = compactText(message?.content || `Prioridade ${index + 1}`, 1200);
    return {
      title: compactText(message?.agentId ? `${message.agentId} ${index + 1}` : `Prioridade ${index + 1}`, 120),
      importance: index < 2 ? 'alta' : 'media',
      basis: inferBasis(detail),
      detail,
    };
  });
}

export function normalizeSupervisorFinalReport({ mission = {}, snapshot = {}, report = {}, fallbackReason = '' } = {}) {
  const contributions = Array.isArray(snapshot?.contributions) ? snapshot.contributions : [];
  const coverage = evaluateInsuranceEvidenceCoverage(
    contributions.map((item) => String(item?.content || '')).join('\n'),
    mission,
  );
  const findings = injectInsuranceContractFindings(normalizeFindings(report?.findings, contributions), mission, coverage);
  const missionCriteria = missionBulletItems(mission?.success);
  const reportCriteria = uniqueStrings(Array.isArray(report?.successCriteria) ? report.successCriteria : [], { max: 6 });
  const successCriteria = reportCriteria.length
    ? reportCriteria
    : missionCriteria.length
      ? missionCriteria
      : ['canvas publicado', 'prioridades claras', 'acoes praticas definidas'];
  if (missionLooksInsuranceLike(mission) && coverage.requiresFinancialGap) {
    successCriteria.push('lacuna financeira ou proxy explicitado para a decisao');
  }
  const mustShow = uniqueStrings([
    ...(Array.isArray(report?.designerBrief?.mustShow) ? report.designerBrief.mustShow : []),
    ...inferMustShowFromMission(mission, coverage),
    ...(successCriteria.length ? ['criterios de sucesso'] : []),
  ], { max: 20 });
  const recommendedBlocks = uniqueStrings([
    ...(Array.isArray(report?.designerBrief?.recommendedBlocks) ? report.designerBrief.recommendedBlocks : []),
    ...DEFAULT_BLOCKS,
  ], { max: 6 });
  const avoid = uniqueStrings([
    ...(Array.isArray(report?.designerBrief?.avoid) ? report.designerBrief.avoid : []),
    ...DEFAULT_AVOID,
  ], { max: 10 });
  const summary = compactText(
    report?.summary
      || findings[0]?.detail
      || fallbackReason
      || 'Consolidacao executiva pronta para canvas.',
    1200,
  );
  const chartGuidance = compactText(
    [
      report?.designerBrief?.chartGuidance,
      ...inferMissionChartHints(mission),
      missionLooksInsuranceLike(mission)
        ? 'Use ranking de risco, bloco de evidencia/premissa e nota curta sobre lacuna financeira ou proxy quando houver.'
        : 'Use ranking simples e blocos curtos para explicar prioridades e criterio de sucesso.',
    ].filter(Boolean).join(' '),
    1200,
  );

  return {
    summary,
    findings,
    designerBrief: {
      mustShow,
      recommendedBlocks,
      chartGuidance,
      avoid,
    },
    successCriteria: uniqueStrings(successCriteria, { max: 6 }),
    sourceAgentId: report?.sourceAgentId || 'supervisor',
    fallback: Boolean(report?.fallback || fallbackReason),
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}
