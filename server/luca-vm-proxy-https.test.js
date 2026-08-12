import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../deploy/luca-ai-vm-proxy.js';

test('edge redirects HTTP to the canonical HTTPS URL before reaching the VM', async () => {
  let originCalls = 0;
  const response = await worker.fetch(
    new Request('http://luca-ai.com.br/api/personas/available?filter=official'),
    {
      LUCA_EXPRESS: {
        async fetch() {
          originCalls += 1;
          return new Response('unexpected origin call');
        },
      },
    },
  );

  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://luca-ai.com.br/api/personas/available?filter=official');
  assert.equal(originCalls, 0);
});

test('edge forwards HTTPS as HTTPS and adds HSTS to VM responses', async () => {
  let forwardedRequest;
  const response = await worker.fetch(
    new Request('https://luca-ai.com.br/api/health'),
    {
      LUCA_EXPRESS: {
        async fetch(request) {
          forwardedRequest = request;
          return new Response('{"ok":true}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal(response.headers.get('x-luca-origin'), 'vm');
  assert.equal(forwardedRequest.headers.get('x-forwarded-proto'), 'https');
  assert.equal(forwardedRequest.headers.get('x-forwarded-host'), 'luca-ai.com.br');
});
