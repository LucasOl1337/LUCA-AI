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
  // chat-library must stay the CANONICAL instance: chat-attachments imports it
  // statically, so a cache-busted copy would be a different module instance.
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

test('CHAT_ATTACHMENTS_V1 keeps text files readable as an input_file part', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-attachments-text-'));
  const { workspace, chatLibrary, attachments } = await loadModules(dataDir);

  workspace.runWithWorkspaceUser('owner-text', () => {
    const session = chatLibrary.createChatSession({ title: 'Texto' });
    const stored = attachments.storeChatAttachment({
      sessionId: session.id,
      name: 'notas.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Plano\nsegredo: katorze'),
    });
    assert.equal(stored.kind, 'text');

    const [resolved] = attachments.resolveChatAttachmentsForModel(session.id, [stored.id]);
    assert.equal(resolved.part.type, 'input_file');
    assert.equal(resolved.part.filename, 'notas.md');
    const base64 = resolved.part.file_data.split(',')[1];
    assert.match(Buffer.from(base64, 'base64').toString('utf8'), /segredo: katorze/);
  });
});

test('CHAT_ATTACHMENTS_V1 recusa PDF enquanto nenhum modelo do catalogo souber ler', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-attachments-pdf-'));
  const { workspace, chatLibrary, attachments } = await loadModules(dataDir);

  workspace.runWithWorkspaceUser('owner-pdf', () => {
    const session = chatLibrary.createChatSession({ title: 'PDF' });
    // Probes contra o 9Router local: gpt-5.6-sol, claude-fable-5 e grok-4.5
    // respondem sem enxergar o PDF, em input_file e em file/file_data.
    // Aceitar o upload faria a persona responder com confianca sobre um arquivo
    // que nunca leu — pior que recusar na porta.
    assert.throws(() => attachments.storeChatAttachment({
      sessionId: session.id,
      name: 'relatorio.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nconteudo'),
    }), /attachment_pdf_not_supported/);
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
    // Extension/MIME lie about the bytes — must not be trusted.
    assert.throws(() => attachments.storeChatAttachment({
      sessionId,
      name: 'falso.png',
      mimeType: 'image/png',
      buffer: Buffer.from('nao e imagem'),
    }), /attachment_signature_mismatch/);
    // Executables and other binaries are not a supported attachment type.
    assert.throws(() => attachments.storeChatAttachment({
      sessionId,
      name: 'virus.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ\u0000\u0000binario'),
    }), /attachment_type_not_supported/);
    attachmentId = attachments.storeChatAttachment({
      sessionId,
      name: 'real.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    }).id;
  });

  workspace.runWithWorkspaceUser('intruder-security', () => {
    // Another account knows the ids but must never reach the bytes.
    assert.throws(() => attachments.getChatAttachment(sessionId, attachmentId), /session_not_found/);
    assert.throws(
      () => attachments.resolveChatAttachmentsForModel(sessionId, [attachmentId]),
      /session_not_found/,
    );
  });
});

test('CHAT_ATTACHMENTS_V1 path traversal ids never escape the session directory', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-attachments-traversal-'));
  const { workspace, chatLibrary, attachments } = await loadModules(dataDir);

  workspace.runWithWorkspaceUser('owner-traversal', () => {
    const session = chatLibrary.createChatSession({ title: 'Traversal' });
    for (const evil of ['../../etc/passwd', '..\\..\\secret', 'a/../../b', '']) {
      assert.throws(() => attachments.getChatAttachment(session.id, evil), /attachment_not_found/);
    }
    // A traversal-style filename is flattened, never used as a path.
    const stored = attachments.storeChatAttachment({
      sessionId: session.id,
      name: '../../../evil.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('conteudo'),
    });
    assert.equal(stored.name, 'evil.txt');
  });
});

test('CHAT_ATTACHMENTS_V1 deleting a session removes its files from disk', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-attachments-delete-'));
  const { workspace, chatLibrary, attachments } = await loadModules(dataDir);

  workspace.runWithWorkspaceUser('owner-delete', () => {
    const session = chatLibrary.createChatSession({ title: 'Apagar' });
    attachments.storeChatAttachment({
      sessionId: session.id,
      name: 'quadro.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    assert.deepEqual(attachments.listStoredAttachmentSessionIds([session.id]), [session.id]);

    attachments.deleteAllChatAttachments(session.id);
    assert.deepEqual(attachments.listStoredAttachmentSessionIds([session.id]), []);
  });
});

test('CHAT_ATTACHMENTS_V1 limita bytes acumulados por sessao para evitar exaustao de disco', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-attachments-quota-'));
  const { workspace, chatLibrary, attachments } = await loadModules(dataDir);

  workspace.runWithWorkspaceUser('owner-quota', () => {
    const session = chatLibrary.createChatSession({ title: 'Quota' });
    // O limite de 4 anexos so valia na hora de rodar; o upload em si era ilimitado,
    // entao dava para acumular arquivos nunca referenciados ate encher o disco.
    const blob = Buffer.alloc(2 * 1024 * 1024, 0x41);
    let stored = 0;
    let blocked = null;
    for (let i = 0; i < 60 && !blocked; i += 1) {
      try {
        attachments.storeChatAttachment({
          sessionId: session.id,
          name: `nota-${i}.txt`,
          mimeType: 'text/plain',
          buffer: blob,
        });
        stored += 1;
      } catch (error) {
        blocked = error;
      }
    }
    assert.ok(blocked, 'upload ilimitado deveria ser barrado por quota');
    assert.match(String(blocked.message), /attachment_session_quota_exceeded/);
    assert.ok(stored * blob.length <= attachments.MAX_CHAT_SESSION_STORAGE_BYTES);
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
