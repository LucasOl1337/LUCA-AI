import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';
import { messageCases } from './support/rich-message-cases.js';

const { parseMessageBlocks, inlineTextParts } = await loadFrontendModule('../../src/components/rich-message/message-format.ts');
const { RichMessageBody } = await loadFrontendModule('../../src/components/rich-message/RichMessageBody.tsx');
const { LUCA_THEME } = await loadFrontendModule('../../src/hooks/useTheme.tsx');

for (const content of ['', '  \r\n', '---\n***\n___']) {
  test(`empty/separator input yields a readable fallback: ${JSON.stringify(content)}`, () => {
    assert.deepEqual(parseMessageBlocks(content), [{ kind: 'paragraph', body: 'Sem conteúdo textual.' }]);
  });
}

test('code fences preserve indentation, blank lines and literal markdown, including an unclosed fence', () => {
  assert.deepEqual(parseMessageBlocks(messageCases.find(({ id }) => id === 'code').content), [
    { kind: 'code', language: 'ts', body: '  const value = "<tag>";\n\n  **literal**' },
    { kind: 'code', language: undefined, body: 'no language' },
  ]);
  assert.deepEqual(parseMessageBlocks('```\n```\nFim'), [
    { kind: 'code', language: undefined, body: '' }, { kind: 'paragraph', label: undefined, body: 'Fim' },
  ]);
});

test('tables strip outer markdown and preserve uneven rows for header-aligned rendering', () => {
  assert.deepEqual(parseMessageBlocks(messageCases.find(({ id }) => id === 'table').content), [
    { kind: 'table', headers: ['Nome', 'Estado', 'Nota'], rows: [['A', 'OK'], ['B', '', 'extra', 'ignorado']] },
    { kind: 'paragraph', label: undefined, body: 'Depois' },
  ]);
  assert.deepEqual(parseMessageBlocks('A | B\n-- | --\n1 | 2'), [
    { kind: 'table', headers: ['A', 'B'], rows: [['1', '2']] },
  ]);
});

test('pipes without a divider remain text and a divider-only table may have no rows', () => {
  assert.deepEqual(parseMessageBlocks('| A | B |'), [{ kind: 'paragraph', label: undefined, body: '| A | B |' }]);
  assert.deepEqual(parseMessageBlocks('| A | B |\n| -- | -- |'), [{ kind: 'table', headers: ['A', 'B'], rows: [] }]);
});

test('list markers, numbered labels and label-only bullets keep their existing semantics', () => {
  assert.deepEqual(parseMessageBlocks(messageCases.find(({ id }) => id === 'lists').content), [
    { kind: 'bullet', label: 'Risco', body: 'alto' },
    { kind: 'bullet', label: undefined, body: 'normal **forte**' },
    { kind: 'bullet', label: undefined, body: 'outro' },
    { kind: 'bullet', label: '01', body: 'Primeiro' },
    { kind: 'bullet', label: '12', body: 'executar' },
    { kind: 'bullet', label: 'Sozinho', body: 'Sozinho' },
  ]);
});

test('images accept HTTP(S) and local paths, use fallback alt text, and reject other syntax as text', () => {
  assert.deepEqual(parseMessageBlocks(messageCases.find(({ id }) => id === 'images').content), [
    { kind: 'image', alt: 'Mapa', src: 'https://example.test/map.png' },
    { kind: 'image', alt: 'Imagem da entrega', src: '/image.png' },
    { kind: 'image', alt: 'HTTP', src: 'http://example.test/img.png' },
    { kind: 'paragraph', label: undefined, body: '![unsafe](javascript:alert)' },
    { kind: 'paragraph', label: undefined, body: '![inline](/other.png) trailing' },
  ]);
});

test('headings, labels and outer markdown normalization retain the custom format, not full Markdown', () => {
  assert.deepEqual(parseMessageBlocks('# **Título**\n## Dois\n### Três\n#### Quatro\n##### Literal\n**Resumo**: claro\nChave: valor\n**Só título**\n__texto__'), [
    { kind: 'heading', label: 'Título', level: 1 },
    { kind: 'heading', label: 'Dois', level: 2 },
    { kind: 'heading', label: 'Três', level: 3 },
    { kind: 'heading', label: 'Quatro', level: 4 },
    { kind: 'paragraph', label: undefined, body: '##### Literal' },
    { kind: 'paragraph', label: 'Resumo', body: 'claro' },
    { kind: 'paragraph', label: 'Chave', body: 'valor' },
    { kind: 'heading', label: 'Só título', level: 3 },
    { kind: 'paragraph', label: undefined, body: 'texto' },
  ]);
});

test('mixed content preserves block order rather than merging neighboring paragraphs', () => {
  assert.deepEqual(parseMessageBlocks(messageCases.find(({ id }) => id === 'mixed').content).map(({ kind }) => kind), [
    'heading', 'paragraph', 'bullet', 'bullet', 'table', 'code', 'image', 'paragraph',
  ]);
});

test('inline emphasis preserves text segments, adjacent bold spans, empty and unmatched markers', () => {
  assert.deepEqual(inlineTextParts('A **B****C** D **incompleto'), [
    { text: 'A ', strong: false }, { text: 'B', strong: true }, { text: 'C', strong: true },
    { text: ' D **incompleto', strong: false },
  ]);
  assert.deepEqual(inlineTextParts(''), [{ text: '', strong: false }]);
  assert.deepEqual(inlineTextParts('__literal__'), [{ text: '__literal__', strong: false }]);
});

for (const sample of messageCases) {
  for (const compact of [false, true]) {
    test(`real RichMessageBody renders ${sample.id} (${compact ? 'compact' : 'normal'})`, () => {
      const html = renderToStaticMarkup(createElement(RichMessageBody, { content: sample.content, compact }));
      for (const fragment of sample.includes) assert.ok(html.includes(fragment), `missing ${fragment}`);
      for (const fragment of sample.excludes || []) assert.ok(!html.includes(fragment), `unexpected ${fragment}`);
      assert.ok(html.includes(`class="luca-ai-prose luca-wrap ${compact ? 'text-[13px]' : ''}"`));
      assert.ok(html.includes(`style="color:${LUCA_THEME.textSoft}"`));
    });
  }
}

test('InlineText uses the real theme and React escapes HTML in labels and paragraphs', () => {
  const html = renderToStaticMarkup(createElement(RichMessageBody, { content: 'A **<script>bad</script>** Z' }));
  assert.ok(html.includes(`<strong style="color:${LUCA_THEME.text}">&lt;script&gt;bad&lt;/script&gt;</strong>`));
  assert.ok(!html.includes('<script>'));
});
