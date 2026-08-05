// Source lock: Tools catalog failure exposes retry CTA + error tone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/ToolsPage.tsx'), 'utf8');

test('tools error state has recoverable CTA', () => {
  assert.ok(source.includes('data-tools-error'), 'error shell marker');
  assert.ok(source.includes('data-tone="error"') || source.includes("data-tone='error'"), 'error tone');
  assert.ok(source.includes('role="alert"') || source.includes("role='alert'"), 'alert role');
  assert.ok(source.includes('data-tools-retry'), 'retry button marker');
  assert.ok(source.includes('Tentar novamente'), 'retry label');
  assert.ok(source.includes('function retryCatalog') || source.includes('retryCatalog()'), 'retry handler');
  assert.ok(source.includes('setReloadKey'), 'reload trigger');
});

test('tools error does not leave only dead mono text', () => {
  const start = source.indexOf('data-tools-error');
  assert.ok(start >= 0, 'error block present');
  const slice = source.slice(start, start + 900);
  assert.ok(slice.includes('data-tools-retry'), 'CTA inside error block');
  assert.ok(slice.includes('btn-primary'), 'primary action chrome');
  assert.equal(slice.includes('data-tools-loading'), false, 'loading marker not inside error');
});
