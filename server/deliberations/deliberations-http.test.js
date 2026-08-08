import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { createPersonaRunJobStore } from '../persona-run-jobs.js';
import { createDeliberations } from './index.js';

const MACHINE_TOKEN = 'machine-token-with-at-least-32-characters';

function bundle(overrides = {}) {
  return {
    schema: 'luca.context-bundle.v1',
    objective: 'Escolher a arquitetura mais segura',
    team: { mode: 'parallel', slugs: ['arquiteto'] },
    artifacts: [{ id: 'diff-1', kind: 'diff', content: 'diff sem URL' }],
    ...overrides,
  };
}

async function startApp(context, {
  machineToken = MACHINE_TOKEN,
  engine = async () => ({
    mode: 'parallel', team: [], durationMs: 5,
    replies: [{ ok: true, slug: 'arquiteto', name: 'Arquiteto', model: 'test/model', content: 'Use a API.' }],
  }),
} = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  let nextId = 0;
  const jobStore = createPersonaRunJobStore({ idFactory: () => `run-${++nextId}` });
  const owners = [];
  const requireUser = (req, res, next) => {
    const ownerId = String(req.headers['x-test-user'] || '');
    if (!ownerId) return res.status(401).json({ ok: false, error: 'authentication_required' });
    req.auth = { user: { id: ownerId } };
    next();
  };
  createDeliberations({
    engine, requireUser, jobStore, machineToken,
    ensureWorkspace: (ownerId) => owners.push(ownerId),
    runWithWorkspaceUser: (_ownerId, fn) => fn(),
  }).registerRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => server.close());
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, owners };
}

async function poll(baseUrl, id, headers) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/deliberations/${id}`, { headers });
    const body = await response.json();
    if (body.status !== 'running') return { response, body };
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`deliberação ${id} não terminou`);
}

test('Bearer de máquina fica desabilitado sem token forte', async (context) => {
  for (const machineToken of ['', 'curto']) {
    const { baseUrl } = await startApp(context, { machineToken });
    const response = await fetch(`${baseUrl}/api/deliberations`, {
      method: 'POST', headers: { authorization: `Bearer ${machineToken || MACHINE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(bundle()),
    });
    assert.equal(response.status, 401);
  }
});

test('POST valida bundle, desliga tools e GET devolve DecisionPackage', async (context) => {
  const calls = [];
  const { baseUrl, owners } = await startApp(context, {
    engine: async (...args) => {
      calls.push(args);
      return {
        mode: 'parallel', team: [], durationMs: 8,
        replies: [{ ok: true, slug: 'arquiteto', name: 'Arquiteto', model: 'test/model', content: 'Use a API.' }],
      };
    },
  });
  const headers = { authorization: `Bearer ${MACHINE_TOKEN}`, 'content-type': 'application/json' };
  const wrong = await fetch(`${baseUrl}/api/deliberations`, {
    method: 'POST', headers: { ...headers, authorization: 'Bearer wrong-machine-token-with-32-characters' }, body: JSON.stringify(bundle()),
  });
  assert.equal(wrong.status, 401);
  const invalid = await fetch(`${baseUrl}/api/deliberations`, {
    method: 'POST', headers, body: JSON.stringify({ schema: 'invalido', objective: 'x' }),
  });
  assert.equal(invalid.status, 400);
  const accepted = await fetch(`${baseUrl}/api/deliberations`, {
    method: 'POST', headers, body: JSON.stringify(bundle()),
  });
  assert.equal(accepted.status, 202);
  const acceptedBody = await accepted.json();
  const { body } = await poll(baseUrl, acceptedBody.deliberationId, headers);
  assert.equal(body.schema, 'luca.decision-package.v1');
  assert.equal(body.status, 'complete');
  assert.equal(body.contributions[0].content, 'Use a API.');
  assert.equal(calls[0][1].toolsEnabled, false);
  assert.equal(calls[0][0].traceId, null);
  assert.match(calls[0][0].mission, /DADO-EXTERNO/);
  assert.deepEqual(owners, ['machine:default']);
});

test('GET oculta deliberação de outro owner', async (context) => {
  const { baseUrl } = await startApp(context);
  const accepted = await fetch(`${baseUrl}/api/deliberations`, {
    method: 'POST', headers: { 'x-test-user': 'user-a', 'content-type': 'application/json' }, body: JSON.stringify(bundle()),
  });
  const { deliberationId } = await accepted.json();
  const hidden = await fetch(`${baseUrl}/api/deliberations/${deliberationId}`, { headers: { 'x-test-user': 'user-b' } });
  assert.equal(hidden.status, 404);
});

test('falha do engine vira DecisionPackage failed', async (context) => {
  const { baseUrl } = await startApp(context, {
    engine: async () => { const error = new Error('Persona ausente'); error.code = 'persona_not_found'; throw error; },
  });
  const headers = { authorization: `Bearer ${MACHINE_TOKEN}`, 'content-type': 'application/json' };
  const accepted = await fetch(`${baseUrl}/api/deliberations`, { method: 'POST', headers, body: JSON.stringify(bundle()) });
  const { deliberationId } = await accepted.json();
  const { body } = await poll(baseUrl, deliberationId, headers);
  assert.equal(body.status, 'failed');
  assert.deepEqual(body.error, { code: 'persona_not_found', message: 'Persona ausente' });
});
