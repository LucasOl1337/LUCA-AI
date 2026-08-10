import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadChatLibrary(dataDir) {
  process.env.LUCA_DATA_DIR = dataDir;
  const workspaceUrl = pathToFileURL(path.resolve('server/workspace-context.js')).href;
  const libraryUrl = pathToFileURL(path.resolve('server/chat-library.js')).href
    + `?chatlib=${Date.now()}-${Math.random()}`;
  const workspace = await import(workspaceUrl);
  const chatLibrary = await import(libraryUrl);
  return { workspace, chatLibrary };
}

test('CHAT_LIBRARY_V1 creates sessions and folders per account', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  let sessionA;
  let folderA;
  workspace.runWithWorkspaceUser('user-a', () => {
    folderA = chatLibrary.createChatFolder({ name: 'LUCA AI' });
    sessionA = chatLibrary.createChatSession({ title: 'Hospedagem Yume', folderId: folderA.id });
    chatLibrary.updateChatSession(sessionA.id, {
      missionDraft: 'subir yume',
      transcript: [{ id: '1', role: 'operator', name: 'Você', content: 'subir yume', timestamp: new Date().toISOString() }],
    });
    const snap = chatLibrary.getChatLibrarySnapshot();
    assert.equal(snap.folders.length, 1);
    assert.equal(snap.folders[0].name, 'LUCA AI');
    assert.ok(snap.sessions.some((item) => item.id === sessionA.id));
    assert.equal(snap.activeSessionId, sessionA.id);
    assert.equal(snap.activeSession.missionDraft, 'subir yume');
  });

  workspace.runWithWorkspaceUser('user-b', () => {
    const snap = chatLibrary.getChatLibrarySnapshot();
    assert.equal(snap.folders.length, 0);
    assert.ok(!snap.sessions.some((item) => item.id === sessionA.id));
    chatLibrary.createChatSession({ title: 'Só B' });
  });

  workspace.runWithWorkspaceUser('user-a', () => {
    const deleted = chatLibrary.deleteChatSession(sessionA.id);
    assert.equal(deleted.ok, true);
    assert.equal(deleted.softDeleted, true);
    const snap = chatLibrary.getChatLibrarySnapshot();
    // Usuário não vê sessão soft-deleted.
    assert.ok(!snap.sessions.some((item) => item.id === sessionA.id));
    assert.ok(snap.activeSessionId);
  });

  // Admin ainda vê a sessão apagada (soft-delete + archive).
  const adminA = chatLibrary.getChatLibrarySnapshotForUser('user-a');
  assert.ok(adminA.sessions.some((item) => item.id === sessionA.id && item.deleted));
  const adminSession = chatLibrary.getChatSessionForUser('user-a', sessionA.id);
  assert.equal(adminSession.transcript.length, 1);
  assert.ok(adminSession.deletedAt);

  // Admin-style read without switching request context still sees owner library.
  const adminSnap = chatLibrary.getChatLibrarySnapshotForUser('user-b');
  assert.equal(adminSnap.ownerUserId, 'user-b');
  assert.ok(adminSnap.sessions.some((item) => item.title === 'Só B' || item.preview));
  assert.ok(adminSnap.stats.sessionCount >= 1);

  const workspacesRoot = path.join(dataDir, 'workspaces');
  const dirs = fs.readdirSync(workspacesRoot);
  assert.equal(dirs.length, 2);
  for (const dir of dirs) {
    assert.ok(fs.existsSync(path.join(workspacesRoot, dir, 'chat-library.json')));
  }
});

test('CHAT_LIBRARY_V1 delete folder moves sessions to root by default', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-folder-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-a', () => {
    const folder = chatLibrary.createChatFolder({ name: 'Temp' });
    const session = chatLibrary.createChatSession({ title: 'Inside', folderId: folder.id });
    chatLibrary.deleteChatFolder(folder.id);
    const reloaded = chatLibrary.getChatSession(session.id);
    assert.equal(reloaded.folderId, null);
  });
});

test('CHAT_LIBRARY_V1 seedFromActive does not inherit folder of active session', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-seed-folder-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-seed-folder', () => {
    const folder = chatLibrary.createChatFolder({ name: 'Vaga' });
    const inside = chatLibrary.createChatSession({ title: 'Inside', folderId: folder.id });
    assert.equal(inside.folderId, folder.id);

    const rootNew = chatLibrary.createChatSession({
      title: 'Nova sessão',
      folderId: null,
      seedFromActive: true,
    });
    assert.equal(rootNew.folderId, null, 'global/recent new chat must not inherit active folder');

    const inFolder = chatLibrary.createChatSession({
      title: 'Na pasta',
      folderId: folder.id,
      seedFromActive: true,
    });
    assert.equal(inFolder.folderId, folder.id);
  });
});

test('CHAT_LIBRARY_V1 first load materializes durable library file', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-first-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  let sessionId;
  workspace.runWithWorkspaceUser('user-first', () => {
    const snap = chatLibrary.getChatLibrarySnapshot();
    sessionId = snap.activeSessionId;
    assert.ok(sessionId);
    assert.equal(snap.activeSession.transcript.length, 0);
  });

  const workspacesRoot = path.join(dataDir, 'workspaces');
  const dirs = fs.readdirSync(workspacesRoot);
  assert.equal(dirs.length, 1);
  const filePath = path.join(workspacesRoot, dirs[0], 'chat-library.json');
  assert.ok(fs.existsSync(filePath));
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(raw.activeSessionId, sessionId);
  assert.equal(raw.sessions[0].id, sessionId);
});

test('CHAT_LIBRARY_V1 persists transcript and survives reload of module cache', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-persist-'));
  const first = await loadChatLibrary(dataDir);
  let sessionId;

  first.workspace.runWithWorkspaceUser('user-persist', () => {
    const snap = first.chatLibrary.getChatLibrarySnapshot();
    sessionId = snap.activeSessionId;
    first.chatLibrary.updateChatSession(sessionId, {
      missionDraft: 'salvar no servidor',
      transcript: [
        { id: 'op1', role: 'operator', name: 'Operador', content: 'salvar no servidor', timestamp: new Date().toISOString() },
        { id: 'p1', role: 'persona', name: 'Juiz', content: 'ok', timestamp: new Date().toISOString() },
      ],
      finalResult: { id: 'f1', role: 'persona', name: 'Juiz', content: 'veredito', timestamp: new Date().toISOString() },
    });
  });

  // Fresh module import simulates process restart / F5 server path.
  const second = await loadChatLibrary(dataDir);
  second.workspace.runWithWorkspaceUser('user-persist', () => {
    const session = second.chatLibrary.getChatSession(sessionId);
    assert.equal(session.missionDraft, 'salvar no servidor');
    assert.equal(session.transcript.length, 2);
    assert.equal(session.transcript[0].content, 'salvar no servidor');
    assert.equal(session.finalResult.content, 'veredito');
  });
});

test('CHAT_LIBRARY_V1 appendTranscript extends without wiping existing messages', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-append-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-append', () => {
    const snap = chatLibrary.getChatLibrarySnapshot();
    const sessionId = snap.activeSessionId;
    chatLibrary.updateChatSession(sessionId, {
      transcript: [{ id: '1', role: 'operator', name: 'Operador', content: 'q1', timestamp: new Date().toISOString() }],
    });
    chatLibrary.updateChatSession(sessionId, {
      appendTranscript: [{ id: '2', role: 'persona', name: 'A', content: 'a1', timestamp: new Date().toISOString() }],
    });
    const session = chatLibrary.getChatSession(sessionId);
    assert.equal(session.transcript.length, 2);
    assert.equal(session.transcript[1].content, 'a1');
  });
});

test('CHAT_LIBRARY_V1 recordPersonaRunOnSession grava transcript no servidor', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-run-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-run', () => {
    const sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    chatLibrary.recordPersonaRunOnSession(sessionId, {
      mission: 'Hospital com filas',
      mode: 'individual',
      traceId: 'trace-1',
      generatedAt: new Date().toISOString(),
      replies: [
        { ok: true, slug: 'aurora', name: 'Aurora', content: 'proposta A', completedAt: new Date().toISOString() },
      ],
      steps: [{
        roleId: 'blind',
        roleLabel: 'Cega',
        replies: [
          { ok: true, slug: 'aurora', name: 'Aurora', content: 'proposta A', phase: 'blind', completedAt: new Date().toISOString() },
        ],
      }],
      judge: { ok: false, slug: 'juiz', name: 'Juiz', content: '', error: 'timeout' },
      finalDisplay: null,
    });
    const session = chatLibrary.getChatSession(sessionId);
    assert.ok(session.transcript.length >= 2, 'operator + reply');
    assert.equal(session.missionDraft, 'Hospital com filas');
    assert.equal(session.operationMode, 'individual');
  });

  const workspacesRoot = path.join(dataDir, 'workspaces');
  const dirs = fs.readdirSync(workspacesRoot);
  const archivePath = path.join(workspacesRoot, dirs[0], 'chat-history-archive.jsonl');
  assert.ok(fs.existsSync(archivePath));
  const archive = fs.readFileSync(archivePath, 'utf8');
  assert.match(archive, /Hospital com filas/);
  assert.match(archive, /persona_run/);
});

test('CHAT_LIBRARY_V1 persists pending attachment metadata for retry after reload', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-attachments-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-attachments', () => {
    const sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    chatLibrary.updateChatSession(sessionId, {
      draftAttachments: [{
        id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        name: 'quadro.png',
        mimeType: 'image/png',
        kind: 'image',
        size: 68,
        url: `/api/luca-ai/chat/sessions/${sessionId}/attachments/aaaaaaaaaaaaaaaaaaaaaaaa`,
      }],
    });

    const session = chatLibrary.getChatSession(sessionId);
    assert.equal(session.draftAttachments.length, 1);
    assert.equal(session.draftAttachments[0].name, 'quadro.png');
  });
});
