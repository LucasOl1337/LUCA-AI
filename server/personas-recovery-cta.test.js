// Source lock: falha das fontes de personas + vazio expõem CTAs recuperáveis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/PersonasPage.tsx'), 'utf8');

test('personas error state has recoverable CTA', () => {
  assert.ok(source.includes('data-personas-error'), 'error shell marker');
  assert.ok(source.includes('data-tone={tone}') || source.includes('data-tone="error"'), 'tone marker');
  assert.ok(
    source.includes("role={tone === 'error' ? 'alert' : undefined}") || source.includes('role="alert"'),
    'alert role',
  );
  assert.ok(source.includes('data-personas-retry'), 'retry button marker');
  assert.ok(source.includes('Tentar novamente'), 'retry label');
  assert.ok(source.includes('onClick={() => void load()}'), 'retry calls load');
  assert.ok(source.includes('title="Fontes de personas indisponíveis"'), 'persona sources error title');
  // retry is passed as Notice actions (call site), not inside Notice function body
  const titleAt = source.indexOf('title="Fontes de personas indisponíveis"');
  assert.ok(titleAt >= 0, 'error title present');
  const callSite = source.slice(titleAt, titleAt + 500);
  assert.ok(callSite.includes('data-personas-retry'), 'retry next to persona sources error title');
  assert.ok(callSite.includes('btn-primary'), 'primary action chrome');
});

test('personas empty state has actionable CTA', () => {
  const start = source.indexOf('data-personas-empty');
  assert.ok(start >= 0, 'empty shell present');
  const slice = source.slice(start, start + 2200);
  assert.ok(slice.includes('data-personas-clear-filters'), 'clear filters CTA');
  assert.ok(slice.includes('data-personas-open-yume'), 'open Yume CTA');
  assert.ok(slice.includes('data-personas-empty-reload'), 'secondary reload');
  assert.ok(slice.includes('Limpar busca e filtro'), 'clear label');
  assert.ok(slice.includes('Abrir Yume'), 'yume label');
  assert.equal(slice.includes('data-personas-error'), false, 'error marker not inside empty');
  assert.equal(slice.includes('data-personas-retry'), false, 'retry marker not inside empty');
});
