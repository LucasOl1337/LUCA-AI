import { KAMUI_BASE } from './kamui-client.js';
import {
  ROUTER_MODEL,
  isAllowed9RouterModel,
  resolvePersonaRuntimeModel,
} from './config.js';

const YUME_AVATAR_PREFIX = '/api/avatars/';

export function normalizeYumeAvatarPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return '';

  const pathname = raw.split('?')[0].split('#')[0];
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!normalized.startsWith(YUME_AVATAR_PREFIX)) return '';
  if (normalized.includes('..') || normalized.includes('\\')) return '';
  return normalized;
}

export function buildYumeAvatarProxyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const avatarPath = normalizeYumeAvatarPath(raw);
  if (!avatarPath) return raw;
  return `/api/personas/avatar?src=${encodeURIComponent(avatarPath)}`;
}

export function buildKamuiYumeAvatarUrl(value) {
  const avatarPath = normalizeYumeAvatarPath(value);
  if (!avatarPath) return '';
  return `${KAMUI_BASE}/kamui/yume${avatarPath}`;
}

export function normalizeYumePersonaForLuca(persona = {}, importedAgents = new Map()) {
  const slug = String(persona.slug || '').trim();
  const avatarUrl = buildYumeAvatarProxyUrl(persona.avatar_url);
  const importedAgent = importedAgents.get(slug);
  const isOfficial = persona.is_official === true;
  const yumeModel = String(persona.model || '').trim();
  const localModel = String(importedAgent?.model || '').trim();
  const model = resolvePersonaRuntimeModel({
    localModel,
    yumeModel,
    fallback: ROUTER_MODEL,
  });
  const modelOverridden = Boolean(
    importedAgent
    && isAllowed9RouterModel(localModel)
    && yumeModel
    && localModel !== yumeModel,
  );

  return {
    slug,
    name: String(persona.name || slug || 'Persona Yume').trim(),
    // Motor efetivo que o LUCA usa no 9Router (sempre preenchido quando possível).
    model,
    yumeModel,
    localModel: isAllowed9RouterModel(localModel) ? localModel : '',
    modelOverridden,
    description: String(persona.description || '').trim(),
    purpose: String(persona.purpose || '').trim(),
    avatar_url: String(persona.avatar_url || '').trim(),
    avatarUrl,
    is_official: isOfficial,
    version: persona.version ?? null,
    updated_at: persona.updated_at ?? null,
    // O roster editorial pertence ao Yume. O estado local guarda somente
    // cache/configuração operacional e nunca decide quem é principal.
    imported: Boolean(slug && isOfficial),
  };
}

export function reconcileOfficialPersonaAgents(personas = [], personaAgents = [], now = new Date().toISOString()) {
  const catalog = Array.isArray(personas) ? personas : [];
  if (catalog.some((persona) => typeof persona?.is_official !== 'boolean')) {
    throw new Error('yume_official_roster_contract_invalid');
  }
  const existingBySlug = new Map(
    (Array.isArray(personaAgents) ? personaAgents : [])
      .map((agent) => [String(agent?.slug || '').trim(), agent])
      .filter(([slug]) => Boolean(slug)),
  );

  const roster = catalog
    .filter((persona) => persona?.is_official === true)
    .map((persona) => {
      const slug = String(persona.slug || '').trim();
      if (!slug) return null;
      const existing = existingBySlug.get(slug);
      return {
        ...(existing || {}),
        id: `yume:${slug}`,
        slug,
        source: 'yume',
        name: String(persona.name || existing?.name || slug).trim(),
        model: String(existing?.model || '').trim(),
        yumeModel: String(persona.model || '').trim(),
        enabled: existing?.enabled !== false,
        cachedVersion: existing?.cachedVersion ?? null,
        cachedSystemPrompt: existing?.cachedSystemPrompt ?? null,
        cachedAt: existing?.cachedAt ?? null,
        lastError: existing?.lastError ?? null,
        addedAt: existing?.addedAt || now,
      };
    })
    .filter(Boolean);

  return {
    roster,
    changed: JSON.stringify(roster) !== JSON.stringify(Array.isArray(personaAgents) ? personaAgents : []),
  };
}

export function normalizeYumePersonasForLuca(personas = [], personaAgents = []) {
  const importedAgents = new Map(
    (Array.isArray(personaAgents) ? personaAgents : [])
      .map((agent) => [String(agent?.slug || '').trim(), agent])
      .filter(([slug]) => Boolean(slug)),
  );
  return (Array.isArray(personas) ? personas : [])
    .map((persona) => normalizeYumePersonaForLuca(persona, importedAgents))
    .filter((persona) => persona.slug);
}
