// CHAT_ATTACHMENTS_V1 — private per-account chat attachments for LUCA-AI.
//
// Files live outside the chat library JSON: one directory per (account, session),
// both derived from a hash so nothing user-controlled ever reaches the filesystem
// path. Every entry point resolves the session through getChatSession(), which
// throws outside the caller's workspace — that is the cross-account boundary.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { getChatSession, onChatSessionsRemoved } from './chat-library.js';
import { requireWorkspaceUserId } from './workspace-context.js';

export const MAX_CHAT_ATTACHMENTS = 4;
export const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS_TOTAL_BYTES = 20 * 1024 * 1024;
// Uploads sao aceitos antes de qualquer rodada, entao o limite de 4 anexos nao
// segura o disco: sem esta quota da para acumular arquivos nunca referenciados.
export const MAX_CHAT_SESSION_STORAGE_BYTES = 50 * 1024 * 1024;

const rootStateDir = path.resolve(process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'));
const workspacesRoot = path.join(rootStateDir, 'workspaces');

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.yaml', '.yml', '.toml', '.sql', '.log',
  '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.htm', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.hpp',
]);
const TEXT_MIME_TYPES = new Set([
  'text/plain', 'text/markdown', 'text/csv', 'text/xml', 'text/yaml',
  'application/json', 'application/xml', 'application/yaml', 'application/x-yaml',
  'application/toml', 'application/sql', 'application/javascript', 'application/typescript',
]);
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function safeDirSegment(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function attachmentDir(userId, sessionId) {
  return path.join(workspacesRoot, safeDirSegment(userId), 'chat-attachments', safeDirSegment(sessionId));
}

function metadataPath(userId, sessionId, attachmentId) {
  return path.join(attachmentDir(userId, sessionId), `${attachmentId}.json`);
}

function dataPath(userId, sessionId, attachmentId) {
  return path.join(attachmentDir(userId, sessionId), `${attachmentId}.bin`);
}

function attachmentError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function cleanName(value) {
  const name = path.basename(String(value || '').replaceAll('\\', '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return (name || 'arquivo').slice(0, 180);
}

function hasImageSignature(buffer, mimeType) {
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  if (mimeType === 'image/gif') {
    const signature = buffer.toString('ascii', 0, 6);
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  return false;
}

function inferredImageMime(buffer) {
  for (const mimeType of IMAGE_MIME_TYPES) {
    if (hasImageSignature(buffer, mimeType)) return mimeType;
  }
  return '';
}

function isDecodableText(buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

// Trust the bytes, not the label: a file claiming image/png must actually start
// with the PNG signature, otherwise it is rejected.
function normalizeAttachmentType(name, requestedMimeType, buffer) {
  const requested = String(requestedMimeType || '').split(';')[0].trim().toLowerCase();
  const extension = path.extname(name).toLowerCase();
  const detectedImage = inferredImageMime(buffer);

  if (IMAGE_MIME_TYPES.has(requested) || detectedImage) {
    const mimeType = IMAGE_MIME_TYPES.has(requested) ? requested : detectedImage;
    if (!IMAGE_MIME_TYPES.has(mimeType) || !hasImageSignature(buffer, mimeType)) {
      throw attachmentError('attachment_signature_mismatch');
    }
    return { kind: 'image', mimeType };
  }

  if (requested === 'application/pdf' || extension === '.pdf') {
    if (buffer.length < 5 || buffer.toString('ascii', 0, 5) !== '%PDF-') {
      throw attachmentError('attachment_signature_mismatch');
    }
    // Nenhum modelo do catalogo 9Router le PDF hoje (probes em gpt-5.6-sol,
    // claude-fable-5 e grok-4.5, com input_file e file/file_data: todos
    // respondem sem enxergar o arquivo). Aceitar aqui produziria persona
    // confiante sobre documento que nunca leu — recusamos na porta.
    throw attachmentError('attachment_pdf_not_supported', 415);
  }

  if (TEXT_MIME_TYPES.has(requested) || TEXT_EXTENSIONS.has(extension)) {
    if (!isDecodableText(buffer)) throw attachmentError('attachment_text_invalid');
    return {
      kind: 'text',
      mimeType: TEXT_MIME_TYPES.has(requested) ? requested : 'text/plain',
    };
  }

  throw attachmentError('attachment_type_not_supported', 415);
}

function publicMetadata(meta) {
  return {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    kind: meta.kind,
    size: meta.size,
    createdAt: meta.createdAt,
    url: `/api/luca-ai/chat/sessions/${encodeURIComponent(meta.sessionId)}/attachments/${encodeURIComponent(meta.id)}`,
  };
}

function readStored(userId, sessionId, attachmentId) {
  const cleanId = String(attachmentId || '').trim();
  // Ids are hex generated here; anything else never touches the filesystem.
  if (!/^[a-f0-9]{24}$/.test(cleanId)) throw attachmentError('attachment_not_found', 404);
  try {
    const meta = JSON.parse(fs.readFileSync(metadataPath(userId, sessionId, cleanId), 'utf8'));
    const buffer = fs.readFileSync(dataPath(userId, sessionId, cleanId));
    if (meta.sessionId !== sessionId || meta.id !== cleanId || buffer.length !== meta.size) {
      throw new Error('attachment_corrupt');
    }
    return { meta, buffer };
  } catch (error) {
    if (error?.message === 'attachment_corrupt') throw attachmentError('attachment_corrupt', 500);
    throw attachmentError('attachment_not_found', 404);
  }
}

function usedSessionBytes(userId, sessionId) {
  const dir = attachmentDir(userId, sessionId);
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.bin')) continue;
    try {
      total += fs.statSync(path.join(dir, entry)).size;
    } catch {
      // Arquivo sumiu no meio da contagem: ignorar e seguir.
    }
  }
  return total;
}

export function storeChatAttachment({ sessionId, name, mimeType, buffer }) {
  const userId = requireWorkspaceUserId();
  const session = getChatSession(String(sessionId || '').trim());
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!bytes.length) throw attachmentError('attachment_empty');
  if (bytes.length > MAX_CHAT_ATTACHMENT_BYTES) throw attachmentError('attachment_too_large', 413);
  if (usedSessionBytes(userId, session.id) + bytes.length > MAX_CHAT_SESSION_STORAGE_BYTES) {
    throw attachmentError('attachment_session_quota_exceeded', 413);
  }

  const clean = cleanName(name);
  const type = normalizeAttachmentType(clean, mimeType, bytes);
  const id = randomBytes(12).toString('hex');
  const meta = {
    id,
    sessionId: session.id,
    name: clean,
    mimeType: type.mimeType,
    kind: type.kind,
    size: bytes.length,
    createdAt: new Date().toISOString(),
  };

  const dir = attachmentDir(userId, session.id);
  fs.mkdirSync(dir, { recursive: true });
  // Atomic publish: a crash mid-write must never leave a half file readable.
  const tmp = path.join(dir, `${id}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, dataPath(userId, session.id, id));
  fs.writeFileSync(metadataPath(userId, session.id, id), JSON.stringify(meta, null, 2));
  return publicMetadata(meta);
}

export function getChatAttachment(sessionId, attachmentId) {
  const userId = requireWorkspaceUserId();
  const session = getChatSession(String(sessionId || '').trim());
  const stored = readStored(userId, session.id, attachmentId);
  return { ...stored, public: publicMetadata(stored.meta) };
}

export function deleteChatAttachment(sessionId, attachmentId) {
  const userId = requireWorkspaceUserId();
  const session = getChatSession(String(sessionId || '').trim());
  const stored = readStored(userId, session.id, attachmentId);
  fs.rmSync(dataPath(userId, session.id, stored.meta.id), { force: true });
  fs.rmSync(metadataPath(userId, session.id, stored.meta.id), { force: true });
  return { ok: true, id: stored.meta.id };
}

export function deleteAllChatAttachments(sessionId) {
  const userId = requireWorkspaceUserId();
  const session = getChatSession(String(sessionId || '').trim());
  fs.rmSync(attachmentDir(userId, session.id), { recursive: true, force: true });
  return { ok: true, sessionId: session.id };
}

/**
 * Drop attachment directories of sessions that no longer exist. The session row
 * is already gone at this point, so getChatSession() can no longer resolve them.
 */
export function purgeChatAttachmentsForSessions(sessionIds = []) {
  const userId = requireWorkspaceUserId();
  const ids = [...new Set(
    (Array.isArray(sessionIds) ? sessionIds : []).map((id) => String(id || '').trim()).filter(Boolean),
  )];
  let removed = 0;
  for (const id of ids) {
    const dir = attachmentDir(userId, id);
    if (!fs.existsSync(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed += 1;
  }
  return { ok: true, removed };
}

/** Test/ops helper: which of these sessions still own files on disk. */
export function listStoredAttachmentSessionIds(candidateSessionIds = []) {
  const userId = requireWorkspaceUserId();
  return (Array.isArray(candidateSessionIds) ? candidateSessionIds : [])
    .map((id) => String(id || '').trim())
    .filter((id) => id && fs.existsSync(attachmentDir(userId, id)));
}

/**
 * Build the model-facing parts for a run. Images become native `image_url`
 * blocks; text/PDF become `input_file` blocks that agent-loop inlines as text,
 * because not every model in the 9Router catalog can read file blocks.
 */
export function resolveChatAttachmentsForModel(sessionId, attachmentIds = []) {
  const userId = requireWorkspaceUserId();
  const session = getChatSession(String(sessionId || '').trim());
  const ids = [...new Set(
    (Array.isArray(attachmentIds) ? attachmentIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];
  if (ids.length > MAX_CHAT_ATTACHMENTS) throw attachmentError('too_many_attachments');

  let totalBytes = 0;
  return ids.map((id) => {
    const { meta, buffer } = readStored(userId, session.id, id);
    totalBytes += buffer.length;
    if (totalBytes > MAX_CHAT_ATTACHMENTS_TOTAL_BYTES) {
      throw attachmentError('attachments_total_too_large', 413);
    }
    const dataUrl = `data:${meta.mimeType};base64,${buffer.toString('base64')}`;
    return {
      meta: publicMetadata(meta),
      part: meta.kind === 'image'
        ? { type: 'image_url', image_url: { url: dataUrl } }
        : { type: 'input_file', filename: meta.name, file_data: dataUrl },
    };
  });
}

// Cascade folder deletion removes many sessions at once; without this their
// private files would stay on disk forever with no owner able to reach them.
onChatSessionsRemoved((sessionIds) => {
  purgeChatAttachmentsForSessions(sessionIds);
});
