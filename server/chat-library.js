import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { getWorkspaceUserId, requireWorkspaceUserId } from './workspace-context.js';

const rootStateDir = path.resolve(process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'));
const workspacesRoot = path.join(rootStateDir, 'workspaces');
/** Sessões visíveis/ativas do usuário. */
const MAX_SESSIONS = 100;
/** Sessões retidas no library (ativas + soft-deleted) para o admin. */
const MAX_RETAINED_SESSIONS = 400;
const MAX_FOLDERS = 40;
const MAX_TRANSCRIPT = 200;
const MAX_DRAFT_ATTACHMENTS = 4;
const TITLE_MAX = 80;

function safeUserDir(userId) {
  const clean = String(userId || '').trim();
  if (!clean) throw new Error('workspace_user_required');
  return createHash('sha256').update(clean).digest('hex').slice(0, 32);
}

function libraryPathFor(userId) {
  return path.join(workspacesRoot, safeUserDir(userId), 'chat-library.json');
}

function archivePathFor(userId) {
  return path.join(workspacesRoot, safeUserDir(userId), 'chat-history-archive.jsonl');
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

function clipTitle(value, fallback = 'Nova sessão') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text;
}

function emptyAssignments() {
  return {
    supervisor: [],
    mission: [],
    execution: [],
    approval: [],
    display: [],
    visual: [],
  };
}

function emptyIndividual() {
  return { participants: [], judge: null };
}

function normalizeDraftAttachments(value, sessionId) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const id = String(item?.id || '').trim();
    if (!/^[a-f0-9]{24}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const kind = item?.kind === 'image' || item?.kind === 'pdf' ? item.kind : 'text';
    result.push({
      id,
      name: String(item?.name || 'arquivo').slice(0, 180),
      mimeType: String(item?.mimeType || 'application/octet-stream').slice(0, 120),
      kind,
      size: Math.max(0, Number(item?.size) || 0),
      createdAt: item?.createdAt ? String(item.createdAt) : undefined,
      url: `/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}/attachments/${id}`,
    });
    if (result.length >= MAX_DRAFT_ATTACHMENTS) break;
  }
  return result;
}

function makeSession(partial = {}) {
  const createdAt = partial.createdAt || nowIso();
  const id = partial.id || makeId('sess');
  const deletedAt = partial.deletedAt ? String(partial.deletedAt) : null;
  return {
    id,
    title: clipTitle(partial.title, 'Nova sessão'),
    folderId: partial.folderId ? String(partial.folderId) : null,
    createdAt,
    updatedAt: partial.updatedAt || createdAt,
    deletedAt,
    operationMode: partial.operationMode === 'individual' ? 'individual' : 'team',
    workflowAssignments: partial.workflowAssignments && typeof partial.workflowAssignments === 'object'
      ? partial.workflowAssignments
      : emptyAssignments(),
    individualAssignments: partial.individualAssignments && typeof partial.individualAssignments === 'object'
      ? {
          participants: Array.isArray(partial.individualAssignments.participants)
            ? partial.individualAssignments.participants.map(String).filter(Boolean).slice(0, 5)
            : [],
          judge: partial.individualAssignments.judge ? String(partial.individualAssignments.judge) : null,
        }
      : emptyIndividual(),
    missionDraft: String(partial.missionDraft || ''),
    draftAttachments: normalizeDraftAttachments(partial.draftAttachments, id),
    transcript: Array.isArray(partial.transcript) ? partial.transcript.slice(-MAX_TRANSCRIPT) : [],
    finalResult: partial.finalResult ?? null,
    visualPack: partial.visualPack ?? null,
    activePersonaSlug: partial.activePersonaSlug ? String(partial.activePersonaSlug) : null,
  };
}

function isSessionLive(session) {
  return !session?.deletedAt;
}

function liveSessions(library) {
  return (library?.sessions || []).filter(isSessionLive);
}

function makeFolder(partial = {}) {
  const createdAt = partial.createdAt || nowIso();
  return {
    id: partial.id || makeId('folder'),
    name: clipTitle(partial.name, 'Projeto'),
    createdAt,
    updatedAt: partial.updatedAt || createdAt,
  };
}

function emptyLibrary() {
  const session = makeSession({ title: 'Nova sessão' });
  return {
    version: 1,
    folders: [],
    sessions: [session],
    activeSessionId: session.id,
  };
}

function normalizeLibrary(raw) {
  const base = emptyLibrary();
  if (!raw || typeof raw !== 'object') return base;
  const folders = Array.isArray(raw.folders)
    ? raw.folders.map((item) => makeFolder(item)).slice(0, MAX_FOLDERS)
    : [];
  const folderIds = new Set(folders.map((item) => item.id));
  let sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map((item) => {
        const session = makeSession(item);
        if (session.folderId && !folderIds.has(session.folderId)) session.folderId = null;
        return session;
      }).slice(0, MAX_RETAINED_SESSIONS)
    : [];
  // Garantir ao menos uma sessão viva para a UI do usuário.
  if (!liveSessions({ sessions }).length) {
    sessions = [makeSession({ title: 'Nova sessão' }), ...sessions].slice(0, MAX_RETAINED_SESSIONS);
  }
  let activeSessionId = raw.activeSessionId ? String(raw.activeSessionId) : '';
  const live = liveSessions({ sessions });
  if (!live.some((item) => item.id === activeSessionId)) activeSessionId = live[0].id;
  return { version: 2, folders, sessions, activeSessionId };
}

/** Snapshot imutável em JSONL — sobrevive a soft-delete e limpeza da library. */
function archiveSessionSnapshot(userId, session, reason = 'snapshot') {
  const id = String(userId || '').trim();
  if (!id || !session?.id) return;
  try {
    const filePath = archivePathFor(id);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const record = {
      archivedAt: nowIso(),
      reason: String(reason || 'snapshot').slice(0, 80),
      ownerUserId: id,
      session: {
        id: session.id,
        title: session.title,
        folderId: session.folderId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        deletedAt: session.deletedAt || null,
        operationMode: session.operationMode,
        missionDraft: session.missionDraft,
        transcript: Array.isArray(session.transcript) ? session.transcript.slice(-MAX_TRANSCRIPT) : [],
        finalResult: session.finalResult ?? null,
        visualPack: session.visualPack ?? null,
        activePersonaSlug: session.activePersonaSlug || null,
        workflowAssignments: session.workflowAssignments || null,
        individualAssignments: session.individualAssignments || null,
      },
    };
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.error(`[chat-library] archive falhou: ${error?.message || String(error)}`);
  }
}

function loadArchiveRecords(userId, { limit = 200 } = {}) {
  const id = String(userId || '').trim();
  if (!id) return [];
  const filePath = archivePathFor(id);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const capped = lines.slice(-Math.max(1, Math.min(2000, Number(limit) || 200)));
    const records = [];
    for (const line of capped) {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.session?.id) records.push(parsed);
      } catch {
        // skip corrupt line
      }
    }
    return records;
  } catch {
    return [];
  }
}

function pruneRetainedSessions(library, userId) {
  if (!library?.sessions || library.sessions.length <= MAX_RETAINED_SESSIONS) return;
  // Remove preferencialmente soft-deleted mais antigos (já estão no archive).
  const sorted = library.sessions.slice().sort((a, b) => {
    const aDel = a.deletedAt ? 0 : 1;
    const bDel = b.deletedAt ? 0 : 1;
    if (aDel !== bDel) return aDel - bDel;
    return String(a.updatedAt || a.createdAt || '').localeCompare(String(b.updatedAt || b.createdAt || ''));
  });
  const keepIds = new Set(sorted.slice(-MAX_RETAINED_SESSIONS).map((item) => item.id));
  const dropped = library.sessions.filter((item) => !keepIds.has(item.id));
  for (const session of dropped) {
    archiveSessionSnapshot(userId, session, 'retention_prune');
  }
  library.sessions = library.sessions.filter((item) => keepIds.has(item.id));
  if (!liveSessions(library).length) {
    const fresh = makeSession({ title: 'Nova sessão' });
    library.sessions.push(fresh);
    library.activeSessionId = fresh.id;
  } else if (!liveSessions(library).some((item) => item.id === library.activeSessionId)) {
    library.activeSessionId = liveSessions(library)[0].id;
  }
}

/** @type {Map<string, any>} */
const cache = new Map();

// Sessions own side data outside this module (private chat attachments on disk).
// Owners register a cleanup hook here so a cascade delete cannot leave orphans
// behind. Kept as a hook to avoid a circular import with chat-attachments.js.
const sessionRemovalHooks = new Set();

export function onChatSessionsRemoved(hook) {
  if (typeof hook === 'function') sessionRemovalHooks.add(hook);
  return () => sessionRemovalHooks.delete(hook);
}

function notifySessionsRemoved(sessionIds) {
  const ids = (Array.isArray(sessionIds) ? sessionIds : []).filter(Boolean);
  if (!ids.length) return;
  for (const hook of sessionRemovalHooks) {
    try {
      hook(ids);
    } catch (error) {
      // Cleanup is best-effort: never fail the user's delete because of side data.
      console.error(`[chat-library] session cleanup hook falhou: ${error?.message || String(error)}`);
    }
  }
}

function loadLibrary(userId) {
  const id = String(userId || '').trim();
  if (!id) throw new Error('workspace_user_required');
  if (cache.has(id)) return cache.get(id);
  const filePath = libraryPathFor(id);
  let library;
  let created = false;
  try {
    library = normalizeLibrary(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    // First touch: materialize a stable empty library so F5 keeps the same session id.
    library = emptyLibrary();
    created = true;
  }
  cache.set(id, library);
  if (created) persistLibrary(id, library);
  return library;
}

function persistLibrary(userId, library) {
  const filePath = libraryPathFor(userId);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  // Atomic replace — partial write + crash must not wipe chat-library.json.
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(library, null, 2));
  fs.renameSync(tmp, filePath);
}

function withLibrary(mutator) {
  const userId = requireWorkspaceUserId();
  const library = loadLibrary(userId);
  const result = mutator(library, userId);
  pruneRetainedSessions(library, userId);
  persistLibrary(userId, library);
  return result;
}

function summarizeSession(session) {
  const deleted = Boolean(session.deletedAt);
  return {
    id: session.id,
    title: session.title,
    folderId: session.folderId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    deletedAt: session.deletedAt || null,
    deleted,
    operationMode: session.operationMode,
    messageCount: Array.isArray(session.transcript) ? session.transcript.length : 0,
    preview: String(session.missionDraft || session.transcript?.at?.(-1)?.content || '').slice(0, 120),
  };
}

function snapshotFromLibrary(library, userId = null, { includeDeleted = false } = {}) {
  const sessions = includeDeleted
    ? library.sessions
    : liveSessions(library);
  const activeLive = liveSessions(library).find((item) => item.id === library.activeSessionId)
    || liveSessions(library)[0]
    || null;
  return {
    ownerUserId: userId || null,
    folders: library.folders
      .slice()
      .sort((a, b) => String(b.createdAt || b.updatedAt).localeCompare(String(a.createdAt || a.updatedAt))),
    // Stable list order: newest created first. Activate/update must not reshuffle.
    sessions: sessions
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map(summarizeSession),
    activeSessionId: activeLive?.id || null,
    activeSession: activeLive || null,
    stats: {
      folderCount: library.folders.length,
      sessionCount: sessions.length,
      liveSessionCount: liveSessions(library).length,
      deletedSessionCount: library.sessions.filter((item) => item.deletedAt).length,
      messageCount: sessions.reduce(
        (sum, session) => sum + (Array.isArray(session.transcript) ? session.transcript.length : 0),
        0,
      ),
    },
  };
}

export function getChatLibrarySnapshot() {
  const userId = getWorkspaceUserId();
  if (!userId) {
    return snapshotFromLibrary(emptyLibrary(), null, { includeDeleted: false });
  }
  return snapshotFromLibrary(loadLibrary(userId), userId, { includeDeleted: false });
}

/** Admin/read-only: library + soft-deleted + índices do archive. */
export function getChatLibrarySnapshotForUser(userId) {
  const id = String(userId || '').trim();
  if (!id) {
    const error = new Error('user_required');
    error.status = 400;
    throw error;
  }
  const library = loadLibrary(id);
  const snap = snapshotFromLibrary(library, id, { includeDeleted: true });
  const archive = loadArchiveRecords(id, { limit: 300 });
  // Último snapshot por sessionId (mais recente no arquivo).
  const latestById = new Map();
  for (const record of archive) {
    latestById.set(record.session.id, record);
  }
  const libraryIds = new Set(library.sessions.map((item) => item.id));
  const archiveOnly = [];
  for (const [sessionId, record] of latestById.entries()) {
    if (libraryIds.has(sessionId)) continue;
    archiveOnly.push({
      ...summarizeSession(makeSession(record.session)),
      archivedOnly: true,
      archivedAt: record.archivedAt,
      archiveReason: record.reason,
    });
  }
  archiveOnly.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return {
    ...snap,
    sessions: [...snap.sessions, ...archiveOnly],
    stats: {
      ...snap.stats,
      sessionCount: snap.sessions.length + archiveOnly.length,
      archivedOnlyCount: archiveOnly.length,
      archiveRecordCount: archive.length,
    },
  };
}

export function getChatSessionForUser(userId, sessionId) {
  const id = String(userId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!id || !sid) {
    const error = new Error('session_not_found');
    error.status = 404;
    throw error;
  }
  const library = loadLibrary(id);
  const session = library.sessions.find((item) => item.id === sid);
  if (session) {
    return session;
  }
  // Fallback: último snapshot no archive (suporte mesmo após prune).
  const archive = loadArchiveRecords(id, { limit: 2000 });
  for (let i = archive.length - 1; i >= 0; i -= 1) {
    if (archive[i].session?.id === sid) {
      return makeSession({ ...archive[i].session, deletedAt: archive[i].session.deletedAt || archive[i].archivedAt });
    }
  }
  const error = new Error('session_not_found');
  error.status = 404;
  throw error;
}

export function createChatFolder({ name } = {}) {
  return withLibrary((library) => {
    if (library.folders.length >= MAX_FOLDERS) {
      const error = new Error('folder_limit_reached');
      error.status = 400;
      throw error;
    }
    const folder = makeFolder({ name });
    library.folders = [folder, ...library.folders].slice(0, MAX_FOLDERS);
    return folder;
  });
}

export function renameChatFolder(folderId, { name } = {}) {
  return withLibrary((library) => {
    const folder = library.folders.find((item) => item.id === folderId);
    if (!folder) {
      const error = new Error('folder_not_found');
      error.status = 404;
      throw error;
    }
    folder.name = clipTitle(name, folder.name);
    folder.updatedAt = nowIso();
    return folder;
  });
}

export function deleteChatFolder(folderId, { cascadeSessions = false } = {}) {
  return withLibrary((library, userId) => {
    const before = library.folders.length;
    library.folders = library.folders.filter((item) => item.id !== folderId);
    if (library.folders.length === before) {
      const error = new Error('folder_not_found');
      error.status = 404;
      throw error;
    }
    if (cascadeSessions) {
      const stamp = nowIso();
      for (const item of library.sessions) {
        if (item.folderId === folderId && isSessionLive(item)) {
          item.deletedAt = stamp;
          item.updatedAt = stamp;
          archiveSessionSnapshot(userId, item, 'folder_cascade_delete');
        }
      }
      if (!liveSessions(library).length) {
        const session = makeSession({ title: 'Nova sessão' });
        library.sessions.push(session);
        library.activeSessionId = session.id;
      } else if (!liveSessions(library).some((item) => item.id === library.activeSessionId)) {
        library.activeSessionId = liveSessions(library)[0].id;
      }
    } else {
      for (const session of library.sessions) {
        if (session.folderId === folderId) session.folderId = null;
      }
    }
    return { ok: true, activeSessionId: library.activeSessionId, removedSessionIds: [] };
  });
}

export function createChatSession({ title, folderId, seedFromActive = false } = {}) {
  return withLibrary((library, userId) => {
    const live = liveSessions(library);
    if (live.length >= MAX_SESSIONS) {
      // Soft-delete sessões vivas mais antigas (sem transcript) para liberar slot; conteúdo fica no archive.
      const sortedLive = live
        .slice()
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      let freed = 0;
      for (const item of sortedLive) {
        if (live.length - freed <= MAX_SESSIONS - 1) break;
        if ((item.transcript || []).length > 0 || item.finalResult) {
          archiveSessionSnapshot(userId, item, 'capacity_soft_delete');
        }
        item.deletedAt = nowIso();
        freed += 1;
      }
    }
    const active = liveSessions(library).find((item) => item.id === library.activeSessionId)
      || liveSessions(library)[0];
    // Explicit folder only: never inherit active.folderId. Global / Recentes new chat
    // must land at root (null); folder pencil passes folderId intentionally.
    const validFolderId = folderId && library.folders.some((item) => item.id === folderId)
      ? String(folderId)
      : null;
    const session = makeSession(seedFromActive && active
      ? {
          title: title || 'Nova sessão',
          folderId: validFolderId,
          operationMode: active.operationMode,
          workflowAssignments: active.workflowAssignments,
          individualAssignments: active.individualAssignments,
          activePersonaSlug: active.activePersonaSlug,
          missionDraft: '',
          draftAttachments: [],
          transcript: [],
          finalResult: null,
          visualPack: null,
        }
      : {
          title: title || 'Nova sessão',
          folderId: validFolderId,
        });
    library.sessions = [session, ...library.sessions];
    library.activeSessionId = session.id;
    return session;
  });
}

export function getChatSession(sessionId) {
  const userId = requireWorkspaceUserId();
  const library = loadLibrary(userId);
  const session = library.sessions.find((item) => item.id === sessionId && isSessionLive(item));
  if (!session) {
    const error = new Error('session_not_found');
    error.status = 404;
    throw error;
  }
  return session;
}

export function updateChatSession(sessionId, patch = {}) {
  return withLibrary((library, userId) => {
    const session = library.sessions.find((item) => item.id === sessionId && isSessionLive(item));
    if (!session) {
      const error = new Error('session_not_found');
      error.status = 404;
      throw error;
    }
    const prevTranscriptLen = Array.isArray(session.transcript) ? session.transcript.length : 0;
    const prevHadFinal = Boolean(session.finalResult);

    if (typeof patch.title === 'string') session.title = clipTitle(patch.title, session.title);
    if (Object.prototype.hasOwnProperty.call(patch, 'folderId')) {
      const nextFolder = patch.folderId ? String(patch.folderId) : null;
      session.folderId = nextFolder && library.folders.some((item) => item.id === nextFolder)
        ? nextFolder
        : null;
    }
    if (patch.operationMode === 'team' || patch.operationMode === 'individual') {
      session.operationMode = patch.operationMode;
    }
    if (patch.workflowAssignments && typeof patch.workflowAssignments === 'object') {
      session.workflowAssignments = patch.workflowAssignments;
    }
    if (patch.individualAssignments && typeof patch.individualAssignments === 'object') {
      session.individualAssignments = {
        participants: Array.isArray(patch.individualAssignments.participants)
          ? patch.individualAssignments.participants.map(String).filter(Boolean).slice(0, 5)
          : session.individualAssignments.participants,
        judge: Object.prototype.hasOwnProperty.call(patch.individualAssignments, 'judge')
          ? (patch.individualAssignments.judge ? String(patch.individualAssignments.judge) : null)
          : session.individualAssignments.judge,
      };
    }
    if (typeof patch.missionDraft === 'string') session.missionDraft = patch.missionDraft;
    if (Array.isArray(patch.draftAttachments)) {
      session.draftAttachments = normalizeDraftAttachments(patch.draftAttachments, session.id);
    }
    if (Array.isArray(patch.transcript)) {
      // Limpar transcript: arquiva o estado anterior para o admin.
      if (prevTranscriptLen > 0 && patch.transcript.length === 0) {
        archiveSessionSnapshot(userId, session, 'transcript_clear');
      }
      session.transcript = patch.transcript.slice(-MAX_TRANSCRIPT);
    }
    // Append-only path for operator bubbles / incremental replies without full rewrite races.
    if (Array.isArray(patch.appendTranscript) && patch.appendTranscript.length) {
      session.transcript = [...(session.transcript || []), ...patch.appendTranscript].slice(-MAX_TRANSCRIPT);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'finalResult')) session.finalResult = patch.finalResult ?? null;
    if (Object.prototype.hasOwnProperty.call(patch, 'visualPack')) session.visualPack = patch.visualPack ?? null;
    if (Object.prototype.hasOwnProperty.call(patch, 'activePersonaSlug')) {
      session.activePersonaSlug = patch.activePersonaSlug ? String(patch.activePersonaSlug) : null;
    }
    if (!String(session.title || '').trim() || session.title === 'Nova sessão') {
      const fromMission = String(session.missionDraft || '').trim();
      if (fromMission) session.title = clipTitle(fromMission);
    }
    // Touch updatedAt only for contentful changes; list order stays by createdAt.
    const contentful = (
      typeof patch.title === 'string'
      || Object.prototype.hasOwnProperty.call(patch, 'folderId')
      || typeof patch.missionDraft === 'string'
      || Array.isArray(patch.draftAttachments)
      || Array.isArray(patch.transcript)
      || Array.isArray(patch.appendTranscript)
      || Object.prototype.hasOwnProperty.call(patch, 'finalResult')
      || Object.prototype.hasOwnProperty.call(patch, 'visualPack')
      || patch.operationMode === 'team'
      || patch.operationMode === 'individual'
      || patch.workflowAssignments
      || patch.individualAssignments
    );
    if (contentful) session.updatedAt = nowIso();

    const nextTranscriptLen = Array.isArray(session.transcript) ? session.transcript.length : 0;
    const grew = nextTranscriptLen > prevTranscriptLen || (session.finalResult && !prevHadFinal);
    if (grew || (nextTranscriptLen > 0 && Array.isArray(patch.transcript))) {
      archiveSessionSnapshot(userId, session, 'content_update');
    }
    return session;
  });
}

/**
 * Grava a rodada no chat-library no servidor (fonte de verdade).
 * Independente do flush do browser — falha de juíz/F5 não apaga o histórico.
 */
export function recordPersonaRunOnSession(sessionId, run = {}) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  return withLibrary((library, userId) => {
    const session = library.sessions.find((item) => item.id === sid && isSessionLive(item));
    if (!session) return null;

    const timestamp = String(run.generatedAt || nowIso());
    const mission = String(run.mission || session.missionDraft || '').trim();
    const mode = run.mode === 'individual' ? 'individual' : 'team';
    const existing = Array.isArray(session.transcript) ? session.transcript.slice() : [];

    // Operator bubble: só acrescenta se a última missão for diferente.
    const lastOperator = [...existing].reverse().find((entry) => entry.role === 'operator');
    if (mission && (!lastOperator || String(lastOperator.content || '').trim() !== mission)) {
      existing.push({
        id: `op_${String(run.traceId || Date.now()).replace(/[^\w-]+/g, '').slice(0, 40)}`,
        role: 'operator',
        name: 'Operador',
        content: mission,
        status: 'info',
        timestamp,
      });
    }

    const replyEntries = [];
    const steps = Array.isArray(run.steps) ? run.steps : [];
    if (steps.length) {
      for (const step of steps) {
        const stage = step.roleLabel || step.roleId || '';
        for (const reply of (step.replies || [])) {
          if (!reply) continue;
          const content = String(reply.content || reply.error || '').trim();
          if (!content && reply.ok) continue;
          replyEntries.push({
            id: `r_${String(reply.slug || 'persona')}_${String(step.roleId || 'step')}_${replyEntries.length}`,
            role: 'persona',
            name: reply.name || reply.slug || 'Persona',
            slug: reply.slug || undefined,
            model: reply.model || undefined,
            stage,
            phase: reply.phase || step.phase || undefined,
            content: content || (reply.ok ? '' : `Falha: ${reply.error || 'erro'}`),
            status: reply.ok ? 'ok' : 'error',
            timestamp: reply.completedAt || timestamp,
          });
        }
      }
    } else {
      for (const reply of (run.replies || [])) {
        if (!reply) continue;
        const content = String(reply.content || reply.error || '').trim();
        if (!content && reply.ok) continue;
        replyEntries.push({
          id: `r_${String(reply.slug || 'persona')}_${replyEntries.length}`,
          role: 'persona',
          name: reply.name || reply.slug || 'Persona',
          slug: reply.slug || undefined,
          model: reply.model || undefined,
          stage: reply.workflowRoleLabel || undefined,
          phase: reply.phase || undefined,
          content: content || (reply.ok ? '' : `Falha: ${reply.error || 'erro'}`),
          status: reply.ok ? 'ok' : 'error',
          timestamp: reply.completedAt || timestamp,
        });
      }
    }

    session.transcript = [...existing, ...replyEntries].slice(-MAX_TRANSCRIPT);
    if (mission) session.missionDraft = mission;
    session.operationMode = mode;

    let nextFinal = null;
    if (mode === 'individual' && run.judge?.content) {
      nextFinal = {
        id: `judge_${String(run.traceId || Date.now()).slice(0, 40)}`,
        role: 'persona',
        name: run.judge.name || run.judge.slug,
        slug: run.judge.slug,
        model: run.judge.model,
        phase: run.judge.phase || 'judge',
        stage: 'Juiz',
        content: run.judge.content,
        status: run.judge.ok ? 'ok' : 'error',
        timestamp,
      };
    } else if (run.finalDisplay?.content) {
      nextFinal = {
        id: `final_${String(run.traceId || Date.now()).slice(0, 40)}`,
        role: 'persona',
        name: run.finalDisplay.name || run.finalDisplay.slug,
        slug: run.finalDisplay.slug,
        model: run.finalDisplay.model,
        stage: run.finalDisplay.roleLabel || 'Exibição final',
        content: run.finalDisplay.content,
        status: 'ok',
        timestamp,
      };
    }
    if (nextFinal) session.finalResult = nextFinal;
    if (run.visualPack && typeof run.visualPack === 'object') session.visualPack = run.visualPack;

    if (!String(session.title || '').trim() || session.title === 'Nova sessão') {
      if (mission) session.title = clipTitle(mission);
    }
    session.updatedAt = nowIso();
    archiveSessionSnapshot(userId, session, 'persona_run');
    return session;
  });
}

export function activateChatSession(sessionId) {
  return withLibrary((library) => {
    const session = library.sessions.find((item) => item.id === sessionId && isSessionLive(item));
    if (!session) {
      const error = new Error('session_not_found');
      error.status = 404;
      throw error;
    }
    // Open only — do not bump updatedAt (would reshuffle UI if sorted by activity).
    library.activeSessionId = session.id;
    return session;
  });
}

export function deleteChatSession(sessionId) {
  return withLibrary((library, userId) => {
    const session = library.sessions.find((item) => item.id === sessionId && isSessionLive(item));
    if (!session) {
      const error = new Error('session_not_found');
      error.status = 404;
      throw error;
    }
    // Soft-delete: some da lista do usuário, permanece para o admin + archive.
    session.deletedAt = nowIso();
    session.updatedAt = session.deletedAt;
    archiveSessionSnapshot(userId, session, 'user_delete');

    const live = liveSessions(library);
    if (!live.length) {
      const fresh = makeSession({ title: 'Nova sessão' });
      library.sessions.push(fresh);
      library.activeSessionId = fresh.id;
      return { ok: true, activeSession: fresh, createdReplacement: true, softDeleted: true };
    }
    if (library.activeSessionId === sessionId) {
      library.activeSessionId = live[0].id;
    }
    const active = live.find((item) => item.id === library.activeSessionId) || live[0];
    return { ok: true, activeSession: active, createdReplacement: false, softDeleted: true };
  });
}
