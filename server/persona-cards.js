import { KAMUI_BASE } from './kamui-client.js';

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

export function normalizeYumePersonaForLuca(persona = {}, importedSlugs = new Set()) {
  const slug = String(persona.slug || '').trim();
  const avatarUrl = buildYumeAvatarProxyUrl(persona.avatar_url);
  return {
    slug,
    name: String(persona.name || slug || 'Persona Yume').trim(),
    model: String(persona.model || '').trim(),
    description: String(persona.description || '').trim(),
    purpose: String(persona.purpose || '').trim(),
    avatar_url: String(persona.avatar_url || '').trim(),
    avatarUrl,
    version: persona.version ?? null,
    updated_at: persona.updated_at ?? null,
    imported: Boolean(slug && importedSlugs.has(slug)),
  };
}

export function normalizeYumePersonasForLuca(personas = [], personaAgents = []) {
  const importedSlugs = new Set(
    (Array.isArray(personaAgents) ? personaAgents : [])
      .map((agent) => String(agent?.slug || '').trim())
      .filter(Boolean),
  );
  return (Array.isArray(personas) ? personas : [])
    .map((persona) => normalizeYumePersonaForLuca(persona, importedSlugs))
    .filter((persona) => persona.slug);
}
