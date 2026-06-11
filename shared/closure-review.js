import {
  missionFullText,
  missionRequestsAllAgents,
  missionNeedsSupervisorJudgment,
  textMentionsMissionEvidence,
  textMentionsMissionQuantitativeEvidence,
  evaluateInsuranceEvidenceCoverage,
} from './mission-intent.js';

function clip(value, max = 220) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function executiveCanvasText(dashboard = null) {
  if (!dashboard || typeof dashboard !== 'object') return '';
  const { sourceAgentId, updatedAt, ...publicDashboard } = dashboard;
  void sourceAgentId;
  void updatedAt;
  return normalizeText(JSON.stringify(publicDashboard));
}

function executiveCanvasRawText(dashboard = null) {
  if (!dashboard || typeof dashboard !== 'object') return '';
  const { sourceAgentId, updatedAt, ...publicDashboard } = dashboard;
  void sourceAgentId;
  void updatedAt;
  return JSON.stringify(publicDashboard);
}

function normalizedDashboardBlocks(dashboard = null) {
  if (!Array.isArray(dashboard?.blocks)) return [];
  return dashboard.blocks.map((block) => ({
    title: normalizeText(block?.title),
    itemsCount: Array.isArray(block?.items) ? block.items.filter(Boolean).length : 0,
    text: normalizeText([
      block?.title,
      block?.value,
      block?.body,
      ...(Array.isArray(block?.items)
        ? block.items.map((item) => (typeof item === 'string' ? item : `${item?.label || ''} ${item?.value || ''}`))
        : []),
    ].join(' ')),
  }));
}

function dashboardHasBlock(blocks = [], matcher) {
  return blocks.some((block) => matcher(block));
}

function successBlockText(blocks = []) {
  return blocks
    .filter((block) => /\b(criterio|criterios|sucesso|meta|metas|aceite)\b/.test(block.title))
    .map((block) => block.text)
    .join(' ');
}

function successCriteriaClaimsUnsupportedOutcome(text = '') {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const claimsRealizedOutcome = /\b(evito[u]?|impedi[u]?|eliminou|zerou|removeu|suprimiu|comprovou|comprovacao de que|provou|garantiu)\b/.test(normalized)
    && /\b(sinistro|sinistros|alagamento|perda|perdas|falha|falhas|praga|pragas|evento|eventos|subprecificacao|subprecificacao)\b/.test(normalized);
  const framedAsTarget = /\b(meta|objetivo|alvo|target|buscar|reduzir|mitigar|diminuir|evitar|prevenir|ate |se |quando |apos |depois de |antes de )\b/.test(normalized);
  const hasObservableApprovalMarker = /\b(aprovad|aprovacao|publicad|confirmad|registrad|validad)\b/.test(normalized)
    || /\b(vistoria|acionamento|coleta|execucao)\b.*\b(concluid|executad|realizad|registrad)\b/.test(normalized);
  return claimsRealizedOutcome && !framedAsTarget && !hasObservableApprovalMarker;
}

function missionHasConcreteFinancialAnchor(mission = {}) {
  const text = String(missionFullText(mission) || '');
  if (!text) return false;
  if (/\bR\$\s*\d|\bUS\$\s*\d/i.test(text)) return true;
  if (/\b(?:roi|retorno|economia|economia estimada|premio|pr[eê]mio|valor segurado|receita|margem|custo|perda|economia anual)\b[^\n\r]{0,24}\b\d+(?:[.,]\d+)?\s*%/i.test(text)) {
    return true;
  }
  if (/\b(?:roi|retorno|economia|premio|pr[eê]mio|valor segurado|receita|margem|custo|perda)\b[^\n\r]{0,24}\b\d+(?:[.,]\d+)?\s*(?:mil|milhao|milhoes|mi|mm)\b/i.test(text)) {
    return true;
  }
  return false;
}

function canvasClaimsUnsupportedConcreteFinancials(rawDashboardText = '', mission = {}) {
  if (!rawDashboardText) return false;
  if (missionHasConcreteFinancialAnchor(mission)) return false;

  const qualifiedPattern = /\b(proxy|proxies|premissa|premissas|estimativa|estimativas|estimado|estimada|cenario|cenario-base|cenarios|faixa)\b/i;
  const concreteClaimPatterns = [
    /\b(?:roi|retorno|economia|premio|pr[eê]mio|valor segurado|receita|margem|custo evitado|perda evitada|economia anual|payback)\b[^\n\r]{0,32}\bR\$\s*\d/i,
    /\bR\$\s*\d[^\n\r]{0,32}\b(?:roi|retorno|economia|premio|pr[eê]mio|valor segurado|receita|margem|custo evitado|perda evitada|payback)\b/i,
    /\b(?:roi|retorno|economia|sinistralidade|premio|pr[eê]mio|margem|receita|custo|payback)\b[^\n\r]{0,24}\b\d+(?:[.,]\d+)?\s*%/i,
    /\b(?:roi|retorno|economia|premio|pr[eê]mio|valor segurado|receita|margem|custo evitado|perda evitada)\b[^\n\r]{0,24}\b\d+(?:[.,]\d+)?\s*(?:mil|milhao|milhoes|mi|mm)\b/i,
  ];

  return concreteClaimPatterns.some((pattern) => {
    const match = rawDashboardText.match(pattern);
    if (!match) return false;
    const start = Math.max(0, match.index - 48);
    const end = Math.min(rawDashboardText.length, match.index + match[0].length + 48);
    const context = rawDashboardText.slice(start, end);
    return !qualifiedPattern.test(context);
  });
}

function dashboardCoversMustShow(item = '', dashboardText = '', blocks = []) {
  const normalizedItem = normalizeText(item);
  if (!normalizedItem) return true;

  const conceptMatchers = [
    {
      match: /\b(criterio|criterios|sucesso|meta|metas|aceite)\b/,
      test: () => /\b(criterio|criterios|sucesso|meta|metas|aceite|aprovacao|aprovado)\b/.test(dashboardText),
    },
    {
      match: /\b(acoes recomendadas|acao recomendada|plano preventivo|proxima acao|proximas acoes)\b/,
      test: () => dashboardHasBlock(blocks, (block) => /\b(plano preventivo|acoes recomendadas|proxima acao|proximas acoes)\b/.test(block.title))
        || /\b(vistoria|vistoriar|inspecao|inspecionar|coleta|coletar|monitorar|monitoramento|ajuste|ajustar|revisao|revisar|acionar|priorizar|bloquear|corrigir|mitigar)\b/.test(dashboardText),
    },
    {
      match: /\b(prioridades|prioridade|ranking|top 5|top5)\b/,
      test: () => dashboardHasBlock(blocks, (block) => /\b(prioridades|prioridade|ranking|top 5|top5)\b/.test(block.title))
        || /\b(prioridades|prioridade|ranking|top 5|top5|risco priorizado)\b/.test(dashboardText),
    },
    {
      match: /\b(dor central|problema central|mensagem-chave)\b/,
      test: () => dashboardHasBlock(blocks, (block) => /\b(dor central|problema central|mensagem-chave|risco principal)\b/.test(block.title))
        || /\b(dor central|problema central|mensagem-chave|risco principal)\b/.test(dashboardText),
    },
    {
      match: /\b(impacto ou proxy|lacuna financeira ou proxy)\b/,
      test: () => /\b(financeir|financeiro|valor|custo|economia|proxy|pendente|lacuna)\b/.test(dashboardText),
    },
    {
      match: /\b(evidencias|evidencia)\b/,
      test: () => /\b(evidencia|evidencias)\b/.test(dashboardText),
    },
    {
      match: /\b(evidencias agroclimaticas)\b/,
      test: () => /\b(evidencias agroclimaticas|inmet|conab|deficit hidrico|chuva abaixo|produtividade|zarc)\b/.test(dashboardText),
    },
    {
      match: /\b(ativo exposto)\b/,
      test: () => /\b(ativo exposto|fazenda|talhao|talhoes|propriedade|operacao|safra|lavoura)\b/.test(dashboardText),
    },
    {
      match: /\b(risco priorizado)\b/,
      test: () => /\b(risco priorizado|prioridade|ranking|top 5|top5)\b/.test(dashboardText),
    },
    {
      match: /\b(telemetria)\b/,
      test: () => /\b(telemetria|sensor|umidade|chuva|vazao|irrigacao|anomalia)\b/.test(dashboardText),
    },
    {
      match: /\b(csv de sinistros|csv\/sinistros)\b/,
      test: () => /\b(csv|sinistro|sinistros|ocorrencia|ocorrencias|eventos|talhao|talhoes)\b/.test(dashboardText),
    },
    {
      match: /\b(microrregioes prioritarias|microrregioes|microrregi[oõ]es prioritarias)\b/,
      test: () => /\b(microrregiao|microrregioes|regioes criticas|regiao critica|oeste|sudoeste|centro-sul|centro sul)\b/.test(dashboardText),
    },
    {
      match: /\b(mapa de risco)\b/,
      test: () => dashboardHasBlock(blocks, (block) => /\b(mapa de risco|mapa|heatmap|geografia|geografico)\b/.test(block.title))
        || /\b(mapa de risco|heatmap|regional|geografico|geografia)\b/.test(dashboardText),
    },
    {
      match: /\b(validacao zarc|zarc)\b/,
      test: () => /\b(zarc|janela de plantio|fora da janela|conformidade)\b/.test(dashboardText),
    },
    {
      match: /\b(ranking de apolices)\b/,
      test: () => /\b(apolice|apolices|valor segurado|carteira critica|ranking de apolices)\b/.test(dashboardText),
    },
    {
      match: /\b(projecao de indenizacoes)\b/,
      test: () => /\b(indenizacao|indenizacoes|sinistralidade|projecao|cenario de perda|provisao)\b/.test(dashboardText),
    },
    {
      match: /\b(sinistralidade esperada)\b/,
      test: () => /\b(sinistralidade|acionamento de sinistro|sinistro esperado|faixa de perda|cenario de perda)\b/.test(dashboardText),
    },
    {
      match: /\b(cronograma de monitoramento)\b/,
      test: () => /\b(cronograma|monitoramento|checkpoint|proxima revisao|janela de acompanhamento)\b/.test(dashboardText),
    },
    {
      match: /\b(alertas operacionais)\b/,
      test: () => /\b(alerta|alertas|corretor|corretores|comunicado|aviso de sinistro|escalonamento)\b/.test(dashboardText),
    },
    {
      match: /\b(pacote de evidencias)\b/,
      test: () => /\b(evidencia|evidencias|checklist|document|foto|fotos|anexo|laudo|prova)\b/.test(dashboardText),
    },
    {
      match: /\b(fila operacional)\b/,
      test: () => /\b(fila|backlog|sla|aging|severidade)\b/.test(dashboardText),
    },
    {
      match: /\b(gatilhos preventivos)\b/,
      test: () => /\b(gatilho|gatilhos|preventiv|mitigac|acionamento|prazo de resposta)\b/.test(dashboardText),
    },
  ];

  for (const matcher of conceptMatchers) {
    if (matcher.match.test(normalizedItem)) return matcher.test();
  }
  return dashboardText.includes(normalizedItem);
}

export function executiveCanvasCoverageGaps({ mission = {}, dashboard = null, finalReport = null } = {}) {
  const gaps = [];
  const dashboardText = executiveCanvasText(dashboard);
  const dashboardRawText = executiveCanvasRawText(dashboard);
  const blocks = normalizedDashboardBlocks(dashboard);
  const quantitativeCoverage = evaluateInsuranceEvidenceCoverage(dashboardText, mission);
  if (!dashboardText) return gaps;

  const mustShow = Array.isArray(finalReport?.designerBrief?.mustShow)
    ? finalReport.designerBrief.mustShow.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const missingMustShow = mustShow.filter((item) => !dashboardCoversMustShow(item, dashboardText, blocks));
  if (missingMustShow.length) {
    gaps.push(`Canvas executivo nao cobriu itens obrigatorios do designerBrief.mustShow: ${missingMustShow.join(', ')}.`);
  }

  const missionText = normalizeText(missionFullText(mission));
  const mustShowText = mustShow.join(' ');
  const requiresTopFive = /\b(top 5|top5)\b/.test(`${missionText} ${mustShowText}`);
  if (requiresTopFive) {
    const rankingBlock = blocks.find((block) => /\b(prioridades|prioridade|ranking|top 5|top5)\b/.test(block.title));
    if (!rankingBlock || rankingBlock.itemsCount < 5) {
      gaps.push('Canvas executivo pede top 5, mas o bloco de ranking/prioridades nao lista 5 itens objetivos.');
    }
  }

  if (Array.isArray(finalReport?.successCriteria) && finalReport.successCriteria.length) {
    const mentionsSuccess = /\b(criterio|criterios|sucesso|meta|metas)\b/.test(dashboardText);
    if (!mentionsSuccess) {
      gaps.push('Canvas executivo nao explicita criterio de sucesso verificavel.');
    }
  }

  const insuranceLikeText = normalizeText([
    mission?.title,
    mission?.description,
    mission?.success,
    finalReport?.summary,
    JSON.stringify(finalReport?.findings ?? []),
  ].join(' '));
  const insuranceLike = /\b(sompo|seguradora|seguro|underwriting|sinistro|apolice|risco|telemetria|csv|fazenda|rural|vistoria|renovacao)\b/.test(insuranceLikeText);
  const requestsFinancialDiscipline = insuranceLike
    && /\b(financeir|financeiro|valor para seguradora|custo|apolice|premio|economia|proxy)\b/.test(insuranceLikeText);
  if (requestsFinancialDiscipline) {
    const mentionsFinance = /\b(financeir|financeiro|valor|custo|economia|proxy|pendente|lacuna)\b/.test(dashboardText);
    const marksGap = /\b(pendente|proxy|lacuna|nao informado|nao disponivel)\b/.test(dashboardText);
    const financialBlock = blocks.find((block) => /\b(impacto|proxy|financeir|indenizac|projecao)\b/.test(block.title));
    if (!mentionsFinance || !marksGap) {
      gaps.push('Canvas executivo nao sinaliza lacuna financeira ou uso de proxy/pendente para a decisao.');
    }
    if (!financialBlock) {
      gaps.push('Canvas executivo nao materializa um bloco financeiro explicito para impacto, proxy ou projecao.');
    }
    if (canvasClaimsUnsupportedConcreteFinancials(dashboardRawText, mission)) {
      gaps.push('Canvas executivo afirma ROI, premio ou valor financeiro especifico sem base no briefing e sem rotulo claro de proxy/estimativa.');
    }
  }

  if (insuranceLike) {
    const preventivePlanBlock = blocks.find((block) => block.title === 'plano preventivo');
    const mentionsConcreteAction = /\b(acao imediata|acao concreta|vistoria|vistoriar|inspecao|inspecionar|coleta|coletar|monitorar|monitoramento|ajuste|ajustar|revisao|revisar|validar|cruzar|notificar|alertar|acionar|priorizar|bloquear|corrigir|mitigar)\b/.test(preventivePlanBlock?.text || '');
    const mentionsOwner = /\b(dono|responsavel|responsavel:|underwriting|operac|campo|agronom|engenhari|sinistro|time|equipe)\b/.test(preventivePlanBlock?.text || '');
    if (!preventivePlanBlock || !mentionsConcreteAction || !mentionsOwner) {
      gaps.push('Canvas executivo nao deixa o plano preventivo acionavel: falta acao concreta ou dono claro.');
    }

    const successText = successBlockText(blocks);
    if (successCriteriaClaimsUnsupportedOutcome(successText)) {
      gaps.push('Canvas executivo trata prevencao ou perda evitada como fato consumado no criterio de sucesso, sem marcador observavel de aprovacao.');
    }
    if (quantitativeCoverage.requiresQuantitativeEvidence && !textMentionsMissionQuantitativeEvidence(dashboardText, mission)) {
      gaps.push('Canvas executivo nao reaproveita nenhuma evidencia quantitativa do briefing Sompo.');
    }
  }

  const findingBasis = Array.isArray(finalReport?.findings)
    ? finalReport.findings.map((finding) => normalizeText(finding?.basis)).filter(Boolean)
    : [];
  if (findingBasis.includes('evidencia') && findingBasis.some((basis) => basis === 'premissa' || basis === 'proxy')) {
    const separatesEvidence = /\b(evidencia|evidencias)\b/.test(dashboardText);
    const separatesInference = /\b(premissa|premissas|proxy|inferencia|inferencias)\b/.test(dashboardText);
    if (!separatesEvidence || !separatesInference) {
      gaps.push('Canvas executivo nao separa evidencia de premissa/proxy apesar do relatorio final exigir essa distincao.');
    }
  }

  return gaps;
}

export function supervisorReportedJudgmentBlocker(message = {}) {
  if (message.agentId !== 'supervisor') return false;
  if (!['alerta', 'decisao', 'resultado', 'info', 'verificacao'].includes(message.type)) return false;
  const content = String(message.content || '');
  if (/\bveredito\b/i.test(content)) return false;
  if (/Canvas executivo gerado por contingencia deterministica|Motivo tecnico tratado/i.test(content)) return false;
  return /\b(n[aã]o posso|nao posso|n[aã]o consigo|sem inventar|ainda n[aã]o|ainda nao|faltou|faltam|sem (piada|mensagem|contribui|evidencia)|bloque)\b/i.test(content);
}

export function supervisorIssuedJudgmentVerdict(message = {}) {
  if (message.agentId !== 'supervisor') return false;
  if (!['decisao', 'resultado', 'acao', 'verificacao'].includes(message.type)) return false;
  if (supervisorReportedJudgmentBlocker(message)) return false;
  return /\b(veredito|venceu|vencedor|vencedora|nota|melhor|escolh|escolhi|decidi|ranking|aprovar|aprovo|aprovaria|reprovar|reprovo|avan[cç]ar|seguir|condicion|bloquear|segurar)\b/i.test(String(message.content || ''));
}

export function expectedChatPerformers(mission = {}, agents = [], performerIds = []) {
  const roster = Array.isArray(agents) ? agents : [];
  const ids = missionRequestsAllAgents(mission)
    ? performerIds
    : roster
      .filter((agent) => performerIds.includes(agent.id) && agent.enabled !== false)
      .map((agent) => agent.id);
  return ids
    .map((agentId) => roster.find((agent) => agent.id === agentId))
    .filter(Boolean);
}

export function buildDeterministicClosureReview({ mission = {}, chatMessages = [], agents = [], closureContext = {} } = {}) {
  const gaps = [];
  const nextSteps = [];
  const fullText = missionFullText(mission).toLowerCase();
  const performerIds = Array.isArray(closureContext.expectedPerformerIds) ? closureContext.expectedPerformerIds : [];
  const requiresAllAgents = Boolean(closureContext.requiresAllAgents ?? missionRequestsAllAgents(mission));
  const expectedPerformers = performerIds.length
    ? performerIds
    : expectedChatPerformers(mission, agents, performerIds).map((agent) => agent.id);
  const needsSupervisorJudgment = Boolean(closureContext.needsSupervisorJudgment ?? missionNeedsSupervisorJudgment(mission));

  if (requiresAllAgents || /\b(todos os agentes|todos agentes|cada agente|agentes devem|agentes precisam)\b/i.test(fullText)) {
    for (const agentId of expectedPerformers) {
      const agent = agents.find((item) => item.id === agentId);
      if (!agent) continue;
      if (agent.enabled === false) {
        gaps.push(`Agente ${agent.name || agent.id} esta desativado, mas a missao pede participacao de todos os agentes.`);
        nextSteps.push(`Ativar ${agent.name || agent.id} e executar novamente a rodada antes de encerrar.`);
        continue;
      }
      const contributed = chatMessages.some((message) => message.agentId === agent.id && message.type !== 'info');
      if (!contributed) {
        gaps.push(`Agente ${agent.name || agent.id} nao registrou contribuicao real nesta missao.`);
        nextSteps.push(`Acionar ${agent.name || agent.id} antes de encerrar.`);
      }
    }
  }

  if (closureContext.type === 'dashboard_build' && closureContext.proposedStatus === 'completed') {
    if (closureContext.hasDashboard === false) {
      gaps.push('Missao de dashboard sem canvas publicado.');
      nextSteps.push('Gerar o canvas executivo antes de encerrar.');
    }
    if (closureContext.hasFinalReport === false) {
      gaps.push('Missao sem veredito executivo final do Supervisor.');
      nextSteps.push('Gerar um veredito final curto e acionavel.');
    }
    for (const agentId of performerIds) {
      const contributed = chatMessages.some((message) => message.agentId === agentId && message.type !== 'info');
      if (!contributed) {
        gaps.push(`Contribuicao obrigatoria ausente: ${agentId}.`);
        nextSteps.push(`Adicionar a contribuicao do papel ${agentId} antes de aprovar.`);
      }
    }
    if (closureContext.requireResearchEvidence) {
      const researcherMessages = chatMessages.filter((message) => message.agentId === 'pesquisador');
      const anchored = researcherMessages.some((message) => textMentionsMissionEvidence(message.content, mission));
      if (!anchored) {
        gaps.push('Pesquisador nao citou evidencia concreta do briefing na analise.');
        nextSteps.push('Refazer a contribuicao do Pesquisador ancorando em sinais reais da missao.');
      }
      const combinedResearch = researcherMessages.map((message) => String(message.content || '')).join('\n');
      const coverage = evaluateInsuranceEvidenceCoverage(combinedResearch, mission);
      const minimumCoverage = coverage.requiredCount >= 2 ? 2 : coverage.requiredCount;
      if (minimumCoverage > 0 && coverage.matchedCount < minimumCoverage) {
        const missingDetail = coverage.missing.length ? ` Faltou cobrir: ${coverage.missing.join(', ')}.` : '';
        gaps.push(`Pesquisador nao cobriu sinais suficientes do briefing Sompo.${missingDetail}`);
        nextSteps.push('Refazer a leitura do Pesquisador cobrindo telemetria, sinistros/CSV, ativo exposto e demais sinais concretos presentes na missao.');
      }
      if (coverage.requiresQuantitativeEvidence && coverage.matchedQuantitativeAnchors.length === 0) {
        gaps.push('Pesquisador nao reutilizou nenhuma evidencia quantitativa explicita do briefing Sompo.');
        nextSteps.push('Refazer a leitura do Pesquisador citando pelo menos um numero ou medida real do briefing, como contagem de sinistros, chuva prevista ou top 5 requerido.');
      }
      if (coverage.requiresFinancialGap && (!coverage.matched.includes('lacuna financeira') || !coverage.mentionsGap)) {
        gaps.push('Pesquisador nao explicitou a lacuna ou premissa financeira do caso.');
        nextSteps.push('Registrar no texto do Pesquisador que valor financeiro, premio ou impacto economico seguem pendentes quando o briefing nao trouxer base suficiente.');
      }
    }
    const canvasCoverageGaps = executiveCanvasCoverageGaps({
      mission,
      dashboard: closureContext.dashboard,
      finalReport: closureContext.finalReport,
    });
    gaps.push(...canvasCoverageGaps);
    if (canvasCoverageGaps.length) {
      nextSteps.push('Regerar o canvas com cobertura explicita de mustShow, criterio de sucesso e lacunas financeiras/proxies.');
    }
  }

  if (needsSupervisorJudgment) {
    const supervisorVerdict = chatMessages.some(supervisorIssuedJudgmentVerdict);
    const supervisorBlocked = chatMessages.some(supervisorReportedJudgmentBlocker);
    if (!supervisorVerdict && supervisorBlocked) {
      gaps.push('Supervisor reportou que nao pode cumprir o criterio de avaliacao ou escolha.');
      nextSteps.push('Resolver a lacuna do Supervisor e rodar novamente o fechamento.');
    } else if (!supervisorVerdict) {
      gaps.push('Criterio de sucesso pede julgamento, mas nao ha veredito claro do Supervisor.');
      nextSteps.push('Executar novamente o Supervisor para fechar a decisao.');
    }
  }

  for (const message of chatMessages.slice(-24)) {
    if (!supervisorReportedJudgmentBlocker(message) && message.type !== 'alerta') continue;
    if (message.type === 'alerta' && !/\b(n[aã]o posso|ainda n[aã]o|sem (mensagem|evidencia|contribui)|bloque|faltou|incomplet)\b/i.test(message.content)) continue;
    const snippet = clip(message.content, 220);
    if (gaps.some((gap) => gap.includes(snippet.slice(0, 60)))) continue;
    gaps.push(`${message.agentName || message.agentId}: ${snippet}`);
  }

  const blocked = gaps.length > 0;
  return {
    verdict: blocked ? 'blocked' : 'approved',
    reasons: blocked
      ? ['Revisao deterministica encontrou lacunas antes do encerramento.']
      : ['Revisao deterministica nao encontrou lacunas obvias.'],
    gaps,
    nextSteps,
    source: 'deterministic',
  };
}

export function mergeClosureReviews(deterministic = {}, modelReview = null) {
  if (deterministic.verdict === 'blocked') {
    return {
      verdict: modelReview?.verdict === 'retry' ? 'retry' : 'blocked',
      reasons: [...(deterministic.reasons || []), ...(modelReview?.reasons || [])].filter(Boolean),
      gaps: [...new Set([...(deterministic.gaps || []), ...(modelReview?.gaps || [])])],
      nextSteps: modelReview?.nextSteps?.length ? modelReview.nextSteps : deterministic.nextSteps,
      sources: ['deterministic', modelReview?.verdict ? 'model' : null].filter(Boolean),
    };
  }
  if (modelReview?.verdict === 'blocked' || modelReview?.verdict === 'retry') {
    return {
      verdict: modelReview.verdict,
      reasons: modelReview.reasons?.length ? modelReview.reasons : deterministic.reasons,
      gaps: [...new Set([...(deterministic.gaps || []), ...(modelReview.gaps || [])])],
      nextSteps: modelReview.nextSteps?.length ? modelReview.nextSteps : deterministic.nextSteps,
      sources: ['model'],
    };
  }
  if (modelReview?.verdict === 'approved') {
    return {
      verdict: deterministic.verdict === 'blocked' ? 'blocked' : 'approved',
      reasons: modelReview.reasons?.length ? modelReview.reasons : deterministic.reasons,
      gaps: deterministic.gaps?.length ? deterministic.gaps : modelReview.gaps,
      nextSteps: deterministic.nextSteps?.length ? deterministic.nextSteps : modelReview.nextSteps,
      sources: ['deterministic', 'model'],
    };
  }
  return { ...deterministic, sources: ['deterministic'] };
}
