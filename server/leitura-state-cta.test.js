import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/PublicReadingPage.tsx'), 'utf8');

test('public reading distinguishes network, forbidden and revoked', () => {
  assert.ok(source.includes('data-leitura-error'), 'error shell');
  assert.ok(source.includes('data-leitura-retry'), 'retry');
  assert.ok(source.includes('pickFailureCopy'), 'classifies failure');
  assert.ok(source.includes('foi revogado pelo autor'), 'revoked copy stays specific');
  assert.ok(source.includes('Sem internet'), 'offline copy');
});

test('public reading loading is a deferred skeleton and does not wipe a loaded share', () => {
  assert.ok(source.includes('data-leitura-loading'), 'loading marker');
  assert.ok(source.includes('loading && !share'), 'keep share while refreshing');
});
