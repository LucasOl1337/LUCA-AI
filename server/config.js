import fs from 'node:fs';
import path from 'node:path';

export function readProjectVersion(rootDir = process.cwd()) {
  try {
    const raw = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8');
    const version = String(JSON.parse(raw)?.version || '').trim();
    return version || null;
  } catch {
    return null;
  }
}

export const PACKAGE_VERSION = readProjectVersion();

export const HOST = process.env.HOST ?? '127.0.0.1';
export const PORT = Number(process.env.PORT ?? 4242);
export const ROUTER_API_KEY = process.env.ROUTER_API_KEY ?? process.env.NINE_ROUTER_API_KEY ?? '';
// Producao/Maestro na sennin: 20129. 20128 e nginx e devolve 403.
export const ROUTER_BASE_URL = process.env.ROUTER_BASE_URL ?? 'http://127.0.0.1:20129/v1';
export const ROUTER_TIMEOUT_MS = Number(process.env.ROUTER_TIMEOUT_MS ?? 120000);
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
  ['gpt-5-5', 'GPT 5.5', 'cx/gpt-5.5'],
  ['gpt-5-5-xhigh', 'GPT 5.5 xhigh', 'cx/gpt-5.5-xhigh'],
  ['grok-4-6', 'Grok 4.6', 'gcli/grok-4.6'],
  ['grok-4-5', 'Grok 4.5', 'gcli/grok-4.5'],
  ['grok-4-5-high', 'Grok 4.5 High', 'gcli/grok-4.5-high'],
  ['grok-4-5-medium', 'Grok 4.5 Medium', 'gcli/grok-4.5-medium'],
  ['grok-4-5-low', 'Grok 4.5 Low', 'gcli/grok-4.5-low'],
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

// Geracao de imagem: mesmo caminho do Maestro/Sennin via 9Router POST /images/generations.
// Primario confirmado em producao: cx/gpt-5.5-image (Codex); fallbacks iguais ao Maestro.
const IMAGE_GENERATION_PROFILE_DEFINITIONS = [
  ['gpt-image', 'GPT Image 5.5', 'cx/gpt-5.5-image'],
  ['gpt-image-5.4', 'GPT Image 5.4', 'cx/gpt-5.4-image'],
  ['gpt-image-1', 'GPT Image 1', 'cx/gpt-image-1'],
  ['grok-imagine', 'Grok Imagine', 'xai/grok-imagine-image'],
  ['grok-imagine-quality', 'Grok Imagine Quality', 'xai/grok-imagine-image-quality'],
];

export const IMAGE_GENERATION_CAPABILITIES = Object.freeze({
  api: 'openai-images-generations',
  inputModalities: Object.freeze(['text']),
  outputModalities: Object.freeze(['image']),
  responseFormats: Object.freeze(['b64_json', 'url']),
  aspectRatios: Object.freeze(['1:1', '16:9', '9:16', '4:3', '3:4']),
  sizes: Object.freeze(['1024x1024', '1536x1024', '1024x1536']),
});

export const IMAGE_GENERATION_PROFILES = Object.freeze(
  IMAGE_GENERATION_PROFILE_DEFINITIONS.map(([id, name, model]) => Object.freeze({
    id,
    name,
    model,
    capabilities: IMAGE_GENERATION_CAPABILITIES,
  })),
);

export const IMAGE_GENERATION_ROUTE_IDS = Object.freeze([
  ...new Set(IMAGE_GENERATION_PROFILES.map((profile) => profile.model)),
]);

const IMAGE_GENERATION_ROUTE_ID_SET = new Set(IMAGE_GENERATION_ROUTE_IDS);
const IMAGE_ENGINE_ALIASES = Object.freeze({
  'grok-imagine': 'xai/grok-imagine-image',
  'grok-imagine-2': 'xai/grok-imagine-image',
  'grok-imagine-image': 'xai/grok-imagine-image',
  'imagine': 'xai/grok-imagine-image',
  'imagine-2': 'xai/grok-imagine-image',
  'grok': 'xai/grok-imagine-image',
  'grok-imagine-quality': 'xai/grok-imagine-image-quality',
  'gpt-image': 'cx/gpt-5.5-image',
  'gpt-5.5-image': 'cx/gpt-5.5-image',
  'gpt-image-5.5': 'cx/gpt-5.5-image',
  'gpt-5.4-image': 'cx/gpt-5.4-image',
  'gpt-image-5.4': 'cx/gpt-5.4-image',
  'gpt-image-1': 'cx/gpt-image-1',
  'gpt': 'cx/gpt-5.5-image',
});
const DEFAULT_IMAGE_GENERATION_MODEL = 'cx/gpt-5.5-image';

/** Mapa aspect_ratio → size no formato Maestro/OpenAI images. */
const ASPECT_RATIO_TO_SIZE = Object.freeze({
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '4:3': '1536x1024',
  '9:16': '1024x1536',
  '3:4': '1024x1536',
});

export function imageSizeForAspectRatio(aspectRatio = '16:9') {
  const key = String(aspectRatio || '16:9').trim();
  return ASPECT_RATIO_TO_SIZE[key] || '1536x1024';
}

export function isAllowedImageGenerationModel(value) {
  return IMAGE_GENERATION_ROUTE_ID_SET.has(String(value || '').trim());
}

export function sanitizeImageGenerationModel(value, fallback = DEFAULT_IMAGE_GENERATION_MODEL) {
  const raw = String(value || '').trim();
  const aliased = IMAGE_ENGINE_ALIASES[raw.toLowerCase()] || raw;
  const safeFallback = isAllowedImageGenerationModel(fallback)
    ? String(fallback).trim()
    : DEFAULT_IMAGE_GENERATION_MODEL;
  return isAllowedImageGenerationModel(aliased) ? aliased : safeFallback;
}

export function assertAllowedImageGenerationModel(value) {
  const model = sanitizeImageGenerationModel(value, '');
  if (!isAllowedImageGenerationModel(model)) {
    throw new Error(`9router_image_model_not_allowed: ${String(value || '').trim() || '(vazio)'}`);
  }
  return model;
}

export const IMAGE_GENERATION_MODEL = sanitizeImageGenerationModel(
  process.env.IMAGE_GENERATION_MODEL,
  DEFAULT_IMAGE_GENERATION_MODEL,
);
export const ROUTER_IMAGE_TIMEOUT_MS = Number(process.env.ROUTER_IMAGE_TIMEOUT_MS ?? 180000);
export const VISUAL_PERSONA_SLUG = String(process.env.VISUAL_PERSONA_SLUG || 'especialista-visual').trim()
  || 'especialista-visual';

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

/** Modelo efetivo da persona no LUCA: override local > Yume (se catálogo) > fallback. */
export function resolvePersonaRuntimeModel({
  localModel = '',
  yumeModel = '',
  overrideModel = '',
  fallback = ROUTER_MODEL,
} = {}) {
  if (isAllowed9RouterModel(overrideModel)) return String(overrideModel).trim();
  if (isAllowed9RouterModel(localModel)) return String(localModel).trim();
  if (isAllowed9RouterModel(yumeModel)) return String(yumeModel).trim();
  return sanitize9RouterModel(fallback, ROUTER_MODEL);
}
