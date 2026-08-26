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

test('anexo de texto grande declara o corte em vez de truncar em silencio', async () => {
  const requests = [];
  const huge = 'x'.repeat(130_000) + 'FIM-DO-ARQUIVO';
  await runAgentWithTools({
    system: 'Analista.',
    user: 'Resuma o arquivo.',
    attachments: [{
      type: 'input_file',
      filename: 'grande.txt',
      file_data: `data:text/plain;base64,${Buffer.from(huge).toString('base64')}`,
    }],
    model: 'cx/gpt-5.6-sol',
    agentId: 'anexo-grande',
    maxRounds: 1,
    tools: [],
    callChat: async (request) => {
      requests.push(request);
      return { content: 'ok', toolCalls: [], finishReason: 'stop' };
    },
  });

  const content = requests[0].messages[1].content;
  const textBlob = typeof content === 'string' ? content : content.map((p) => p.text || '').join('\n');
  assert.match(textBlob, /TRUNCADO/, 'o corte precisa ser declarado ao modelo');
  assert.match(textBlob, /130014 caracteres/, 'informa o tamanho real do arquivo');
  assert.equal(textBlob.includes('FIM-DO-ARQUIVO'), false, 'o final cortado nao aparece');
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

test('nao continua resposta longa cortada por max_tokens', async () => {
  const requests = [];
  const long = 'GO restrito. '.repeat(80);
  const result = await runAgentWithTools({
    system: 'Analista.',
    user: 'Decida.',
    model: 'cx/gpt-5.6-sol-xhigh',
    agentId: 'longo',
    maxRounds: 3,
    toolsEnabled: false,
    callChat: async (request) => {
      requests.push(request);
      return { content: long, toolCalls: [], finishReason: 'length' };
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(result.finishReason, 'length');
  assert.match(result.content, /GO restrito/);
});

test('recupera length vazio pedindo resposta curta, nao continuacao longa', async () => {
  const requests = [];
  const result = await runAgentWithTools({
    system: 'Analista.',
    user: 'Decida.',
    model: 'cx/gpt-5.6-sol-xhigh',
    agentId: 'vazio',
    maxRounds: 3,
    toolsEnabled: false,
    callChat: async (request) => {
      requests.push(request);
      if (requests.length === 1) {
        return { content: '', toolCalls: [], finishReason: 'length' };
      }
      return { content: '- GO\n- checar telemetria', toolCalls: [], finishReason: 'stop' };
    },
  });
  assert.equal(requests.length, 2);
  const followUp = requests[1].messages.at(-1).content;
  assert.match(followUp, /orcamento foi gasto sem texto util/i);
  assert.doesNotMatch(followUp, /conclua todas as secoes pendentes/i);
  assert.match(result.content, /GO/);
});

test('timeout do 9router tenta de novo sem ferramentas e com teto menor', async () => {
  const requests = [];
  const result = await runAgentWithTools({
    system: 'Analista.',
    user: 'Decida.',
    model: 'cx/gpt-5.6-sol-xhigh',
    agentId: 'timeout',
    maxTokens: 900,
    maxRounds: 3,
    toolsEnabled: true,
    tools: [{ type: 'function', function: { name: 'web_search' } }],
    callChat: async (request) => {
      requests.push(request);
      if (requests.length === 1) {
        throw new Error('9router_unreachable http://127.0.0.1:20129/v1/chat/completions: timeout de 120s');
      }
      return { content: 'GO restrito.', toolCalls: [], finishReason: 'stop' };
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].tools?.[0]?.function?.name, 'web_search');
  assert.equal(requests[1].tools, undefined);
  assert.equal(requests[1].maxTokens, 480);
  assert.equal(result.content, 'GO restrito.');
});
