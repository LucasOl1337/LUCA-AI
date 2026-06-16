import { extractAgroClimateEvidence, extractMissionQuantitativeAnchors } from './mission-intent.js';

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function uniqueStrings(values = [], { max = 12 } = {}) {
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

function clip(value = '', max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const candidate = text.slice(0, max).trimEnd();
  const sentenceCut = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('; '), candidate.lastIndexOf(': '));
  if (sentenceCut > Math.floor(max * 0.55)) return candidate.slice(0, sentenceCut + 1).trim();
  const wordCut = candidate.lastIndexOf(' ');
  return (wordCut > Math.floor(max * 0.55) ? candidate.slice(0, wordCut) : candidate).trim();
}

function fullBodyText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/\.{2,}/g, '.')
    .trim();
}

function looksLikeTechnicalFallback(value = '') {
  return /\b(glm|9router|fetch failed|unreachable|timeout|econnrefused|enotfound|etimedout|indisponivel|falhei|falha|erro|contrato incompleto|revisao deterministica|contingencia deterministica|fallback|tecnico|metricas executivas|blocos obrigatorios)\b/.test(normalizeText(value));
}

function dashboardSummaryText(finalReport = {}, mission = {}, findings = []) {
  const summary = String(finalReport?.summary || '').trim();
  if (summary && !looksLikeTechnicalFallback(summary)) return summary;
  const finding = findings.find((item) => item?.detail && !looksLikeTechnicalFallback(item.detail));
  if (finding?.detail) return finding.detail;
  return mission?.description || mission?.title || 'Sintese executiva pronta para decisao.';
}

function hasMustShow(mustShow = [], pattern) {
  return mustShow.some((item) => pattern.test(normalizeText(item)));
}

function missionRequestsFinancialBlock(mission = {}, findings = []) {
  const missionText = normalizeText(`${mission?.title || ''} ${mission?.description || ''} ${mission?.success || ''}`);
  const findingsText = normalizeText((Array.isArray(findings) ? findings : [])
    .map((finding) => `${finding?.title || ''} ${finding?.detail || ''} ${finding?.basis || ''}`)
    .join(' '));
  return /\b(valor para seguradora|impacto financeiro|impacto economico|financeir|premio|valor segurado|economia|roi|retorno|projecao de indenizacoes|indenizacao)\b/.test(`${missionText} ${findingsText}`);
}

function extractRegionalAnchors(mission = {}, findings = []) {
  const rawText = `${mission?.title || ''} ${mission?.description || ''} ${mission?.success || ''}`;
  const normalized = normalizeText(rawText);
  const regions = [];
  const append = (label) => {
    if (!label) return;
    if (regions.includes(label)) return;
    regions.push(label);
  };

  if (/\bsudoeste\b/.test(normalized)) append('Sudoeste PR');
  if (/\boeste\b/.test(normalized)) append('Oeste PR');
  if (/\bcentro-sul\b|\bcentro sul\b/.test(normalized)) append('Centro-Sul PR');
  if (/\bsul do mato grosso do sul\b|\bsul ms\b/.test(normalized)) append('Sul MS');

  for (const finding of findings) {
    const detail = `${finding?.title || ''} ${finding?.detail || ''}`;
    if (/\bsudoeste\b/i.test(detail)) append('Sudoeste PR');
    if (/\boeste\b/i.test(detail)) append('Oeste PR');
    if (/\bcentro-sul\b|\bcentro sul\b/i.test(detail)) append('Centro-Sul PR');
    if (/\bsul do mato grosso do sul\b|\bsul ms\b/i.test(detail)) append('Sul MS');
  }

  return regions.slice(0, 4);
}

function buildSinistralityProxyText(mission = {}, findings = []) {
  const anchors = extractMissionQuantitativeAnchors(mission);
  const regions = extractRegionalAnchors(mission, findings);
  const anchorsText = anchors.length ? ` Evidencias quantitativas reaproveitadas: ${anchors.join(', ')}.` : '';
  const regionText = regions.length ? ` Faixa prioritaria: ${regions.join(', ')}.` : '';
  return fullBodyText(
    `Proxy qualitativo: sinistralidade esperada em faixa alta para a carteira priorizada, com calibracao final dependente de apolices, valor segurado e premio consolidados.${regionText}${anchorsText}`,
  );
}

function buildExecutiveMetrics({ mission = {}, finalReport = {}, findings = [], mustShow = [], quantitativeAnchors = [], agroClimateEvidence = [], regionalAnchors = [], needsFinancialBlock = false } = {}) {
  const actionText = String(finalReport?.designerBrief?.chartGuidance || mission?.success || '').trim();
  const evidenceCount = Math.max(quantitativeAnchors.length, agroClimateEvidence.length, findings.length);
  const requestedDeliverables = mustShow.length || 0;
  const regionValue = regionalAnchors.length ? regionalAnchors[0] : 'carteira critica';
  return [
    {
      label: 'Evidencias usadas',
      value: evidenceCount ? `${evidenceCount} sinais` : 'pendente',
    },
    {
      label: 'Prioridade executiva',
      value: regionValue,
    },
    {
      label: 'Impacto financeiro',
      value: needsFinancialBlock ? 'proxy/pendente' : 'sem cifra base',
    },
    {
      label: 'Entregaveis cobertos',
      value: requestedDeliverables ? `${requestedDeliverables} itens` : clip(actionText || 'criterio executivo', 40),
    },
  ];
}

function extractContribution(agentId, contributions = []) {
  return contributions
    .filter((item) => item?.agentId === agentId)
    .map((item) => String(item?.content || '').trim())
    .find(Boolean) || '';
}

function extractLabeledValue(text = '', labels = []) {
  if (!labels.length) return '';
  const allLabels = [
    'Evidencia',
    'Lacuna critica',
    'Risco principal',
    'Prioridade',
    'A[cç]ao imediata',
    'Dono sugerido',
    'Dono responsavel',
    'Responsavel',
    'Veredito',
    'Proxima acao',
    'Pendencia critica',
  ].join('|');
  const pattern = new RegExp(`(?:${labels.join('|')}):\\s*([\\s\\S]*?)(?=\\s+(?:${allLabels}):|$)`, 'i');
  return pattern.exec(text)?.[1]?.trim().replace(/\s+/g, ' ') || '';
}

function extractActionBody(plannerText = '') {
  const action = extractLabeledValue(plannerText, ['A[cç]ao imediata']);
  const owner = extractLabeledValue(plannerText, ['Dono sugerido', 'Dono responsavel', 'Responsavel']);
  const priority = extractLabeledValue(plannerText, ['Prioridade']);
  const parts = [];
  if (priority) parts.push(`Prioridade: ${priority}.`);
  if (action) parts.push(`Acao concreta: ${action}.`);
  if (owner) parts.push(`Dono responsavel: ${owner}.`);
  return parts.join(' ');
}

function extractEvidenceBody(researchText = '', findings = [], quantitativeAnchors = []) {
  const evidence = extractLabeledValue(researchText, ['Evidencia']);
  const gap = extractLabeledValue(researchText, ['Lacuna critica']);
  const risk = extractLabeledValue(researchText, ['Risco principal']);
  const quantitativeText = quantitativeAnchors.length
    ? `Evidencia quantitativa: ${quantitativeAnchors.join(', ')}.`
    : '';
  const basisSummary = findings
    .slice(0, 3)
    .filter((finding) => !looksLikeTechnicalFallback(`${finding?.title || ''} ${finding?.detail || ''}`))
    .map((finding) => `${finding?.basis || 'premissa'}: ${finding?.detail || finding?.title || ''}`)
    .filter(Boolean)
    .join(' ');
  return fullBodyText([
    evidence ? `Evidencia: ${evidence}.` : '',
    quantitativeText,
    gap ? `Premissa/proxy: ${gap}.` : '',
    risk ? `Risco principal: ${risk}.` : '',
    basisSummary,
  ].filter(Boolean).join(' '));
}

function buildCentralPainBody(mission = {}, researchText = '', findings = [], regionalAnchors = []) {
  const risk = extractLabeledValue(researchText, ['Risco principal']);
  const evidence = extractLabeledValue(researchText, ['Evidencia']);
  const mainFinding = findings.find((finding) => {
    if (!finding?.detail && !finding?.title) return false;
    return !looksLikeTechnicalFallback(`${finding?.title || ''} ${finding?.detail || ''}`);
  });
  return fullBodyText([
    risk ? `Risco principal: ${risk}.` : '',
    evidence ? `Evidencia central: ${evidence}.` : '',
    regionalAnchors.length ? `Regioes priorizadas: ${regionalAnchors.join(', ')}.` : '',
    mainFinding ? `Foco executivo: ${mainFinding.detail || mainFinding.title}.` : '',
    !risk && !evidence && !mainFinding ? `Dor central: ${mission?.description || mission?.title || 'priorizar risco e proxima acao defensavel'}.` : '',
  ].filter(Boolean).join(' '));
}

function padRankingItems(items = [], labelPrefix = 'Prioridade') {
  const result = [...items];
  while (result.length < 5) {
    result.push({
      label: `${labelPrefix} ${result.length + 1}`,
      value: Math.max(1, 5 - result.length),
    });
  }
  return result.slice(0, 5);
}

function rankingItemTitle(finding = {}, index = 0, rankingTitle = 'Prioridades') {
  const fallback = rankingTitle === 'Ranking de apolices'
    ? `Apolice critica ${index + 1}`
    : `Prioridade ${index + 1}`;
  const title = fullBodyText(finding?.title || fallback);
  if (rankingTitle !== 'Ranking de apolices') return title;
  if (/\b(apolice|carteira|talhao|fazenda|produtor|lote)\b/i.test(title)) return title;
  return `${fallback} - ${title}`;
}

function inferMissionMustShow(mission = {}) {
  const text = normalizeText(`${mission?.title || ''} ${mission?.description || ''} ${mission?.success || ''}`);
  const inferred = [];
  const append = (value) => {
    if (!value) return;
    inferred.push(value);
  };
  if (/\b(microrregiao|microrregioes|oeste|sudoeste|centro-sul|centro sul)\b/.test(text)) append('microrregioes prioritarias');
  if (/\b(mapa de risco|mapa|heatmap|geograf)\b/.test(text)) append('mapa de risco');
  if (/\b(zarc|janela de plantio|fora da janela)\b/.test(text)) append('validacao zarc');
  if (/\b(apolice|apolices|apolice critica|valor segurado)\b/.test(text)) append('ranking de apolices');
  if (/\b(sinistralidade|sinistro esperado|acionamento de sinistro)\b/.test(text)) append('sinistralidade esperada');
  if (/\b(indenizacao|indenizacoes|provisao)\b/.test(text)) append('projecao de indenizacoes');
  if (/\b(cronograma|monitoramento|4 a 8 semanas|4-8 semanas|4 semanas|8 semanas)\b/.test(text)) append('cronograma de monitoramento');
  if (/\b(alerta|alertas|corretor|corretores|comunicado|aviso de sinistro)\b/.test(text)) append('alertas operacionais');
  if (/\b(evidenc|foto|fotos|document|anexo|laudo|prova|vistoria fotografica)\b/.test(text)) append('pacote de evidencias');
  if (/\b(dashboard operacional|fila|backlog|sla|tempo medio|aging|triagem|severidade|prioridade operacional)\b/.test(text)) append('fila operacional');
  if (/\b(gatilho|gatilhos|prevenc|preventiv|mitigac|mitiga[cç][aã]o|evitar sinistro|evitar perdas|conten[cç][aã]o)\b/.test(text)) append('gatilhos preventivos');
  return uniqueStrings(inferred, { max: 10 });
}

export function buildDeterministicExecutiveDashboard({ mission = {}, finalReport = {}, snapshot = {} } = {}) {
  const findings = Array.isArray(finalReport?.findings) ? finalReport.findings : [];
  const mustShow = uniqueStrings([
    ...(Array.isArray(finalReport?.designerBrief?.mustShow) ? finalReport.designerBrief.mustShow : []),
    ...inferMissionMustShow(mission),
  ], { max: 24 });
  const successCriteria = uniqueStrings(Array.isArray(finalReport?.successCriteria) ? finalReport.successCriteria : []);
  const contributions = Array.isArray(snapshot?.contributions) ? snapshot.contributions : [];
  const plannerText = extractContribution('planejador', contributions);
  const researchText = extractContribution('pesquisador', contributions);
  const normalizedMustShow = mustShow.map((item) => normalizeText(item));
  const quantitativeAnchors = extractMissionQuantitativeAnchors(mission);
  const agroClimateEvidence = extractAgroClimateEvidence(mission);
  const regionalAnchors = extractRegionalAnchors(mission, findings);
  const needsFinancialBlock = missionRequestsFinancialBlock(mission, findings);
  const summaryText = dashboardSummaryText(finalReport, mission, findings);

  const rankingTitle = hasMustShow(normalizedMustShow, /\branking de apolices\b/) ? 'Ranking de apolices' : 'Prioridades';
  const rankingPrefix = rankingTitle === 'Ranking de apolices' ? 'Apolice critica' : 'Prioridade';
  const rankingItems = padRankingItems(findings.slice(0, 5).map((finding, index) => ({
    label: rankingItemTitle(finding, index, rankingTitle),
    value: Math.max(1, 5 - index),
  })), rankingPrefix);

  const blocks = [];

  blocks.push({
    type: 'note',
    title: 'Dor central',
    body: buildCentralPainBody(mission, researchText, findings, regionalAnchors),
  });

  if (needsFinancialBlock || hasMustShow(normalizedMustShow, /\b(impacto ou proxy|lacuna financeira ou proxy|projecao de indenizacoes)\b/)) {
    blocks.push({
      type: 'metric',
      title: 'Impacto ou proxy',
      value: hasMustShow(normalizedMustShow, /\bprojecao de indenizacoes\b/) ? 'proxy ativo' : 'pendente',
      body: fullBodyText(
        summaryText
          || (needsFinancialBlock
            ? 'Decisao executiva deve seguir com impacto financeiro em proxy explicito ate consolidar premio, valor segurado ou base economica completa.'
            : 'Decisao executiva deve seguir com proxy explicito ate consolidar base financeira completa.'),
      ),
    });
  }

  if (agroClimateEvidence.length || hasMustShow(normalizedMustShow, /\bevidencias agroclimaticas\b/)) {
    blocks.push({
      type: 'note',
      title: 'Evidencias agroclimaticas',
      body: fullBodyText(
        agroClimateEvidence.length
          ? `Fonte e sinais do briefing: ${agroClimateEvidence.map((item) => item.value).join('; ')}. Usar esses sinais como lastro e manter sinistralidade/indenizacao como proxy quando faltar carteira consolidada.`
          : 'Separar fonte climatica, metrica, regiao e janela antes de fechar underwriting agricola.',
      ),
    });
  }

  blocks.push({
    type: 'tower',
    title: rankingTitle,
    body: rankingTitle === 'Ranking de apolices'
      ? fullBodyText(
        `Top 5 executivo para underwriting. Quando o caso nao trouxer IDs e valor segurado por apolice, manter identificacao pendente e priorizar o cruzamento da carteira critica.${regionalAnchors.length ? ` Faixa regional sob maior pressao: ${regionalAnchors.join(', ')}.` : ''}`,
      )
      : undefined,
    items: rankingItems,
  });

  if (hasMustShow(normalizedMustShow, /\b(microrregioes prioritarias|mapa de risco)\b/)) {
    blocks.push({
      type: 'note',
      title: hasMustShow(normalizedMustShow, /\bmapa de risco\b/) ? 'Mapa de risco' : 'Microrregioes prioritarias',
      body: fullBodyText(
        (
          hasMustShow(normalizedMustShow, /\bmicrorregioes prioritarias\b/)
            ? 'Microrregioes prioritarias devem aparecer com faixa regional clara para underwriting, corretor e vistoria.'
            : 'Mapa de risco regional deve destacar concentracao geografica e a segunda faixa de exposicao.'
        )
        + (regionalAnchors.length ? ` Regioes ancoradas no briefing: ${regionalAnchors.join(', ')}.` : '')
        + (findings[0]?.detail ? ` ${findings[0].detail}` : ''),
      ),
    });
  }

  if (hasMustShow(normalizedMustShow, /\bvalidacao zarc\b/)) {
    blocks.push({
      type: 'note',
      title: 'Validacao ZARC',
      body: 'Status: validar janela de plantio, risco de negativa de cobertura e apolices fora da regra antes da decisao final.',
    });
  }

  if (hasMustShow(normalizedMustShow, /\bprojecao de indenizacoes\b/)) {
    blocks.push({
      type: 'note',
      title: 'Projecao de indenizacoes',
      body: fullBodyText(
        `Proxy: projetar a provisao em faixa defensavel, sem numero inventado, ate consolidar valor segurado, premio e exposicao final da carteira.${quantitativeAnchors.length ? ` Reaproveitar sinais do briefing: ${quantitativeAnchors.join(', ')}.` : ''}`,
      ),
    });
  }

  if (hasMustShow(normalizedMustShow, /\bsinistralidade esperada\b/)) {
    blocks.push({
      type: 'note',
      title: 'Sinistralidade esperada',
      body: buildSinistralityProxyText(mission, findings),
    });
  }

  const planBody = extractActionBody(plannerText) || 'Acao concreta: priorizar vistoria, triagem da carteira critica e coleta minima para confirmar exposicao. Dono responsavel: underwriting com sinistros no suporte.';
  blocks.push({
    type: 'note',
    title: 'Plano preventivo',
    body: fullBodyText(planBody),
  });

  if (hasMustShow(normalizedMustShow, /\bcronograma de monitoramento\b/)) {
    blocks.push({
      type: 'note',
      title: 'Cronograma de monitoramento',
      body: /4\s*a\s*8\s*semanas|4-8\s*semanas/i.test(`${mission?.description || ''} ${mission?.success || ''}`)
        ? 'Janela de acompanhamento em 4 a 8 semanas, com checkpoint semanal e revisao extraordinaria apos novo alerta.'
        : 'Checkpoint semanal, revisao por excecao e fechamento executivo apos consolidacao da carteira critica.',
    });
  }

  if (hasMustShow(normalizedMustShow, /\balertas operacionais\b/)) {
    blocks.push({
      type: 'note',
      title: 'Alertas operacionais',
      body: fullBodyText(
        `Disparar alertas preventivos para corretores e operacao com gatilho claro, orientacao de vistoria/documentacao e escalonamento para underwriting quando houver risco de negativa ou sinistro relevante.${regionalAnchors.length ? ` Priorizar comunicados para ${regionalAnchors.join(', ')}.` : ''}`,
      ),
    });
  }

  if (hasMustShow(normalizedMustShow, /\bpacote de evidencias\b/)) {
    blocks.push({
      type: 'note',
      title: 'Pacote de evidencias',
      body: fullBodyText(
        `Checklist documental: consolidar fotos, laudos, anexos, telemetria e comprovantes de vistoria com status de coleta e lacunas explicitas para sustentar a decisao.${quantitativeAnchors.length ? ` Reaproveitar sinais do briefing: ${quantitativeAnchors.join(', ')}.` : ''}`,
      ),
    });
  }

  if (hasMustShow(normalizedMustShow, /\bfila operacional\b/)) {
    blocks.push({
      type: 'note',
      title: 'Fila operacional',
      body: fullBodyText(
        `Priorizar a fila por severidade, aging e impacto esperado, com dono claro para triagem e checkpoint de SLA antes do fechamento executivo.${regionalAnchors.length ? ` Foco inicial: ${regionalAnchors.join(', ')}.` : ''}`,
      ),
    });
  }

  if (hasMustShow(normalizedMustShow, /\bgatilhos preventivos\b/)) {
    blocks.push({
      type: 'note',
      title: 'Gatilhos preventivos',
      body: fullBodyText(
        `Definir gatilhos de acionamento preventivo com condicao objetiva, responsavel e prazo de resposta para conter o risco antes do sinistro.${quantitativeAnchors.length ? ` Gatilhos podem usar: ${quantitativeAnchors.join(', ')}.` : ''}`,
      ),
    });
  }

  blocks.push({
    type: 'note',
    title: 'Evidencia e premissa',
    body: extractEvidenceBody(researchText, findings, quantitativeAnchors) || 'Evidencia: findings priorizados da missao atual. Premissa/proxy: leitura executiva segue util mesmo com lacunas explicitadas.',
  });

  blocks.push({
    type: 'note',
    title: 'Criterios de sucesso',
    body: successCriteria.length
      ? successCriteria.join('; ')
      : String(mission?.success || 'Canvas executivo publicado com prioridades e proxima acao defensavel.'),
  });

  return {
    title: String(mission?.title || 'Canvas Executivo').trim() || 'Canvas Executivo',
    subtitle: clip(summaryText || mission?.description || 'Sintese executiva pronta para decisao.', 360),
    status: 'concluido',
    layout: 'result-board',
    metrics: buildExecutiveMetrics({
      mission,
      finalReport,
      findings,
      mustShow,
      quantitativeAnchors,
      agroClimateEvidence,
      regionalAnchors,
      needsFinancialBlock,
    }),
    blocks,
    fallback: true,
  };
}
