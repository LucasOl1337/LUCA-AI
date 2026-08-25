import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/ConfiguracaoPage.tsx'), 'utf8');

test('configuracao error state has recoverable CTA', () => {
  assert.ok(source.includes('data-config-error'), 'error shell marker');
  assert.ok(source.includes('data-config-retry'), 'retry marker');
  assert.ok(source.includes('Tentar novamente'), 'retry label');
  assert.ok(source.includes("role={tone === 'error' ? 'alert' : undefined}"), 'alert role');
});

test('configuracao empty state invites create and is not error', () => {
  const start = source.indexOf('data-config-empty');
  assert.ok(start >= 0, 'empty shell');
  const slice = source.slice(start, start + 1800);
  assert.ok(slice.includes('data-config-empty-create'), 'create CTA');
  assert.ok(slice.includes('Nenhuma equipe montada ainda'), 'team empty copy');
  assert.ok(slice.includes('Nenhum template individual ainda'), 'individual empty copy');
  assert.equal(slice.includes('data-config-error'), false, 'error not inside empty');
});

test('configuracao loading keeps list shape instead of a lone spinner', () => {
  assert.ok(source.includes('data-config-loading'), 'loading marker');
  assert.ok(source.includes('showListSkeleton'), 'deferred skeleton');
  assert.ok(source.includes('loading && list.length === 0'), 'does not replace a filled list');
});
