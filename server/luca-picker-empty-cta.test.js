// Source lock: LUCA-AI persona picker empty exposes clear/close CTAs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');

test('picker empty state has recoverable primary CTA', () => {
  assert.ok(source.includes('data-luca-picker-empty'), 'empty shell marker');
  assert.ok(source.includes('data-tone="empty"') || source.includes("data-tone='empty'"), 'empty tone');
  assert.ok(source.includes('data-luca-picker-clear'), 'clear-search CTA');
  assert.ok(source.includes('data-luca-picker-close'), 'close CTA');
  assert.ok(source.includes('Limpar busca'), 'clear label');
  assert.ok(source.includes('Nenhuma persona corresponde à busca'), 'search empty title');
  assert.ok(source.includes('Nenhuma persona disponível no catálogo'), 'catalog empty title');
  assert.ok(source.includes('onQuery("")') || source.includes("onQuery('')"), 'clears search');
});

test('picker empty block is not bare mono text', () => {
  const start = source.indexOf('data-luca-picker-empty');
  assert.ok(start >= 0, 'empty block present');
  const slice = source.slice(start, start + 1400);
  assert.ok(slice.includes('btn-primary'), 'primary chrome');
  assert.ok(slice.includes('data-luca-picker-clear'), 'CTA inside empty block');
  assert.ok(slice.includes('data-luca-picker-close'), 'close inside empty block');
  assert.equal(slice.includes('data-admin-empty'), false, 'admin marker not inside picker empty');
  // dead text-only paragraph must not remain as sole recovery
  assert.ok(!/data-luca-picker-empty[\s\S]{0,80}<p className="px-4 py-12/.test(source), 'no bare py-12 only empty');
});
