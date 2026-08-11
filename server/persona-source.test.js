import test from 'node:test';
import assert from 'node:assert/strict';

import { createPersonaSource } from './persona-source.js';

const BUILTIN = {
  slug: 'especialista-visual',
  name: 'Especialista Visual',
  is_official: true,
  model: 'cx/gpt-5.6-sol',
  system_prompt: 'PROMPT BUILTIN VISUAL',
  luca_builtin: true,
};

function memoryCache(initial = []) {
  let records = initial.map((record) => ({ ...record }));
  return {
    list: () => records,
    replace: (next) => {
      records = next.map((record) => ({ ...record }));
      return records;
    },
  };
}

function sourceFixture({ catalog = [], prompts = {}, versions = {}, initial = [], listError = null } = {}) {
  const calls = { list: 0, prompt: [], version: [] };
  const cache = memoryCache(initial);
  const source = createPersonaSource({
    yume: {
      list: async () => {
        calls.list += 1;
        if (listError) throw listError;
        return catalog;
      },
      fetchPrompt: async (slug) => {
        calls.prompt.push(slug);
        const value = prompts[slug];
        if (value instanceof Error) throw value;
        if (!value) throw new Error(`prompt_missing:${slug}`);
        return value;
      },
      fetchVersion: async (slug) => {
        calls.version.push(slug);
        const value = versions[slug];
        if (value instanceof Error) throw value;
        if (value === undefined) throw new Error(`version_missing:${slug}`);
        return { version: value };
      },
    },
    builtin: { list: () => [BUILTIN] },
    cache,
    now: () => new Date('2026-08-11T12:00:00.000Z'),
  });
  return { source, cache, calls };
}

test('Persona Source preserva precedencia autoritativa do Yume sobre builtin com a mesma slug', async () => {
  const { source, cache } = sourceFixture({
    catalog: [
      { ...BUILTIN, name: 'Visual do Yume', model: 'gcli/grok-4.5', luca_builtin: undefined },
      { slug: 'aurora', name: 'Aurora', model: 'kimi/k3', is_official: true },
    ],
  });

  const available = await source.listAvailable();
  assert.equal(available.rosterSource, 'yume.is_official');
  assert.equal(available.personas.length, 2);
  assert.equal(available.personas.find((persona) => persona.slug === BUILTIN.slug)?.name, 'Visual do Yume');
  assert.equal(available.personas.find((persona) => persona.slug === BUILTIN.slug)?.source, 'yume');
  assert.equal(cache.list().find((agent) => agent.slug === BUILTIN.slug)?.source, 'yume');
});

test('Persona Source injeta e resolve builtin ausente sem round-trip de prompt no Kamui', async () => {
  const { source, calls } = sourceFixture({
    catalog: [{ slug: 'aurora', name: 'Aurora', model: 'kimi/k3', is_official: true }],
  });

  const available = await source.listAvailable();
  assert.equal(available.rosterSource, 'yume.is_official+luca.builtin');
  assert.equal(available.personas.find((persona) => persona.slug === BUILTIN.slug)?.source, 'luca-builtin');

  const loaded = await source.resolve(BUILTIN.slug);
  assert.equal(loaded.systemPrompt, 'PROMPT BUILTIN VISUAL');
  assert.equal(loaded.source, 'luca-builtin');
  assert.equal(loaded.builtin, true);
  assert.deepEqual(calls.prompt, []);
});

test('Persona Source mantem cache executavel e builtin quando catalogo Yume fica indisponivel', async () => {
  const { source, cache } = sourceFixture({
    listError: new Error('Kamui fora'),
    prompts: { aurora: new Error('Kamui fora') },
    versions: { aurora: new Error('Kamui fora') },
    initial: [{
      id: 'yume:aurora',
      slug: 'aurora',
      name: 'Aurora',
      source: 'yume',
      isOfficial: true,
      model: '',
      yumeModel: 'kimi/k3',
      enabled: true,
      cachedVersion: 7,
      cachedSystemPrompt: 'PROMPT CACHE AURORA',
      cachedAt: 'antes',
      lastError: null,
      addedAt: 'antes',
    }],
  });

  const available = await source.listAvailable();
  assert.equal(available.rosterSource, 'cache+luca.builtin');
  assert.match(available.warning, /Kamui fora/);
  assert.deepEqual(
    available.personas.map((persona) => persona.slug),
    ['aurora', BUILTIN.slug],
  );
  assert.deepEqual(cache.list().map((agent) => agent.slug), ['aurora', BUILTIN.slug]);

  const loaded = await source.loadMany(['aurora', BUILTIN.slug]);
  assert.equal(loaded.entries[0].loaded.systemPrompt, 'PROMPT CACHE AURORA');
  assert.equal(loaded.entries[0].loaded.stale, true);
  assert.equal(loaded.entries[1].loaded.source, 'luca-builtin');
});

test('Persona Source concentra cache de prompt e precedencia de modelo', async () => {
  const { source, calls } = sourceFixture({
    catalog: [{ slug: 'aurora', name: 'Aurora', model: 'gcli/grok-4.5', is_official: true }],
    prompts: {
      aurora: { name: 'Aurora', model: 'gcli/grok-4.5', system_prompt: 'PROMPT YUME', version: 9 },
    },
    versions: { aurora: 9 },
    initial: [{
      id: 'yume:aurora',
      slug: 'aurora',
      name: 'Aurora',
      source: 'yume',
      isOfficial: true,
      model: 'cx/gpt-5.6-sol-high',
      yumeModel: 'gcli/grok-4.5',
      enabled: true,
      cachedVersion: null,
      cachedSystemPrompt: null,
      addedAt: 'antes',
    }],
  });

  const first = await source.loadMany(['aurora'], {
    modelOverrides: { aurora: 'kimi/k3' },
  });
  assert.equal(first.entries[0].loaded.model, 'kimi/k3');
  assert.equal(first.entries[0].loaded.systemPrompt, 'PROMPT YUME');
  assert.equal(first.entries[0].loaded.cached, false);

  const second = await source.resolve('aurora');
  assert.equal(second.model, 'cx/gpt-5.6-sol-high');
  assert.equal(second.cached, true);
  assert.deepEqual(calls.prompt, ['aurora']);
});

test('Persona Source importa e remove somente secundaria; oficial permanece', async () => {
  const { source, cache } = sourceFixture({
    catalog: [
      { slug: 'aurora', name: 'Aurora', model: 'kimi/k3', is_official: true },
      { slug: 'jinx', name: 'Jinx', model: 'cx/gpt-5.6-sol', is_official: false },
    ],
  });

  const imported = await source.importPersona('jinx');
  assert.equal(imported.agent.slug, 'jinx');
  assert.equal(imported.agent.isOfficial, false);
  assert.equal((await source.removePersona('jinx')).removed, true);

  await source.importPersona('aurora');
  assert.equal((await source.removePersona('aurora')).removed, false);
  assert.ok(cache.list().some((agent) => agent.slug === 'aurora'));
});

test('Persona Source falha alto em catalogo sem contrato editorial', async () => {
  const { source } = sourceFixture({ catalog: [{ slug: 'legada', name: 'Legada' }] });
  await assert.rejects(() => source.listAvailable(), /yume_official_roster_contract_invalid/);
});

test('Persona Source falha alto quando o catalogo nao e uma lista', async () => {
  const { source } = sourceFixture({ catalog: null });
  await assert.rejects(() => source.listAvailable(), /yume_persona_catalog_contract_invalid/);
});
