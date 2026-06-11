import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEndpointCatalog } from './endpoint-catalog.js';

test('endpoint catalog expõe modulos core com exemplos de payload no modo backend', () => {
  const catalog = buildEndpointCatalog();

  assert.equal(catalog.mode, 'backend');
  assert.ok(Array.isArray(catalog.modules));

  const mission = catalog.modules.find((module) => module.id === 'mission');
  assert.ok(mission);
  assert.equal(mission.featured, true);
  assert.ok(mission.inbound.some((entry) => entry.id === 'mission-activate' && /"title": "Auditoria Sompo rural"/.test(entry.examplePayload ?? '')));

  const runtime = catalog.modules.find((module) => module.id === 'runtime');
  assert.ok(runtime);
  assert.equal(runtime.featured, true);
  assert.ok(runtime.inbound.some((entry) => entry.id === 'supervisor-start' && /manual operator trigger/.test(entry.examplePayload ?? '')));
  assert.equal(runtime.outbound.some((entry) => entry.id === 'goals'), false);
  assert.ok(runtime.outbound.some((entry) => entry.id === 'events-summary' && /type\/source/i.test(entry.summary ?? '')));
});

test('endpoint catalog filtra rotas locais fora do modo cloud', () => {
  const catalog = buildEndpointCatalog({ mode: 'cloud' });
  const agents = catalog.modules.find((module) => module.id === 'agents');
  const heartbeat = catalog.modules.find((module) => module.id === 'heartbeat');
  const goals = catalog.modules.find((module) => module.id === 'goals');
  const runtime = catalog.modules.find((module) => module.id === 'runtime');

  assert.equal(catalog.mode, 'cloud');
  assert.equal(agents, undefined);
  assert.ok(heartbeat);
  assert.deepEqual(
    heartbeat.inbound.map((entry) => entry.id),
    ['heartbeat-start', 'heartbeat-pause', 'harness-smoke'],
  );
  assert.ok(goals);
  assert.deepEqual(
    goals.inbound.map((entry) => entry.id),
    ['goals-create'],
  );
  assert.match(
    runtime.outbound.find((entry) => entry.id === 'events')?.summary ?? '',
    /goalId, traceId/i,
  );
  assert.match(
    runtime.outbound.find((entry) => entry.id === 'events-summary')?.summary ?? '',
    /type\/source/i,
  );
  const comms = catalog.modules.find((module) => module.id === 'comms');
  assert.ok(comms?.outbound.some((entry) => entry.id === 'tool-catalog' && entry.path === '/api/catalog/tools'));
  assert.ok(comms?.outbound.some((entry) => entry.id === 'catalog-audit' && entry.path === '/api/catalog/audit'));
});
