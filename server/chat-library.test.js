import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('CHAT_LIBRARY_V3 inicia especialista visual ligado nos modos equipe e individual', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-visual-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-a', () => {
    const session = chatLibrary.createChatSession({ title: 'Visual toggle' });
    assert.deepEqual(session.workflowAssignments.visual, ['especialista-visual']);
    assert.equal(session.individualAssignments.visual, 'especialista-visual');
    assert.equal(session.individualAssignments.visualEnabled, true);

    // O estado default persiste junto da sessão.
    chatLibrary.updateChatSession(session.id, {
      individualAssignments: { participants: ['p1'], judge: 'juiz', visual: 'especialista-visual', visualEnabled: true },
    });
    let snap = chatLibrary.getChatLibrarySnapshot();
    assert.equal(snap.activeSession.individualAssignments.visualEnabled, true);
    assert.equal(snap.activeSession.individualAssignments.visual, 'especialista-visual');

    // Desligar mantém a persona salva mas marca o módulo como off.
    chatLibrary.updateChatSession(session.id, {
      individualAssignments: { visualEnabled: false },
    });
    snap = chatLibrary.getChatLibrarySnapshot();
    assert.equal(snap.activeSession.individualAssignments.visualEnabled, false);
    assert.equal(snap.activeSession.individualAssignments.visual, 'especialista-visual');

    // Patch sem o flag preserva o estado atual do módulo (não religa sozinho).
    chatLibrary.updateChatSession(session.id, {
      individualAssignments: { participants: ['p1'], judge: 'juiz', visual: 'especialista-visual' },
    });
    snap = chatLibrary.getChatLibrarySnapshot();
    assert.equal(snap.activeSession.individualAssignments.visualEnabled, false);

    // Um projeto novo sempre renasce com o padrão visual, mesmo ao copiar a equipe anterior.
    const nextProject = chatLibrary.createChatSession({ title: 'Novo projeto', seedFromActive: true });
    assert.deepEqual(nextProject.workflowAssignments.visual, ['especialista-visual']);
    assert.equal(nextProject.individualAssignments.visual, 'especialista-visual');
    assert.equal(nextProject.individualAssignments.visualEnabled, true);
  });
});

test('CHAT_LIBRARY_V3 migra projetos existentes para o novo padrão visual', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-visual-migration-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);
  const userId = 'legacy-visual-user';
  const safeUserDir = createHash('sha256').update(userId).digest('hex').slice(0, 32);
  const libraryPath = path.join(dataDir, 'workspaces', safeUserDir, 'chat-library.json');
  fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
  fs.writeFileSync(libraryPath, JSON.stringify({
    version: 2,
    folders: [],
    activeSessionId: 'legacy-session',
    sessions: [{
      id: 'legacy-session',
      title: 'Projeto existente',
      workflowAssignments: {
        supervisor: [], mission: [], execution: [], approval: [], display: [], visual: [],
      },
      individualAssignments: {
        participants: [], judge: null, visual: null, visualEnabled: false,
      },
    }],
  }));

  workspace.runWithWorkspaceUser(userId, () => {
    const session = chatLibrary.getChatLibrarySnapshot().activeSession;
    assert.deepEqual(session.workflowAssignments.visual, ['especialista-visual']);
    assert.equal(session.individualAssignments.visual, 'especialista-visual');
    assert.equal(session.individualAssignments.visualEnabled, true);
  });

  const persisted = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
  assert.equal(persisted.version, 3);
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
    assert.equal(session.missionDraft, '', 'draft clears after run; mission lives on operator bubble');
    assert.equal(session.operationMode, 'individual');
    assert.ok(
      session.transcript.some((entry) => entry.role === 'operator' && entry.content === 'Hospital com filas'),
      'operator bubble keeps the sent mission',
    );
  });

  const workspacesRoot = path.join(dataDir, 'workspaces');
  const dirs = fs.readdirSync(workspacesRoot);
  const libraryPath = path.join(workspacesRoot, dirs[0], 'chat-library.json');
  assert.match(fs.readFileSync(libraryPath, 'utf8'), /Hospital com filas/);
});

test('CHAT_LIBRARY_V1 stale browser snapshot cannot erase a server-recorded run', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-race-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-race', () => {
    const sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    // O browser grava a bolha com o id derivado do trace da rodada.
    const operatorOnly = [
      { id: 'op_trace-race', role: 'operator', name: 'Operador', content: 'Missão durável', timestamp: new Date().toISOString() },
    ];
    chatLibrary.updateChatSession(sessionId, { transcript: operatorOnly });
    chatLibrary.recordPersonaRunOnSession(sessionId, {
      mission: 'Missão durável',
      mode: 'team',
      traceId: 'trace-race',
      generatedAt: new Date().toISOString(),
      replies: [{ ok: true, slug: 'aurora', name: 'Aurora', content: 'Resposta preservada' }],
    });

    chatLibrary.updateChatSession(sessionId, { transcript: operatorOnly });

    const session = chatLibrary.getChatSession(sessionId);
    assert.deepEqual(
      session.transcript.map((entry) => entry.content),
      ['Missão durável', 'Resposta preservada'],
    );
  });
});

test('CHAT_LIBRARY_V1 autosave does not archive identical transcript snapshots', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-autosave-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-autosave', () => {
    const sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    const transcript = [
      { id: 'operator-1', role: 'operator', name: 'Operador', content: 'Texto estável', timestamp: new Date().toISOString() },
    ];
    for (let i = 0; i < 5; i += 1) {
      chatLibrary.updateChatSession(sessionId, { missionDraft: `Edição ${i}`, transcript });
    }
  });

  const workspaceDir = fs.readdirSync(path.join(dataDir, 'workspaces'))[0];
  const archivePath = path.join(dataDir, 'workspaces', workspaceDir, 'chat-history-archive.jsonl');
  assert.equal(fs.existsSync(archivePath), false);
});

test('CHAT_LIBRARY_V1 delete stays live when durable archive write fails', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-archive-fail-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);
  let sessionId;

  workspace.runWithWorkspaceUser('user-archive-fail', () => {
    sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    chatLibrary.updateChatSession(sessionId, {
      transcript: [{ id: 'operator-1', role: 'operator', content: 'Não perder', timestamp: new Date().toISOString() }],
    });
  });

  const workspaceDir = fs.readdirSync(path.join(dataDir, 'workspaces'))[0];
  fs.mkdirSync(path.join(dataDir, 'workspaces', workspaceDir, 'chat-history-archive.jsonl'));

  workspace.runWithWorkspaceUser('user-archive-fail', () => {
    assert.throws(() => chatLibrary.deleteChatSession(sessionId));
    assert.equal(chatLibrary.getChatSession(sessionId).transcript[0].content, 'Não perder');
  });
});

test('CHAT_LIBRARY_V1 admin can inspect content archived before an explicit clear', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-clear-admin-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);
  let sessionId;

  workspace.runWithWorkspaceUser('user-clear-admin', () => {
    sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    chatLibrary.updateChatSession(sessionId, {
      transcript: [{ id: 'operator-1', role: 'operator', content: 'Conteúdo anterior', timestamp: new Date().toISOString() }],
    });
    chatLibrary.updateChatSession(sessionId, { transcript: [], finalResult: null });
  });

  const admin = chatLibrary.getChatLibrarySnapshotForUser('user-clear-admin');
  const revision = admin.sessions.find((session) => session.id !== sessionId && session.sourceSessionId === sessionId);
  assert.ok(revision, 'cleared revision is listed separately for support');
  assert.equal(chatLibrary.getChatSessionForUser('user-clear-admin', revision.id).transcript[0].content, 'Conteúdo anterior');
});

test('CHAT_LIBRARY_V1 records a run that finishes after soft-delete without stale results or duplicate ids', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-deleted-run-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-deleted-run', () => {
    const sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    chatLibrary.updateChatSession(sessionId, {
      finalResult: { id: 'old-final', content: 'Resultado antigo' },
      visualPack: { status: 'ok', summary: 'Visual antigo' },
    });
    chatLibrary.deleteChatSession(sessionId);
    const run = {
      mission: 'Nova missão',
      mode: 'team',
      traceId: 'trace-late',
      generatedAt: new Date().toISOString(),
      replies: [{ ok: true, slug: 'aurora', name: 'Aurora', content: 'Resultado tardio' }],
    };
    assert.ok(chatLibrary.recordPersonaRunOnSession(sessionId, run));
    assert.ok(chatLibrary.recordPersonaRunOnSession(sessionId, run));

    const retained = chatLibrary.getChatSessionForUser('user-deleted-run', sessionId);
    const ids = retained.transcript.map((entry) => entry.id);
    assert.ok(retained.transcript.some((entry) => entry.content === 'Resultado tardio'));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(retained.finalResult, null);
    assert.equal(retained.visualPack, null);
  });
});

test('CHAT_LIBRARY_V1 repeated mission in distinct runs remains two conversation turns', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-repeat-mission-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-repeat-mission', () => {
    const sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    for (const traceId of ['trace-first', 'trace-second']) {
      chatLibrary.recordPersonaRunOnSession(sessionId, {
        ok: true,
        mission: 'Mesma missão',
        mode: 'team',
        traceId,
        generatedAt: new Date().toISOString(),
        replies: [{ ok: true, slug: 'aurora', name: 'Aurora', content: `Resposta ${traceId}` }],
      });
    }
    const session = chatLibrary.getChatSession(sessionId);
    assert.equal(session.transcript.filter((entry) => entry.role === 'operator').length, 2);
    assert.equal(new Set(session.transcript.map((entry) => entry.id)).size, session.transcript.length);
  });
});

test('CHAT_LIBRARY_V1 admin keeps pruned sessions discoverable beyond the old 300-record window', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-archive-window-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);
  let oldestId;

  workspace.runWithWorkspaceUser('user-archive-window', () => {
    oldestId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    chatLibrary.updateChatSession(oldestId, {
      transcript: [{ id: 'old', role: 'operator', content: 'Histórico mais antigo', timestamp: new Date().toISOString() }],
    });
    chatLibrary.deleteChatSession(oldestId);
    for (let i = 0; i < 405; i += 1) {
      const sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
      chatLibrary.deleteChatSession(sessionId);
    }
  });

  const admin = chatLibrary.getChatLibrarySnapshotForUser('user-archive-window');
  assert.ok(admin.sessions.some((session) => session.id === oldestId));
  assert.equal(chatLibrary.getChatSessionForUser('user-archive-window', oldestId).transcript[0].content, 'Histórico mais antigo');

  const workspaceDir = fs.readdirSync(path.join(dataDir, 'workspaces'))[0];
  const archivePath = path.join(dataDir, 'workspaces', workspaceDir, 'chat-history-archive.jsonl');
  assert.ok(fs.readFileSync(archivePath, 'utf8').trim().split(/\n/).length <= 2000);
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

test('CHAT_LIBRARY_V1 product usage counts operator prompts not agent replies', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-product-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-product', () => {
    const sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    chatLibrary.recordPersonaRunOnSession(sessionId, {
      mission: 'Primeiro prompt',
      mode: 'team',
      traceId: 'trace-p1',
      generatedAt: new Date().toISOString(),
      replies: [{ ok: true, slug: 'a', name: 'A', content: 'resposta 1', completedAt: new Date().toISOString() }],
      steps: [],
      judge: null,
      finalDisplay: { name: 'Final', content: 'ok 1' },
    });
    chatLibrary.recordPersonaRunOnSession(sessionId, {
      mission: 'Segundo prompt',
      mode: 'team',
      traceId: 'trace-p2',
      generatedAt: new Date().toISOString(),
      replies: [{ ok: true, slug: 'a', name: 'A', content: 'resposta 2', completedAt: new Date().toISOString() }],
      steps: [],
      judge: null,
      finalDisplay: { name: 'Final', content: 'ok 2' },
    });
  });

  const usage = chatLibrary.getProductUsageSummaryForUser('user-product');
  assert.equal(usage.promptCount, 2, 'dois envios do operador');
  assert.equal(usage.runCount, 2, 'rodada = prompt');
  assert.ok(usage.chatSessionCount >= 1);
  assert.ok(usage.messageCount > 2, 'inclui respostas dos agentes além dos prompts');
});

test('CHAT_LIBRARY_V1 activePersonaRun marca e limpa rodada em andamento', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-chatlib-active-run-'));
  const { workspace, chatLibrary } = await loadChatLibrary(dataDir);

  workspace.runWithWorkspaceUser('user-active-run', () => {
    const sessionId = chatLibrary.getChatLibrarySnapshot().activeSessionId;
    chatLibrary.markPersonaRunStartedOnSession(sessionId, {
      runId: 'run-xyz',
      traceId: 'trace-xyz',
      startedAt: '2026-08-11T12:00:00.000Z',
    });
    let session = chatLibrary.getChatSession(sessionId);
    assert.equal(session.activePersonaRun.runId, 'run-xyz');
    assert.equal(session.activePersonaRun.status, 'running');

    chatLibrary.recordPersonaRunOnSession(sessionId, {
      mission: 'Missao com borda instavel',
      mode: 'team',
      traceId: 'trace-xyz',
      generatedAt: new Date().toISOString(),
      replies: [{ ok: true, slug: 'a', name: 'A', content: 'ok', completedAt: new Date().toISOString() }],
      steps: [],
      judge: null,
      finalDisplay: { name: 'Final', content: 'ok' },
    });
    session = chatLibrary.getChatSession(sessionId);
    assert.equal(session.activePersonaRun, null, 'record limpa marcador ativo');
    assert.ok(session.finalResult);

    chatLibrary.markPersonaRunStartedOnSession(sessionId, { runId: 'run-fail', traceId: 'trace-fail' });
    chatLibrary.markPersonaRunFailedOnSession(sessionId, {
      runId: 'run-fail',
      traceId: 'trace-fail',
      errorMessage: 'boom',
    });
    session = chatLibrary.getChatSession(sessionId);
    assert.equal(session.activePersonaRun.status, 'failed');
    assert.match(String(session.activePersonaRun.errorMessage), /boom/);
    chatLibrary.clearPersonaRunOnSession(sessionId);
    session = chatLibrary.getChatSession(sessionId);
    assert.equal(session.activePersonaRun, null);
  });
});
