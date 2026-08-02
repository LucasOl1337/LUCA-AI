// Source lock: stateTone uses product status rails, not ad-hoc tailwind/amber hex.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, '../src/lib/format.ts'), 'utf8');

assert.equal(src.includes('#f87171'), false, 'format.ts still has tailwind red #f87171');
assert.equal(src.includes('#fbbf24'), false, 'format.ts still has amber #fbbf24');
// leftover agent-green on stateTone (alive product rail is #30d158)
assert.equal(
  /function stateTone[\s\S]*?#43d18a/.test(src),
  false,
  'stateTone must not return #43d18a (use product --l-ok)',
);

assert.ok(
  src.includes("return '#30d158'"),
  'running/online/ready must use product ok/alive #30d158',
);
assert.ok(
  src.includes("return '#ff453a'"),
  'error/offline must use product error #ff453a',
);
assert.ok(
  src.includes("return '#ff9f0a'"),
  'default state must use product warning #ff9f0a',
);

assert.ok(src.includes('export function stateTone'), 'stateTone export present');

console.log('state-tone-visual-tokens: ok');
