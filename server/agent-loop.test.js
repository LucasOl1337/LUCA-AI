import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgentWithTools } from './agent-loop.js';

test('anexo de texto vira texto no prompt para nao depender de suporte a input_file', async () => {
  // Claude ignora silenciosamente blocos input_file no 9Router: a persona responde
  // como se nenhum arquivo existisse. Texto entra no prompt; imagem segue nativa.
  const requests = [];
  await runAgentWithTools({
    system: 'Analista.',
    user: 'Qual a palavra secreta?',
    attachments: [
      {
        type: 'input_file',
        filename: 'segredo.txt',
        file_data: `data:text/plain;base64,${Buffer.from('segredo: katorze').toString('base64')}`,
      },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ],
    model: 'cc/claude-fable-5',
    agentId: 'anexo',
    maxRounds: 1,
    tools: [],
    callChat: async (request) => {
      requests.push(request);
      return { content: 'katorze', toolCalls: [], finishReason: 'stop' };
    },
  });

  const parts = requests[0].messages[1].content;
  assert.ok(Array.isArray(parts), 'conteudo multimodal preservado');
  const textBlob = parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  assert.match(textBlob, /segredo\.txt/, 'nome do arquivo citado no prompt');
  assert.match(textBlob, /segredo: katorze/, 'conteudo legivel para qualquer modelo');
  assert.equal(parts.filter((part) => part.type === 'image_url').length, 1);
  // Nenhum bloco input_file sobra para ser ignorado em silencio.
  assert.equal(parts.some((part) => part.type === 'input_file'), false);
});

test('anexo binario ilegivel nao vira conteudo inventado', async () => {
  const requests = [];
  await runAgentWithTools({
    system: 'Analista.',
    user: 'Leia o PDF.',
    attachments: [{
      type: 'input_file',
      filename: 'relatorio.pdf',
      file_data: `data:application/pdf;base64,${Buffer.from('%PDF-1.4\u0000\u0001binario').toString('base64')}`,
    }],
    model: 'cx/gpt-5.6-sol',
    agentId: 'anexo-bin',
    maxRounds: 1,
    tools: [],
    callChat: async (request) => {
      requests.push(request);
      return { content: 'ok', toolCalls: [], finishReason: 'stop' };
    },
  });

  const content = requests[0].messages[1].content;
  const textBlob = typeof content === 'string' ? content : content.map((part) => part.text || '').join('\n');
  assert.match(textBlob, /relatorio\.pdf/, 'arquivo é citado');
  assert.match(textBlob, /binario nao extraido/, 'declara que não leu, em vez de alucinar');
});

test('sem anexos o conteudo do usuario continua string simples', async () => {
  const requests = [];
  await runAgentWithTools({
    system: 'Analista.',
    user: 'Missao sem anexo.',
    model: 'cx/gpt-5.6-sol',
    agentId: 'sem-anexo',
    maxRounds: 1,
    tools: [],
    callChat: async (request) => {
      requests.push(request);
      return { content: 'ok', toolCalls: [], finishReason: 'stop' };
    },
  });

  assert.equal(requests[0].messages[1].content, 'Missao sem anexo.');
});
