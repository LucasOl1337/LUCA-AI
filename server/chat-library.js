import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { getWorkspaceUserId, requireWorkspaceUserId } from './workspace-context.js';

const rootStateDir = path.resolve(process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'));
const workspacesRoot = path.join(rootStateDir, 'workspaces');
const MAX_SESSIONS = 100;
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
  return {
    id,
    title: clipTitle(partial.title, 'Nova sessão'),
    folderId: partial.folderId ? String(partial.folderId) : null,
    createdAt,
    updatedAt: partial.updatedAt || createdAt,
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
    activePersonaSlug: partial.activePersonaSlug ? String(partial.activePersonaSlug) : null,
  };
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
      }).slice(0, MAX_SESSIONS)
    : [];
  if (!sessions.length) sessions = [makeSession({ title: 'Nova sessão' })];
  let activeSessionId = raw.activeSessionId ? String(raw.activeSessionId) : sessions[0].id;
  if (!sessions.some((item) => item.id === activeSessionId)) activeSessionId = sessions[0].id;
  return { version: 1, folders, sessions, activeSessionId };
}

/** @type {Map<string, any>} */
const cache = new Map();

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
  const result = mutator(library);
  persistLibrary(userId, library);
  return result;
}

function summarizeSession(session) {
  return {
    id: session.id,
    title: session.title,
    folderId: session.folderId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    operationMode: session.operationMode,
    messageCount: Array.isArray(session.transcript) ? session.transcript.length : 0,
    preview: String(session.missionDraft || session.transcript?.at?.(-1)?.content || '').slice(0, 120),
  };
}

function snapshotFromLibrary(library, userId = null) {
  const active = library.sessions.find((item) => item.id === library.activeSessionId) || library.sessions[0];
  return {
    ownerUserId: userId || null,
    folders: library.folders
      .slice()
      .sort((a, b) => String(b.createdAt || b.updatedAt).localeCompare(String(a.createdAt || a.updatedAt))),
    // Stable list order: newest created first. Activate/update must not reshuffle.
    sessions: library.sessions
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map(summarizeSession),
    activeSessionId: active?.id || null,
    activeSession: active || null,
    stats: {
      folderCount: library.folders.length,
      sessionCount: library.sessions.length,
      messageCount: library.sessions.reduce(
        (sum, session) => sum + (Array.isArray(session.transcript) ? session.transcript.length : 0),
        0,
      ),
    },
  };
}

export function getChatLibrarySnapshot() {
  const userId = getWorkspaceUserId();
  if (!userId) {
    return snapshotFromLibrary(emptyLibrary(), null);
  }
  return snapshotFromLibrary(loadLibrary(userId), userId);
}

/** Admin/read-only: load another account's chat library without switching request workspace. */
export function getChatLibrarySnapshotForUser(userId) {
  const id = String(userId || '').trim();
  if (!id) {
    const error = new Error('user_required');
    error.status = 400;
    throw error;
  }
  return snapshotFromLibrary(loadLibrary(id), id);
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
  if (!session) {
    const error = new Error('session_not_found');
    error.status = 404;
    throw error;
  }
  return session;
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
  return withLibrary((library) => {
    const before = library.folders.length;
    library.folders = library.folders.filter((item) => item.id !== folderId);
    if (library.folders.length === before) {
      const error = new Error('folder_not_found');
      error.status = 404;
      throw error;
    }
    if (cascadeSessions) {
      library.sessions = library.sessions.filter((item) => item.folderId !== folderId);
      if (!library.sessions.length) {
        const session = makeSession({ title: 'Nova sessão' });
        library.sessions = [session];
        library.activeSessionId = session.id;
      } else if (!library.sessions.some((item) => item.id === library.activeSessionId)) {
        library.activeSessionId = library.sessions[0].id;
      }
    } else {
      for (const session of library.sessions) {
        if (session.folderId === folderId) session.folderId = null;
      }
    }
    return { ok: true, activeSessionId: library.activeSessionId };
  });
}

export function createChatSession({ title, folderId, seedFromActive = false } = {}) {
  return withLibrary((library) => {
    if (library.sessions.length >= MAX_SESSIONS) {
      // Drop oldest by createdAt, not "least recently updated".
      library.sessions = library.sessions
        .slice()
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, MAX_SESSIONS - 1);
    }
    const active = library.sessions.find((item) => item.id === library.activeSessionId);
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
        }
      : {
          title: title || 'Nova sessão',
          folderId: validFolderId,
        });
    library.sessions = [session, ...library.sessions].slice(0, MAX_SESSIONS);
    library.activeSessionId = session.id;
    return session;
  });
}

export function getChatSession(sessionId) {
  const userId = requireWorkspaceUserId();
  const library = loadLibrary(userId);
  const session = library.sessions.find((item) => item.id === sessionId);
  if (!session) {
    const error = new Error('session_not_found');
    error.status = 404;
    throw error;
  }
  return session;
}

export function updateChatSession(sessionId, patch = {}) {
  return withLibrary((library) => {
    const session = library.sessions.find((item) => item.id === sessionId);
    if (!session) {
      const error = new Error('session_not_found');
      error.status = 404;
      throw error;
    }
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
    if (Array.isArray(patch.transcript)) session.transcript = patch.transcript.slice(-MAX_TRANSCRIPT);
    // Append-only path for operator bubbles / incremental replies without full rewrite races.
    if (Array.isArray(patch.appendTranscript) && patch.appendTranscript.length) {
      session.transcript = [...session.transcript, ...patch.appendTranscript].slice(-MAX_TRANSCRIPT);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'finalResult')) session.finalResult = patch.finalResult ?? null;
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
      || patch.operationMode === 'team'
      || patch.operationMode === 'individual'
      || patch.workflowAssignments
      || patch.individualAssignments
    );
    if (contentful) session.updatedAt = nowIso();
    return session;
  });
}

export function activateChatSession(sessionId) {
  return withLibrary((library) => {
    const session = library.sessions.find((item) => item.id === sessionId);
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
  return withLibrary((library) => {
    const before = library.sessions.length;
    library.sessions = library.sessions.filter((item) => item.id !== sessionId);
    if (library.sessions.length === before) {
      const error = new Error('session_not_found');
      error.status = 404;
      throw error;
    }
    if (!library.sessions.length) {
      const session = makeSession({ title: 'Nova sessão' });
      library.sessions = [session];
      library.activeSessionId = session.id;
      return { ok: true, activeSession: session, createdReplacement: true };
    }
    if (library.activeSessionId === sessionId) {
      library.activeSessionId = library.sessions[0].id;
    }
    const active = library.sessions.find((item) => item.id === library.activeSessionId) || library.sessions[0];
    return { ok: true, activeSession: active, createdReplacement: false };
  });
}
