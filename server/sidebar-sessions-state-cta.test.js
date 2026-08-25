import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/components/SidebarSessionsRail.tsx'), 'utf8');

test('sidebar sessions error has retry and is not empty', () => {
  assert.ok(source.includes('data-sidebar-sessions-error'), 'error shell');
  assert.ok(source.includes('data-sidebar-sessions-retry'), 'retry');
  assert.ok(source.includes('Tentar novamente'), 'retry label');
  const start = source.indexOf('data-sidebar-sessions-error');
  const slice = source.slice(start, start + 500);
  assert.equal(slice.includes('data-sidebar-sessions-empty'), false, 'empty not inside error');
});

test('sidebar sessions distinguishes first chat, search miss and empty folder', () => {
  assert.ok(source.includes('data-sidebar-sessions-empty="library"'), 'first-chat empty');
  assert.ok(source.includes('data-sidebar-sessions-empty="search"'), 'search empty');
  assert.ok(source.includes('data-sidebar-sessions-empty="folder"'), 'folder empty');
  assert.ok(source.includes('Começar o primeiro chat'), 'create first chat');
  assert.ok(source.includes('Limpar busca'), 'clear search');
  assert.ok(source.includes('Nova sessão aqui'), 'create in folder');
});

test('sidebar sessions loading is a deferred skeleton', () => {
  assert.ok(source.includes('data-sidebar-sessions-loading'), 'loading marker');
  assert.ok(source.includes('!ready && sessions.length === 0'), 'does not hide existing sessions');
});
