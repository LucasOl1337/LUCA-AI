import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadModules(dataDir) {
  process.env.LUCA_DATA_DIR = dataDir;
  const bust = `${Date.now()}-${Math.random()}`;
  const workspace = await import(pathToFileURL(path.resolve('server/workspace-context.js')).href);
  // NOTE: chat-library must be the CANONICAL instance (no cache-bust) because
  // share-links.js statically imports './chat-library.js' — a busted copy here
  // would be a different module instance and share-links would not see sessions.
  const chatLibrary = await import(pathToFileURL(path.resolve('server/chat-library.js')).href);
  const shareLinks = await import(
    `${pathToFileURL(path.resolve('server/share-links.js')).href}?share=${bust}`
  );
  return { workspace, chatLibrary, shareLinks };
}

function seedSession(chatLibrary, title = 'Sessão compartilhável') {
  const session = chatLibrary.createChatSession({ title });
  chatLibrary.updateChatSession(session.id, {
    missionDraft: 'Qual a coisa mais importante do universo?',
    transcript: [
      { id: 'op1', role: 'operator', name: 'Operador', content: 'Qual a coisa mais importante do universo?', timestamp: new Date().toISOString() },
      { id: 'p1', role: 'persona', name: 'Aurora', slug: 'aurora', model: 'gpt-5.6-sol-high', stage: 'Resposta individual', content: '## Análise\n- Consciência\n- **Memória**', timestamp: new Date().toISOString() },
    ],
    finalResult: { id: 'f1', role: 'persona', name: 'TARS', slug: 'tars', stage: 'Veredito do juiz', content: '> Preservar as condições para florescer.', timestamp: new Date().toISOString() },
  });
  return session;
}

test('SHARE_LINKS_V1 creates public snapshot link and resolves without auth context', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-share-'));
  const { workspace, chatLibrary, shareLinks } = await loadModules(dataDir);

  let share;
  workspace.runWithWorkspaceUser('owner-a', () => {
    const session = seedSession(chatLibrary);
    share = shareLinks.createShareLink(session.id);
    assert.ok(share.token.length >= 16);
    assert.equal(share.url, `/s/${share.token}`);
    assert.equal(share.messageCount, 2);
  });

  // Public resolution runs OUTSIDE any workspace (anonymous visitor).
  const resolved = shareLinks.resolvePublicShare(share.token);
  assert.ok(resolved);
  assert.equal(resolved.snapshot.title, 'Sessão compartilhável');
  assert.equal(resolved.snapshot.transcript.length, 2);
  assert.equal(resolved.snapshot.finalResult.name, 'TARS');

  const html = shareLinks.renderShareHtml(resolved);
  assert.match(html, /Sessão compartilhável/);
  assert.match(html, /Visualização pública/);
  assert.match(html, /Resultado final/);
  assert.match(html, /<blockquote>Preservar as condições para florescer\.<\/blockquote>/);
  assert.match(html, /<strong>Memória<\/strong>/);
  // No auth artifacts and content is escaped, not scriptable.
  assert.doesNotMatch(html, /<script/i);
});

test('SHARE_LINKS_V1 snapshot is immutable until refreshed and revoke kills the link', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-share-immutable-'));
  const { workspace, chatLibrary, shareLinks } = await loadModules(dataDir);

  let share;
  let sessionId;
  workspace.runWithWorkspaceUser('owner-b', () => {
    const session = seedSession(chatLibrary, 'Antes');
    sessionId = session.id;
    share = shareLinks.createShareLink(sessionId);
    // Mutate the live session AFTER sharing.
    chatLibrary.updateChatSession(sessionId, {
      title: 'Depois',
      appendTranscript: [{ id: 'p2', role: 'persona', name: 'Nova', content: 'mensagem nova', timestamp: new Date().toISOString() }],
    });
  });

  // Public view still shows the snapshot taken at share time.
  let resolved = shareLinks.resolvePublicShare(share.token);
  assert.equal(resolved.snapshot.title, 'Antes');
  assert.equal(resolved.snapshot.transcript.length, 2);

  // Refresh keeps the SAME token but updates the snapshot.
  workspace.runWithWorkspaceUser('owner-b', () => {
    const refreshed = shareLinks.createShareLink(sessionId);
    assert.equal(refreshed.token, share.token);
  });
  resolved = shareLinks.resolvePublicShare(share.token);
  assert.equal(resolved.snapshot.title, 'Depois');
  assert.equal(resolved.snapshot.transcript.length, 3);

  // Revoke: public resolution dies, owner query returns null.
  workspace.runWithWorkspaceUser('owner-b', () => {
    shareLinks.revokeShareLink(sessionId);
    assert.equal(shareLinks.getShareLinkForSession(sessionId), null);
  });
  assert.equal(shareLinks.resolvePublicShare(share.token), null);
});

test('SHARE_LINKS_V1 cannot share or revoke another account session', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-share-isolation-'));
  const { workspace, chatLibrary, shareLinks } = await loadModules(dataDir);

  let sessionId;
  workspace.runWithWorkspaceUser('owner-c', () => {
    sessionId = seedSession(chatLibrary).id;
  });

  workspace.runWithWorkspaceUser('intruder', () => {
    assert.throws(() => shareLinks.createShareLink(sessionId), /session_not_found/);
    assert.throws(() => shareLinks.revokeShareLink(sessionId), /share_not_found/);
    assert.equal(shareLinks.getShareLinkForSession(sessionId), null);
  });
});

test('SHARE_LINKS_V1 escapes HTML injection in shared content', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-share-xss-'));
  const { workspace, chatLibrary, shareLinks } = await loadModules(dataDir);

  let share;
  workspace.runWithWorkspaceUser('owner-x', () => {
    const session = chatLibrary.createChatSession({ title: '<img src=x onerror=alert(1)>' });
    chatLibrary.updateChatSession(session.id, {
      transcript: [
        { id: '1', role: 'persona', name: '<script>alert(2)</script>', content: '<script>alert(3)</script>', timestamp: new Date().toISOString() },
      ],
    });
    share = shareLinks.createShareLink(session.id);
  });

  const html = shareLinks.renderShareHtml(shareLinks.resolvePublicShare(share.token));
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;/);
});

test('SHARE_LINKS_V1 invalid or unknown token resolves to null', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-share-miss-'));
  const { shareLinks } = await loadModules(dataDir);
  assert.equal(shareLinks.resolvePublicShare(''), null);
  assert.equal(shareLinks.resolvePublicShare('nope'), null);
  assert.equal(shareLinks.resolvePublicShare('x'.repeat(200)), null);
});
