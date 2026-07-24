export const HOST = process.env.HOST ?? '127.0.0.1';
export const PORT = Number(process.env.PORT ?? 4242);
export const ROUTER_API_KEY = process.env.ROUTER_API_KEY ?? process.env.NINE_ROUTER_API_KEY ?? '';
export const ROUTER_BASE_URL = process.env.ROUTER_BASE_URL ?? 'http://127.0.0.1:20128/v1';
export const ROUTER_TIMEOUT_MS = Number(process.env.ROUTER_TIMEOUT_MS ?? 45000);
export const REQUIRE_CLOUDFLARE_ACCESS = process.env.REQUIRE_CLOUDFLARE_ACCESS === 'true';
export const CLOUDFLARE_ACCESS_EMAILS = Object.freeze(
  String(process.env.CLOUDFLARE_ACCESS_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
export const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX ?? 240);
export const API_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60000);

// Catalogo fechado do 9Router. O nivel de esforco faz parte da propria rota;
// o LUCA nao cria variants nem envia controles de raciocinio ao provider.
const NINE_ROUTER_PROFILE_DEFINITIONS = [
  ['claude-fable-5', 'Claude Fable 5', 'cc/claude-fable-5'],
  ['claude-opus-4-8-alto', 'Claude Opus 4.8 Alto', 'cc/claude-opus-4-8(max)'],
  ['gpt-5-6-sol-normal', 'GPT 5.6 Sol Normal', 'cx/gpt-5.6-sol'],
  ['gpt-5-6-sol-high', 'GPT 5.6 Sol High', 'cx/gpt-5.6-sol-high'],
  ['gpt-5-6-sol-xhigh', 'GPT 5.6 Sol xhigh', 'cx/gpt-5.6-sol-xhigh'],
  ['gpt-5-6-sol-ultra', 'GPT 5.6 Sol Ultra', 'cx/gpt-5.6-sol-xhigh'],
  ['gpt-5-6-luna-xhigh', 'GPT 5.6 Luna xhigh', 'cx/gpt-5.6-luna-xhigh'],
  ['gpt-5-6-luna-ultra', 'GPT 5.6 Luna Ultra', 'cx/gpt-5.6-luna-xhigh'],
  ['gpt-5-5-xhigh', 'GPT 5.5 xhigh', 'cx/gpt-5.5-xhigh'],
  ['grok-4-5', 'Grok 4.5', 'gcli/grok-4.5'],
  ['kimi-k3-general', 'Kimi K3 General', 'kimi/kimi-k3'],
  ['kimi-k3-code', 'Kimi K3 Code', 'kimi/k3'],
  ['kimi-k2-7-code', 'Kimi K2.7 Code', 'kimi/kimi-for-coding'],
  ['kimi-k2-7-code-highspeed', 'Kimi K2.7 Code HighSpeed', 'kimi/kimi-for-coding-highspeed'],
];

export const NINE_ROUTER_CAPABILITIES = Object.freeze({
  api: 'openai-chat-completions',
  inputModalities: Object.freeze(['text', 'image']),
  outputModalities: Object.freeze(['text']),
  attachments: true,
  toolCalling: true,
  temperature: true,
  maxTokens: true,
});

export const NINE_ROUTER_MODEL_PROFILES = Object.freeze(
  NINE_ROUTER_PROFILE_DEFINITIONS.map(([id, name, model]) => Object.freeze({
    id,
    name,
    model,
    capabilities: NINE_ROUTER_CAPABILITIES,
  })),
);

export const NINE_ROUTER_ROUTE_IDS = Object.freeze([
  ...new Set(NINE_ROUTER_MODEL_PROFILES.map((profile) => profile.model)),
]);

const NINE_ROUTER_ROUTE_ID_SET = new Set(NINE_ROUTER_ROUTE_IDS);
const DEFAULT_ROUTER_MODEL = 'cx/gpt-5.6-sol';
const DEFAULT_SPECIALIST_MODEL = 'cx/gpt-5.5-xhigh';

export function isAllowed9RouterModel(value) {
  return NINE_ROUTER_ROUTE_ID_SET.has(String(value || '').trim());
}

export function sanitize9RouterModel(value, fallback = DEFAULT_ROUTER_MODEL) {
  const model = String(value || '').trim();
  const safeFallback = isAllowed9RouterModel(fallback) ? String(fallback).trim() : DEFAULT_ROUTER_MODEL;
  return isAllowed9RouterModel(model) ? model : safeFallback;
}

export function assertAllowed9RouterModel(value) {
  const model = String(value || '').trim();
  if (!isAllowed9RouterModel(model)) {
    throw new Error(`9router_model_not_allowed: ${model || '(vazio)'}`);
  }
  return model;
}

export const ROUTER_MODEL = sanitize9RouterModel(process.env.ROUTER_MODEL, DEFAULT_ROUTER_MODEL);
export const MISSION_TRANSFORMER_MODEL = sanitize9RouterModel(process.env.MISSION_TRANSFORMER_MODEL, DEFAULT_SPECIALIST_MODEL);
export const DESIGNER_MODEL = sanitize9RouterModel(process.env.DESIGNER_MODEL, DEFAULT_SPECIALIST_MODEL);
export const MAESTRO_MODEL = sanitize9RouterModel(process.env.MAESTRO_MODEL, DEFAULT_SPECIALIST_MODEL);

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
  return sanitize9RouterModel(value, fallback);
}
