// Gate de encerramento de missao (portado do Maestro do VideoGen).
// Revisao deterministica + merge com o veredito do auditor Maestro (LLM).

import { CLOSURE_PERFORMER_AGENT_IDS } from './config.js';
import { missionFullText, missionRequestsAllAgents, missionNeedsSupervisorJudgment } from './intent.js';

function clip(value, max = 220) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

export function parseClosureReviewOutput(output = '') {
  const text = String(output || '');
  const verdictMatch = text.match(/\[closure:verdict\]\s*(approved|blocked|retry)/i);
  const verdict = verdictMatch ? verdictMatch[1].toLowerCase() : null;
  const reasons = [...text.matchAll(/\[closure:reason\]\s*(.+)$/gim)].map((match) => match[1].trim()).filter(Boolean);
  const gaps = [...text.matchAll(/\[closure:gap\]\s*(.+)$/gim)].map((match) => match[1].trim()).filter(Boolean);
  const nextSteps = [...text.matchAll(/\[closure:next\]\s*(.+)$/gim)].map((match) => match[1].trim()).filter(Boolean);
  return { verdict, reasons, gaps, nextSteps, raw: text };
}

export function supervisorReportedJudgmentBlocker(message = {}) {
  if (message.agentId !== 'supervisor') return false;
  if (!['alerta', 'decisao', 'resultado', 'info'].includes(message.type)) return false;
  return /\b(n[aã]o posso|nao posso|n[aã]o consigo|sem inventar|ainda n[aã]o|ainda nao|faltou|faltam|sem (piada|mensagem|contribui|evidencia)|bloque)\b/i.test(String(message.content || ''));
}

export function supervisorIssuedJudgmentVerdict(message = {}) {
  if (message.agentId !== 'supervisor') return false;
  if (!['decisao', 'resultado', 'acao'].includes(message.type)) return false;
  if (supervisorReportedJudgmentBlocker(message)) return false;
  return /\b(venceu|vencedor|vencedora|nota|melhor|escolh|escolhi|decidi|ranking)\b/i.test(String(message.content || ''));
}

export function expectedChatPerformers(mission = {}, agents = []) {
  const roster = Array.isArray(agents) ? agents : [];
  const performerIds = missionRequestsAllAgents(mission)
    ? [...CLOSURE_PERFORMER_AGENT_IDS]
    : roster
      .filter((agent) => CLOSURE_PERFORMER_AGENT_IDS.has(agent.id) && agent.enabled !== false)
      .map((agent) => agent.id);
  return performerIds
    .map((agentId) => roster.find((agent) => agent.id === agentId))
    .filter(Boolean);
}

export function buildDeterministicClosureReview({ mission = {}, chatMessages = [], agents = [], closureContext = {} } = {}) {
  const gaps = [];
  const nextSteps = [];
  const fullText = missionFullText(mission).toLowerCase();
  const requiresAllAgents = Boolean(closureContext.requiresAllAgents ?? missionRequestsAllAgents(mission));
  const expectedPerformers = Array.isArray(closureContext.expectedPerformerIds) && closureContext.expectedPerformerIds.length
    ? closureContext.expectedPerformerIds
    : expectedChatPerformers(mission, agents).map((agent) => agent.id);
  const needsSupervisorJudgment = Boolean(closureContext.needsSupervisorJudgment ?? missionNeedsSupervisorJudgment(mission));

  if (requiresAllAgents || /\b(todos os agentes|todos agentes|cada agente|agentes devem|agentes precisam)\b/i.test(fullText)) {
    for (const agentId of expectedPerformers) {
      const agent = agents.find((item) => item.id === agentId);
      if (!agent) continue;
      if (agent.enabled === false) {
        gaps.push(`Agente ${agent.name || agent.id} esta desativado, mas a missao pede participacao de todos os agentes.`);
        nextSteps.push(`Ativar ${agent.name || agent.id} e executar novamente a rodada de chat antes de encerrar.`);
        continue;
      }
      const contributed = chatMessages.some((message) => message.agentId === agent.id && message.type !== 'info');
      if (!contributed) {
        gaps.push(`Agente ${agent.name || agent.id} nao registrou contribuicao no chat desta missao.`);
        nextSteps.push(`Acionar ${agent.name || agent.id} no chat antes de encerrar.`);
      }
    }
  }

  if (needsSupervisorJudgment) {
    const supervisorVerdict = chatMessages.some(supervisorIssuedJudgmentVerdict);
    const supervisorBlocked = chatMessages.some(supervisorReportedJudgmentBlocker);
    if (!supervisorVerdict && supervisorBlocked) {
      gaps.push('Supervisor reportou que nao pode cumprir o criterio de avaliacao ou escolha.');
      nextSteps.push('Garantir contribuicoes de todos os agentes exigidos e rodar novamente a rodada de julgamento do Supervisor.');
    } else if (!supervisorVerdict) {
      gaps.push('Criterio de sucesso pede escolha/avaliacao, mas nao ha veredicto do Supervisor no chat.');
      nextSteps.push('Rodar novamente o Supervisor para decidir com base nas contribuicoes reais.');
    }
  }

  if (closureContext.type === 'dashboard_build' && closureContext.proposedStatus === 'completed') {
    if (closureContext.hasDashboard === false) {
      gaps.push('Missao de dashboard sem canvas publicado pelo Designer.');
      nextSteps.push('Rodar o Designer para publicar o canvas executivo antes de encerrar.');
    }
    if (closureContext.repoAnalysisSatisfied === false) {
      gaps.push('Analise da repo incompleta: faltam pontos fortes/fracos com evidencia de arquivos.');
      nextSteps.push('Solicitar nova contribuicao do Pesquisador usando o RepoContext.');
    }
  }

  for (const message of chatMessages.slice(-24)) {
    if (!supervisorReportedJudgmentBlocker(message) && message.type !== 'alerta') continue;
    if (message.type === 'alerta' && !/\b(n[aã]o posso|ainda n[aã]o|sem (piada|mensagem|evidencia|contribui)|bloque|faltou|incomplet)\b/i.test(message.content)) continue;
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

export function mergeClosureReviews(deterministic = {}, maestro = null) {
  if (deterministic.verdict === 'blocked') {
    return {
      verdict: maestro?.verdict === 'retry' ? 'retry' : 'blocked',
      reasons: [...(deterministic.reasons || []), ...(maestro?.reasons || [])].filter(Boolean),
      gaps: [...new Set([...(deterministic.gaps || []), ...(maestro?.gaps || [])])],
      nextSteps: maestro?.nextSteps?.length ? maestro.nextSteps : deterministic.nextSteps,
      sources: ['deterministic', maestro?.verdict ? 'maestro' : null].filter(Boolean),
    };
  }
  if (maestro?.verdict === 'blocked' || maestro?.verdict === 'retry') {
    return {
      verdict: maestro.verdict,
      reasons: maestro.reasons.length ? maestro.reasons : deterministic.reasons,
      gaps: [...new Set([...(deterministic.gaps || []), ...(maestro.gaps || [])])],
      nextSteps: maestro.nextSteps.length ? maestro.nextSteps : deterministic.nextSteps,
      sources: ['maestro'],
    };
  }
  if (maestro?.verdict === 'approved') {
    return {
      verdict: deterministic.verdict === 'blocked' ? 'blocked' : 'approved',
      reasons: maestro.reasons.length ? maestro.reasons : deterministic.reasons,
      gaps: deterministic.gaps?.length ? deterministic.gaps : maestro.gaps,
      nextSteps: deterministic.nextSteps?.length ? deterministic.nextSteps : maestro.nextSteps,
      sources: ['deterministic', 'maestro'],
    };
  }
  return { ...deterministic, sources: ['deterministic'] };
}
