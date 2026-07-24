import assert from 'node:assert/strict';
import test from 'node:test';

import { ROUTER_MODEL } from './config.js';
import { createPersonaWorkbench } from './persona-workbench.js';

function memoryStore(initial = []) {
  let records = [...initial];
  return {
    list: () => records.map((record) => ({ ...record })),
    upsert(entry) {
      const record = { id: `yume:${entry.slug}`, source: 'yume', ...entry };
      records = [record, ...records.filter((item) => item.slug !== entry.slug)];
      return record;
    },
    remove(slug) {
      const before = records.length;
      records = records.filter((record) => record.slug !== slug);
      return records.length !== before;
    },
  };
}

test('persona-workbench concentra catalogo, importacao e workflow no mesmo interface', async () => {
  const loggedEvents = [];
  const store = memoryStore();
  const workbench = createPersonaWorkbench({
    store,
    kamui: {
      listPersonas: async () => [{ slug: 'tars', name: 'TARS', model: 'modelo-tars' }],
      fetchPrompt: async (slug) => ({ slug, name: 'TARS', model: 'modelo-tars', system_prompt: 'Voce e TARS.' }),
      getVersion: async () => ({ version: 7 }),
      health: async () => true,
    },
    router: {
      call: async ({ agentId }) => `resultado de ${agentId}`,
      health: async () => ({ ok: true, status: 200 }),
    },
    events: {
      append: (event) => {
        const saved = { id: `evt-${loggedEvents.length + 1}`, time: new Date().toISOString(), ...event };
        loggedEvents.push(saved);
        return saved;
      },
      list: ({ traceId } = {}) => loggedEvents.filter((event) => !traceId || event.traceId === traceId),
    },
  });

  assert.equal((await workbench.listPersonas())[0].imported, false);
  const imported = await workbench.importPersona('tars');
  assert.equal(imported.cachedVersion, 7);
  assert.ok(loggedEvents.some((event) => event.type === 'persona.added'));
  assert.equal((await workbench.listPersonas())[0].imported, true);

  const result = await workbench.run({
    mission: 'Simplificar o produto',
    traceId: 'trace-workbench',
    workflow: {
      supervisor: 'tars',
      mission: 'tars',
      execution: ['tars'],
      approval: 'tars',
      display: 'tars',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.steps.length, 5);
  assert.equal(result.finalDisplay.roleId, 'display');
  assert.match(result.finalDisplay.content, /resultado de luca-ai-team-tars/);
  assert.ok(workbench.listEvents({ traceId: 'trace-workbench' }).length >= 12);
  assert.equal(workbench.removePersona('tars'), true);
  assert.equal((await workbench.listPersonas())[0].imported, false);
});

test('persona do catalogo pode executar workflow sem importacao previa', async () => {
  const store = memoryStore();
  const routerCalls = [];
  const workbench = createPersonaWorkbench({
    store,
    kamui: {
      listPersonas: async () => [{ slug: 'online', name: 'Online' }],
      fetchPrompt: async () => ({ name: 'Online', model: 'modelo-online', system_prompt: 'Persona online.' }),
      getVersion: async () => ({ version: 1 }),
      health: async () => true,
    },
    router: {
      call: async (request) => {
        routerCalls.push(request);
        return 'ok';
      },
      health: async () => ({ ok: true }),
    },
    events: {
      append: (event) => event,
      list: () => [],
    },
  });

  const result = await workbench.run({
    mission: 'Executar sem cache local',
    workflow: {
      supervisor: 'online',
      mission: 'online',
      execution: ['online'],
      approval: 'online',
      display: 'online',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.steps.length, 5);
  assert.equal(routerCalls.length, 5);
  assert.deepEqual(store.list(), []);
});

test('workflow repete com modelo padrao quando modelo da persona esta indisponivel', async () => {
  const routerModels = [];
  const workbench = createPersonaWorkbench({
    store: memoryStore(),
    kamui: {
      listPersonas: async () => [{ slug: 'glm-only', name: 'GLM Only' }],
      fetchPrompt: async () => ({ name: 'GLM Only', model: 'glm-5.2', system_prompt: 'Persona GLM.' }),
      getVersion: async () => ({ version: 1 }),
      health: async () => true,
    },
    router: {
      call: async ({ model }) => {
        routerModels.push(model);
        if (model === 'glm-5.2') throw new Error('9router 404: No active credentials for provider: glm; model_not_found');
        return 'resposta pelo fallback';
      },
      health: async () => ({ ok: true }),
    },
    events: {
      append: (event) => event,
      list: () => [],
    },
  });

  const result = await workbench.run({
    mission: 'Validar fallback de modelo',
    workflow: {
      supervisor: 'glm-only',
      mission: 'glm-only',
      execution: ['glm-only'],
      approval: 'glm-only',
      display: 'glm-only',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.finalDisplay.model, ROUTER_MODEL);
  assert.deepEqual(routerModels, Array.from({ length: 5 }, () => ['glm-5.2', ROUTER_MODEL]).flat());
});

test('workflow limita executores para nao saturar o roteador local', async () => {
  let activeCalls = 0;
  let maxActiveCalls = 0;
  const workbench = createPersonaWorkbench({
    store: memoryStore(),
    kamui: {
      listPersonas: async () => [],
      fetchPrompt: async (slug) => ({ name: slug, model: 'cx/teste', system_prompt: `Persona ${slug}.` }),
      getVersion: async () => ({ version: 1 }),
      health: async () => true,
    },
    router: {
      call: async () => {
        activeCalls += 1;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeCalls -= 1;
        return 'ok';
      },
      health: async () => ({ ok: true }),
    },
    events: {
      append: (event) => event,
      list: () => [],
    },
  });

  const result = await workbench.run({
    mission: 'Validar carga do roteador',
    workflow: {
      supervisor: 'a',
      mission: 'a',
      execution: ['a', 'b', 'c'],
      approval: 'a',
      display: 'a',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(maxActiveCalls, 1);
});
