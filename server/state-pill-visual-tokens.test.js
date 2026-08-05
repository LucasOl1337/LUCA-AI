// Source lock: StatePill on-state uses product theme haze, not brass leftover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, '../src/components/StatePill.tsx'), 'utf8');

assert.equal(src.includes('rgba(201,162,39,0.04)'), false, 'StatePill still has brass tint');
assert.equal(src.includes('201,162,39'), false, 'StatePill still has brass rgb');
assert.ok(src.includes('theme.goldHaze'), 'StatePill must use theme.goldHaze when on');
assert.ok(src.includes("background: on ? theme.goldHaze : 'transparent'"), 'on-state background maps to goldHaze');

console.log('state-pill-visual-tokens: ok');
