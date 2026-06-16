import test from 'node:test';
import assert from 'node:assert/strict';

import { extractChatCompletionContent } from './router-client.js';

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
