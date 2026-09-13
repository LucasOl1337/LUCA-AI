// Catálogo global de personas definido pelo admin.
// Um arquivo só (LUCA_DATA_DIR/persona-catalog.json), sem separação por conta:
// o que o admin decide aqui vale para todo mundo. Nunca escreve no Yume; é
// uma camada de override local por cima do GET do Kamui.

import fs from 'node:fs';
import path from 'node:path';
import { isAllowed9RouterModel } from './config.js';

export const PERSONA_OVERRIDE_FIELDS = Object.freeze([
  'visible',
  'name',
  'description',
  'purpose',
  'systemPrompt',
  'model',
  'avatarUrl',
]);

const TEXT_LIMITS = Object.freeze({
  name: 80,
  description: 600,
  purpose: 300,
  systemPrompt: 24_000,
  avatarUrl: 2_000,
});

function cleanText(value, limit) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  return text.length > limit ? text.slice(0, limit) : text;
}

function cleanAvatarUrl(value) {
  const raw = cleanText(value, TEXT_LIMITS.avatarUrl);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(raw)) return raw;
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('..')) return raw;
  return '';
}

/**
 * Normaliza um patch vindo da API. Só campos conhecidos entram; texto vazio
 * remove o override (volta ao valor do Yume). Modelo fora do catálogo 9Router
 * é descartado em vez de virar fallback silencioso.
 */
export function sanitizePersonaOverride(patch = {}, current = {}) {
  const next = { ...current };
  if (Object.prototype.hasOwnProperty.call(patch, 'visible')) {
    if (patch.visible === null || patch.visible === undefined) delete next.visible;
    else next.visible = Boolean(patch.visible);
  }
  for (const field of ['name', 'description', 'purpose', 'systemPrompt']) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const text = cleanText(patch[field], TEXT_LIMITS[field]);
    if (text) next[field] = text;
    else delete next[field];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'model')) {
    const model = String(patch.model ?? '').trim();
    if (model && isAllowed9RouterModel(model)) next.model = model;
    else delete next.model;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'avatarUrl')) {
    const avatarUrl = cleanAvatarUrl(patch.avatarUrl);
    if (avatarUrl) next.avatarUrl = avatarUrl;
    else delete next.avatarUrl;
  }
  return next;
}

export function isEmptyPersonaOverride(override = {}) {
  return !PERSONA_OVERRIDE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(override, field));
}

function normalizeStore(parsed) {
  const personas = {};
  const raw = parsed && typeof parsed === 'object' && parsed.personas && typeof parsed.personas === 'object'
    ? parsed.personas
    : {};
  for (const [slug, value] of Object.entries(raw)) {
    const clean = String(slug || '').trim();
    if (!clean || !value || typeof value !== 'object') continue;
    const override = sanitizePersonaOverride(value, {});
    if (!isEmptyPersonaOverride(override)) personas[clean] = override;
  }
  return {
    version: 1,
    updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
    personas,
  };
}

export function createPersonaCatalogConfig({
  filePath,
  now = () => new Date(),
} = {}) {
  const target = path.resolve(filePath || path.join(
    process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'),
    'persona-catalog.json',
  ));
  let store = null;

  function load() {
    if (store) return store;
    try {
      store = normalizeStore(JSON.parse(fs.readFileSync(target, 'utf8')));
    } catch {
      store = normalizeStore(null);
    }
    return store;
  }

  function persist() {
    const current = load();
    current.updatedAt = now().toISOString();
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(current, null, 2));
      fs.renameSync(tmp, target);
    } catch (error) {
      // Persistência não derruba o runtime; o override vive em memória até o próximo save.
      console.warn(`[persona-catalog] falha ao gravar ${target}: ${error?.message || error}`);
    }
    return current;
  }

  function snapshot() {
    const current = load();
    return {
      version: current.version,
      updatedAt: current.updatedAt,
      personas: Object.fromEntries(
        Object.entries(current.personas).map(([slug, override]) => [slug, { ...override }]),
      ),
    };
  }

  function get(slug) {
    const clean = String(slug || '').trim();
    const override = load().personas[clean];
    return override ? { ...override } : {};
  }

  function set(slug, patch = {}) {
    const clean = String(slug || '').trim();
    if (!clean) throw new Error('persona_slug_required');
    const current = load();
    const next = sanitizePersonaOverride(patch, current.personas[clean] || {});
    if (isEmptyPersonaOverride(next)) delete current.personas[clean];
    else current.personas[clean] = next;
    persist();
    return get(clean);
  }

  function reset(slug) {
    const clean = String(slug || '').trim();
    const current = load();
    const existed = Boolean(current.personas[clean]);
    delete current.personas[clean];
    if (existed) persist();
    return existed;
  }

  function isVisible(slug) {
    return get(slug).visible !== false;
  }

  return {
    filePath: target,
    get,
    set,
    reset,
    isVisible,
    snapshot,
  };
}
