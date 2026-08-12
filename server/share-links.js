// Public, immutable, read-only snapshots of LUCA-AI chat sessions.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { requireWorkspaceUserId } from './workspace-context.js';
import { getChatSession, onChatSessionsRemoved } from './chat-library.js';

const rootStateDir = path.resolve(process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'));
const shareFilePath = path.join(rootStateDir, 'share-links.json');
const MAX_LINKS = 500;
const MAX_TRANSCRIPT = 200;

let cache = null;

function nowIso() {
  return new Date().toISOString();
}

function makeToken() {
  return randomBytes(16).toString('base64url');
}

function cleanToken(value) {
  const token = String(value || '').trim();
  return token && token.length <= 64 ? token : '';
}

function loadStore() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(shareFilePath, 'utf8'));
    cache = { version: 2, links: Array.isArray(raw?.links) ? raw.links : [] };
  } catch {
    cache = { version: 2, links: [] };
  }
  return cache;
}

function persistStore(store) {
  fs.mkdirSync(path.dirname(shareFilePath), { recursive: true });
  const tmp = `${shareFilePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, shareFilePath);
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const content = String(entry.content || '');
  if (!content.trim()) return null;
  const phase = ['blind', 'revision', 'judge'].includes(entry.phase) ? entry.phase : undefined;
  return {
    id: String(entry.id || ''),
    role: entry.role === 'operator' || entry.role === 'system' ? entry.role : 'persona',
    name: String(entry.name || '').slice(0, 120),
    slug: entry.slug ? String(entry.slug).slice(0, 120) : undefined,
    model: entry.model ? String(entry.model).slice(0, 120) : undefined,
    stage: entry.stage ? String(entry.stage).slice(0, 160) : undefined,
    phase,
    status: entry.status === 'error' || entry.status === 'info' ? entry.status : 'ok',
    content: content.slice(0, 40_000),
    timestamp: String(entry.timestamp || ''),
  };
}

function sanitizeVisualPack(pack) {
  if (!pack || typeof pack !== 'object') return null;
  const report = pack.report && typeof pack.report === 'object'
    ? {
        id: String(pack.report.id || 'report').slice(0, 120),
        kind: 'report',
        title: String(pack.report.title || 'Relatório').slice(0, 240),
        markdown: String(pack.report.markdown || '').slice(0, 80_000),
        status: pack.report.status ? String(pack.report.status).slice(0, 40) : undefined,
      }
    : null;
  const charts = (Array.isArray(pack.charts) ? pack.charts : []).slice(0, 12).map((chart) => ({
    id: String(chart?.id || '').slice(0, 120),
    kind: 'chart',
    title: String(chart?.title || '').slice(0, 240),
    type: String(chart?.type || 'tower').slice(0, 40),
    items: (Array.isArray(chart?.items) ? chart.items : []).slice(0, 40).map((item) => ({
      label: String(item?.label || '').slice(0, 240),
      value: Number(item?.value) || 0,
    })),
    rationale: chart?.rationale ? String(chart.rationale).slice(0, 4_000) : undefined,
    status: chart?.status ? String(chart.status).slice(0, 40) : undefined,
  }));
  const images = (Array.isArray(pack.images) ? pack.images : []).slice(0, 12).map((image) => ({
    id: String(image?.id || '').slice(0, 120),
    kind: 'image',
    title: String(image?.title || '').slice(0, 240),
    prompt: image?.prompt ? String(image.prompt).slice(0, 12_000) : undefined,
    aspectRatio: image?.aspectRatio ? String(image.aspectRatio).slice(0, 40) : undefined,
    style: image?.style ? String(image.style).slice(0, 120) : undefined,
    mimeType: image?.mimeType ? String(image.mimeType).slice(0, 120) : undefined,
    size: Math.max(0, Number(image?.size) || 0),
    url: image?.url ? String(image.url).slice(0, 4_000) : undefined,
    model: image?.model ? String(image.model).slice(0, 160) : undefined,
    status: image?.status ? String(image.status).slice(0, 40) : undefined,
    error: image?.error ? String(image.error).slice(0, 2_000) : undefined,
  }));
  return {
    status: String(pack.status || 'complete').slice(0, 40),
    summary: pack.summary ? String(pack.summary).slice(0, 12_000) : undefined,
    report,
    charts,
    images,
    imageEngine: pack.imageEngine ? String(pack.imageEngine).slice(0, 160) : null,
    planSource: pack.planSource ? String(pack.planSource).slice(0, 120) : undefined,
    retried: Boolean(pack.retried),
    localImageFallback: Boolean(pack.localImageFallback),
    errors: (Array.isArray(pack.errors) ? pack.errors : []).slice(0, 20).map((item) => ({
      id: item?.id ? String(item.id).slice(0, 120) : undefined,
      error: item?.error ? String(item.error).slice(0, 2_000) : undefined,
    })),
    generatedAt: pack.generatedAt ? String(pack.generatedAt) : undefined,
    reason: pack.reason ? String(pack.reason).slice(0, 2_000) : undefined,
  };
}

function buildSnapshot(session) {
  const transcript = (Array.isArray(session.transcript) ? session.transcript : [])
    .map(sanitizeEntry)
    .filter(Boolean)
    .slice(-MAX_TRANSCRIPT);
  return {
    title: String(session.title || 'Sessão LUCA-AI'),
    operationMode: session.operationMode === 'individual' ? 'individual' : 'team',
    missionDraft: String(session.missionDraft || '').slice(0, 8_000),
    transcript,
    finalResult: sanitizeEntry(session.finalResult),
    visualPack: sanitizeVisualPack(session.visualPack),
    sessionCreatedAt: String(session.createdAt || ''),
    sessionUpdatedAt: String(session.updatedAt || ''),
  };
}

function publicLinkInfo(link) {
  return {
    token: link.token,
    url: `/leitura/${link.token}`,
    sessionId: link.sessionId,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    messageCount: Array.isArray(link.snapshot?.transcript) ? link.snapshot.transcript.length : 0,
  };
}

function activeLink(token) {
  const clean = cleanToken(token);
  if (!clean) return null;
  return loadStore().links.find((item) => item.token === clean && !item.revokedAt && item.snapshot) || null;
}

function parseLocalVisualUrl(value) {
  const match = String(value || '').match(/^\/api\/luca-ai\/visual-artifacts\/([^/?#]+)\/([^/?#]+)$/);
  if (!match) return null;
  try {
    return { traceId: decodeURIComponent(match[1]), artifactId: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

export function createShareLink(sessionId) {
  const ownerUserId = requireWorkspaceUserId();
  const session = getChatSession(sessionId);
  const store = loadStore();
  const snapshot = buildSnapshot(session);
  const existing = store.links.find(
    (item) => item.ownerUserId === ownerUserId && item.sessionId === session.id && !item.revokedAt,
  );
  if (existing) {
    existing.snapshot = snapshot;
    existing.updatedAt = nowIso();
    persistStore(store);
    return publicLinkInfo(existing);
  }
  const link = {
    token: makeToken(),
    ownerUserId,
    sessionId: session.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    revokedAt: null,
    snapshot,
  };
  store.links = [link, ...store.links].slice(0, MAX_LINKS);
  persistStore(store);
  return publicLinkInfo(link);
}

export function getShareLinkForSession(sessionId) {
  const ownerUserId = requireWorkspaceUserId();
  const link = loadStore().links.find(
    (item) => item.ownerUserId === ownerUserId && item.sessionId === String(sessionId) && !item.revokedAt,
  );
  return link ? publicLinkInfo(link) : null;
}

export function revokeShareLink(sessionId) {
  const ownerUserId = requireWorkspaceUserId();
  const store = loadStore();
  const link = store.links.find(
    (item) => item.ownerUserId === ownerUserId && item.sessionId === String(sessionId) && !item.revokedAt,
  );
  if (!link) {
    const error = new Error('share_not_found');
    error.status = 404;
    throw error;
  }
  link.revokedAt = nowIso();
  link.snapshot = null;
  persistStore(store);
  return { ok: true };
}

onChatSessionsRemoved((sessionIds) => {
  const ownerUserId = requireWorkspaceUserId();
  const ids = new Set((Array.isArray(sessionIds) ? sessionIds : []).map(String));
  if (!ids.size) return;
  const store = loadStore();
  let changed = false;
  for (const link of store.links) {
    if (link.ownerUserId !== ownerUserId || !ids.has(String(link.sessionId)) || link.revokedAt) continue;
    link.revokedAt = nowIso();
    link.snapshot = null;
    changed = true;
  }
  if (changed) persistStore(store);
});

export function resolvePublicShare(token) {
  const link = activeLink(token);
  if (!link) return null;
  return {
    token: link.token,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    snapshot: link.snapshot,
  };
}

export function publicSharePayload(token) {
  const share = resolvePublicShare(token);
  if (!share) return null;
  const payload = JSON.parse(JSON.stringify(share));
  for (const image of payload.snapshot?.visualPack?.images || []) {
    const local = parseLocalVisualUrl(image.url);
    if (!local) continue;
    image.url = `/api/public/share/${encodeURIComponent(share.token)}/artifacts/${encodeURIComponent(local.traceId)}/${encodeURIComponent(local.artifactId)}`;
  }
  return payload;
}

export function resolvePublicShareArtifactAccess(token, traceId, artifactId) {
  const link = activeLink(token);
  if (!link) return null;
  const cleanTraceId = String(traceId || '');
  const cleanArtifactId = String(artifactId || '');
  const allowed = (link.snapshot?.visualPack?.images || []).some((image) => {
    const local = parseLocalVisualUrl(image?.url);
    return local?.traceId === cleanTraceId && local?.artifactId === cleanArtifactId;
  });
  return allowed ? { ownerUserId: link.ownerUserId } : null;
}
