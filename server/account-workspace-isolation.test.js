import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadStateModule(dataDir) {
  process.env.LUCA_DATA_DIR = dataDir;
  // Bust import cache by query param so each test suite can use a fresh data dir.
  const moduleUrl = pathToFileURL(path.resolve('server/state.js')).href + `?iso=${Date.now()}-${Math.random()}`;
  const workspaceUrl = pathToFileURL(path.resolve('server/workspace-context.js')).href;
  const workspace = await import(workspaceUrl);
  const state = await import(moduleUrl);
  return { state, workspace };
}

test('ACCOUNT_WORKSPACE_ISOLATION_V1 keeps chat and personas per account', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-iso-'));
  const { state, workspace } = await loadStateModule(dataDir);

  workspace.runWithWorkspaceUser('user-a', () => {
    state.addGlobalChatMessage({ agentId: 'user', agentName: 'A', content: 'segredo da conta A' });
    state.addPersonaAgent({ slug: 'aurora', name: 'Aurora' });
  });

  workspace.runWithWorkspaceUser('user-b', () => {
    state.addGlobalChatMessage({ agentId: 'user', agentName: 'B', content: 'segredo da conta B' });
    const snap = state.getState();
    assert.equal(snap.globalChatMessages.length, 1);
    assert.equal(snap.globalChatMessages[0].content, 'segredo da conta B');
    assert.equal(snap.personaAgents.length, 0);
    assert.ok(!snap.globalChatMessages.some((m) => String(m.content).includes('conta A')));
  });

  workspace.runWithWorkspaceUser('user-a', () => {
    const snap = state.getState();
    assert.equal(snap.globalChatMessages.length, 1);
    assert.equal(snap.globalChatMessages[0].content, 'segredo da conta A');
    assert.equal(snap.personaAgents.length, 1);
    assert.equal(snap.personaAgents[0].slug, 'aurora');
    assert.ok(!snap.globalChatMessages.some((m) => String(m.content).includes('conta B')));
  });

  // Physical partition on disk
  const workspacesRoot = path.join(dataDir, 'workspaces');
  const dirs = fs.readdirSync(workspacesRoot);
  assert.equal(dirs.length, 2);
  for (const dir of dirs) {
    assert.ok(fs.existsSync(path.join(workspacesRoot, dir, 'system-state.json')));
  }
});

test('ACCOUNT_WORKSPACE_ISOLATION_V1 events stay inside the owner log', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-iso-evt-'));
  process.env.LUCA_DATA_DIR = dataDir;
  const workspaceUrl = pathToFileURL(path.resolve('server/workspace-context.js')).href;
  const eventUrl = pathToFileURL(path.resolve('server/event-log.js')).href + `?iso=${Date.now()}`;
  const workspace = await import(workspaceUrl);
  const events = await import(eventUrl);

  workspace.runWithWorkspaceUser('user-a', () => {
    events.appendEvent({ type: 'chat.message', payload: { text: 'only-a' } });
  });
  workspace.runWithWorkspaceUser('user-b', () => {
    events.appendEvent({ type: 'chat.message', payload: { text: 'only-b' } });
    const listed = events.listEvents({ limit: 20 });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].payload.text, 'only-b');
  });
  workspace.runWithWorkspaceUser('user-a', () => {
    const listed = events.listEvents({ limit: 20 });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].payload.text, 'only-a');
  });
});
