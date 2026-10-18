import assert from 'node:assert/strict';
import { call9RouterChat } from './router-client.js';
import { ROUTER_BASE_URL, PRODUCT_TEXT_MODEL } from './config.js';
const messages = [{ role: 'user', content: 'Call transport_probe once. After its result reply only LUCA_ASTRA_OK.' }];
const first = await call9RouterChat({
  messages, model: 'cx/gpt-5.6-sol(high)', stream: false, maxTokens: 2048,
  tools: [{ type: 'function', function: { name: 'transport_probe', description: 'Read-only synthetic transport verification', parameters: { type: 'object', properties: {}, additionalProperties: false } } }],
  toolChoice: { type: 'function', function: { name: 'transport_probe' } },
});
const calls = first.toolCalls || first.tool_calls;
assert.ok(calls?.length, JSON.stringify(first));
messages.push({ role: 'assistant', content: first.content || null, tool_calls: calls });
for (const call of calls) {
  assert.equal(call.function.name, 'transport_probe');
  messages.push({ role: 'tool', tool_call_id: call.id, content: '{"result":"LUCA_ASTRA_OK"}' });
}
const final = await call9RouterChat({ messages, stream: false, maxTokens: 2048 });
assert.match(final.content, /LUCA_ASTRA_OK/);
console.log(JSON.stringify({ state: 'PASS', endpoint: ROUTER_BASE_URL, model: PRODUCT_TEXT_MODEL, toolCalls: calls.length, answer: final.content, scope: 'real product transport, synthetic data, no customer or database' }));
