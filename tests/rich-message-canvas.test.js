import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';
import { canvasProps, canvasVariants, messageCases } from './support/rich-message-cases.js';

const { LucaMissionCanvas } = await loadFrontendModule('../../src/pages/LucaAiPage.tsx');
// Golden hashes captured from the real canvas at 1139459 before extracting the renderer.
// They cover the whole HTML output, including classes, styles, theme and card structure.
const baseline = JSON.parse(readFileSync(new URL('./fixtures/rich-message-canvas.json', import.meta.url), 'utf8'));

for (const sample of messageCases) {
  for (const variant of canvasVariants) {
    test(`real canvas preserves ${sample.id} in ${variant}`, () => {
      const html = renderToStaticMarkup(createElement(LucaMissionCanvas, canvasProps(sample.content, variant)));
      for (const fragment of sample.includes) assert.ok(html.includes(fragment), `missing ${fragment}`);
      for (const fragment of sample.excludes || []) assert.ok(!html.includes(fragment), `unexpected ${fragment}`);
      assert.equal(createHash('sha256').update(html).digest('hex'), baseline[`${sample.id}/${variant}`]);
      if (variant.endsWith('response')) {
        assert.match(html, /<details class="luca-ai-response luca-ai-message group"/);
        assert.ok(html.includes('Copiar resposta de Persona fixture'));
      }
      if (variant.endsWith('final')) {
        assert.ok(!html.includes('<details'));
        assert.ok(html.includes('Copiar entrega final'));
      }
      if (variant.startsWith('individual')) assert.ok(html.includes('data-luca-individual-phase="blind"'));
    });
  }
}
