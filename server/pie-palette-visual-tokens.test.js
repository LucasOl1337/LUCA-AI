// Source lock: canvas pie palette uses product action blue, not Wes-Anderson brass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, '../src/lib/canvas.ts'), 'utf8');

assert.equal(src.includes('#C9A227'), false, 'canvas.ts still has brass #C9A227');
assert.equal(src.includes('C9A227'), false, 'canvas.ts still mentions brass hex');

assert.ok(
  src.includes("const PIE_PALETTE = ['#0a84ff', '#7FB3D5', '#1E4E8C', '#43d18a', '#b58cff']"),
  'PIE_PALETTE first slot must be product action blue',
);

// Distinct non-brass slice colors stay (not a mono palette rewrite).
assert.ok(src.includes("'#7FB3D5'"), 'cool blue slice kept');
assert.ok(src.includes("'#1E4E8C'"), 'deep navy slice kept');
assert.ok(src.includes("'#43d18a'"), 'alive green slice kept');
assert.ok(src.includes("'#b58cff'"), 'violet slice kept');

console.log('pie-palette-visual-tokens: ok');
