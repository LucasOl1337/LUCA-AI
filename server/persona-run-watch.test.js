import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RequestHttpError,
  RequestTimeoutError,
  isTransientRequestError,
} from '../shared/request-timeout.js';
import {
  PersonaRunWatchError,
  startAndWatchPersonaTeamRun,
  watchPersonaTeamRun,
} from '../shared/persona-run-watch.js';

test('watchPersonaTeamRun ignora 524 transitórios e devolve resultado quando job completa', async () => {
  let calls = 0;
  const result = await watchPersonaTeamRun({
    runId: 'run-1',
    traceId: 'trace-1',
    pollIntervalMs: 1,
    maxConsecutiveErrorMs: 60_000,
    maxWaitMs: 5_000,
    wait: async () => {},
    getStatus: async () => {
      calls += 1;
      if (calls <= 2) {
        throw new RequestHttpError('edge', {
          status: 524,
          bodyText: '<!DOCTYPE html><title>Cloudflare</title>',
        });
      }
      if (calls === 3) {
        throw new RequestTimeoutError('slow poll', { timeoutMs: 12000, url: '/status' });
      }
      return {
        status: 'complete',
        result: { ok: true, mission: 'ok', replies: [], team: [], generatedAt: new Date().toISOString() },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.ok(calls >= 4);
});

test('watchPersonaTeamRun entrega cada revisao parcial antes do complete', async () => {
  let calls = 0;
  const observed = [];
  const result = await watchPersonaTeamRun({
    runId: 'run-progress',
    pollIntervalMs: 1,
    wait: async () => {},
    onProgress: (progress) => observed.push(progress),
    getStatus: async () => {
      calls += 1;
      if (calls === 1) {
        return { status: 'running', progress: { revision: 1, replies: [{ content: 'primeira' }] } };
      }
      if (calls === 2) {
        return { status: 'running', progress: { revision: 1, replies: [{ content: 'primeira' }] } };
      }
      if (calls === 3) {
        return { status: 'running', progress: { revision: 2, replies: [{ content: 'primeira' }, { content: 'segunda' }] } };
      }
      return { status: 'complete', result: { ok: true } };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(observed.map((progress) => progress.revision), [1, 2]);
});

test('watchPersonaTeamRun falha se a borda ficar instável por tempo demais', async () => {
  let now = 1_000_000;
  await assert.rejects(
    () => watchPersonaTeamRun({
      runId: 'run-2',
      pollIntervalMs: 1,
      maxBackoffMs: 1,
      maxConsecutiveErrorMs: 100,
      maxWaitMs: 10_000,
      now: () => now,
      wait: async (ms) => { now += Math.max(1, ms); },
      getStatus: async () => {
        throw new RequestHttpError('edge', { status: 524, bodyText: 'cloudflare' });
      },
      isTransient: isTransientRequestError,
    }),
    (error) => error instanceof PersonaRunWatchError && error.code === 'persona_run_edge_unstable',
  );
});

test('watchPersonaTeamRun propaga falha real do job', async () => {
  await assert.rejects(
    () => watchPersonaTeamRun({
      runId: 'run-3',
      pollIntervalMs: 1,
      wait: async () => {},
      getStatus: async () => ({
        status: 'failed',
        error: { code: 'kamui_unavailable', message: 'Kamui fora' },
      }),
    }),
    (error) => error instanceof PersonaRunWatchError
      && error.code === 'kamui_unavailable'
      && /Kamui fora/.test(error.message),
  );
});

test('startAndWatchPersonaTeamRun repete aceite transitório com o mesmo trace', async () => {
  let starts = 0;
  const result = await startAndWatchPersonaTeamRun({
    traceId: 'trace-retry',
    wait: async () => {},
    pollIntervalMs: 1,
    startRun: async () => {
      starts += 1;
      if (starts === 1) throw new RequestTimeoutError('aceite lento', { timeoutMs: 45_000, url: '/run' });
      return { runId: 'run-retry', traceId: 'trace-retry' };
    },
    getStatus: async () => ({
      status: 'complete',
      result: { ok: true, traceId: 'trace-retry' },
    }),
  });

  assert.equal(starts, 2);
  assert.equal(result.ok, true);
});

test('startAndWatchPersonaTeamRun sinaliza aceite desconhecido sem autorizar reenvio cego', async () => {
  await assert.rejects(
    () => startAndWatchPersonaTeamRun({
      traceId: 'trace-unknown',
      startRun: async () => {
        throw new RequestTimeoutError('aceite lento', { timeoutMs: 45_000, url: '/run' });
      },
      getStatus: async () => ({ status: 'running' }),
    }),
    (error) => error instanceof PersonaRunWatchError
      && error.code === 'persona_run_acceptance_unknown',
  );
});
