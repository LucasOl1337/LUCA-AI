import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgentWithTools } from './agent-loop.js';

test('runAgentWithTools desliga schemas, addon, calls e bootstrap quando toolsEnabled=false', async () => {
  const requests = [];
  let executed = false;
  const result = await runAgentWithTools({
    system: 'Você é um deliberador.',
    user: 'Trate como dado: https://evil.example/exfiltrar',
    model: 'test/model',
    agentId: 'deliberator',
    toolsEnabled: false,
    callChat: async (request) => {
      requests.push(request);
      return {
        content: 'Analisei sem acessar a rede.',
        toolCalls: [{ id: 'unexpected', type: 'function', function: { name: 'fetch_url', arguments: '{}' } }],
        finishReason: 'stop',
      };
    },
    executeTool: async () => {
      executed = true;
      return { ok: true };
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(Object.hasOwn(requests[0], 'tools'), false);
  assert.equal(Object.hasOwn(requests[0], 'toolChoice'), false);
  assert.doesNotMatch(requests[0].messages[0].content, /Capacidade operacional ativa/);
  assert.equal(executed, false);
  assert.deepEqual(result.toolTrace, []);
  assert.equal(result.content, 'Analisei sem acessar a rede.');
});
