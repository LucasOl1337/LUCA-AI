import test from 'node:test';
import assert from 'node:assert/strict';

import { createPersonaRunJobStore } from './persona-run-jobs.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function waitForStatus(store, runId, ownerId, expected) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const job = store.get(runId, ownerId);
    if (job?.status === expected) return job;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`job ${runId} nao chegou ao status ${expected}`);
}

test('persona run job inicia running e termina complete com o resultado', async () => {
  const work = deferred();
  const store = createPersonaRunJobStore({ idFactory: () => 'run-1' });
  const started = store.start({
    ownerId: 'user-1',
    traceId: 'trace-1',
    execute: () => work.promise,
  });

  assert.equal(started.status, 'running');
  assert.equal(started.result, null);
  work.resolve({ ok: true, replies: [{ slug: 'aurora' }] });

  const completed = await waitForStatus(store, 'run-1', 'user-1', 'complete');
  assert.deepEqual(completed.result, { ok: true, replies: [{ slug: 'aurora' }] });
  assert.ok(completed.completedAt);
});

test('persona run job termina failed sem expor o job para outro workspace', async () => {
  const store = createPersonaRunJobStore({ idFactory: () => 'run-2' });
  const started = store.start({
    ownerId: 'user-1',
    traceId: 'trace-2',
    execute: async () => {
      const error = new Error('Kamui indisponivel');
      error.code = 'kamui_unavailable';
      throw error;
    },
  });

  assert.equal(store.get(started.runId, 'user-2'), null);
  const failed = await waitForStatus(store, started.runId, 'user-1', 'failed');
  assert.deepEqual(failed.error, {
    code: 'kamui_unavailable',
    message: 'Kamui indisponivel',
  });
});

test('persona run job encontra aceite existente por owner e trace', () => {
  const store = createPersonaRunJobStore({ idFactory: () => 'run-trace' });
  const started = store.start({
    ownerId: 'user-1',
    traceId: 'trace-idempotente',
    execute: async () => ({ ok: true }),
  });

  assert.equal(store.findByTraceId('trace-idempotente', 'user-1')?.runId, started.runId);
  assert.equal(store.findByTraceId('trace-idempotente', 'user-2'), null);
});
