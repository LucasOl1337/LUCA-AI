// Source lock: auth shell uses product tokens, not leftover auth hex palette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(root, '../src/index.css'), 'utf8');
const start = css.indexOf('/* Autenticação e administração');
const end = css.indexOf('@media (max-width: 900px) {', start);
assert.ok(start >= 0 && end > start, 'auth/admin CSS block present');
const section = css.slice(start, end);

const banned = [
  '#050a10',
  '#167fd9',
  '#0b61ae',
  '#3b9ff1',
  '#65b9ff',
  '#55adf5',
  '#147fdd',
  '#229cff',
  '#edf5ff',
  '#bfe3ff',
  '#72c2ff',
];

for (const hex of banned) {
  assert.equal(section.includes(hex), false, `auth section still has ${hex}`);
}

for (const token of [
  'var(--l-void)',
  'var(--l-navy-deep)',
  'var(--l-navy-soft)',
  'var(--l-gold-soft)',
  'var(--l-error-bg)',
  'rgba(10, 132, 255, 0.72)',
]) {
  assert.ok(section.includes(token), `missing product token ${token}`);
}

assert.match(
  section,
  /\.auth-card label > div:focus-within \{[^}]*border-color: var\(--l-border\);[^}]*box-shadow: none;/,
  'auth fields keep a neutral border and no blue focus ring',
);
assert.match(
  section,
  /\.auth-card label input:focus-visible \{ box-shadow: none !important; \}/,
  'auth inputs suppress the global blue focus ring',
);

console.log('auth-visual-tokens: ok');
