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
    const snap = chatLibrary.getChatLibrarySnapshot();
    assert.ok(!snap.sessions.some((item) => item.id === sessionA.id));
    assert.ok(snap.activeSessionId);
  });

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
