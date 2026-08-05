import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const page = fs.readFileSync(path.join(root, 'src/pages/LucaAiPage.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');

test('CHAT_COPY_UX_V1 operator bubble has quick copy button', () => {
  assert.match(page, /import CopyLogButton from '@\/components\/CopyLogButton'/);
  assert.match(page, /Copiar mensagem enviada/);
  assert.match(page, /luca-ai-message-copy-operator/);
  assert.match(page, /luca-ai-operator-bubble/);
});

test('CHAT_COPY_UX_V1 persona and judge replies expose copy actions', () => {
  assert.match(page, /Copiar resposta de \$\{entry\.name\}/);
  assert.match(page, /Copiar veredito/);
  assert.match(page, /Copiar mensagem de \$\{entry\.name\}/);
});

test('CHAT_COPY_UX_V1 chat text is explicitly selectable', () => {
  assert.match(css, /\.luca-ai-selectable/);
  assert.match(css, /user-select:\s*text/);
  assert.match(css, /-webkit-user-select:\s*text/);
});
