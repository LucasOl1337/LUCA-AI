// Source lock: Admin panel failure exposes retry CTA + error tone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/AdminPage.tsx'), 'utf8');

test('admin error state has recoverable CTA', () => {
  assert.ok(source.includes('data-admin-error'), 'error shell marker');
  assert.ok(source.includes('data-tone="error"') || source.includes("data-tone='error'"), 'error tone');
  assert.ok(source.includes('role="alert"') || source.includes("role='alert'"), 'alert role');
  assert.ok(source.includes('data-admin-retry'), 'retry button marker');
  assert.ok(source.includes('Tentar novamente'), 'retry label');
  assert.ok(source.includes('onClick={() => void load(search)}') || source.includes('void load(search)'), 'retry reloads panel');
});

test('admin error does not leave only dead mono text', () => {
  const start = source.indexOf('data-admin-error');
  assert.ok(start >= 0, 'error block present');
  const slice = source.slice(start, start + 900);
  assert.ok(slice.includes('data-admin-retry'), 'CTA inside error block');
  assert.ok(slice.includes('btn-primary'), 'primary action chrome');
  assert.ok(slice.includes('Falha ao carregar o painel'), 'operator-facing title');
  assert.equal(slice.includes('data-admin-empty'), false, 'empty marker not inside error');
});
