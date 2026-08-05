// Source lock: AgentRail power bg uses product theme.aliveSoft, not heartbeat residual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, '../src/components/AgentRail.tsx'), 'utf8');

assert.equal(src.includes('rgba(67,209,138,0.08)'), false, 'AgentRail still has heartbeat soft residual');
assert.equal(src.includes('67,209,138'), false, 'AgentRail still has heartbeat rgb');
assert.ok(src.includes('theme.aliveSoft'), 'AgentRail must use theme.aliveSoft when power is on/busy');
assert.ok(
  src.includes('background: running || supervisorBusy ? theme.aliveSoft : theme.input'),
  'power button on/busy background maps to aliveSoft',
);

console.log('agent-rail-visual-tokens: ok');
