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
  const chatLibrary = await import(pathToFileURL(path.resolve('server/chat-library.js')).href);
  const attachments = await import(
    `${pathToFileURL(path.resolve('server/chat-attachments.js')).href}?attachments=${bust}`
  );
  return { workspace, chatLibrary, attachments };
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('CHAT_ATTACHMENTS_V1 stores an image inside its owner session and builds a vision part', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-attachments-'));
  const { workspace, chatLibrary, attachments } = await loadModules(dataDir);

  workspace.runWithWorkspaceUser('owner-a', () => {
    const session = chatLibrary.createChatSession({ title: 'Imagem' });
    const stored = attachments.storeChatAttachment({
      sessionId: session.id,
      name: 'quadro.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });

    assert.equal(stored.name, 'quadro.png');
    assert.equal(stored.kind, 'image');
    assert.equal(stored.size, PNG_1X1.length);
    assert.match(stored.url, new RegExp(`/api/luca-ai/chat/sessions/${session.id}/attachments/${stored.id}$`));

    const resolved = attachments.resolveChatAttachmentsForModel(session.id, [stored.id]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].meta.id, stored.id);
    assert.equal(resolved[0].part.type, 'image_url');
    assert.match(resolved[0].part.image_url.url, /^data:image\/png;base64,/);
  });
});

test('CHAT_ATTACHMENTS_V1 rejects spoofed image content and cross-account reads', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-attachments-security-'));
  const { workspace, chatLibrary, attachments } = await loadModules(dataDir);
  let sessionId;
  let attachmentId;

  workspace.runWithWorkspaceUser('owner-security', () => {
    const session = chatLibrary.createChatSession({ title: 'Seguro' });
    sessionId = session.id;
    assert.throws(() => attachments.storeChatAttachment({
      sessionId,
      name: 'falso.png',
      mimeType: 'image/png',
      buffer: Buffer.from('nao e imagem'),
    }), /attachment_signature_mismatch/);
    attachmentId = attachments.storeChatAttachment({
      sessionId,
      name: 'real.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    }).id;
  });

  workspace.runWithWorkspaceUser('intruder-security', () => {
    assert.throws(
      () => attachments.getChatAttachment(sessionId, attachmentId),
      /session_not_found/,
    );
  });
});

test('CHAT_ATTACHMENTS_V1 cascade folder delete leaves no orphan attachment on disk', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-attachments-cascade-'));
  const { workspace, chatLibrary, attachments } = await loadModules(dataDir);

  workspace.runWithWorkspaceUser('owner-cascade', () => {
    const folder = chatLibrary.createChatFolder({ name: 'Projeto' });
    const session = chatLibrary.createChatSession({ title: 'Com anexo', folderId: folder.id });
    const stored = attachments.storeChatAttachment({
      sessionId: session.id,
      name: 'quadro.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    assert.ok(attachments.getChatAttachment(session.id, stored.id));

    // Cascade drops the sessions; their private files must not survive on disk.
    chatLibrary.deleteChatFolder(folder.id, { cascadeSessions: true });

    const leftovers = attachments.listStoredAttachmentSessionIds([session.id]);
    assert.equal(leftovers.includes(session.id), false, 'attachment directory outlived its session');
  });
});
