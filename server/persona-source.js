import {
  ROUTER_MODEL,
  isAllowed9RouterModel,
  resolvePersonaRuntimeModel,
} from './config.js';
import { normalizeYumePersonasForLuca } from './persona-cards.js';

function errorMessage(error) {
  return String(error?.message || error || 'persona_source_failed');
}

function publicBuiltinPersona(persona = {}) {
  return {
    slug: String(persona.slug || '').trim(),
    name: String(persona.name || persona.slug || '').trim(),
    is_official: true,
    model: String(persona.model || '').trim(),
    purpose: String(persona.purpose || '').trim(),
    description: String(persona.description || '').trim(),
    luca_builtin: true,
    source: 'luca-builtin',
    version: 'luca-builtin',
  };
}

function catalogPersonaFromCache(agent = {}) {
  const builtin = agent.source === 'luca-builtin';
  return {
    slug: String(agent.slug || '').trim(),
    name: String(agent.name || agent.slug || '').trim(),
    is_official: builtin || agent.isOfficial === true,
    model: String(agent.yumeModel || '').trim(),
    version: agent.cachedVersion ?? null,
    luca_builtin: builtin || undefined,
    source: builtin ? 'luca-builtin' : 'cache',
  };
}

function sameRecords(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function personaRecord(persona, existing, now) {
  const slug = String(persona?.slug || existing?.slug || '').trim();
  if (!slug) return null;
  const builtin = persona?.luca_builtin === true || persona?.source === 'luca-builtin';
  return {
    ...(existing || {}),
    id: `yume:${slug}`,
    slug,
    source: builtin ? 'luca-builtin' : 'yume',
    isOfficial: persona?.is_official === true,
    name: String(persona?.name || existing?.name || slug).trim(),
    model: String(existing?.model || '').trim(),
    yumeModel: String(persona?.model || existing?.yumeModel || '').trim(),
    enabled: existing?.enabled !== false,
    cachedVersion: existing?.cachedVersion ?? null,
    cachedSystemPrompt: existing?.cachedSystemPrompt ?? null,
    cachedAt: existing?.cachedAt ?? null,
    lastError: existing?.lastError ?? null,
    addedAt: existing?.addedAt || now,
  };
}

function buildRoster(catalog, current, now) {
  if (catalog.some((persona) => typeof persona?.is_official !== 'boolean')) {
    throw new Error('yume_official_roster_contract_invalid');
  }
  const catalogBySlug = new Map(
    catalog
      .map((persona) => [String(persona?.slug || '').trim(), persona])
      .filter(([slug]) => Boolean(slug)),
  );
  const currentBySlug = new Map(
    current
      .map((agent) => [String(agent?.slug || '').trim(), agent])
      .filter(([slug]) => Boolean(slug)),
  );

  const official = catalog
    .filter((persona) => persona?.is_official === true)
    .map((persona) => personaRecord(
      persona,
      currentBySlug.get(String(persona.slug || '').trim()),
      now,
    ))
    .filter(Boolean);
  const officialSlugs = new Set(official.map((agent) => agent.slug));
  const retainedSecondaries = [];
  for (const [slug, existing] of currentBySlug) {
    if (officialSlugs.has(slug)) continue;
    const persona = catalogBySlug.get(slug);
    if (!persona || persona.is_official === true) continue;
    retainedSecondaries.push(personaRecord(persona, existing, now));
  }
  return [...official, ...retainedSecondaries];
}

function loadedPersona(slug, {
  name,
  systemPrompt,
  yumeModel = '',
  localModel = '',
  modelOverride = '',
  version = null,
  cached = false,
  stale = false,
  builtin = false,
  warning = '',
  source = 'yume',
} = {}) {
  const model = resolvePersonaRuntimeModel({
    localModel,
    yumeModel,
    overrideModel: modelOverride,
    fallback: ROUTER_MODEL,
  });
  return {
    name: name || slug,
    model,
    yumeModel,
    localModel: isAllowed9RouterModel(localModel) ? localModel : '',
    modelOverridden: Boolean(
      (isAllowed9RouterModel(modelOverride) && modelOverride !== yumeModel)
      || (isAllowed9RouterModel(localModel) && yumeModel && localModel !== yumeModel),
    ),
    systemPrompt,
    version,
    cached,
    source,
    ...(stale ? { stale: true } : {}),
    ...(builtin ? { builtin: true } : {}),
    ...(warning ? { warning } : {}),
  };
}

export function createPersonaSource({
  yume,
  builtin,
  cache,
  workspaces = null,
  now = () => new Date(),
} = {}) {
  if (typeof yume?.list !== 'function'
    || typeof yume?.fetchPrompt !== 'function'
    || typeof yume?.fetchVersion !== 'function') {
    throw new Error('persona_source_yume_adapter_required');
  }
  if (typeof builtin?.list !== 'function') {
    throw new Error('persona_source_builtin_adapter_required');
  }
  if (typeof cache?.list !== 'function' || typeof cache?.replace !== 'function') {
    throw new Error('persona_source_cache_adapter_required');
  }

  function builtinPersonas() {
    return builtin.list().filter((persona) => String(persona?.slug || '').trim());
  }

  function findBuiltin(slug) {
    const clean = String(slug || '').trim();
    return builtinPersonas().find((persona) => String(persona.slug || '').trim() === clean) || null;
  }

  function replaceIfChanged(next) {
    const current = cache.list();
    if (sameRecords(current, next)) return { roster: current, changed: false };
    return { roster: cache.replace(next), changed: true };
  }

  function seedBuiltinPrompts(roster) {
    const builtins = new Map(builtinPersonas().map((persona) => [String(persona.slug), persona]));
    const timestamp = now().toISOString();
    return roster.map((agent) => {
      if (agent.source !== 'luca-builtin') return agent;
      const definition = builtins.get(agent.slug);
      const systemPrompt = String(definition?.system_prompt || '').trim();
      if (!systemPrompt) return agent;
      return {
        ...agent,
        name: definition.name || agent.name,
        yumeModel: String(definition.model || agent.yumeModel || '').trim(),
        cachedSystemPrompt: systemPrompt,
        cachedVersion: 'luca-builtin',
        cachedAt: agent.cachedAt || timestamp,
        lastError: null,
      };
    });
  }

  function ensureBuiltinsDuringOutage(current) {
    const next = current.slice();
    const present = new Set(next.map((agent) => String(agent?.slug || '').trim()).filter(Boolean));
    const timestamp = now().toISOString();
    for (const definition of builtinPersonas()) {
      const slug = String(definition.slug || '').trim();
      if (!slug || present.has(slug)) continue;
      next.push(personaRecord(publicBuiltinPersona(definition), null, timestamp));
      present.add(slug);
    }
    return seedBuiltinPrompts(next);
  }

  function patchCachedPersona(slug, patch) {
    const current = cache.list();
    let updated = null;
    const next = current.map((agent) => {
      if (agent.slug !== slug) return agent;
      updated = { ...agent, ...patch };
      return updated;
    });
    if (updated && !sameRecords(current, next)) cache.replace(next);
    return updated;
  }

  function saveCatalogPersona(persona) {
    const current = cache.list();
    const slug = String(persona?.slug || '').trim();
    const existingIndex = current.findIndex((agent) => agent.slug === slug);
    const existing = existingIndex >= 0 ? current[existingIndex] : null;
    const record = personaRecord(persona, existing, now().toISOString());
    if (!record) return null;
    const next = current.slice();
    if (existingIndex >= 0) next[existingIndex] = record;
    else next.push(record);
    const seeded = seedBuiltinPrompts(next);
    replaceIfChanged(seeded);
    return cache.list().find((agent) => agent.slug === slug) || record;
  }

  async function readCatalog() {
    let yumeCatalog;
    try {
      yumeCatalog = await yume.list();
    } catch (error) {
      return {
        yumeAvailable: false,
        catalog: builtinPersonas().map(publicBuiltinPersona),
        rosterSource: 'cache+luca.builtin',
        warning: errorMessage(error),
      };
    }
    if (!Array.isArray(yumeCatalog)) {
      throw new Error('yume_persona_catalog_contract_invalid');
    }
    const catalog = yumeCatalog.slice();
    if (catalog.some((persona) => typeof persona?.is_official !== 'boolean')) {
      throw new Error('yume_official_roster_contract_invalid');
    }
    const present = new Set(catalog.map((persona) => String(persona?.slug || '').trim()).filter(Boolean));
    let addedBuiltin = false;
    for (const definition of builtinPersonas()) {
      const publicPersona = publicBuiltinPersona(definition);
      if (!publicPersona.slug || present.has(publicPersona.slug)) continue;
      catalog.push(publicPersona);
      present.add(publicPersona.slug);
      addedBuiltin = true;
    }
    return {
      yumeAvailable: true,
      catalog,
      rosterSource: addedBuiltin ? 'yume.is_official+luca.builtin' : 'yume.is_official',
      warning: '',
    };
  }

  function applyCatalog(read) {
    const current = cache.list();
    let roster;
    let personas;
    if (read.yumeAvailable) {
      roster = seedBuiltinPrompts(buildRoster(read.catalog, current, now().toISOString()));
      personas = read.catalog;
    } else {
      roster = ensureBuiltinsDuringOutage(current);
      const cachedCatalog = roster.map(catalogPersonaFromCache).filter((persona) => persona.slug);
      const present = new Set(cachedCatalog.map((persona) => persona.slug));
      personas = cachedCatalog.slice();
      for (const persona of read.catalog) {
        if (present.has(persona.slug)) continue;
        personas.push(persona);
      }
    }
    const persisted = replaceIfChanged(roster);
    return {
      ...read,
      personas,
      roster: persisted.roster,
      changed: persisted.changed,
    };
  }

  async function syncRoster() {
    return applyCatalog(await readCatalog());
  }

  async function syncAllRosters() {
    if (typeof workspaces?.list !== 'function' || typeof workspaces?.run !== 'function') {
      throw new Error('persona_source_workspace_adapter_required');
    }
    const read = await readCatalog();
    let changedWorkspaces = 0;
    for (const userId of workspaces.list()) {
      await workspaces.run(userId, () => {
        const result = applyCatalog(read);
        if (result.changed) {
          changedWorkspaces += 1;
          workspaces.changed?.(userId);
        }
      });
    }
    return { ...read, changedWorkspaces };
  }

  function builtinResolution(slug, persona, modelOverride, warning = '') {
    const definition = findBuiltin(slug);
    const systemPrompt = String(definition?.system_prompt || persona?.cachedSystemPrompt || '').trim();
    if (!definition || !systemPrompt) return null;
    return loadedPersona(slug, {
      name: definition.name || persona?.name || slug,
      systemPrompt,
      yumeModel: String(definition.model || persona?.yumeModel || '').trim(),
      localModel: String(persona?.model || '').trim(),
      modelOverride,
      version: 'luca-builtin',
      cached: true,
      stale: Boolean(warning),
      builtin: true,
      warning,
      source: 'luca-builtin',
    });
  }

  async function resolve(slug, { modelOverride = '' } = {}) {
    const clean = String(slug || '').trim();
    if (!clean) throw new Error('persona_slug_required');
    let persona = cache.list().find((agent) => agent.slug === clean) || null;
    if (persona?.source === 'luca-builtin' || (!persona && findBuiltin(clean))) {
      const resolvedBuiltin = builtinResolution(clean, persona, modelOverride);
      if (resolvedBuiltin) return resolvedBuiltin;
    }

    let currentVersion = null;
    try {
      const versionInfo = await yume.fetchVersion(clean);
      currentVersion = versionInfo?.version ?? null;
      if (persona?.cachedSystemPrompt && persona.cachedVersion === currentVersion) {
        return loadedPersona(clean, {
          name: persona.name || clean,
          systemPrompt: persona.cachedSystemPrompt,
          yumeModel: String(persona.yumeModel || '').trim(),
          localModel: String(persona.model || '').trim(),
          modelOverride,
          version: currentVersion,
          cached: true,
          source: 'cache',
        });
      }
    } catch {
      // Version e uma otimizacao. Ainda tenta o prompt autoritativo do Yume.
    }

    try {
      const data = await yume.fetchPrompt(clean);
      const systemPrompt = String(data?.system_prompt || '').trim();
      if (!systemPrompt) throw new Error(`persona_system_prompt_empty:${clean}`);
      currentVersion = currentVersion ?? data?.version ?? null;
      const yumeModel = String(data?.model || persona?.yumeModel || '').trim();
      persona = patchCachedPersona(clean, {
        cachedSystemPrompt: systemPrompt,
        cachedVersion: currentVersion,
        cachedAt: now().toISOString(),
        name: data?.name || persona?.name || clean,
        yumeModel,
        source: 'yume',
        lastError: null,
      }) || persona;
      return loadedPersona(clean, {
        name: data?.name || persona?.name || clean,
        systemPrompt,
        yumeModel,
        localModel: String(persona?.model || '').trim(),
        modelOverride,
        version: currentVersion,
        cached: false,
        source: 'yume',
      });
    } catch (error) {
      const warning = errorMessage(error);
      const resolvedBuiltin = builtinResolution(clean, persona, modelOverride, warning);
      if (resolvedBuiltin) return resolvedBuiltin;
      if (persona?.cachedSystemPrompt) {
        patchCachedPersona(clean, { lastError: warning });
        return loadedPersona(clean, {
          name: persona.name || clean,
          systemPrompt: persona.cachedSystemPrompt,
          yumeModel: String(persona.yumeModel || '').trim(),
          localModel: String(persona.model || '').trim(),
          modelOverride,
          version: persona.cachedVersion ?? null,
          cached: true,
          stale: true,
          warning,
          source: 'cache',
        });
      }
      throw error;
    }
  }

  async function loadMany(slugs, { modelOverrides = {} } = {}) {
    const requested = [...new Set(
      (Array.isArray(slugs) ? slugs : [])
        .map((slug) => String(slug || '').trim())
        .filter(Boolean),
    )];
    const snapshot = await syncRoster();
    const catalogBySlug = new Map(snapshot.personas.map((persona) => [String(persona.slug), persona]));
    const missingSlugs = requested.filter((slug) => !catalogBySlug.has(slug));
    if (missingSlugs.length) {
      const error = new Error('Uma ou mais personas nao existem nas fontes disponiveis.');
      error.code = 'persona_not_found';
      error.details = { missingSlugs, rosterSource: snapshot.rosterSource };
      throw error;
    }
    for (const slug of requested) {
      if (!cache.list().some((agent) => agent.slug === slug)) {
        saveCatalogPersona(catalogBySlug.get(slug));
      }
    }
    const entries = await Promise.all(requested.map(async (slug) => {
      try {
        return { slug, loaded: await resolve(slug, { modelOverride: modelOverrides[slug] || '' }) };
      } catch (error) {
        return { slug, error: errorMessage(error) };
      }
    }));
    return { entries, rosterSource: snapshot.rosterSource, warning: snapshot.warning };
  }

  async function listAvailable() {
    const snapshot = await syncRoster();
    return {
      personas: normalizeYumePersonasForLuca(snapshot.personas, snapshot.roster),
      rosterSource: snapshot.rosterSource,
      warning: snapshot.warning || undefined,
    };
  }

  async function importPersona(slug) {
    const clean = String(slug || '').trim();
    if (!clean) throw new Error('slug_required');
    const snapshot = await syncRoster();
    const persona = snapshot.personas.find((item) => String(item?.slug || '').trim() === clean);
    if (!persona) {
      const error = new Error('persona_not_found');
      error.code = 'persona_not_found';
      error.status = 404;
      throw error;
    }
    return {
      agent: saveCatalogPersona(persona),
      synchronized: true,
      rosterSource: persona.source === 'luca-builtin'
        ? 'luca.builtin'
        : persona.source === 'cache'
          ? snapshot.rosterSource
          : persona.is_official === true ? 'yume.is_official' : 'yume.secondary',
    };
  }

  async function removePersona(slug) {
    const clean = String(slug || '').trim();
    const existed = cache.list().some((agent) => agent.slug === clean);
    const snapshot = await syncRoster();
    const persona = snapshot.personas.find((item) => String(item?.slug || '').trim() === clean);
    if (existed && persona?.is_official !== true) {
      cache.replace(cache.list().filter((agent) => agent.slug !== clean));
    }
    const remains = cache.list().some((agent) => agent.slug === clean);
    return {
      removed: existed && !remains,
      synchronized: true,
      rosterSource: snapshot.rosterSource,
    };
  }

  return {
    importPersona,
    listAvailable,
    loadMany,
    removePersona,
    resolve,
    syncAllRosters,
    syncRoster,
  };
}
