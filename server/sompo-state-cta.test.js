import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, '../src/pages/SompoPage.tsx'), 'utf8');
const panel = readFileSync(join(root, '../src/components/SompoTelemetryPanel.tsx'), 'utf8');

test('sompo case empty offers clear filters and is not error', () => {
  const start = page.indexOf('data-sompo-cases-empty');
  assert.ok(start >= 0, 'empty shell');
  const slice = page.slice(start, start + 1400);
  assert.ok(slice.includes('data-sompo-cases-clear'), 'clear CTA');
  assert.ok(slice.includes('Limpar busca e filtros'), 'clear label');
  assert.equal(slice.includes('data-sompo-templates-error'), false, 'templates error not inside cases empty');
});

test('sompo templates error has retry and list is not replaced by a spinner', () => {
  assert.ok(page.includes('data-sompo-templates-error'), 'templates error');
  assert.ok(page.includes('data-sompo-templates-retry'), 'retry');
  assert.ok(page.includes('loadTemplates()'), 'retry reloads templates');
  assert.equal(page.includes('Carregando equipes…'), false, 'no blocking spinner copy');
});

test('sompo telemetry separates empty, error and delayed loading', () => {
  assert.ok(panel.includes('data-sompo-telemetry-error'), 'error shell');
  assert.ok(panel.includes('data-sompo-telemetry-empty'), 'empty shell');
  assert.ok(panel.includes('data-sompo-telemetry-loading'), 'loading shell');
  assert.ok(panel.includes('data-sompo-telemetry-retry'), 'retry');
  const emptyAt = panel.indexOf('data-sompo-telemetry-empty');
  const emptySlice = panel.slice(emptyAt, emptyAt + 700);
  assert.equal(emptySlice.includes('data-sompo-telemetry-error'), false, 'error not inside empty');
});
