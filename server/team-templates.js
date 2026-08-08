import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { getWorkspaceUserId, requireWorkspaceUserId } from './workspace-context.js';
import { isAllowed9RouterModel, sanitizeAgentModel } from './config.js';
import {
  LUCA_INDIVIDUAL_PRESET_SEED,
  LUCA_TEAM_PRESET_SEED,
  MAX_EXECUTORS,
  MAX_PARTICIPANTS,
  PRESET_ICON_IDS,
  TEAM_ROLE_ORDER,
} from '../shared/luca-preset-seed.js';

const rootStateDir = path.resolve(process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'));
const workspacesRoot = path.join(rootStateDir, 'workspaces');
const MAX_TEMPLATES_PER_KIND = 40;
const ICON_SET = new Set(PRESET_ICON_IDS);

/** @type {Map<string, any>} */
const cache = new Map();

function safeUserDir(userId) {
  const clean = String(userId || '').trim();
  if (!clean) throw new Error('workspace_user_required');
  return createHash('sha256').update(clean).digest('hex').slice(0, 32);
}

function storePathFor(userId) {
  return path.join(workspacesRoot, safeUserDir(userId), 'team-templates.json');
}

function uniqueSlugs(values, limit = Number.POSITIVE_INFINITY) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const slug = String(value || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
    if (result.length >= limit) break;
  }
  return result;
}

function slugifyId(value) {
  const base = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || `tpl-${randomBytes(3).toString('hex')}`;
}

function sanitizeIcon(value) {
  const icon = String(value || '').trim().toLowerCase();
  return ICON_SET.has(icon) ? icon : 'users';
}

function clipText(value, max, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > max ? text.slice(0, max) : text;
}

function sanitizeTemplateModels(rawModels, slugs) {
  if (!rawModels || typeof rawModels !== 'object' || Array.isArray(rawModels)) return {};
  const allowedSlugs = new Set(slugs.filter(Boolean));
  const models = {};
  for (const [rawSlug, rawModel] of Object.entries(rawModels)) {
    const slug = String(rawSlug || '').trim();
    const model = String(rawModel || '').trim();
    if (!allowedSlugs.has(slug) || !isAllowed9RouterModel(model)) continue;
    models[slug] = sanitizeAgentModel(model);
  }
  return models;
}

function sanitizeTeamTemplate(raw = {}, { requireId = false } = {}) {
  const id = clipText(raw.id, 64, '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (requireId && !id) {
    const error = new Error('template_id_required');
    error.code = 'template_id_required';
    throw error;
  }
  const assignments = {};
  for (const roleId of TEAM_ROLE_ORDER) {
    const limit = roleId === 'execution' ? MAX_EXECUTORS : 1;
    const rawList = raw.assignments?.[roleId];
    const list = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
    assignments[roleId] = uniqueSlugs(list, limit);
  }
  const models = sanitizeTemplateModels(raw.models, TEAM_ROLE_ORDER.flatMap((roleId) => assignments[roleId]));
  return {
    id: id || slugifyId(raw.label),
    label: clipText(raw.label, 80, 'Equipe'),
    description: clipText(raw.description, 280, ''),
    icon: sanitizeIcon(raw.icon),
    assignments,
    ...(Object.keys(models).length ? { models } : {}),
  };
}

function sanitizeIndividualTemplate(raw = {}, { requireId = false } = {}) {
  const id = clipText(raw.id, 64, '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (requireId && !id) {
    const error = new Error('template_id_required');
    error.code = 'template_id_required';
    throw error;
  }
  const participants = uniqueSlugs(
    Array.isArray(raw.participants) ? raw.participants : [],
    MAX_PARTICIPANTS,
  );
  const judge = String(raw.judge || '').trim() || null;
  const models = sanitizeTemplateModels(raw.models, [...participants, judge]);
  return {
    id: id || slugifyId(raw.label),
    label: clipText(raw.label, 80, 'Seleção'),
    description: clipText(raw.description, 280, ''),
    icon: sanitizeIcon(raw.icon),
    participants,
    judge,
    ...(Object.keys(models).length ? { models } : {}),
  };
}

function seedStore() {
  return {
    version: 1,
    team: LUCA_TEAM_PRESET_SEED.map((item) => sanitizeTeamTemplate(item)),
    individual: LUCA_INDIVIDUAL_PRESET_SEED.map((item) => sanitizeIndividualTemplate(item)),
  };
}

function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object') return seedStore();
  const team = Array.isArray(raw.team)
    ? raw.team.map((item) => sanitizeTeamTemplate(item)).slice(0, MAX_TEMPLATES_PER_KIND)
    : [];
  const individual = Array.isArray(raw.individual)
    ? raw.individual.map((item) => sanitizeIndividualTemplate(item)).slice(0, MAX_TEMPLATES_PER_KIND)
    : [];
  // Empty both kinds → first-touch seed. Partial data is kept as-is.
  if (!team.length && !individual.length) return seedStore();
  return { version: 1, team, individual };
}

function loadStore(userId) {
  const id = String(userId || '').trim();
  if (!id) throw new Error('workspace_user_required');
  if (cache.has(id)) return cache.get(id);
  const filePath = storePathFor(id);
  let store;
  let created = false;
  try {
    store = normalizeStore(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    store = seedStore();
    created = true;
  }
  cache.set(id, store);
  if (created) persistStore(id, store);
  return store;
}

function persistStore(userId, store) {
  const filePath = storePathFor(userId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, filePath);
}

function withStore(mutator) {
  const userId = requireWorkspaceUserId();
  const store = loadStore(userId);
  const result = mutator(store);
  persistStore(userId, store);
  return result;
}

function kindList(store, kind) {
  if (kind !== 'team' && kind !== 'individual') {
    const error = new Error('invalid_template_kind');
    error.code = 'invalid_template_kind';
    throw error;
  }
  return store[kind];
}

function ensureUniqueId(list, id) {
  if (!list.some((item) => item.id === id)) return id;
  return `${id}-${randomBytes(2).toString('hex')}`;
}

export function getTeamTemplatesSnapshot() {
  const userId = getWorkspaceUserId();
  if (!userId) return seedStore();
  return loadStore(userId);
}

export function createTeamTemplate(kind, template) {
  return withStore((store) => {
    const list = kindList(store, kind);
    if (list.length >= MAX_TEMPLATES_PER_KIND) {
      const error = new Error('template_limit_reached');
      error.code = 'template_limit_reached';
      throw error;
    }
    const sanitized = kind === 'team'
      ? sanitizeTeamTemplate(template)
      : sanitizeIndividualTemplate(template);
    sanitized.id = ensureUniqueId(list, sanitized.id);
    list.push(sanitized);
    return sanitized;
  });
}

export function updateTeamTemplate(kind, id, template) {
  return withStore((store) => {
    const list = kindList(store, kind);
    const cleanId = String(id || '').trim();
    const index = list.findIndex((item) => item.id === cleanId);
    if (index < 0) {
      const error = new Error('template_not_found');
      error.code = 'template_not_found';
      throw error;
    }
    const raw = template?.models === undefined
      ? { ...template, models: list[index].models }
      : template;
    const sanitized = kind === 'team'
      ? sanitizeTeamTemplate({ ...raw, id: cleanId }, { requireId: true })
      : sanitizeIndividualTemplate({ ...raw, id: cleanId }, { requireId: true });
    list[index] = sanitized;
    return sanitized;
  });
}

export function deleteTeamTemplate(kind, id) {
  return withStore((store) => {
    const list = kindList(store, kind);
    const cleanId = String(id || '').trim();
    const before = list.length;
    store[kind] = list.filter((item) => item.id !== cleanId);
    if (store[kind].length === before) {
      const error = new Error('template_not_found');
      error.code = 'template_not_found';
      throw error;
    }
    return { deleted: true, id: cleanId };
  });
}

export function reorderTeamTemplates(kind, ids) {
  return withStore((store) => {
    const list = kindList(store, kind);
    const wanted = Array.isArray(ids) ? ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
    if (wanted.length !== list.length) {
      const error = new Error('template_order_mismatch');
      error.code = 'template_order_mismatch';
      throw error;
    }
    const byId = new Map(list.map((item) => [item.id, item]));
    if (wanted.some((id) => !byId.has(id)) || new Set(wanted).size !== wanted.length) {
      const error = new Error('template_order_mismatch');
      error.code = 'template_order_mismatch';
      throw error;
    }
    store[kind] = wanted.map((id) => byId.get(id));
    return store[kind];
  });
}

/** Test helper: drop in-memory cache between cases. */
export function _resetTeamTemplatesCacheForTests() {
  cache.clear();
}
