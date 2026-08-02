// Source lock: LUCA-AI activity tab empty exposes focus-mission CTA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');

test('activity empty state has focus-mission primary CTA', () => {
  assert.ok(source.includes('data-luca-activity-empty'), 'empty shell marker');
  assert.ok(source.includes('data-luca-activity-focus-mission'), 'focus mission CTA');
  assert.ok(source.includes('Nenhuma atividade nesta sessão'), 'empty title');
  assert.ok(source.includes('Escrever missão'), 'CTA label present');
  assert.ok(
    source.includes("getElementById('luca-ai-mission')") || source.includes('getElementById("luca-ai-mission")'),
    'targets mission input',
  );
});

test('activity empty block is not bare mono text', () => {
  const start = source.indexOf('data-luca-activity-empty');
  assert.ok(start >= 0, 'empty block present');
  const slice = source.slice(start, start + 1600);
  assert.ok(slice.includes('data-tone="empty"') || slice.includes("data-tone='empty'"), 'empty tone');
  assert.ok(slice.includes('btn-primary'), 'primary chrome');
  assert.ok(slice.includes('data-luca-activity-focus-mission'), 'CTA inside empty block');
  assert.ok(slice.includes('Escrever missão'), 'label inside empty block');
  assert.ok(slice.includes('!running'), 'CTA gated while running');
  assert.equal(slice.includes('data-luca-canvas-empty'), false, 'canvas empty not inside activity empty');
  assert.equal(slice.includes('data-luca-picker-empty'), false, 'picker empty not inside activity empty');
  assert.equal(slice.includes('data-luca-chat-error'), false, 'chat error not inside activity empty');
});
