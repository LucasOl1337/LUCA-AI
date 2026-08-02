// Source lock: agent accents use product action blue, not Wes-Anderson brass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, '../src/lib/agents.ts'), 'utf8');

assert.equal(src.includes('#C9A227'), false, 'agents.ts still has brass #C9A227');
assert.equal(src.includes('C9A227'), false, 'agents.ts still mentions brass hex');

// System / action roles must use product action blue (theme.gold / --l-navy).
for (const id of ['maestro', 'transformador-missao', 'designer', 'supervisor']) {
  assert.match(
    src,
    new RegExp(`id: '${id}'[\\s\\S]{0,160}accent: '#0a84ff'`),
    `${id} must use product action accent #0a84ff`,
  );
}

assert.ok(
  src.includes("const CHAT_ACCENTS = ['#0a84ff', '#7FB3D5', '#1E4E8C', '#43d18a', '#b58cff', '#f0a35c']"),
  'CHAT_ACCENTS first slot must be product action blue',
);

// Distinct non-brass role colors stay (not a mono palette rewrite).
assert.ok(src.includes("accent: '#43d18a'"), 'heartbeat alive accent kept');
assert.ok(src.includes("accent: '#7FB3D5'"), 'database/planner cool accent kept');
assert.ok(src.includes("accent: '#1E4E8C'"), 'researcher deep navy accent kept');

console.log('agent-accent-visual-tokens: ok');
