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
    assert.equal(share.url, `/leitura/${share.token}`);
    assert.equal(share.messageCount, 2);
  });

  // Public resolution runs OUTSIDE any workspace (anonymous visitor).
  const resolved = shareLinks.resolvePublicShare(share.token);
  assert.ok(resolved);
  assert.equal(resolved.snapshot.title, 'Sessão compartilhável');
  assert.equal(resolved.snapshot.transcript.length, 2);
  assert.equal(resolved.snapshot.finalResult.name, 'TARS');

  const payload = shareLinks.publicSharePayload(share.token);
  assert.equal(payload.snapshot.title, 'Sessão compartilhável');
  assert.equal(payload.snapshot.finalResult.name, 'TARS');
});

test('SHARE_LINKS_V1 public snapshot never carries private session attachments', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-share-attachments-'));
  const { workspace, chatLibrary, shareLinks } = await loadModules(dataDir);

  let share;
  workspace.runWithWorkspaceUser('owner-attachments', () => {
    const session = chatLibrary.createChatSession({ title: 'Sessão com anexo' });
    chatLibrary.updateChatSession(session.id, {
      transcript: [{
        id: 'op1',
        role: 'operator',
        name: 'Operador',
        content: 'Veja o arquivo em anexo.',
        timestamp: new Date().toISOString(),
        attachments: [{
          id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          name: 'sigiloso.txt',
          mimeType: 'text/plain',
          kind: 'text',
          size: 22,
          url: `/api/luca-ai/chat/sessions/${session.id}/attachments/aaaaaaaaaaaaaaaaaaaaaaaa`,
        }],
      }],
    });
    share = shareLinks.createShareLink(session.id);
  });

  const resolved = shareLinks.resolvePublicShare(share.token);
  // O texto continua público, mas nenhum handle de arquivo pode vazar:
  // /leitura/:token é anônimo, mas anexos privados continuam atrás de requireUser.
  assert.equal(resolved.snapshot.transcript.length, 1);
  assert.equal(resolved.snapshot.transcript[0].attachments, undefined);

  assert.doesNotMatch(JSON.stringify(resolved), /sigiloso\.txt/);
  assert.doesNotMatch(JSON.stringify(resolved), /\/attachments\//);
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

test('SHARE_LINKS_V1 deleting the owner session revokes its public link', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-share-delete-'));
  const { workspace, chatLibrary, shareLinks } = await loadModules(dataDir);
  let share;

  workspace.runWithWorkspaceUser('owner-delete-share', () => {
    const session = seedSession(chatLibrary, 'Apagar link');
    share = shareLinks.createShareLink(session.id);
    chatLibrary.deleteChatSession(session.id);
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

test('SHARE_LINKS_V1 returns unmodified text for React to render safely', async () => {
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

  const resolved = shareLinks.resolvePublicShare(share.token);
  assert.equal(resolved.snapshot.title, '<img src=x onerror=alert(1)>');
  assert.equal(resolved.snapshot.transcript[0].name, '<script>alert(2)</script>');
  assert.equal(resolved.snapshot.transcript[0].content, '<script>alert(3)</script>');
});

test('SHARE_LINKS_V2 keeps visual packs and rewrites only authorized local artifacts', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-share-visual-'));
  const { workspace, chatLibrary, shareLinks } = await loadModules(dataDir);
  let share;
  workspace.runWithWorkspaceUser('owner-visual', () => {
    const session = chatLibrary.createChatSession({ title: 'Sessão visual' });
    chatLibrary.updateChatSession(session.id, {
      visualPack: {
        status: 'complete',
        summary: 'Canvas pronto',
        charts: [{ id: 'ranking', kind: 'chart', title: 'Ranking', type: 'tower', items: [{ label: 'T01', value: 88 }] }],
        images: [{ id: 'mapa', kind: 'image', title: 'Mapa', status: 'ok', url: '/api/luca-ai/visual-artifacts/trace-1/mapa' }],
      },
    });
    share = shareLinks.createShareLink(session.id);
  });

  const payload = shareLinks.publicSharePayload(share.token);
  assert.equal(payload.snapshot.visualPack.summary, 'Canvas pronto');
  assert.equal(payload.snapshot.visualPack.charts[0].items[0].value, 88);
  assert.equal(
    payload.snapshot.visualPack.images[0].url,
    `/api/public/share/${share.token}/artifacts/trace-1/mapa`,
  );
  assert.deepEqual(
    shareLinks.resolvePublicShareArtifactAccess(share.token, 'trace-1', 'mapa'),
    { ownerUserId: 'owner-visual' },
  );
  assert.equal(shareLinks.resolvePublicShareArtifactAccess(share.token, 'trace-1', 'outro'), null);
});

test('SHARE_LINKS_V1 invalid or unknown token resolves to null', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-share-miss-'));
  const { shareLinks } = await loadModules(dataDir);
  assert.equal(shareLinks.resolvePublicShare(''), null);
  assert.equal(shareLinks.resolvePublicShare('nope'), null);
  assert.equal(shareLinks.resolvePublicShare('x'.repeat(200)), null);
});
