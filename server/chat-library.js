import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import {
  finalEntryFromPersonaRun,
  personaRunOperatorEntryId,
  transcriptEntriesFromPersonaRun,
} from '../shared/persona-run-transcript.js';
import { VISUAL_PERSONA_SLUG } from '../shared/luca-preset-seed.js';
import { missionLedgerHasItems, normalizeMissionLedger } from '../shared/mission-ledger.js';
import { getWorkspaceUserId, requireWorkspaceUserId } from './workspace-context.js';

const rootStateDir = path.resolve(process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'));
const workspacesRoot = path.join(rootStateDir, 'workspaces');
/** Sessões visíveis/ativas do usuário. */
const MAX_SESSIONS = 100;
/** Sessões retidas no library (ativas + soft-deleted) para o admin. */
const MAX_RETAINED_SESSIONS = 400;
const MAX_ARCHIVE_RECORDS = 2000;
const MAX_ARCHIVE_REVISIONS_PER_SESSION = 10;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_FOLDERS = 40;
const MAX_TRANSCRIPT = 200;
const MAX_DRAFT_ATTACHMENTS = 4;
const TITLE_MAX = 80;
const CHAT_LIBRARY_VERSION = 3;

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
    visual: [VISUAL_PERSONA_SLUG],
  };
}

function emptyIndividual() {
  return {
    participants: [],
    judge: null,
    visual: VISUAL_PERSONA_SLUG,
    visualEnabled: true,
  };
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

function makeSession(partial = {}, { forceVisualDefaults = false } = {}) {
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
      ? {
          ...partial.workflowAssignments,
          ...(forceVisualDefaults ? { visual: [VISUAL_PERSONA_SLUG] } : {}),
        }
      : emptyAssignments(),
    individualAssignments: partial.individualAssignments && typeof partial.individualAssignments === 'object'
      ? {
          participants: Array.isArray(partial.individualAssignments.participants)
            ? partial.individualAssignments.participants.map(String).filter(Boolean).slice(0, 5)
            : [],
          judge: partial.individualAssignments.judge ? String(partial.individualAssignments.judge) : null,
          visual: forceVisualDefaults
            ? VISUAL_PERSONA_SLUG
            : (partial.individualAssignments.visual ? String(partial.individualAssignments.visual) : null),
          // Sessões antigas sem o flag: persona salva implica módulo ligado.
          visualEnabled: forceVisualDefaults
            ? true
            : partial.individualAssignments.visualEnabled !== undefined
            ? Boolean(partial.individualAssignments.visualEnabled)
            : Boolean(partial.individualAssignments.visual),
        }
      : emptyIndividual(),
    missionDraft: String(partial.missionDraft || ''),
    draftAttachments: normalizeDraftAttachments(partial.draftAttachments, id),
    transcript: Array.isArray(partial.transcript) ? partial.transcript.slice(-MAX_TRANSCRIPT) : [],
    finalResult: partial.finalResult ?? null,
    visualPack: partial.visualPack ?? null,
    missionLedger: missionLedgerHasItems(partial.missionLedger)
      ? normalizeMissionLedger(partial.missionLedger)
      : null,
    missionDomain: String(partial.missionDomain || '').trim() || null,
    missionDomainOverride: Boolean(partial.missionDomainOverride),
    activePersonaSlug: partial.activePersonaSlug ? String(partial.activePersonaSlug) : null,
    activePersonaRun: normalizeActivePersonaRun(partial.activePersonaRun),
    lastPersonaRun: normalizePersonaRunReceipt(partial.lastPersonaRun),
  };
}

function normalizeActivePersonaRun(value) {
  if (!value || typeof value !== 'object') return null;
  const runId = String(value.runId || '').trim();
  if (!runId) return null;
  const status = String(value.status || 'running').trim() || 'running';
  return {
    runId,
    traceId: String(value.traceId || runId).trim(),
    status,
    startedAt: String(value.startedAt || nowIso()),
    errorMessage: value.errorMessage ? String(value.errorMessage).slice(0, 400) : null,
    errorCode: value.errorCode ? String(value.errorCode).slice(0, 120) : null,
  };
}

function normalizePersonaRunReceipt(value) {
  if (!value || typeof value !== 'object') return null;
  const runId = String(value.runId || '').trim();
  if (!runId) return null;
  return {
    runId,
    traceId: String(value.traceId || runId).trim(),
    status: 'complete',
    startedAt: String(value.startedAt || value.completedAt || nowIso()),
    completedAt: String(value.completedAt || nowIso()),
    ok: value.ok !== false,
  };
}

function isSessionLive(session) {
  return !session?.deletedAt;
}

function liveSessions(library) {
  return (library?.sessions || []).filter(isSessionLive);
}

function mergeTranscript(existing, incoming) {
  if (!incoming.length) return [];
  const merged = Array.isArray(existing) ? existing.slice() : [];
  const indexById = new Map(
    merged.map((entry, index) => [String(entry?.id || '').trim(), index]).filter(([id]) => id),
  );
  for (const entry of incoming) {
    const id = String(entry?.id || '').trim();
    const index = id ? indexById.get(id) : undefined;
    if (index === undefined) {
      if (id) indexById.set(id, merged.length);
      merged.push(entry);
    } else {
      merged[index] = entry;
    }
  }
  return merged.slice(-MAX_TRANSCRIPT);
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
    version: CHAT_LIBRARY_VERSION,
    folders: [],
    sessions: [session],
    activeSessionId: session.id,
  };
}

function normalizeLibrary(raw) {
  const base = emptyLibrary();
  if (!raw || typeof raw !== 'object') return base;
  const forceVisualDefaults = Number(raw.version || 0) < CHAT_LIBRARY_VERSION;
  const folders = Array.isArray(raw.folders)
    ? raw.folders.map((item) => makeFolder(item)).slice(0, MAX_FOLDERS)
    : [];
  const folderIds = new Set(folders.map((item) => item.id));
  let sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map((item) => {
        const session = makeSession(item, { forceVisualDefaults });
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
  return { version: CHAT_LIBRARY_VERSION, folders, sessions, activeSessionId };
}

function loadArchiveRecords(userId, { limit = Infinity } = {}) {
  const id = String(userId || '').trim();
  if (!id) return [];
  const filePath = archivePathFor(id);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const records = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.session?.id) records.push(parsed);
      } catch {
        // skip corrupt line
      }
    }
    const cap = Number(limit);
    return Number.isFinite(cap) ? records.slice(-Math.max(1, cap)) : records;
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function compactArchiveRecords(records) {
  const groups = new Map();
  for (const record of records) {
    const sessionId = String(record?.session?.id || '').trim();
    if (!sessionId) continue;
    if (!groups.has(sessionId)) groups.set(sessionId, []);
    groups.get(sessionId).push(record);
  }
  const orderedGroups = [...groups.values()]
    .map((items) => items.sort((a, b) => String(b.archivedAt || '').localeCompare(String(a.archivedAt || ''))))
    .sort((a, b) => String(b[0]?.archivedAt || '').localeCompare(String(a[0]?.archivedAt || '')));
  const selected = [];
  let bytes = 0;
  for (let revision = 0; revision < MAX_ARCHIVE_REVISIONS_PER_SESSION; revision += 1) {
    for (const items of orderedGroups) {
      if (selected.length >= MAX_ARCHIVE_RECORDS) break;
      const record = items[revision];
      if (!record) continue;
      const recordBytes = Buffer.byteLength(`${JSON.stringify(record)}\n`);
      if (recordBytes > MAX_ARCHIVE_BYTES) throw new Error('chat_archive_record_too_large');
      if (bytes + recordBytes > MAX_ARCHIVE_BYTES) continue;
      selected.push(record);
      bytes += recordBytes;
    }
    if (selected.length >= MAX_ARCHIVE_RECORDS) break;
  }
  return selected.sort((a, b) => String(a.archivedAt || '').localeCompare(String(b.archivedAt || '')));
}

/** Snapshot imutável, compactado e publicado por replace atômico. */
function archiveSessionSnapshot(userId, session, reason = 'snapshot') {
  const id = String(userId || '').trim();
  if (!id || !session?.id) return;
  const filePath = archivePathFor(id);
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
      draftAttachments: session.draftAttachments || [],
      transcript: Array.isArray(session.transcript) ? session.transcript.slice(-MAX_TRANSCRIPT) : [],
      finalResult: session.finalResult ?? null,
      visualPack: session.visualPack ?? null,
      activePersonaSlug: session.activePersonaSlug || null,
      activePersonaRun: session.activePersonaRun || null,
      lastPersonaRun: session.lastPersonaRun || null,
      workflowAssignments: session.workflowAssignments || null,
      individualAssignments: session.individualAssignments || null,
    },
  };
  const records = compactArchiveRecords([...loadArchiveRecords(id), record]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, records.map((item) => JSON.stringify(item)).join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function archiveRevisionId(record) {
  return `archive_${createHash('sha256')
    .update(`${record?.session?.id || ''}\0${record?.archivedAt || ''}\0${record?.reason || ''}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function pruneRetainedSessions(library, userId) {
  if (!library?.sessions || library.sessions.length <= MAX_RETAINED_SESSIONS) return [];
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
  return dropped.map((session) => session.id);
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
  let migrated = false;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    migrated = Number(raw?.version || 0) < CHAT_LIBRARY_VERSION;
    library = normalizeLibrary(raw);
  } catch {
    // First touch: materialize a stable empty library so F5 keeps the same session id.
    library = emptyLibrary();
    created = true;
  }
  cache.set(id, library);
  if (created || migrated) persistLibrary(id, library);
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
  const library = structuredClone(loadLibrary(userId));
  const removedSessionIds = [];
  const result = mutator(library, userId, removedSessionIds);
  const hardRemovedSessionIds = pruneRetainedSessions(library, userId);
  persistLibrary(userId, library);
  cache.set(userId, library);
  notifySessionsRemoved([...removedSessionIds, ...hardRemovedSessionIds]);
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

function isOperatorEntry(entry) {
  const role = String(entry?.role || '').toLowerCase();
  return role === 'operator' || role === 'user';
}

function emptyProductUsage() {
  return {
    promptCount: 0,
    runCount: 0,
    chatSessionCount: 0,
    workSessionCount: 0,
    messageCount: 0,
    folderCount: 0,
  };
}

/**
 * Fonte de verdade de uso de produto (admin): prompts do operador na bancada,
 * não batidas HTTP. 1 bolha operator/user = 1 prompt = 1 rodada de produto.
 */
export function getProductUsageSummaryForUser(userId) {
  const id = String(userId || '').trim();
  if (!id) return emptyProductUsage();

  let library;
  try {
    library = loadLibrary(id);
  } catch {
    return emptyProductUsage();
  }

  const seenOperatorIds = new Set();
  let promptCount = 0;
  let messageCount = 0;
  const workSessionIds = new Set();

  function absorbSession(session) {
    if (!session?.id) return;
    const transcript = Array.isArray(session.transcript) ? session.transcript : [];
    messageCount += transcript.length;
    let localPrompts = 0;
    for (const entry of transcript) {
      if (!isOperatorEntry(entry)) continue;
      const entryId = String(entry.id || '').trim()
        || `${session.id}:${entry.timestamp || ''}:${String(entry.content || '').slice(0, 48)}`;
      if (seenOperatorIds.has(entryId)) continue;
      seenOperatorIds.add(entryId);
      localPrompts += 1;
      promptCount += 1;
    }
    if (localPrompts > 0 || session.finalResult) {
      workSessionIds.add(String(session.sourceSessionId || session.id));
    }
  }

  for (const session of library.sessions || []) {
    absorbSession(session);
  }

  // Sessões só no archive (prune) + revisões de limpeza com prompts antigos.
  let archive = [];
  try {
    archive = loadArchiveRecords(id);
  } catch {
    archive = [];
  }
  const libraryIds = new Set((library.sessions || []).map((item) => item.id));
  for (const record of archive) {
    const session = record?.session;
    if (!session?.id) continue;
    if (libraryIds.has(session.id) && record.reason !== 'transcript_clear') continue;
    absorbSession(session);
  }

  const chatSessionCount = (library.sessions || []).filter((session) => {
    const msgs = Array.isArray(session.transcript) ? session.transcript.length : 0;
    return msgs > 0 || Boolean(session.finalResult) || Boolean(String(session.missionDraft || '').trim());
  }).length;

  return {
    promptCount,
    runCount: promptCount,
    chatSessionCount,
    workSessionCount: workSessionIds.size,
    messageCount,
    folderCount: Array.isArray(library.folders) ? library.folders.length : 0,
  };
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
  const archive = loadArchiveRecords(id);
  // Último snapshot por sessionId (mais recente no arquivo) para sessões já podadas.
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
  const revisions = archive
    .filter((record) => record.reason === 'transcript_clear')
    .map((record) => ({
      ...summarizeSession(makeSession(record.session)),
      id: archiveRevisionId(record),
      sourceSessionId: record.session.id,
      archivedOnly: true,
      archivedAt: record.archivedAt,
      archiveReason: record.reason,
    }));
  const archivedSessions = [...archiveOnly, ...revisions]
    .sort((a, b) => String(b.archivedAt || b.createdAt || '').localeCompare(String(a.archivedAt || a.createdAt || '')));
  return {
    ...snap,
    sessions: [...snap.sessions, ...archivedSessions],
    stats: {
      ...snap.stats,
      sessionCount: snap.sessions.length + archivedSessions.length,
      archivedOnlyCount: archivedSessions.length,
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
  const archive = loadArchiveRecords(id);
  const revision = archive.find((record) => archiveRevisionId(record) === sid);
  if (revision) {
    return {
      ...makeSession(revision.session),
      id: sid,
      sourceSessionId: revision.session.id,
      archivedOnly: true,
      archivedAt: revision.archivedAt,
      archiveReason: revision.reason,
    };
  }
  // Fallback: último snapshot no archive (suporte mesmo após prune).
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
  return withLibrary((library, userId, removedSessionIds) => {
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
          item.folderId = null;
          item.deletedAt = stamp;
          item.updatedAt = stamp;
          archiveSessionSnapshot(userId, item, 'folder_cascade_delete');
          removedSessionIds.push(item.id);
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
    return { ok: true, activeSessionId: library.activeSessionId };
  });
}

export function createChatSession({ title, folderId, seedFromActive = false } = {}) {
  return withLibrary((library, userId, removedSessionIds) => {
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
        removedSessionIds.push(item.id);
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
          workflowAssignments: {
            ...active.workflowAssignments,
            visual: [VISUAL_PERSONA_SLUG],
          },
          individualAssignments: {
            ...active.individualAssignments,
            visual: VISUAL_PERSONA_SLUG,
            visualEnabled: true,
          },
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
        visual: Object.prototype.hasOwnProperty.call(patch.individualAssignments, 'visual')
          ? (patch.individualAssignments.visual ? String(patch.individualAssignments.visual) : null)
          : (session.individualAssignments.visual ?? null),
        visualEnabled: Object.prototype.hasOwnProperty.call(patch.individualAssignments, 'visualEnabled')
          ? Boolean(patch.individualAssignments.visualEnabled)
          : Boolean(session.individualAssignments.visualEnabled ?? session.individualAssignments.visual),
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
      session.transcript = mergeTranscript(session.transcript, patch.transcript);
    }
    // Append-only path for operator bubbles / incremental replies without full rewrite races.
    if (Array.isArray(patch.appendTranscript) && patch.appendTranscript.length) {
      session.transcript = [...(session.transcript || []), ...patch.appendTranscript].slice(-MAX_TRANSCRIPT);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'finalResult')) session.finalResult = patch.finalResult ?? null;
    if (Object.prototype.hasOwnProperty.call(patch, 'visualPack')) session.visualPack = patch.visualPack ?? null;
    if (Object.prototype.hasOwnProperty.call(patch, 'missionLedger')) {
      session.missionLedger = missionLedgerHasItems(patch.missionLedger)
        ? normalizeMissionLedger(patch.missionLedger)
        : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'missionDomain')) {
      session.missionDomain = patch.missionDomain ? String(patch.missionDomain).trim() : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'missionDomainOverride')) {
      session.missionDomainOverride = Boolean(patch.missionDomainOverride);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'activePersonaSlug')) {
      session.activePersonaSlug = patch.activePersonaSlug ? String(patch.activePersonaSlug) : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'activePersonaRun')) {
      session.activePersonaRun = normalizeActivePersonaRun(patch.activePersonaRun);
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
      || Object.prototype.hasOwnProperty.call(patch, 'missionLedger')
      || Object.prototype.hasOwnProperty.call(patch, 'missionDomain')
      || Object.prototype.hasOwnProperty.call(patch, 'activePersonaRun')
      || patch.operationMode === 'team'
      || patch.operationMode === 'individual'
      || patch.workflowAssignments
      || patch.individualAssignments
    );
    if (contentful) session.updatedAt = nowIso();

    return session;
  });
}

/**
 * Marca rodada assíncrona na sessão (sobrevive a 524/F5 enquanto o job roda na VM).
 */
export function markPersonaRunStartedOnSession(sessionId, meta = {}) {
  const sid = String(sessionId || '').trim();
  const runId = String(meta.runId || '').trim();
  if (!sid || !runId) return null;
  return withLibrary((library) => {
    const session = library.sessions.find((item) => item.id === sid);
    if (!session) return null;
    session.activePersonaRun = normalizeActivePersonaRun({
      runId,
      traceId: meta.traceId || runId,
      status: 'running',
      startedAt: meta.startedAt || nowIso(),
      errorMessage: null,
      errorCode: null,
    });
    session.updatedAt = nowIso();
    return session;
  });
}

export function markPersonaRunFailedOnSession(sessionId, meta = {}) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  return withLibrary((library) => {
    const session = library.sessions.find((item) => item.id === sid);
    if (!session) return null;
    const prev = normalizeActivePersonaRun(session.activePersonaRun);
    if (!prev && !meta.runId) {
      session.activePersonaRun = null;
      return session;
    }
    session.activePersonaRun = normalizeActivePersonaRun({
      runId: meta.runId || prev?.runId,
      traceId: meta.traceId || prev?.traceId,
      status: 'failed',
      startedAt: prev?.startedAt || nowIso(),
      errorMessage: meta.errorMessage || meta.message || 'persona_run_failed',
      errorCode: meta.errorCode || meta.code || 'persona_run_failed',
    });
    session.updatedAt = nowIso();
    return session;
  });
}

export function clearPersonaRunOnSession(sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  return withLibrary((library) => {
    const session = library.sessions.find((item) => item.id === sid);
    if (!session) return null;
    session.activePersonaRun = null;
    session.updatedAt = nowIso();
    return session;
  });
}

/**
 * Grava a rodada no chat-library no servidor (fonte de verdade).
 * Independente do flush do browser — falha de juíz/F5 não apaga o histórico.
 */
export function recordPersonaRunOnSession(sessionId, run = {}, meta = {}) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  return withLibrary((library, userId) => {
    const session = library.sessions.find((item) => item.id === sid);
    if (!session) return null;

    const timestamp = String(run.generatedAt || nowIso());
    const activeRun = normalizeActivePersonaRun(session.activePersonaRun);
    const mission = String(run.mission || session.missionDraft || '').trim();
    const mode = run.mode === 'individual' ? 'individual' : 'team';
    const existing = Array.isArray(session.transcript) ? session.transcript.slice() : [];
    // O browser já gravou a bolha do operador com este mesmo id derivado do trace.
    const operatorId = personaRunOperatorEntryId(run);
    if (mission && !existing.some((entry) => entry.id === operatorId)) {
      existing.push({
        id: operatorId,
        role: 'operator',
        name: 'Operador',
        content: mission,
        status: 'info',
        timestamp: String(run.startedAt || timestamp),
        durationMs: 0,
        attachments: Array.isArray(run.attachments) ? run.attachments : [],
      });
    }

    const replyEntries = transcriptEntriesFromPersonaRun(run);

    session.transcript = mergeTranscript(existing, replyEntries);
    // Message is committed on the operator bubble — draft leaves empty (Codex-style send).
    session.missionDraft = '';
    session.operationMode = mode;

    session.finalResult = finalEntryFromPersonaRun(run);
    session.visualPack = run.visualPack && typeof run.visualPack === 'object' ? run.visualPack : null;
    if (run.missionLedger && missionLedgerHasItems(run.missionLedger)) {
      session.missionLedger = normalizeMissionLedger(run.missionLedger);
    }
    if (run.domain) session.missionDomain = String(run.domain);
    if (run.domainSource === 'override') session.missionDomainOverride = true;
    if (run.ok) session.draftAttachments = [];
    const runId = String(meta.runId || activeRun?.runId || '').trim();
    if (runId) {
      session.lastPersonaRun = normalizePersonaRunReceipt({
        runId,
        traceId: meta.traceId || run.traceId || activeRun?.traceId || runId,
        startedAt: meta.startedAt || activeRun?.startedAt || timestamp,
        completedAt: meta.completedAt || timestamp,
        ok: run.ok,
      });
    }
    // Job terminou — limpa marcador de rodada em andamento.
    session.activePersonaRun = null;

    if (!String(session.title || '').trim() || session.title === 'Nova sessão') {
      if (mission) session.title = clipTitle(mission);
    }
    session.updatedAt = nowIso();
    return session;
  });
}

/** Adapter duravel do lifecycle: encontra uma rodada pela sessao, inclusive apos restart. */
export function findPersonaRunOnSession(runId) {
  const cleanRunId = String(runId || '').trim();
  if (!cleanRunId) return null;
  const userId = requireWorkspaceUserId();
  const library = loadLibrary(userId);
  for (const session of library.sessions) {
    const active = normalizeActivePersonaRun(session.activePersonaRun);
    if (active?.runId === cleanRunId) {
      return {
        sessionId: session.id,
        runId: active.runId,
        traceId: active.traceId,
        status: active.status,
        startedAt: active.startedAt,
        completedAt: active.status === 'failed' ? session.updatedAt : null,
        result: null,
        error: active.status === 'failed'
          ? {
              code: active.errorCode || 'persona_run_failed',
              message: active.errorMessage || 'Falha ao executar a rodada de personas.',
            }
          : null,
      };
    }

    const receipt = normalizePersonaRunReceipt(session.lastPersonaRun);
    if (receipt?.runId !== cleanRunId) continue;
    const operatorId = personaRunOperatorEntryId({ traceId: receipt.traceId });
    const operator = (session.transcript || []).find((entry) => entry?.id === operatorId);
    const finalResult = session.finalResult && typeof session.finalResult === 'object'
      ? session.finalResult
      : null;
    return {
      sessionId: session.id,
      runId: receipt.runId,
      traceId: receipt.traceId,
      status: 'complete',
      startedAt: receipt.startedAt,
      completedAt: receipt.completedAt,
      error: null,
      result: {
        ok: receipt.ok,
        recoveredFromSession: true,
        traceId: receipt.traceId,
        mission: String(operator?.content || ''),
        mode: session.operationMode === 'individual' ? 'individual' : 'workflow',
        team: [],
        replies: [],
        finalDisplay: finalResult ? {
          roleId: 'recovered',
          roleLabel: String(finalResult.stage || 'Recuperado'),
          slug: String(finalResult.slug || 'session'),
          name: String(finalResult.name || 'Sessao'),
          model: finalResult.model ? String(finalResult.model) : undefined,
          content: String(finalResult.content || ''),
        } : null,
        visualPack: session.visualPack ?? null,
        missionLedger: session.missionLedger ?? null,
        generatedAt: receipt.completedAt,
      },
    };
  }
  return null;
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
  return withLibrary((library, userId, removedSessionIds) => {
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
    removedSessionIds.push(sessionId);

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
