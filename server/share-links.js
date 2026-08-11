// SHARE_LINKS_V1 — public read-only share links for LUCA-AI chat sessions.
// A share captures an immutable snapshot of the session at share time and
// exposes it at /s/:token without authentication. Owner can refresh or revoke.
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

function loadStore() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(shareFilePath, 'utf8'));
    cache = {
      version: 1,
      links: Array.isArray(raw?.links) ? raw.links : [],
    };
  } catch {
    cache = { version: 1, links: [] };
  }
  return cache;
}

function persistStore(store) {
  fs.mkdirSync(path.dirname(shareFilePath), { recursive: true });
  // Atomic replace — crash mid-write must not corrupt share-links.json.
  const tmp = `${shareFilePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, shareFilePath);
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const content = String(entry.content || '');
  if (!content.trim()) return null;
  return {
    id: String(entry.id || ''),
    role: entry.role === 'operator' || entry.role === 'system' ? entry.role : 'persona',
    name: String(entry.name || '').slice(0, 120),
    slug: entry.slug ? String(entry.slug).slice(0, 120) : undefined,
    model: entry.model ? String(entry.model).slice(0, 120) : undefined,
    stage: entry.stage ? String(entry.stage).slice(0, 160) : undefined,
    status: entry.status === 'error' || entry.status === 'info' ? entry.status : 'ok',
    content: content.slice(0, 40_000),
    timestamp: String(entry.timestamp || ''),
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
    sessionCreatedAt: String(session.createdAt || ''),
    sessionUpdatedAt: String(session.updatedAt || ''),
  };
}

function publicLinkInfo(link) {
  return {
    token: link.token,
    url: `/s/${link.token}`,
    sessionId: link.sessionId,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    messageCount: Array.isArray(link.snapshot?.transcript) ? link.snapshot.transcript.length : 0,
  };
}

/** Create (or refresh the snapshot of) the public link for one of MY sessions. */
export function createShareLink(sessionId) {
  const ownerUserId = requireWorkspaceUserId();
  const session = getChatSession(sessionId); // throws session_not_found outside own workspace
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

/** Current active link for one of MY sessions, or null. */
export function getShareLinkForSession(sessionId) {
  const ownerUserId = requireWorkspaceUserId();
  const store = loadStore();
  const link = store.links.find(
    (item) => item.ownerUserId === ownerUserId && item.sessionId === String(sessionId) && !item.revokedAt,
  );
  return link ? publicLinkInfo(link) : null;
}

/** Revoke the active link for one of MY sessions. */
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
  link.snapshot = null; // drop content on revoke — link dies for good
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

/** Public resolution — no auth. Returns snapshot payload or null. */
export function resolvePublicShare(token) {
  const clean = String(token || '').trim();
  if (!clean || clean.length > 64) return null;
  const store = loadStore();
  const link = store.links.find((item) => item.token === clean && !item.revokedAt);
  if (!link || !link.snapshot) return null;
  return {
    token: link.token,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    snapshot: link.snapshot,
  };
}

// ---------------------------------------------------------------------------
// Public viewer rendering (server-side HTML, zero JS, CSP-safe inline styles)
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Markdown-lite: escaped first, then headings/bold/bullets/code fences. */
function renderRichText(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const html = [];
  let inCode = false;
  let codeBuffer = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  const inline = (text) => escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 6);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    const numbered = line.match(/^\s*(\d{1,3})[.)]\s+(.*)$/);
    if (numbered) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li><strong>${escapeHtml(numbered[1])}.</strong> ${inline(numbered[2])}</li>`);
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      closeList();
      html.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  if (inCode && codeBuffer.length) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }
  closeList();
  return html.join('\n');
}

function renderEntry(entry, { highlight = false } = {}) {
  const isOperator = entry.role === 'operator';
  const isSystem = entry.role === 'system';
  const classes = ['entry'];
  if (isOperator) classes.push('entry-operator');
  else if (isSystem) classes.push('entry-system');
  else classes.push('entry-persona');
  if (highlight) classes.push('entry-final');
  if (entry.status === 'error') classes.push('entry-error');
  const meta = [];
  if (entry.model) meta.push(`<span class="chip chip-model">${escapeHtml(entry.model)}</span>`);
  if (entry.stage) meta.push(`<span class="chip">${escapeHtml(entry.stage)}</span>`);
  const when = entry.timestamp
    ? `<time datetime="${escapeHtml(entry.timestamp)}">${escapeHtml(formatWhen(entry.timestamp))}</time>`
    : '';
  return `
    <article class="${classes.join(' ')}">
      <header>
        <span class="entry-name">${escapeHtml(entry.name || (isOperator ? 'Operador' : 'LUCA'))}</span>
        ${meta.join('')}
        ${when}
      </header>
      <div class="entry-body">${renderRichText(entry.content)}</div>
    </article>`;
}

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return '';
  }
}

export function renderShareHtml(share) {
  const snap = share.snapshot;
  const modeLabel = snap.operationMode === 'individual' ? 'Resolução com juiz' : 'Missão em equipe';
  const finalHtml = snap.finalResult ? renderEntry(snap.finalResult, { highlight: true }) : '';
  const finalKey = snap.finalResult
    ? `${snap.finalResult.slug || ''}|${snap.finalResult.stage || ''}|${snap.finalResult.content}`
    : null;
  const transcriptHtml = snap.transcript
    .filter((entry) => !finalKey || `${entry.slug || ''}|${entry.stage || ''}|${entry.content}` !== finalKey)
    .map((entry) => renderEntry(entry))
    .join('\n');
  const sharedWhen = formatWhen(share.updatedAt || share.createdAt);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(snap.title)} — LUCA</title>
<style>
  :root {
    color-scheme: dark;
    --void: #090c11;
    --surface: rgba(16, 20, 27, 0.72);
    --surface-hi: rgba(19, 24, 32, 0.92);
    --navy: #0a84ff;
    --navy-deep: #64d2ff;
    --text: rgba(255, 255, 255, 0.94);
    --text-soft: rgba(255, 255, 255, 0.72);
    --text-mute: rgba(255, 255, 255, 0.55);
    --border: rgba(255, 255, 255, 0.10);
    --ok: #30d158;
    --error: #ff453a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background:
      radial-gradient(1100px 500px at 85% -10%, rgba(10, 132, 255, 0.14), transparent 60%),
      radial-gradient(900px 420px at -10% 0%, rgba(100, 210, 255, 0.08), transparent 55%),
      var(--void);
    color: var(--text);
    font-family: Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 860px; margin: 0 auto; padding: 28px 18px 64px; }
  .masthead {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding-bottom: 18px; border-bottom: 1px solid var(--border); margin-bottom: 22px;
  }
  .brand {
    display: inline-flex; align-items: center; gap: 10px;
    font-weight: 700; letter-spacing: 0.14em; font-size: 13px;
  }
  .brand-mark {
    width: 30px; height: 30px; border-radius: 9px;
    background: linear-gradient(135deg, var(--navy), var(--navy-deep));
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 800; color: #04101f; letter-spacing: 0;
  }
  .masthead .spacer { flex: 1; }
  .readonly-pill {
    font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--text-mute); border: 1px solid var(--border);
    border-radius: 999px; padding: 4px 12px;
  }
  h1.session-title { font-size: 22px; margin: 0 0 8px; line-height: 1.3; }
  .session-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
  .chip {
    display: inline-flex; align-items: center;
    font-size: 11px; color: var(--text-soft);
    border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px;
    background: rgba(255, 255, 255, 0.03);
  }
  .chip-mode { color: var(--navy-deep); border-color: rgba(100, 210, 255, 0.35); }
  .chip-model { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 10px; }
  .mission {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 14px 16px; margin-bottom: 26px;
  }
  .mission .label {
    font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--text-mute); margin-bottom: 6px;
  }
  .section-label {
    font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--text-mute); margin: 26px 0 12px;
  }
  .entry {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 14px 16px; margin-bottom: 14px; overflow-wrap: anywhere;
  }
  .entry header {
    display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;
  }
  .entry-name { font-weight: 600; font-size: 13px; }
  .entry header time { margin-left: auto; font-size: 11px; color: var(--text-mute); }
  .entry-operator { border-color: rgba(10, 132, 255, 0.35); background: rgba(10, 132, 255, 0.08); }
  .entry-operator .entry-name { color: var(--navy-deep); }
  .entry-system { background: rgba(255, 255, 255, 0.03); color: var(--text-soft); }
  .entry-error { border-color: rgba(255, 69, 58, 0.4); }
  .entry-error .entry-name { color: var(--error); }
  .entry-final {
    border-color: rgba(48, 209, 88, 0.42); background: rgba(48, 209, 88, 0.06);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.28);
  }
  .entry-final .entry-name { color: var(--ok); }
  .entry-body p { margin: 0 0 10px; color: var(--text-soft); }
  .entry-body p:last-child { margin-bottom: 0; }
  .entry-body h3, .entry-body h4, .entry-body h5, .entry-body h6 {
    margin: 16px 0 8px; color: var(--text); line-height: 1.35;
  }
  .entry-body h3 { font-size: 16px; }
  .entry-body h4 { font-size: 14px; }
  .entry-body ul { margin: 0 0 10px; padding-left: 20px; color: var(--text-soft); }
  .entry-body li { margin-bottom: 4px; }
  .entry-body blockquote {
    margin: 10px 0; padding: 8px 14px; border-left: 3px solid var(--navy);
    background: rgba(10, 132, 255, 0.07); border-radius: 0 10px 10px 0; color: var(--text);
  }
  .entry-body code {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px;
    background: rgba(255, 255, 255, 0.07); border-radius: 5px; padding: 1px 5px;
  }
  .entry-body pre {
    background: rgba(3, 5, 9, 0.9); border: 1px solid var(--border); border-radius: 10px;
    padding: 12px 14px; overflow-x: auto;
  }
  .entry-body pre code { background: none; padding: 0; }
  footer.share-footer {
    margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border);
    font-size: 12px; color: var(--text-mute); display: flex; flex-wrap: wrap; gap: 8px;
  }
  footer.share-footer .spacer { flex: 1; }
  @media (max-width: 560px) {
    .wrap { padding: 18px 12px 48px; }
    h1.session-title { font-size: 19px; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="masthead">
      <span class="brand"><span class="brand-mark">L</span>LUCA · CENTRO OPERACIONAL</span>
      <span class="spacer"></span>
      <span class="readonly-pill">Visualização pública</span>
    </div>
    <h1 class="session-title">${escapeHtml(snap.title)}</h1>
    <div class="session-meta">
      <span class="chip chip-mode">${escapeHtml(modeLabel)}</span>
      <span class="chip">${snap.transcript.length} mensagens</span>
      ${sharedWhen ? `<span class="chip">Compartilhado em ${escapeHtml(sharedWhen)}</span>` : ''}
    </div>
    ${snap.missionDraft ? `
    <div class="mission">
      <div class="label">Missão</div>
      <div>${renderRichText(snap.missionDraft)}</div>
    </div>` : ''}
    ${transcriptHtml ? `<div class="section-label">Conversa</div>\n${transcriptHtml}` : ''}
    ${finalHtml ? `<div class="section-label">Resultado final</div>\n${finalHtml}` : ''}
    <footer class="share-footer">
      <span>Sessão compartilhada em modo somente leitura.</span>
      <span class="spacer"></span>
      <a href="https://luca-ai.com.br" style="color: var(--navy-deep); text-decoration: none;">luca-ai.com.br</a>
    </footer>
  </div>
</body>
</html>`;
}
