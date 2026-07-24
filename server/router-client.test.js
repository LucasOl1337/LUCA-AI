import test from 'node:test';
import assert from 'node:assert/strict';

import { call9Router, extractChatCompletionContent } from './router-client.js';

test('extractChatCompletionContent le JSON OpenAI compativel', () => {
  const payload = JSON.stringify({
    choices: [{ message: { content: 'Resposta direta.' } }],
  });

  assert.equal(extractChatCompletionContent(payload), 'Resposta direta.');
});

test('extractChatCompletionContent concatena resposta SSE data lines', () => {
  const payload = [
    'data: {"choices":[{"delta":{"content":"Ola "}}]}',
    'data: {"choices":[{"delta":{"content":"mundo"}}]}',
    'data: [DONE]',
  ].join('\n');

  assert.equal(extractChatCompletionContent(payload), 'Ola mundo');
});

test('extractChatCompletionContent tolera JSON valido com sufixo nao JSON', () => {
  const payload = `${JSON.stringify({
    choices: [{ message: { content: 'GROK respondeu normal.' } }],
  })}\n\nrequest-id: abc123`;

  assert.equal(extractChatCompletionContent(payload), 'GROK respondeu normal.');
});

test('extractChatCompletionContent le conteudo em blocos de texto', () => {
  const payload = JSON.stringify({
    content: [
      { type: 'text', text: 'Parte A ' },
      { type: 'text', text: 'Parte B' },
    ],
  });

  assert.equal(extractChatCompletionContent(payload), 'Parte A Parte B');
});

test('extractChatCompletionContent le candidatos com parts estilo Gemini', () => {
  const payload = JSON.stringify({
    candidates: [
      { content: { parts: [{ text: 'Resposta ' }, { text: 'Gemini-like.' }] } },
    ],
  });

  assert.equal(extractChatCompletionContent(payload), 'Resposta Gemini-like.');
});

test('call9Router envia somente a rota pronta, sem controles de esforco', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'OK' } }],
    }), { status: 200 });
  };

  try {
    const output = await call9Router({
      system: 'Sistema',
      user: 'Responda OK',
      model: 'cx/gpt-5.6-sol-xhigh',
      maxTokens: 16,
    });
    assert.equal(output, 'OK');
    assert.equal(requestBody.model, 'cx/gpt-5.6-sol-xhigh');
    assert.equal(
      Object.keys(requestBody).some((key) => /reason|thinking|effort/i.test(key)),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('call9Router rejeita uma rota fora da whitelist antes do fetch', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('nao deveria chamar fetch');
  };

  try {
    await assert.rejects(
      call9Router({ system: 'Sistema', user: 'Teste', model: 'cx/gpt-5.4-mini-xhigh' }),
      /9router_model_not_allowed/,
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
