import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RequestHttpError,
  RequestTimeoutError,
  isTransientRequestError,
} from '../shared/request-timeout.js';
import {
  PersonaRunWatchError,
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
