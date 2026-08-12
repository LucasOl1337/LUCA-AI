import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');
const styles = readFileSync(join(root, '../src/index.css'), 'utf8');
const card = page.slice(page.indexOf('function VisualPackCard'), page.indexOf('function LucaMissionBar'));

test('single visual artifact uses the full chat width without the old thumbnail cap', () => {
  assert.match(card, /images\.length === 1 \? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'/);
  assert.doesNotMatch(card, /max-h-80/);
  assert.match(styles, /\.luca-ai-visual-preview img[\s\S]*max-height: 70vh/);
});

test('visual artifact opens an accessible native-dialog lightbox', () => {
  assert.match(card, /<button[\s\S]*aria-haspopup="dialog"[\s\S]*setExpandedImage\(image\)/);
  assert.match(page, /<dialog[\s\S]*aria-labelledby="luca-ai-visual-lightbox-title"/);
  assert.match(page, /dialog\.showModal\(\)/);
  assert.match(page, /event\.key === 'Escape'|onCancel=/);
  assert.match(page, /lightboxTriggerRef\.current\?\.focus\(\)/);
  assert.match(page, /aria-label="Fechar imagem ampliada"/);
});
