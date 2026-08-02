// Source lock: LucaOwl strokes/halo use product navy rails, not ad-hoc cyan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, '../src/components/LucaOwl.tsx'), 'utf8');

const banned = [
  '#00c8f0',
  '#406888',
  '#1a3090',
  '#2050c0',
  '#60a8e8',
  '#c0d8ff',
  'rgba(0,190,255',
  'rgba(0,180,255',
  'rgba(0,140,220',
  'rgba(0,150,220',
  'rgba(40,80,180',
  'rgba(20,40,120',
  'rgba(20,10,70',
];
for (const hex of banned) {
  assert.equal(src.includes(hex), false, `LucaOwl still has ad-hoc ${hex}`);
}

assert.ok(src.includes("alive ? '#64d2ff' : '#1E4E8C'"), 'pulse must use product goldBright / deep navy');
assert.ok(src.includes('stroke="#1E4E8C"'), 'outer ring uses product deep navy');
assert.ok(src.includes('stroke="#0a84ff"'), 'mid ring uses product action navy');
assert.ok(src.includes('stroke="#64d2ff"'), 'inner ring uses product goldBright');
assert.ok(src.includes('fill="#82c7ff"'), 'stars use product goldDeep');
assert.ok(src.includes('rgba(10,132,255,0.55)'), 'border uses product navy alpha');
assert.ok(src.includes('rgba(10,132,255,0.20)'), 'halo uses product navy alpha');

console.log('luca-owl-visual-tokens: ok');
