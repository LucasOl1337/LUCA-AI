// Classificacao de intencao da missao (portado do modulo Maestro do VideoGen,
// adaptado ao shape de missao do LUCA-AI: { title, description, success }).

export function primaryMissionText(mission = {}) {
  return String(mission?.description || mission?.title || '').trim();
}

export function missionFullText(mission = {}) {
  return `${primaryMissionText(mission)}\n${String(mission?.success || '')}`.trim();
}

export function missionRequestsAgentConversation(mission = {}) {
  const description = String(mission?.description || mission?.title || '').toLowerCase();
  if (!description.trim()) return false;
  const mentionsConversation = /\b(conversar|conversarem|conversem|conversa|dialogar|discutir|debater|brainstorm)\b/i.test(description)
    && /\b(supervisor|pesquisador|planejador|designer|agente|agentes)\b/i.test(description);
  const explicitlyRequestsDashboard = /\b(dashboard|canvas|grafico|gr[aá]fico|relatorio|relat[oó]rio)\b/i.test(description);
  return mentionsConversation && !explicitlyRequestsDashboard;
}

export function missionRequestsAllAgents(mission = {}) {
  const text = missionFullText(mission).toLowerCase();
  return /\b(todos os agentes|todos agentes|todas? os agentes|cada agente|agentes devem|agentes precisam)\b/i.test(text);
}

export function missionRequestsChatOnlyAction(mission = {}) {
  const text = primaryMissionText(mission).toLowerCase();
  if (!text.trim()) return false;
  if (missionRequestsAgentConversation(mission)) return false;

  const mentionsAgents = /\b(agente|agentes|supervisor|pesquisador|planejador|designer|luca)\b/i.test(text);
  if (!mentionsAgents) return false;

  // Se pede explicitamente um artefato visual, e missao de dashboard, nao chat puro.
  const asksDashboard = /\b(dashboard|canvas|grafico|gr[aá]fico|relatorio|relat[oó]rio|visualiz)\b/i.test(text);
  if (asksDashboard) return false;

  const asksChat = /\b(chat|global|mensagem|mandem|manda|mandar|respondam|responder|digam|dizer|falem|falar|oi|ola|ol[aá])\b/i.test(text);
  const asksAgentAction = /\b(contar|contem|conte|piada|piadas|brincadeira|historia|historias|escolh(er|a|am|em)|avali(ar|e|em)|julgar|reag(ir|em|am|e)|debater|recomend(ar|e|em)|analis(ar|e|em))\b/i.test(text);
  const asksAllAgents = missionRequestsAllAgents(mission);

  return asksChat || asksAgentAction || asksAllAgents;
}

export function missionNeedsSupervisorJudgment(mission = {}) {
  const text = missionFullText(mission).toLowerCase();
  return /\b(escolh(er|a|am|em)|avali(ar|e|em)|julgar|decid(ir|e|a)|melhor|vencedor|vencedora|nota)\b/i.test(text);
}

export function classifyMissionIntent(mission = {}) {
  if (missionRequestsAgentConversation(mission)) return 'agent_conversation';
  if (missionRequestsChatOnlyAction(mission)) return 'chat_only';
  return 'dashboard_build';
}

export function parseAgentConversationDurationMs(mission = {}) {
  const text = String(mission?.description || mission?.title || '').toLowerCase();
  let totalMs = 0;
  const minuteMatch = text.match(/(\d+)\s*(?:minuto|minutos|min)\b/);
  const secondMatch = text.match(/(\d+)\s*(?:segundo|segundos|seg)\b/);
  if (minuteMatch) totalMs += Number(minuteMatch[1]) * 60_000;
  if (secondMatch) totalMs += Number(secondMatch[1]) * 1000;
  if (!totalMs) totalMs = 60_000;
  return Math.max(15_000, Math.min(5 * 60_000, totalMs));
}
