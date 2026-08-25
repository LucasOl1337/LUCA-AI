import test from 'node:test';
import assert from 'node:assert/strict';

import { createPersonaRunJobStore } from './persona-run-jobs.js';
import {
  PersonaRunLifecycleError,
  createPersonaRunLifecycle,
} from './persona-run-lifecycle.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function sessionAdapter() {
  const sessions = new Map([['session-1', { id: 'session-1', activePersonaRun: null, lastPersonaRun: null }]]);
  const persisted = new Map();
  const calls = { running: 0, complete: 0, fail: 0 };
  return {
    calls,
    sessions,
    persisted,
    get(id) {
      const session = sessions.get(id);
      if (!session) throw new Error('session_not_found');
      return session;
    },
    markRunning(id, meta) {
      calls.running += 1;
      sessions.get(id).activePersonaRun = { ...meta, status: 'running' };
    },
    complete(id, result, meta) {
      calls.complete += 1;
      const session = sessions.get(id);
      session.activePersonaRun = null;
      session.lastPersonaRun = { ...meta, status: 'complete', ok: result.ok !== false };
      persisted.set(meta.runId, {
        sessionId: id,
        runId: meta.runId,
        traceId: meta.traceId,
        status: 'complete',
        startedAt: meta.startedAt,
        completedAt: meta.completedAt || 'done',
        result: { ...result, recoveredFromSession: true },
        error: null,
      });
      return session;
    },
    fail(id, meta) {
      calls.fail += 1;
      const session = sessions.get(id);
      session.activePersonaRun = {
        runId: meta.runId,
        traceId: meta.traceId,
        status: 'failed',
        startedAt: session.activePersonaRun?.startedAt || 'started',
        errorCode: meta.errorCode,
        errorMessage: meta.errorMessage,
      };
      persisted.set(meta.runId, {
        sessionId: id,
        runId: meta.runId,
        traceId: meta.traceId,
        status: 'failed',
        startedAt: session.activePersonaRun.startedAt,
        completedAt: 'failed',
        result: null,
        error: { code: meta.errorCode, message: meta.errorMessage },
      });
    },
    find(runId) {
      const saved = persisted.get(runId);
      if (saved) return saved;
      for (const session of sessions.values()) {
        if (session.activePersonaRun?.runId === runId) {
          return { sessionId: session.id, ...session.activePersonaRun, result: null, error: null };
        }
      }
      return null;
    },
  };
}

async function waitForStatus(lifecycle, runId, expected) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const run = lifecycle.get(runId, 'owner-1');
    if (run?.status === expected) return run;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`run ${runId} nao chegou a ${expected}`);
}

function fixture({ jobs = createPersonaRunJobStore() } = {}) {
  const sessions = sessionAdapter();
  const lifecycle = createPersonaRunLifecycle({ jobs, sessions });
  return { jobs, sessions, lifecycle };
}

test('Persona Run Lifecycle persiste antes de publicar complete', async () => {
  const { sessions, lifecycle } = fixture({
    jobs: createPersonaRunJobStore({ idFactory: () => 'run-1' }),
  });
  const work = deferred();
  const accepted = lifecycle.start({
    ownerId: 'owner-1',
    input: { traceId: 'trace-1', sessionId: 'session-1' },
    execute: () => work.promise,
  });
  assert.equal(accepted.status, 'running');
  assert.equal(sessions.calls.running, 1);

  work.resolve({ ok: true, generatedAt: '2026-08-11T12:30:00.000Z' });
  const completed = await waitForStatus(lifecycle, accepted.runId, 'complete');
  assert.equal(sessions.calls.complete, 1);
  assert.equal(completed.result.ok, true);
  assert.equal(sessions.sessions.get('session-1').activePersonaRun, null);
});

test('Persona Run Lifecycle encaminha progresso antes da persistencia final', async () => {
  const { lifecycle } = fixture({
    jobs: createPersonaRunJobStore({ idFactory: () => 'run-progress' }),
  });
  const work = deferred();
  const accepted = lifecycle.start({
    ownerId: 'owner-1',
    input: { traceId: 'trace-progress', sessionId: 'session-1' },
    execute: (_job, reportProgress) => {
      reportProgress({ replies: [{ slug: 'maestro', content: 'parcial' }] });
      return work.promise;
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const running = lifecycle.get(accepted.runId, 'owner-1');
  assert.equal(running.status, 'running');
  assert.equal(running.progress.replies[0].content, 'parcial');

  work.resolve({ ok: true, generatedAt: '2026-08-25T12:30:00.000Z' });
  await waitForStatus(lifecycle, accepted.runId, 'complete');
});

test('Persona Run Lifecycle marca falha duravel e preserva o erro do job', async () => {
  const { sessions, lifecycle } = fixture({
    jobs: createPersonaRunJobStore({ idFactory: () => 'run-fail' }),
  });
  const accepted = lifecycle.start({
    ownerId: 'owner-1',
    input: { traceId: 'trace-fail', sessionId: 'session-1' },
    execute: async () => {
      const error = new Error('Kamui indisponivel');
      error.code = 'kamui_unavailable';
      throw error;
    },
  });

  const failed = await waitForStatus(lifecycle, accepted.runId, 'failed');
  assert.equal(sessions.calls.fail, 1);
  assert.equal(failed.error.code, 'kamui_unavailable');
});

test('Persona Run Lifecycle nao publica complete sem confirmacao duravel', async () => {
  const { sessions, lifecycle } = fixture({
    jobs: createPersonaRunJobStore({ idFactory: () => 'run-no-save' }),
  });
  sessions.complete = () => null;
  const accepted = lifecycle.start({
    ownerId: 'owner-1',
    input: { traceId: 'trace-no-save', sessionId: 'session-1' },
    execute: async () => ({ ok: true }),
  });

  const failed = await waitForStatus(lifecycle, accepted.runId, 'failed');
  assert.equal(failed.error.code, 'persona_run_persistence_failed');
  assert.equal(sessions.calls.fail, 1);
});

test('Persona Run Lifecycle torna retry do mesmo trace idempotente', () => {
  const { lifecycle } = fixture({
    jobs: createPersonaRunJobStore({ idFactory: () => 'run-same' }),
  });
  const work = deferred();
  let executions = 0;
  const request = {
    ownerId: 'owner-1',
    input: { traceId: 'trace-same', sessionId: 'session-1' },
    execute: () => {
      executions += 1;
      return work.promise;
    },
  };
  const first = lifecycle.start(request);
  const second = lifecycle.start(request);

  assert.equal(second.runId, first.runId);
  assert.equal(second.reused, true);
  assert.equal(executions, 0, 'job ainda aguarda o scheduler e nao foi duplicado');
  work.resolve({ ok: true });
});

test('Persona Run Lifecycle bloqueia duas rodadas diferentes na mesma sessao', () => {
  const { lifecycle } = fixture({
    jobs: createPersonaRunJobStore({ idFactory: () => 'run-active' }),
  });
  const work = deferred();
  lifecycle.start({
    ownerId: 'owner-1',
    input: { traceId: 'trace-a', sessionId: 'session-1' },
    execute: () => work.promise,
  });

  assert.throws(
    () => lifecycle.start({
      ownerId: 'owner-1',
      input: { traceId: 'trace-b', sessionId: 'session-1' },
      execute: async () => ({ ok: true }),
    }),
    (error) => error instanceof PersonaRunLifecycleError
      && error.code === 'persona_run_already_running',
  );
  work.resolve({ ok: true });
});

test('Persona Run Lifecycle recupera complete duravel sem job em memoria', () => {
  const { sessions, lifecycle } = fixture();
  sessions.persisted.set('run-persisted', {
    sessionId: 'session-1',
    runId: 'run-persisted',
    traceId: 'trace-persisted',
    status: 'complete',
    startedAt: 'start',
    completedAt: 'done',
    result: { ok: true, recoveredFromSession: true },
    error: null,
  });

  const recovered = lifecycle.get('run-persisted', 'owner-1');
  assert.equal(recovered.status, 'complete');
  assert.equal(recovered.result.recoveredFromSession, true);
});

test('Persona Run Lifecycle converte running orfao em falha recuperavel', () => {
  const { sessions, lifecycle } = fixture();
  sessions.sessions.get('session-1').activePersonaRun = {
    runId: 'run-orphan',
    traceId: 'trace-orphan',
    status: 'running',
    startedAt: 'start',
  };

  const failed = lifecycle.get('run-orphan', 'owner-1');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error.code, 'persona_run_interrupted');
  assert.equal(sessions.calls.fail, 1);
});
