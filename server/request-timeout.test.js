import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RequestHttpError,
  RequestNetworkError,
  RequestTimeoutError,
  buildApiErrorMessage,
  isEdgeTimeoutError,
  isTransientRequestError,
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
  assert.equal(
    buildApiErrorMessage(new RequestHttpError('edge timeout', {
      status: 524,
      bodyText: '<!DOCTYPE html><html><title>Cloudflare</title></html>',
    })),
    'A execução demorou além do limite da conexão. Ela pode continuar em segundo plano; acompanhe o progresso e tente atualizar em instantes.',
  );
});

test('isTransientRequestError cobre timeout, rede e 5xx de borda', () => {
  assert.equal(isTransientRequestError(new RequestTimeoutError('t', { timeoutMs: 1000 })), true);
  assert.equal(isTransientRequestError(new RequestNetworkError('n')), true);
  assert.equal(isTransientRequestError(new RequestHttpError('e', { status: 524, bodyText: '' })), true);
  assert.equal(isTransientRequestError(new RequestHttpError('e', { status: 502, bodyText: '' })), true);
  assert.equal(isTransientRequestError(new RequestHttpError('e', {
    status: 200,
    bodyText: '<!DOCTYPE html> cloudflare',
  })), true);
  assert.equal(isTransientRequestError(new RequestHttpError('e', { status: 409, bodyText: 'lock' })), false);
  assert.equal(isTransientRequestError(new Error('boom')), false);
  assert.equal(isEdgeTimeoutError(new RequestHttpError('e', { status: 524, bodyText: '' })), true);
  assert.equal(isEdgeTimeoutError(new RequestTimeoutError('t', { timeoutMs: 1 })), false);
});
