import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');
const api = readFileSync(join(root, '../src/lib/api.ts'), 'utf8');

test('composer exposes an accessible multi-file picker for images, PDF and text files', () => {
  assert.match(page, /type="file"/);
  assert.match(page, /multiple/);
  assert.match(page, /Fotos, PDF e arquivos de texto/);
  assert.match(page, /aria-label="Anexar arquivos e fotos"/);
});

test('operator transcript persists and renders attachment metadata', () => {
  assert.match(page, /attachments:\s*attachmentsToRun/);
  assert.match(page, /entry\.attachments/);
  assert.match(page, /luca-ai-attachment/);
});

test('both team and individual runs send the owner session and attachment ids', () => {
  assert.match(api, /uploadChatAttachment/);
  assert.match(api, /sessionId.*attachmentIds/s);
  assert.match(page, /attachmentsToRun\.map\(\(attachment\) => attachment\.id\)/);
});

test('an attachment can be sent without additional typed text', () => {
  assert.match(page, /mission\.trim\(\)\.length > 0 \|\| draftAttachments\.length > 0/);
  assert.match(page, /Analise os anexos enviados/);
});
