// Source lock: LUCA-AI chat canvas empty exposes focus-mission CTA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');

test('canvas empty state has focus-mission primary CTA', () => {
  assert.ok(source.includes('data-luca-canvas-empty'), 'empty shell marker');
  assert.ok(source.includes('data-tone="empty"') || source.includes("data-tone='empty'"), 'empty tone');
  assert.ok(source.includes('data-luca-canvas-focus-mission'), 'focus mission CTA');
  assert.ok(source.includes('Escrever missão'), 'CTA label');
  assert.ok(source.includes("getElementById('luca-ai-mission')") || source.includes('getElementById("luca-ai-mission")'), 'targets mission input');
  assert.ok(source.includes("O que a equipe deve entregar?"), 'team empty title kept');
  assert.ok(source.includes('Qual problema deve ser julgado?'), 'individual empty title kept');
});

test('canvas empty block is not bare mono text', () => {
  const start = source.indexOf('data-luca-canvas-empty');
  assert.ok(start >= 0, 'empty block present');
  const slice = source.slice(start, start + 2200);
  assert.ok(slice.includes('btn-primary'), 'primary chrome');
  assert.ok(slice.includes('data-luca-canvas-focus-mission'), 'CTA inside empty block');
  assert.ok(slice.includes('Escrever missão'), 'label inside empty block');
  assert.equal(slice.includes('data-luca-picker-empty'), false, 'picker marker not inside canvas empty');
  assert.equal(slice.includes('data-admin-empty'), false, 'admin marker not inside canvas empty');
});
