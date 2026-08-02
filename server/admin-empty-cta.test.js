// Source lock: Admin empty state exposes primary CTA (clear search or refresh).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/AdminPage.tsx'), 'utf8');
const css = readFileSync(join(root, '../src/index.css'), 'utf8');

test('admin empty state has recoverable primary CTA', () => {
  assert.ok(source.includes('data-admin-empty'), 'empty shell marker');
  assert.ok(source.includes('data-tone="empty"') || source.includes("data-tone='empty'"), 'empty tone');
  assert.ok(source.includes('data-admin-empty-clear'), 'clear-search CTA');
  assert.ok(source.includes('data-admin-empty-retry'), 'refresh CTA');
  assert.ok(source.includes('Limpar busca'), 'clear label');
  assert.ok(source.includes('Atualizar lista'), 'retry label');
  assert.ok(source.includes('Nenhuma conta encontrada'), 'empty title');
  assert.ok(source.includes('setSearch("")') || source.includes("setSearch('')"), 'clears search');
  assert.ok(source.includes('void load("")') || source.includes("void load('')"), 'reload without query');
});

test('admin empty block is not bare mono text', () => {
  const start = source.indexOf('data-admin-empty');
  assert.ok(start >= 0, 'empty block present');
  const slice = source.slice(start, start + 1200);
  assert.ok(slice.includes('admin-empty-actions'), 'actions row');
  assert.ok(slice.includes('btn-primary'), 'primary chrome');
  assert.ok(slice.includes('admin-empty-hint'), 'operator hint');
  assert.equal(slice.includes('data-admin-error'), false, 'error marker not inside empty');
});

test('admin empty CSS keeps actionable layout', () => {
  assert.ok(css.includes('.admin-state[data-admin-empty]'), 'empty shell css');
  assert.ok(css.includes('.admin-empty-actions'), 'actions css');
  assert.ok(css.includes('min-height: 44px'), 'touch target');
});
