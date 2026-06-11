import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RequestHttpError,
  RequestNetworkError,
  RequestTimeoutError,
  buildApiErrorMessage,
  requestJson,
} from '../shared/request-timeout.js';

test('requestJson aborta request lenta com timeout controlado', async () => {
  await assert.rejects(
    requestJson('https://luca.invalid/api/state', {
      timeoutMs: 20,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }),
    }),
    (error) => error instanceof RequestTimeoutError && error.timeoutMs === 20,
  );
});

test('requestJson propaga erro HTTP com corpo compacto', async () => {
  await assert.rejects(
    requestJson('https://luca.invalid/api/state', {
      fetchImpl: async () => ({
        ok: false,
        status: 409,
        text: async () => '  mission lock active  ',
      }),
    }),
    (error) => error instanceof RequestHttpError
      && error.status === 409
      && error.bodyText === 'mission lock active',
  );
});

test('buildApiErrorMessage gera mensagens operacionais claras', () => {
  assert.match(
    buildApiErrorMessage(new RequestTimeoutError('timeout', { timeoutMs: 12000 })),
    /Tempo limite excedido \(12s\)/,
  );
  assert.match(
    buildApiErrorMessage(new RequestNetworkError('offline')),
    /Falha de conexao/,
  );
  assert.match(
    buildApiErrorMessage(new RequestHttpError('bad request', { status: 409, bodyText: 'mission lock active' })),
    /409.*mission lock active/i,
  );
});
