import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPublicHttpUrl,
  executeAgentTool,
  extractUrlsFromText,
} from './agent-tools.js';
import { runAgentWithTools } from './agent-loop.js';

test('assertPublicHttpUrl rejects private and bad schemes', () => {
  assert.throws(() => assertPublicHttpUrl('file:///etc/passwd'));
  assert.throws(() => assertPublicHttpUrl('http://localhost/admin'));
  assert.throws(() => assertPublicHttpUrl('http://127.0.0.1/'));
  assert.throws(() => assertPublicHttpUrl('http://192.168.0.10/'));
  assert.throws(() => assertPublicHttpUrl('http://10.0.0.2/'));
  const ok = assertPublicHttpUrl('https://www.sharingan.com.br/');
  assert.equal(ok.hostname, 'www.sharingan.com.br');
});

test('extractUrlsFromText pega urls publicas da missao', () => {
  const urls = extractUrlsFromText('Quero saber o q faz o app https://www.sharingan.com.br/ e ignorar http://127.0.0.1/x');
  assert.deepEqual(urls, ['https://www.sharingan.com.br/']);
});

test('executeAgentTool bloqueia host privado sem sair da maquina', async () => {
  const result = await executeAgentTool('fetch_url', { url: 'http://127.0.0.1:4242/api/health' });
  assert.equal(result.ok, false);
  assert.equal(result.tool, 'fetch_url');
  assert.match(String(result.error || ''), /privado|bloqueado|invalida|scheme|host/i);
});

test('runAgentWithTools executa tool_calls e devolve resposta final', async () => {
  let round = 0;
  const calls = [];
  const result = await runAgentWithTools({
    system: 'Voce e um agente.',
    user: 'Abra https://example.com e diga o titulo',
    model: 'gcli/test',
    agentId: 'test-agent',
    maxRounds: 3,
    callChat: async ({ messages, tools }) => {
      round += 1;
      calls.push({ round, hasTools: Array.isArray(tools) && tools.length > 0, messages: messages.length });
      if (round === 1) {
        return {
          content: '',
          toolCalls: [{
            id: 'call_1',
            type: 'function',
            function: {
              name: 'fetch_url',
              arguments: JSON.stringify({ url: 'https://example.com' }),
            },
          }],
          finishReason: 'tool_calls',
        };
      }
      return {
        content: 'Titulo: Example Domain. O site explica o dominio de exemplo.',
        toolCalls: [],
        finishReason: 'stop',
      };
    },
    executeTool: async (name, args) => {
      assert.equal(name, 'fetch_url');
      assert.equal(args.url, 'https://example.com');
      return {
        ok: true,
        tool: 'fetch_url',
        status: 200,
        url: 'https://example.com',
        title: 'Example Domain',
        text: 'Example Domain This domain is for use in illustrative examples.',
        truncated: false,
        chars: 60,
      };
    },
  });

  assert.match(result.content, /Example Domain/i);
  assert.equal(result.toolTrace.length, 1);
  assert.equal(result.toolTrace[0].name, 'fetch_url');
  assert.equal(calls.length, 2);
});

test('runAgentWithTools forca fetch quando ha URL e o modelo ignora tools', async () => {
  let round = 0;
  const result = await runAgentWithTools({
    system: 'Voce e um agente.',
    user: 'O que faz https://www.sharingan.com.br ?',
    model: 'gcli/test',
    agentId: 'test-agent',
    maxRounds: 3,
    callChat: async () => {
      round += 1;
      if (round === 1) {
        return {
          content: 'Nao consigo abrir o site.',
          toolCalls: [],
          finishReason: 'stop',
        };
      }
      return {
        content: 'Sharingan e uma biblioteca curada de prompts com overlay e fluxos.',
        toolCalls: [],
        finishReason: 'stop',
      };
    },
    executeTool: async (name, args) => {
      assert.equal(name, 'fetch_url');
      assert.match(String(args.url), /sharingan\.com\.br/);
      return {
        ok: true,
        tool: 'fetch_url',
        status: 200,
        url: args.url,
        title: 'Sharingan',
        text: 'Curated prompt library with overlay and flows.',
        truncated: false,
        chars: 40,
      };
    },
  });

  assert.equal(result.toolTrace.length, 1);
  assert.equal(result.toolTrace[0].forced, true);
  assert.match(result.content, /Sharingan|prompt/i);
});

test('runAgentWithTools continua resposta cortada por limite de tokens', async () => {
  let round = 0;
  const seenMessages = [];
  const result = await runAgentWithTools({
    system: 'Voce e o juiz.',
    user: 'Julgue as respostas.',
    model: 'cx/test',
    agentId: 'test-judge',
    maxRounds: 3,
    callChat: async ({ messages }) => {
      round += 1;
      seenMessages.push(messages.length);
      if (round === 1) {
        return {
          content: '1. Avaliacao dos participantes: Lux foi util, mas o veredito ainda',
          toolCalls: [],
          finishReason: 'length',
        };
      }
      return {
        content: ' nao esta completo. 4. Veredito final: decisao consolidada.',
        toolCalls: [],
        finishReason: 'stop',
      };
    },
    executeTool: async () => ({ ok: true }),
  });

  assert.equal(round, 2);
  assert.equal(result.finishReason, 'stop');
  assert.match(result.content, /Veredito final/);
  assert.match(result.content, /nao esta completo/);
});

test('runAgentWithTools nao trava em loop de continuacao infinita', async () => {
  let round = 0;
  const result = await runAgentWithTools({
    system: 'Voce e o juiz.',
    user: 'Julgue as respostas.',
    model: 'cx/test',
    agentId: 'test-judge-loop',
    maxRounds: 3,
    callChat: async () => {
      round += 1;
      return { content: 'trecho cortado', toolCalls: [], finishReason: 'length' };
    },
    executeTool: async () => ({ ok: true }),
  });

  assert.ok(round <= 3);
  assert.equal(result.content, 'trecho cortado');
  assert.equal(result.finishReason, 'length');
});
