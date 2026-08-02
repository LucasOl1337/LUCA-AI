// Source lock: state-badge + term-line use product status/action rails, not soft ad-hoc hex.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(root, '../src/index.css'), 'utf8');

function rule(selector) {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}',
  );
  const m = css.match(re);
  assert.ok(m, `rule ${selector} present`);
  return m[0];
}

const ok = rule('.state-badge.ok');
const err = rule('.state-badge.error');
const warn = rule('.state-badge.warning');
const start = rule('.term-line-start');
const done = rule('.term-line-done');
const fail = rule('.term-line-fail');

const banned = ['#8dffb0', '#ffc566', '#6ee790'];
for (const hex of banned) {
  assert.equal(ok.includes(hex), false, `state-badge.ok still has ${hex}`);
  assert.equal(err.includes(hex), false, `state-badge.error still has ${hex}`);
  assert.equal(warn.includes(hex), false, `state-badge.warning still has ${hex}`);
  assert.equal(done.includes(hex), false, `term-line-done still has ${hex}`);
  assert.equal(fail.includes(hex), false, `term-line-fail still has ${hex}`);
}

// soft error text may still exist outside badges; ban only in status/term rules
assert.equal(err.includes('#ff8a83'), false, 'state-badge.error must not use soft #ff8a83');
assert.equal(fail.includes('#ff8a83'), false, 'term-line-fail must not use soft #ff8a83');
assert.equal(start.includes('#64d2ff'), false, 'term-line-start must use token not raw #64d2ff');

assert.ok(ok.includes('var(--l-ok)'), 'state-badge.ok uses --l-ok');
assert.ok(ok.includes('var(--l-ok-bg)'), 'state-badge.ok keeps --l-ok-bg');
assert.ok(err.includes('var(--l-error)'), 'state-badge.error uses --l-error');
assert.ok(err.includes('var(--l-error-bg)'), 'state-badge.error keeps --l-error-bg');
assert.ok(warn.includes('var(--l-warning)'), 'state-badge.warning uses --l-warning');
assert.ok(warn.includes('var(--l-warning-bg)'), 'state-badge.warning keeps --l-warning-bg');
assert.ok(start.includes('var(--l-navy-deep)'), 'term-line-start uses --l-navy-deep');
assert.ok(done.includes('var(--l-ok)'), 'term-line-done uses --l-ok');
assert.ok(fail.includes('var(--l-error)'), 'term-line-fail uses --l-error');

console.log('state-badge-visual-tokens: ok');
