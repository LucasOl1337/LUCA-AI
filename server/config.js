export const PORT = Number(process.env.PORT ?? 4242);
export const ROUTER_API_KEY = process.env.ROUTER_API_KEY ?? process.env.NINE_ROUTER_API_KEY ?? '';
export const ROUTER_BASE_URL = process.env.ROUTER_BASE_URL ?? 'http://127.0.0.1:20128/v1';
export const ROUTER_MODEL = process.env.ROUTER_MODEL ?? 'cx/gpt-5.4-mini-xhigh';
export const ROUTER_TIMEOUT_MS = Number(process.env.ROUTER_TIMEOUT_MS ?? 45000);
export const MISSION_TRANSFORMER_MODEL = process.env.MISSION_TRANSFORMER_MODEL ?? 'cx/gpt-5.5';
export const DESIGNER_MODEL = process.env.DESIGNER_MODEL ?? 'cx/gpt-5.5';
export const MAESTRO_MODEL = process.env.MAESTRO_MODEL ?? 'cx/gpt-5.5';

export const AGENTS = [
  { id: 'maestro', role: 'router', name: 'Maestro', model: MAESTRO_MODEL },
  { id: 'transformador-missao', role: 'mission-transformer', name: 'Transformador de Missao', model: MISSION_TRANSFORMER_MODEL },
  { id: 'supervisor', role: 'supervisor', name: 'Supervisor', model: ROUTER_MODEL },
  { id: 'planejador', role: 'planner', name: 'Planejador', model: ROUTER_MODEL },
  { id: 'pesquisador', role: 'researcher', name: 'Pesquisador', model: ROUTER_MODEL },
  { id: 'designer', role: 'designer', name: 'Designer', model: DESIGNER_MODEL },
];

export const AGENT_ALIASES = {
  'riscos-campo': 'pesquisador',
};

// Agentes ligados por padrao quando nenhuma configuracao foi salva ainda.
export const ACTIVE_AGENT_IDS = new Set(AGENTS.map((agent) => agent.id));

// Agentes sistemicos que nao podem ser desligados pela UI/config.
export const FORCE_ENABLED_AGENT_IDS = new Set(['maestro']);

// Agentes cuja contribuicao real no chat e exigida para encerrar missoes de
// conversa/chat com "todos os agentes".
export const CLOSURE_PERFORMER_AGENT_IDS = new Set(['planejador', 'pesquisador']);

// Parceiro padrao do Supervisor numa missao de conversa entre agentes.
export const CONVERSATION_PARTNER_AGENT_ID = 'pesquisador';

export const MAX_CLOSURE_ATTEMPTS = 5;

export function defaultAgentEnabled(agentId) {
  if (FORCE_ENABLED_AGENT_IDS.has(agentId)) return true;
  return ACTIVE_AGENT_IDS.has(agentId);
}

export function normalizeAgentEnabled(agentId, value) {
  if (FORCE_ENABLED_AGENT_IDS.has(agentId)) return true;
  if (typeof value === 'boolean') return value;
  return defaultAgentEnabled(agentId);
}

export function defaultAgentModel(agentId) {
  return AGENTS.find((agent) => agent.id === agentId)?.model ?? ROUTER_MODEL;
}

export function sanitizeAgentModel(value, fallback = ROUTER_MODEL) {
  const model = String(value || '').trim();
  return model || fallback;
}
