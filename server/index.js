import express from 'express';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import {
  API_RATE_LIMIT_MAX,
  API_RATE_LIMIT_WINDOW_MS,
  HOST,
  PACKAGE_VERSION,
  PORT,
  AGENTS,
  AGENT_ALIASES,
  ROUTER_BASE_URL,
  ROUTER_MODEL,
  MAESTRO_MODEL,
  NINE_ROUTER_CAPABILITIES,
  NINE_ROUTER_MODEL_PROFILES,
  NINE_ROUTER_ROUTE_IDS,
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_PROFILES,
  IMAGE_GENERATION_ROUTE_IDS,
  IMAGE_GENERATION_CAPABILITIES,
  MAX_CLOSURE_ATTEMPTS,
  CONVERSATION_PARTNER_AGENT_ID,
  isAllowed9RouterModel,
  resolvePersonaRuntimeModel,
} from './config.js';
import { call9Router, call9RouterImageGeneration, check9RouterHealth } from './router-client.js';
import { materializeVisualPack, readVisualArtifactFile } from './visual-stage.js';
import { runAgentWithTools } from './agent-loop.js';
import {
  addHeartbeat,
  addGlobalChatMessage,
  appendLine,
  appendHeartbeatLog,
  archiveActiveMission,
  clearAgentContexts,
  completeRun,
  createAgentTask,
  createRun,
  getState,
  incrementSupervisorTick,
  markAgentChatSeen,
  persist,
  resetMissionScope,
  setAgentConfig,
  setAgentStatus,
  setMission,
  setMissionQueue,
  setRunBriefing,
  setScheduledMissions,
  setSupervisorFinalReport,
  setSupervisorMode,
  setTemporaryDashboard,
  startNewMissionScope,
  updateAgentTask,
  upsertDashboardItem,
  getPersonaAgents,
  replacePersonaAgents,
  addPersonaAgent,
  updatePersonaAgent,
  ensureWorkspace,
  listWorkspaceUserIds,
} from './state.js';
import { runWithWorkspaceUser, getWorkspaceUserId } from './workspace-context.js';
import {
  activateChatSession,
  createChatFolder,
  createChatSession,
  deleteChatFolder,
  deleteChatSession,
  getChatLibrarySnapshot,
  getChatLibrarySnapshotForUser,
  getChatSession,
  getChatSessionForUser,
  recordPersonaRunOnSession,
  renameChatFolder,
  updateChatSession,
} from './chat-library.js';
import {
  createShareLink,
  getShareLinkForSession,
  revokeShareLink,
  resolvePublicShare,
  renderShareHtml,
} from './share-links.js';
import {
  listYumePersonas,
  fetchYumePersonaSystemPrompt,
  getYumePersonaVersion,
  isKamuiReachable,
  KAMUI_BASE,
  buildKamuiRequestHeaders,
} from './kamui-client.js';
import {
  normalizeMissionContext,
  mergeMissionContext,
  summarizeContextForPrompt,
  hasContext,
  normalizeSignal,
  summarizeSignalsForPrompt,
  formatSignalLine,
} from './problem-context.js';
import {
  classifyMissionIntent,
  missionRequestsAgentConversation,
  missionRequestsAllAgents,
  missionNeedsSupervisorJudgment,
  parseAgentConversationDurationMs,
  primaryMissionText,
} from './intent.js';
import {
  parseClosureReviewOutput,
  mergeClosureReviews,
  expectedChatPerformers,
} from './closure.js';
import { buildDeterministicClosureReview, executiveCanvasCoverageGaps } from '../shared/closure-review.js';
import { buildSchedule, missionScheduleIsInfinite, tickSchedules } from './scheduler.js';
import {
  buildAgentPlaybook,
  businessWorkflowHint,
  agentCollaborationContract,
} from '../shared/agent-playbooks.js';
import {
  missionBulletItems,
  normalizeSupervisorFinalReport,
  parseSupervisorFinalReportOutput,
} from '../shared/supervisor-final-report.js';
import { buildPublicStateSnapshot } from '../shared/state-payload.js';
import { runOperationalPreflight } from '../shared/preflight.js';
import { reviewResearcherContribution } from './agent-quality.js';
import { buildEndpointCatalog } from './endpoint-catalog.js';
import { buildToolCatalog } from './tool-catalog.js';
import { buildCatalogAudit } from './catalog-audit.js';
import { appendEvent, eventFlows, eventSummary, listEvents } from './event-log.js';
import { buildDeterministicExecutiveDashboard } from '../shared/executive-dashboard.js';
import { createSingleFlightLoop } from './run-cycle-gate.js';
import { buildOkStateResponse } from './state-response.js';
import { buildMissionReport } from './mission-report.js';
import { buildYumeMemoryEvent } from './yume-memory-event.js';
import { runRuntimeReadinessChecks } from './runtime-readiness.js';
import {
  buildKamuiYumeAvatarUrl,
  normalizeYumeAvatarPath,
  normalizeYumePersonasForLuca,
  reconcileOfficialPersonaAgents,
} from './persona-cards.js';
import {
  buildIndividualJudgePrompt,
  buildIndividualRevisionPrompt,
  buildPersonaTeamPrompt,
  cleanPersonaTeamOutput,
  DEPTH_BUDGETS,
  normalizePersonaTeamRunInput,
  PERSONA_WORKFLOW_ROLES,
  runIndividualResolution,
} from './persona-team.js';
import { createPersonaRunJobStore } from './persona-run-jobs.js';
import { createDeliberations } from './deliberations/index.js';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  deleteAllChatAttachments,
  deleteChatAttachment,
  getChatAttachment,
  resolveChatAttachmentsForModel,
  storeChatAttachment,
} from './chat-attachments.js';
import {
  createTeamTemplate,
  deleteTeamTemplate,
  getTeamTemplatesSnapshot,
  reorderTeamTemplates,
  updateTeamTemplate,
} from './team-templates.js';
import { createAuthService } from './auth.js';

const app = express();
const personaRunJobs = createPersonaRunJobStore();
const deliberationJobs = createPersonaRunJobStore();
const PERSONA_ROSTER_SYNC_INTERVAL_MS = Math.max(
  15_000,
  Number(process.env.LUCA_PERSONA_ROSTER_SYNC_MS || 60_000) || 60_000,
);
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.json({ limit: '1mb' }));

const rateBuckets = new Map();

function requestIdentity(req) {
  return String(req.headers['cf-connecting-ip'] || req.ip || req.socket.remoteAddress || 'unknown');
}

function rateLimitApi(req, res, next) {
  const now = Date.now();
  const key = requestIdentity(req);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + API_RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count > API_RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    res.status(429).json({ ok: false, error: 'rate_limit_exceeded' });
    return;
  }
  next();
}

const adminEmails = String(process.env.LUCA_ADMIN_EMAILS ?? '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const internalAuthToken = crypto.randomBytes(32).toString('hex');
const authService = createAuthService({
  adminEmails,
  internalToken: internalAuthToken,
  dataPath: process.env.LUCA_AUTH_DATA_PATH,
  workspaceCounter: () => listWorkspaceUserIds().length,
});

app.use('/api', rateLimitApi);
authService.registerRoutes(app);
app.get('/api/health', (_req, res) => {
  // Health is public and account-agnostic: do not load a user workspace here.
  res.json({
    ok: true,
    service: 'luca-ai',
    version: PACKAGE_VERSION,
    supervisorMode: 'standby',
    agents: Array.isArray(AGENTS) ? AGENTS.length : 0,
    personaAgents: 0,
    activeMission: false,
    scheduledMissions: 0,
    kamuiBase: process.env.KAMUI_BASE || 'http://127.0.0.1:1338',
    workspaces: listWorkspaceUserIds().length,
  });
});

// SHARE_LINKS_V1 — public read-only viewer. No auth, no workspace, snapshot only.
app.get('/s/:token', (req, res) => {
  const share = resolvePublicShare(req.params.token);
  if (!share) {
    res.status(404).setHeader('Cache-Control', 'no-store');
    res.type('html').send('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Link indisponível — LUCA</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#090c11;color:rgba(255,255,255,.72);font-family:Inter,system-ui,sans-serif;text-align:center;padding:24px}h1{font-size:20px;color:rgba(255,255,255,.94);margin:0 0 8px}</style></head><body><div><h1>Link indisponível</h1><p>Este link de compartilhamento não existe ou foi revogado pelo autor.</p></div></body></html>');
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(renderShareHtml(share));
});

createDeliberations({
  engine: executeLucaAiPersonaTeamRun,
  requireUser: authService.requireUser,
  jobStore: deliberationJobs,
  ensureWorkspace,
  runWithWorkspaceUser,
  machineToken: process.env.LUCA_MACHINE_TOKEN,
}).registerRoutes(app);

app.use('/api', authService.requireUser);
// ACCOUNT_WORKSPACE_ISOLATION_V1 — every authenticated API call runs inside the caller's workspace.
app.use('/api', (req, res, next) => {
  const userId = req.auth?.user?.id;
  if (!userId) {
    next();
    return;
  }
  ensureWorkspace(userId);
  runWithWorkspaceUser(userId, () => next());
});
authService.registerAdminRoutes(app, {
  getUserChatLibrary: getChatLibrarySnapshotForUser,
  getUserChatSession: getChatSessionForUser,
});

const httpServer = createServer(app);
const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  verifyClient(info, done) {
    const session = authService.sessionFromRequest(info.req, { touch: true });
    if (!session) {
      done(false, 401, 'Authentication required');
      return;
    }
    info.req.auth = session;
    authService.store.recordUsage(session.user.id, {
      method: 'WS',
      path: '/ws',
      statusCode: 101,
      websocket: true,
    });
    done(true);
  },
});

let supervisorTimer = null;
let heartbeatProcess = null;
let runCycleGate = null;
const runtimeStateDir = path.resolve(process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'));
const heartbeatReportPath = path.join(runtimeStateDir, 'heartbeat-report.json');
const distPath = path.resolve(process.cwd(), 'dist');
const indexPath = path.join(distPath, 'index.html');
const v2DesignPath = path.resolve(process.cwd(), 'public', 'v2-design');
const v2IndexPath = path.join(v2DesignPath, 'index.html');
const repoIgnoreDirs = new Set(['.git', 'node_modules', 'dist', '.luca']);
const DELIVERY_PRINCIPLE = `Principio global LUCA-AI: trabalhe com o que existe e entregue o melhor resultado possivel. Falta de dados nao e motivo para travar, recusar ou ficar excessivamente criterioso. Quando algo estiver ausente, declare uma premissa razoavel, marque como estimativa/proxy quando necessario e siga pelo caminho mais util para cumprir a missao. Priorize decisao, solucao e output final satisfatorio.`;
const SETTLED_RUN_STATUSES = new Set(['completed', 'chat_completed', 'needs_revision', 'failed', 'cancelled']);

function stopSupervisorTimer() {
  if (supervisorTimer) {
    clearInterval(supervisorTimer);
    supervisorTimer = null;
  }
}

function missionRunIsSettled(status) {
  return SETTLED_RUN_STATUSES.has(String(status ?? ''));
}

function readTextFile(relativePath, maxChars = 5000) {
  try {
    const fullPath = path.resolve(process.cwd(), relativePath);
    if (!fullPath.startsWith(process.cwd())) return null;
    return fs.readFileSync(fullPath, 'utf8').slice(0, maxChars);
  } catch {
    return null;
  }
}

function listRepoTree(dir = process.cwd(), prefix = '', depth = 0, limit = { count: 0 }) {
  if (depth > 3 || limit.count > 140) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !repoIgnoreDirs.has(entry.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
  const lines = [];
  for (const entry of entries) {
    if (limit.count > 140) break;
    limit.count += 1;
    const marker = entry.isDirectory() ? '/' : '';
    lines.push(`${prefix}${entry.name}${marker}`);
    if (entry.isDirectory()) lines.push(...listRepoTree(path.join(dir, entry.name), `${prefix}  `, depth + 1, limit));
  }
  return lines;
}

function repoContextForPrompt() {
  const files = ['package.json', 'server/config.js', 'server/index.js', 'server/state.js', 'src/main.jsx', 'src/styles.css'];
  const fileSummaries = files.map((file) => {
    const content = readTextFile(file, 3500);
    return content ? `--- ${file}\n${content}` : `--- ${file}\nindisponivel`;
  }).join('\n\n');
  return `Raiz da repo: ${process.cwd()}\n\nArvore resumida:\n${listRepoTree().join('\n')}\n\nArquivos principais:\n${fileSummaries}`;
}

function startHeartbeatMonitor() {
  if (heartbeatProcess) return;
  const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
  const pythonArgs = process.platform === 'win32'
    ? ['-3', 'heartbeat_monitor.py', heartbeatReportPath]
    : ['heartbeat_monitor.py', heartbeatReportPath];
  heartbeatProcess = spawn(pythonCmd, pythonArgs, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  heartbeatProcess.stdout.on('data', (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    for (const line of lines) appendHeartbeatLog(line);
    emitState();
  });
  heartbeatProcess.stderr.on('data', (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    for (const line of lines) appendHeartbeatLog(`[stderr] ${line}`);
    emitState();
  });
  heartbeatProcess.on('exit', () => {
    appendHeartbeatLog('[heartbeat] stopped');
    heartbeatProcess = null;
    emitState();
  });
}

function stopHeartbeatMonitor() {
  if (!heartbeatProcess) return;
  appendHeartbeatLog('[heartbeat] stopping');
  heartbeatProcess.kill('SIGTERM');
  heartbeatProcess = null;
}

function readHeartbeatReport() {
  try {
    const raw = fs.readFileSync(heartbeatReportPath, 'utf8');
    const parsed = JSON.parse(raw);
    const updatedMs = parsed.updatedAt ? Date.parse(parsed.updatedAt) : 0;
    const isFresh = Number.isFinite(updatedMs) && (Date.now() - updatedMs) < 12000;
    return {
      ...parsed,
      status: isFresh ? 'online' : 'paused',
    };
  } catch {
    return {
      service: 'heartbeat-monitor',
      status: heartbeatProcess ? 'online' : 'paused',
      updatedAt: null,
      intervalSeconds: 5,
      summary: 'monitor ainda nao iniciou ou sem arquivo de estado',
    };
  }
}

function resolveAgentId(agentId) {
  return AGENT_ALIASES[agentId] ?? agentId;
}

function agentRuntime(agentId) {
  const configured = getState().agents.find((agent) => agent.id === agentId);
  const fallbackModel = AGENTS.find((agent) => agent.id === agentId)?.model ?? ROUTER_MODEL;
  return {
    enabled: configured ? configured.enabled !== false : true,
    model: configured?.model || fallbackModel,
  };
}

function resolveAgentModel(agent) {
  return agentRuntime(agent.id).model || agent.model || ROUTER_MODEL;
}

// Bloco de contexto do problema + sinais de tempo real, injetado nos prompts
// para o sistema interpretar e resolver com base em dados reais.
function missionContextBlock(mission) {
  const parts = [];
  const ctx = mission?.context ? summarizeContextForPrompt(mission.context) : '';
  if (ctx) parts.push(`Contexto estruturado do problema (use para interpretar e resolver; nao invente dados):\n${ctx}`);
  const sig = summarizeSignalsForPrompt(mission?.realtimeFeed || []);
  if (sig) parts.push(sig);
  return parts.join('\n\n');
}

function emitEvent(event) {
  try {
    const normalizedEvent = {
      ...event,
      missionId: event?.missionId ?? event?.mission?.id ?? null,
      goalId: event?.goalId ?? event?.goal?.id ?? null,
      traceId: event?.traceId ?? event?.missionId ?? event?.mission?.id ?? event?.goal?.traceId ?? event?.goalId ?? event?.goal?.id ?? null,
    };
    appendEvent(normalizedEvent);
  } catch {
    // Observability must not break the runtime event path.
  }
  const payload = JSON.stringify({ kind: 'event', event });
  const ownerUserId = getWorkspaceUserId();
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue;
    if (ownerUserId && client.userId && client.userId !== ownerUserId) continue;
    client.send(payload);
  }
}

function emitState() {
  const state = publicStateSnapshot();
  const payload = JSON.stringify({
    kind: 'state',
    state,
  });
  const ownerUserId = getWorkspaceUserId();
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue;
    if (ownerUserId && client.userId && client.userId !== ownerUserId) continue;
    client.send(payload);
  }
}

function publicStateSnapshot() {
  return buildPublicStateSnapshot(getState(), {
    heartbeatMonitor: readHeartbeatReport(),
    events: listEvents({ limit: 120 }),
  });
}

function missionActivationBlocker() {
  const current = getState();
  const runStatus = current.activeRun?.status ?? null;
  if (runStatus && !missionRunIsSettled(runStatus)) {
    return {
      error: 'mission_already_running',
      detail: `execucao ativa com status ${runStatus}`,
      state: publicStateSnapshot(),
    };
  }
  if (current.activeMission && !missionRunIsSettled(runStatus)) {
    return {
      error: 'mission_already_active',
      detail: `missao ativa: ${current.activeMission.title || current.activeMission.id || 'sem titulo'}`,
      state: publicStateSnapshot(),
    };
  }
  const governance = publicStateSnapshot()?.governance;
  if (governance?.missionConcurrency?.blocked) {
    return {
      error: 'mission_concurrency_locked',
      detail: 'event stream possui missao recente sem fechamento',
      lock: governance.missionConcurrency,
      state: publicStateSnapshot(),
    };
  }
  return null;
}

function findMissionReportTarget(missionId = '') {
  const snapshot = publicStateSnapshot();
  const normalizedId = String(missionId ?? '').trim();
  const activeMission = getState().activeMission;
  if (!normalizedId && activeMission) {
    return {
      scope: 'active',
      mission: activeMission,
      run: getState().activeRun,
      dashboard: getState().temporaryDashboard,
      chatMessages: getState().globalChatMessages ?? [],
      archivedAt: '',
      status: getState().activeRun?.status ?? '',
      evidence: [],
      snapshot,
    };
  }

  const history = getState().missionHistory ?? [];
  const archived = history.find((item) => (
    !normalizedId
      ? false
      : item?.id === normalizedId
        || item?.mission?.id === normalizedId
        || item?.run?.id === normalizedId
  )) ?? (!normalizedId ? history[0] : null);

  if (!archived) return null;
  return {
    scope: 'history',
    mission: archived.mission ?? {},
    run: archived.run ?? {},
    dashboard: archived.dashboard ?? null,
    chatMessages: archived.chatMessages ?? [],
    archivedAt: archived.archivedAt ?? '',
    status: archived.status ?? archived.run?.status ?? archived.reason ?? '',
    evidence: archived.evidence ?? [],
    snapshot,
  };
}

async function runLocalPreflight() {
  const state = publicStateSnapshot();
  const governance = state?.heartbeatMonitor?.governance ?? state?.governance ?? null;
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const operational = await runOperationalPreflight({
    mode: 'local',
    governance,
    state,
    probeEndpoint: async (endpointPath) => {
      try {
        const response = await fetch(`${baseUrl}${endpointPath}`, {
          headers: { Accept: 'application/json', 'x-luca-internal-auth': internalAuthToken },
        });
        const body = await response.json().catch(() => null);
        const ok = response.ok && (
          endpointPath === '/api/state'
            ? Boolean(body && typeof body === 'object' && Array.isArray(body.agents))
            : endpointPath === '/api/events'
              ? Boolean(body?.ok && Array.isArray(body?.events))
              : Boolean(body?.ok)
        );
        return {
          ok,
          body,
          detail: response.ok ? '' : `HTTP ${response.status}`,
          status: response.status,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
  const readiness = await runRuntimeReadinessChecks({
    rootDir: process.cwd(),
    stateDir: runtimeStateDir,
    heartbeatScriptPath: path.resolve(process.cwd(), 'heartbeat_monitor.py'),
  });
  const checks = [...operational.checks, ...readiness.checks];
  const ok = checks.every((check) => check.ok);
  return {
    ...operational,
    ok,
    status: ok ? 'passed' : 'failed',
    readyForLiveMission: ok,
    checks,
    runtimeReadiness: readiness,
    source: [...new Set([...(operational.source || []), ...(readiness.source || [])])],
  };
}

async function runLocalHarnessSmoke() {
  const preflight = await runLocalPreflight();
  const state = publicStateSnapshot();
  const summary = eventSummary();
  const checks = [
    ...preflight.checks,
    {
      id: 'event-store-summary',
      label: 'Event store summary',
      ok: summary.total >= 0,
      detail: `${summary.total} evento(s) persistidos`,
    },
    {
      id: 'heartbeat-monitor',
      label: 'Heartbeat monitor',
      ok: Boolean(state?.heartbeatMonitor?.updatedAt || state?.heartbeatMonitor?.service),
      detail: state?.heartbeatMonitor?.summary || state?.heartbeatMonitor?.updatedAt || state?.heartbeatMonitor?.service || 'monitor sem sinal',
    },
  ];
  return {
    ok: checks.every((check) => check.ok),
    status: checks.every((check) => check.ok) ? 'passed' : 'failed',
    timestamp: new Date().toISOString(),
    readyForLiveMission: preflight.readyForLiveMission,
    checks,
    source: ['tars-governance-pattern', 'kamui-service-health-pattern'],
  };
}

function agentDisplayName(agentId) {
  const builtin = AGENTS.find((agent) => agent.id === agentId)?.name;
  if (builtin) return builtin;
  const persona = getPersonaAgents().find((p) => p.id === agentId || p.slug === agentId);
  if (persona) return persona.name || persona.slug;
  return agentId;
}

function appendAgentHeartbeatEvent(agentId, phase, detail = '') {
  const label = phase === 'start' ? 'iniciou' : phase === 'done' ? 'terminou' : 'falhou';
  const suffix = detail ? ` (${detail})` : '';
  appendHeartbeatLog(`[agent:${phase}] ${label} ${agentDisplayName(agentId).toLowerCase()}${suffix}`);
}

function normalizeChatType(type) {
  const value = String(type ?? 'info').toLowerCase().trim();
  if (['info', 'resultado', 'decisao', 'pergunta', 'alerta', 'acao', 'sistema'].includes(value)) return value;
  if (value === 'result') return 'resultado';
  if (value === 'decision') return 'decisao';
  if (value === 'question') return 'pergunta';
  if (value === 'warning') return 'alerta';
  if (value === 'action') return 'acao';
  return 'info';
}

function publishChatMessage({ agentId, type = 'info', content }) {
  const message = addGlobalChatMessage({
    agentId,
    agentName: agentDisplayName(agentId),
    type: normalizeChatType(type),
    content,
  });
  if (!message) return null;
  emitEvent({ type: 'chat.message', message, time: new Date().toISOString() });
  return message;
}

function extractChatMessages(agentId, output) {
  const messages = [];
  const lines = String(output ?? '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*\[chat:(info|resultado|decisao|pergunta|alerta|acao|sistema)\]\s*(.+)$/i);
    if (match) messages.push({ agentId, type: match[1], content: match[2] });
  }
  return messages;
}

function missionRequiresChatMessage(mission) {
  const text = `${mission?.description ?? ''}\n${mission?.success ?? ''}`.toLowerCase();
  return /\b(chat|mensagem|mensagens)\b/.test(text);
}

function missionRequiresRepoContext(mission) {
  const text = `${mission?.title ?? ''}\n${mission?.description ?? ''}\n${mission?.success ?? ''}`.toLowerCase();
  return /\b(repo|repository|repositorio|reposit[oó]rio|c[oó]digo|frontend|backend|arquitetura)\b/.test(text);
}

function missionInstruction(mission) {
  return String(mission?.directionPrompt ?? '').trim();
}

function fallbackChatMessage(agentId, output) {
  const content = String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\[chat:[^\]]+\]\s*/i, '').trim())
    .find(Boolean);
  if (!content) return null;
  return { agentId, type: 'info', content };
}

function summarizeFirstLine(output) {
  return String(output ?? '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
}

function missionReadyForAgents(mission) {
  return Boolean(String(mission?.directionPrompt ?? '').trim());
}

function workerAgents() {
  return AGENTS.filter((agent) => agent.role === 'planner' || agent.role === 'researcher' || agent.role === 'designer');
}

function contributorAgents() {
  return AGENTS.filter((agent) => agent.role === 'planner' || agent.role === 'researcher');
}

function designerAgent() {
  return AGENTS.find((agent) => agent.role === 'designer');
}

function taskInstructionForAgent(agent) {
  if (agent.role === 'planner') {
    return `Atue como arquiteto da solucao. Leia o briefing e transforme a dor em um plano pratico de otimizacao.
Entregue no Chat Global uma contribuicao curta com: problema priorizado, caminho escolhido, abordagem de dashboard, metricas essenciais, acoes recomendadas, ordem de execucao e criterios de sucesso.
Se faltar contexto, escolha a premissa mais razoavel e avance. Nao transforme lacunas em bloqueio. Nao repita a descricao da dor; produza decisao operacional.`;
  }
  if (agent.role === 'researcher') {
    return `Atue como validador pragmatico de evidencias e realismo. Leia o briefing, use o que estiver disponivel e complete lacunas com premissas claras quando isso ajudar a cumprir a missao.
Entregue no Chat Global uma contribuicao curta com: evidencias aproveitaveis, premissas adotadas, proxies quando necessarios, riscos principais e como tornar a solucao defensavel para uma equipe executiva.
Se a missao usar RepoContext, publique obrigatoriamente: um ponto forte com evidencia concreta de arquivo/caminho, um ponto fraco com evidencia concreta de arquivo/caminho e uma leitura de risco/lacuna ou premissa. Use rotulos explicitos como "Ponto forte:", "Ponto fraco:" e "Risco:" ou "Premissa:".
Nao pare na falta de informacao. Nao invente fato como se fosse evidencia; quando precisar inferir, rotule como premissa/proxy e entregue resultado.`;
  }
  if (agent.role === 'designer') {
    return `Crie um canvas executivo para a area principal esquerda, baseado apenas na missao, briefing e contribuicoes uteis do chat.
O canvas deve convencer uma equipe executiva de que o sistema entendeu a dor e gerou uma solucao pratica: dor central, riscos ou oportunidades priorizadas, metricas, graficos recomendados, acoes e criterios de sucesso.
Adapte linguagem, metricas e graficos ao segmento descrito na missao; nao fixe termos de um caso especifico.
Se os insumos forem simples ou incompletos, use premissas claras e gere mesmo assim um canvas final util com listas, ranking, topicos ou graficos simples.
Nao mostre funcionamento interno, agentes, run, chat, logs ou status operacional.`;
  }
  return `Leia o briefing, o chat recente e contribua para cumprir os criterios da missao. Publique uma contribuicao util no Chat Global.`;
}

function recentChatContext(limit = 12) {
  const messages = getState().globalChatMessages ?? [];
  return messages.slice(-limit).map((message) => `[${message.timestamp}] ${message.agentName} (${message.type}): ${message.content}`).join('\n') || 'sem mensagens no chat.';
}

function unreadChatContext(agentId) {
  const state = getState();
  const messages = state.globalChatMessages ?? [];
  const lastSeenId = state.activeRun?.agents?.[agentId]?.lastSeenChatMessageId;
  const lastSeenIndex = lastSeenId ? messages.findIndex((message) => message.id === lastSeenId) : -1;
  const unread = messages.slice(lastSeenIndex + 1).filter((message) => message.agentId !== agentId);
  return unread.map((message) => `[${message.timestamp}] ${message.agentName} (${message.type}): ${message.content}`).join('\n') || 'sem mensagens novas.';
}

function latestChatMessageId() {
  const messages = getState().globalChatMessages ?? [];
  return messages.at(-1)?.id ?? null;
}

function scopedAgentId(agentId) {
  const runId = getState().activeRun?.id;
  return runId ? `${agentId}:${runId}` : agentId;
}

function incompleteTasksFor(agentId) {
  return (getState().activeRun?.tasks ?? []).filter((task) => task.agentId === agentId && task.status !== 'completed' && task.status !== 'error');
}

function completedTasksFor(agentId) {
  return (getState().activeRun?.tasks ?? []).filter((task) => task.agentId === agentId && task.status === 'completed');
}

function hasRunningWorker() {
  return workerAgents().some((agent) => ['running', 'queued'].includes(getState().activeRun?.agents?.[agent.id]?.status));
}

function hasCompletedTask(agentId) {
  return completedTasksFor(agentId).length > 0;
}

function repoAnalysisSatisfied() {
  const text = (getState().globalChatMessages ?? []).map((message) => message.content).join('\n').toLowerCase();
  const hasStrength = /ponto forte|pontos fortes|forte:|fortes:/i.test(text);
  const hasWeakness = /ponto fraco|pontos fracos|fraco:|fracos:/i.test(text);
  const hasEvidence = /server\/|src\/|package\.json|index\.js|state\.js|main\.jsx|styles\.css/i.test(text);
  const blocked = /n[aã]o vejo a [aá]rvore|n[aã]o tenho acesso|liberar `?tree|sem acesso (?:ao|a|à) (?:repo|reposit[oó]rio|[aá]rvore)/i.test(text);
  return hasStrength && hasWeakness && hasEvidence && !blocked;
}

function missionCompletionSatisfied(mission) {
  if (missionRequiresRepoContext(mission)) return repoAnalysisSatisfied();
  return true;
}

function buildBuiltinAgentSystemPrompt(agent, mission, { mode = 'task' } = {}) {
  const collaboration = mode === 'chat'
    ? 'Use o Chat Global apenas para contribuicoes novas e uteis a outros agentes.'
    : 'Entregue contribuicoes acionaveis e orientadas ao resultado final da missao.';
  return [
    `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Responda em pt-BR, objetivo, pragmatico e orientado a entrega.`,
    buildAgentPlaybook([agent.id]),
    businessWorkflowHint(mission),
    agentCollaborationContract(mission),
    collaboration,
    'Quando precisar compartilhar algo no Chat Global, use uma linha [chat:tipo] mensagem.',
  ].filter(Boolean).join('\n\n');
}

async function repairResearcherRepoContribution(agent, mission, originalOutput, review, model) {
  const system = buildBuiltinAgentSystemPrompt(agent, mission, { mode: 'task' });
  const user = `Sua saida anterior do Pesquisador foi rejeitada pelo verificador interno porque nao ficou suficientemente rastreavel para analise de repo.

Lacunas encontradas:
${review.gaps.map((gap) => `- ${gap}`).join('\n')}

Saida anterior:
${String(originalOutput || '').slice(0, 2500)}

Reescreva a contribuicao agora em 2 a 4 linhas [chat:resultado], sem falar do verificador.
Obrigatorio:
- incluir pelo menos um "Ponto forte:" com evidencia concreta de arquivo/caminho;
- incluir pelo menos um "Ponto fraco:" com evidencia concreta de arquivo/caminho;
- incluir "Risco:" ou "Premissa:" quando houver inferencia ou lacuna.
- nao alegar falta de acesso se RepoContext foi fornecido.

Responda somente com linhas [chat:resultado] ou [chat:alerta].`;
  return call9Router({ system, user, agentId: `${scopedAgentId(agent.id)}:repair`, model, maxTokens: 700 });
}

function extractJsonObject(output) {
  const text = String(output ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRouterUnavailable(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /9router_unreachable|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout/i.test(message);
}

function isTechnicalRuntimeMessage(value) {
  return /\b(9router|fetch failed|unreachable|timeout|econnrefused|enotfound|etimedout|indisponivel|falhei ao transformar|erro:)\b/i
    .test(String(value || ''));
}

function isOperationalDashboard(dashboard) {
  const { sourceAgentId, updatedAt, ...publicDashboard } = dashboard ?? {};
  const text = JSON.stringify(publicDashboard).toLowerCase();
  return /\b(run|agentes?|supervisor|planejador|pesquisador|designer|fila|erro|fetch failed|dashboard temporario|9router|heartbeat|tarefas? conclu[ií]das?)\b/.test(text);
}

function designerDataSnapshot(mission) {
  const state = getState();
  return {
    mission: {
      title: mission?.title ?? '',
      description: mission?.description ?? '',
      success: mission?.success ?? '',
      activatedAt: mission?.activatedAt ?? null,
    },
    results: (state.globalChatMessages ?? [])
      .filter((message) => message.agentId !== 'supervisor' && ['info', 'resultado'].includes(message.type))
      .slice(-5)
      .map((message) => ({
      agentId: message.agentId,
      type: message.type,
      content: String(message.content ?? '').slice(0, 900),
      timestamp: message.timestamp,
    })),
    supervisorFinalReport: state.activeRun?.finalReport ?? null,
  };
}

function supervisorFinalReportSnapshot(mission) {
  const state = getState();
  return {
    mission: {
      title: mission?.title ?? '',
      description: mission?.description ?? '',
      success: mission?.success ?? '',
    },
    briefing: state.activeRun?.briefing ?? missionInstruction(mission),
    contributions: (state.globalChatMessages ?? [])
      .filter((message) => message.agentId !== 'supervisor' && message.agentId !== 'designer')
      .slice(-12)
      .map((message) => ({
        agentId: message.agentId,
        type: message.type,
        content: String(message.content ?? '').slice(0, 1200),
        timestamp: message.timestamp,
      })),
  };
}

function compactText(value, maxChars = 4000) {
  return String(value ?? '')
    .replace(/\r?\n{3,}/g, '\n\n')
    .slice(0, maxChars);
}

function fallbackSupervisorFinalReport(mission, reason = 'fallback local') {
  const snapshot = supervisorFinalReportSnapshot(mission);
  const contributions = snapshot.contributions ?? [];
  const usefulItems = contributions
    .map((message) => String(message.content ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((item) => !isTechnicalRuntimeMessage(item))
    .slice(-5);
  const missionText = [mission?.description, mission?.success, snapshot.briefing].filter(Boolean).join(' ');
  const lower = missionText.toLowerCase();
  const inferredFocus = lower.includes('sinistro') || lower.includes('financeiro') || lower.includes('preven')
    ? 'otimizar prevencao de sinistros com foco financeiro'
    : 'organizar a decisao principal da missao em um canvas executivo';
  const findings = usefulItems.length
    ? usefulItems.map((item, index) => ({
      title: `Prioridade ${index + 1}`,
      importance: index < 2 ? 'alta' : 'media',
      basis: 'premissa',
      detail: item.slice(0, 260),
    }))
    : [
      {
        title: 'Foco executivo',
        importance: 'alta',
        basis: 'premissa',
        detail: inferredFocus,
      },
      {
        title: 'Proxima decisao',
        importance: 'media',
        basis: 'premissa',
        detail: 'Priorizar causas, impacto estimado, acoes preventivas e metrica de acompanhamento.',
      },
    ];
  return normalizeSupervisorFinalReport({
    mission,
    snapshot,
    report: {
    summary: `Consolidacao local: ${inferredFocus}.`,
    findings,
    designerBrief: {
      mustShow: ['dor central', 'prioridades', 'impacto ou proxy', 'acoes recomendadas', 'criterios de sucesso'],
      recommendedBlocks: ['metric', 'tower', 'topics', 'note'],
      chartGuidance: 'Use ranking simples para priorizar acoes e topicos curtos para criterios de sucesso.',
      avoid: ['detalhes operacionais', 'logs', 'agentes', 'modelo', 'erros tecnicos'],
    },
    successCriteria: missionBulletItems(mission?.success).length
      ? missionBulletItems(mission?.success)
      : ['canvas publicado', 'prioridades claras', 'acoes praticas definidas'],
    sourceAgentId: 'supervisor',
    fallback: true,
    },
    fallbackReason: reason,
  });
}

function fallbackDesignerDashboard(mission) {
  const report = getState().activeRun?.finalReport ?? fallbackSupervisorFinalReport(mission);
  return buildDeterministicExecutiveDashboard({
    mission,
    finalReport: report,
    snapshot: supervisorFinalReportSnapshot(mission),
  });
}

async function buildSupervisorFinalReport(mission) {
  const model = ROUTER_MODEL;
  const snapshot = supervisorFinalReportSnapshot(mission);
  const prompt = `Missao global ativa
Descricao: ${mission?.description ?? 'Sem descricao'}
Criterios de conclusao: ${mission?.success ?? 'Sem criterios de conclusao'}

${DELIVERY_PRINCIPLE}

Dados para consolidacao:
${JSON.stringify(snapshot, null, 2)}

Sua tarefa como supervisor:
Consolide o relatorio final que sera entregue ao Designer para assumir o canvas central da missao. O relatorio deve separar o que e importante para entendimento humano do trabalho feito.

Inclua obrigatoriamente:
1. Sintese executiva em uma frase.
2. Findings principais, priorizados.
3. Top 5 itens quando a missao pedir top 5.
4. Evidencia, premissa ou proxy usado em cada finding quando aplicavel.
5. Recomendacoes de visualizacao para o Designer: blocos, graficos, rankings, metricas e textos que devem aparecer.
6. Itens que nao devem aparecer no canvas: detalhes de agentes, status operacional, logs, fila, modelo ou chat.
7. Criterios de sucesso que o canvas final precisa cobrir.
8. Se a missao pedir entregaveis especificos de seguro agro ou Sompo, carregue isso para o JSON final sem perder o pedido: ZARC, microrregioes, mapa de risco, ranking de apolices, sinistralidade, projecao de indenizacoes, cronograma de monitoramento e alertas operacionais.

Responda somente com JSON valido neste formato:
{
  "summary": "frase executiva",
  "findings": [
    { "title": "finding", "importance": "alta|media|baixa", "basis": "evidencia|premissa|proxy", "detail": "frase executiva completa, sem reticencias e sem cortar palavras" }
  ],
  "designerBrief": {
    "mustShow": ["item"],
    "recommendedBlocks": ["tower", "topics", "metric", "note"],
    "chartGuidance": "orientacao curta",
    "avoid": ["item"]
  },
  "successCriteria": ["criterio"]
}`;
  const system = 'Voce e o supervisor do LUCA-AI. Sua funcao e consolidar findings finais para o Designer montar um canvas executivo. Responda apenas JSON valido, sem expor funcionamento interno.';

  setAgentStatus('supervisor', 'running');
  appendLine('supervisor', `[orquestrador:${model}] consolidando relatorio final`);
  const output = await call9Router({ system, user: prompt, agentId: scopedAgentId('supervisor'), model, maxTokens: 1800 });
  appendLine('supervisor', output);
  const parsed = parseSupervisorFinalReportOutput(output);
  const fallbackReason = parsed
    ? ''
    : 'supervisor retornou JSON invalido; usando consolidacao deterministica';
  const report = normalizeSupervisorFinalReport({
    mission,
    snapshot,
    report: parsed
      ? {
        ...parsed,
        sourceAgentId: 'supervisor',
        raw: output,
      }
      : {
        sourceAgentId: 'supervisor',
        raw: output,
        fallback: true,
      },
    fallbackReason,
  });
  const storedReport = {
    sourceAgentId: 'supervisor',
    raw: output,
    ...report,
  };
  setSupervisorFinalReport(storedReport);
  publishChatMessage({
    agentId: 'supervisor',
    type: 'resultado',
    content: `Relatorio final consolidado${report.fallback ? ' com fallback deterministico' : ''}: ${report.summary ?? 'findings priorizados para o canvas.'}`,
  });
  addHeartbeat('supervisor', 'ready', report.fallback ? fallbackReason : 'relatorio final consolidado');
  setAgentStatus('supervisor', 'ready');
  return storedReport;
}

async function runMissionTransformer(agent, mission) {
  const contextBlock = missionContextBlock(mission);
  const prompt = `Missao escrita pelo usuario\nTitulo: ${mission?.title ?? 'Sem titulo'}\nDescricao: ${mission?.description ?? 'Sem descricao'}\nCriterios de conclusao informados: ${mission?.success ?? 'Sem criterios de conclusao'}\n\n${DELIVERY_PRINCIPLE}\n\n${contextBlock ? contextBlock + '\n\n' : ''}Transforme a missao bruta em um briefing estruturado para agentes que precisam resolver uma dor de negocio e gerar um dashboard executivo.\n\nInclua obrigatoriamente:\n1. Objetivo final escolhido em uma frase.\n2. Dor, oportunidade ou pedido central, com cliente/segmento quando houver.\n3. Tipo de problema: operacional, financeiro, risco, comercial, produto, conteudo ou outro.\n4. Eventos, causas, riscos, impactos ou itens citados explicitamente.\n5. Premissas razoaveis adotadas para preencher lacunas sem travar a missao.\n6. Objetivo de otimizacao: o que precisa melhorar ou ser entregue na pratica.\n7. Dados pos-processados esperados: pain, client, riskTypes, financialImpact, evidence, dashboardMetrics, recommendedCharts, actions, successCriteria.\n8. Papeis dos agentes com foco em entrega: Supervisor dirige, Planejador escolhe caminho, Pesquisador valida e completa com premissas, Designer sintetiza visualmente.\n9. Criterios de sucesso verificaveis para aprovar a entrega.\n\nNao execute a missao final, mas escolha o melhor caminho operacional. Nao fique procurando condicao perfeita. Se houver ambiguidade, resolva com uma premissa clara e avance.`;
  const system = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Sua funcao e transformar uma missao bruta em briefing operacional pragmatico. Escolha o melhor caminho possivel, use premissas quando faltar informacao e oriente os agentes a entregar resultado final satisfatorio. Responda em pt-BR, objetivo, estruturado e acionavel.`;

  try {
    const transformerModel = resolveAgentModel(agent);
    setAgentStatus(agent.id, 'running');
    appendLine(agent.id, `[9router:${transformerModel}] executando...`);
    appendAgentHeartbeatEvent(agent.id, 'start', transformerModel);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'running', time: new Date().toISOString() });

    const output = await call9Router({ system, user: prompt, agentId: scopedAgentId(agent.id), model: transformerModel });
    appendLine(agent.id, output);
    mission.directionPrompt = output;
    setMission(mission);
    setRunBriefing(output);
    setAgentStatus(agent.id, 'ready');
    addHeartbeat(agent.id, 'ready', 'missao transformada com gpt-5.5');
    appendAgentHeartbeatEvent(agent.id, 'done', 'missao transformada');

    const summary = summarizeFirstLine(output);
    publishChatMessage({
      agentId: agent.id,
      type: 'resultado',
      content: summary || 'Direcionamento operacional gerado. Supervisor, planejador e pesquisador ja podem executar a missao.',
    });

    upsertDashboardItem({
      id: `${agent.id}-${Date.now()}`,
      label: `${agent.id} - direcionamento`,
      type: 'dashboard-panel',
      status: 'ready',
      publicView: {
        plainSummary: output.slice(0, 600),
        whyItMatters: 'Direcionamento inicial produzido para orientar os outros agentes.',
        clearInformation: [
          `agente: ${agent.id}`,
          `modelo: ${agent.model}`,
        ],
        viewerQuestions: ['Os criterios estao verificaveis?', 'Qual etapa deve iniciar agora?'],
      },
    });

    emitEvent({ type: 'agent.output', agentId: agent.id, text: output, time: new Date().toISOString() });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLine(agent.id, `erro: ${message}`);
    setAgentStatus(agent.id, 'error');
    addHeartbeat(agent.id, 'error', message);
    appendAgentHeartbeatEvent(agent.id, 'fail', message);
    publishChatMessage({
      agentId: agent.id,
      type: 'alerta',
      content: `Falhei ao transformar a missao: ${message}`,
    });
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'error', time: new Date().toISOString() });
    return '';
  }
}

async function runAgent(agent, mission, task = null) {
  const runtime = agentRuntime(agent.id);
  if (!runtime.enabled) {
    appendLine(agent.id, 'Agente zerado. LLM nao chamado.');
    if (task) updateAgentTask(task.id, { status: 'completed', completedAt: new Date().toISOString(), skipped: true });
    setAgentStatus(agent.id, 'disabled');
    publishChatMessage({ agentId: agent.id, type: 'info', content: `${agentDisplayName(agent.id)} esta desativado; execucao pulada.` });
    return { ok: false, disabled: true };
  }
  if (agent.role === 'mission-transformer') return runMissionTransformer(agent, mission);
  if (agent.role === 'designer') return runDesignerAgent(agent, mission, task);
  const chatRequired = missionRequiresChatMessage(mission);
  const contextBlock = missionContextBlock(mission);
  const directionPrompt = missionInstruction(mission);
  const taskInstruction = task?.instruction ? `\nTarefa atribuida pelo supervisor:\n${task.instruction}\n` : '';
  const chatContext = `\nChat Global recente:\n${recentChatContext()}\n\nMensagens novas para voce:\n${unreadChatContext(agent.id)}\n`;
  const repoContext = missionRequiresRepoContext(mission) ? `\nFerramenta RepoContext disponivel. Use estas evidencias observaveis da repo; cite arquivos quando fizer achados:\n${repoContextForPrompt()}\n` : '';
  const prompt = `Missao global ativa\nDescricao: ${mission?.description ?? 'Sem descricao'}\nCriterios de conclusao: ${mission?.success ?? 'Sem criterios de conclusao'}\n\n${DELIVERY_PRINCIPLE}\n${directionPrompt ? `\nDirecionamento transformado pelo agente transformador-missao:\n${directionPrompt}\n` : ''}${taskInstruction}${chatContext}${repoContext}${contextBlock ? `\n${contextBlock}\n` : ''}\nFerramenta disponivel: Chat Global.\nPara publicar no chat visivel aos agentes, escreva uma linha exatamente neste formato:\n[chat:tipo] mensagem\nTipos permitidos: info, resultado, decisao, pergunta, alerta.\nUse o chat apenas para informacoes uteis a outros agentes. Nao use para status trivial.\n${chatRequired ? '\nEsta missao exige mensagem no chat. Inclua obrigatoriamente uma linha [chat:info] com a mensagem solicitada.\n' : ''}\nQualidade obrigatoria da contribuicao:\n1. Entregue uma contribuicao final util, mesmo com informacao incompleta.\n2. Se faltar dado, declare premissa/proxy e siga. Nao use lacuna como conclusao principal.\n3. Escolha uma direcao, priorize e recomende a proxima acao.\n4. Produza material que ajude o Designer a montar um dashboard executivo: itens, ranking, metricas, acoes ou criterios de sucesso.\n5. Nao repita informacoes que ja estao no chat; entregue contribuicao nova.\nSe a tarefa pede analise da repo, publique pontos fortes e fracos com evidencia de arquivo/diretorio. Nao diga que nao tem acesso a arvore se RepoContext foi fornecido. Trabalhe apenas dentro desse escopo. Use os criterios de conclusao e o direcionamento transformado para decidir se sua resposta esta suficiente.`;
  const system = buildBuiltinAgentSystemPrompt(agent, mission, { mode: 'task' });
  const model = runtime.model;

  try {
    if (task) updateAgentTask(task.id, { status: 'running', startedAt: new Date().toISOString() });
    setAgentStatus(agent.id, 'running');
    appendLine(agent.id, `[9router:${model}] executando...`);
    appendAgentHeartbeatEvent(agent.id, 'start', model);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'running', time: new Date().toISOString() });

    let output = await call9Router({ system, user: prompt, agentId: scopedAgentId(agent.id), model });
    appendLine(agent.id, output);
    let chatMessages = extractChatMessages(agent.id, output);
    if (!chatMessages.length) {
      const fallback = fallbackChatMessage(agent.id, output);
      if (fallback) chatMessages.push(fallback);
    }
    if (agent.role === 'researcher' && missionRequiresRepoContext(mission)) {
      const review = reviewResearcherContribution({ mission, output, messages: chatMessages });
      if (!review.ok) {
        appendLine(agent.id, `[quality] pesquisador_repair ${review.gaps.join(' | ')}`);
        output = await repairResearcherRepoContribution(agent, mission, output, review, model);
        appendLine(agent.id, output);
        chatMessages = extractChatMessages(agent.id, output);
        if (!chatMessages.length) {
          const fallback = fallbackChatMessage(agent.id, output);
          if (fallback) chatMessages.push(fallback);
        }
        const repaired = reviewResearcherContribution({ mission, output, messages: chatMessages });
        if (!repaired.ok) {
          throw new Error(`researcher_quality_repo_evidence_failed: ${repaired.gaps.join(' | ')}`);
        }
      }
    }
    for (const chatMessage of chatMessages) publishChatMessage(chatMessage);
    setAgentStatus(agent.id, 'ready');
    if (task) updateAgentTask(task.id, { status: 'completed', completedAt: new Date().toISOString() });
    markAgentChatSeen(agent.id, latestChatMessageId());
    addHeartbeat(agent.id, 'ready', 'resposta recebida do 9router');
    appendAgentHeartbeatEvent(agent.id, 'done', 'resposta recebida');

    upsertDashboardItem({
      id: `${agent.id}-${Date.now()}`,
      label: `${agent.id} - sintese`,
      type: 'dashboard-panel',
      status: 'ready',
      publicView: {
        plainSummary: output.slice(0, 600),
        whyItMatters: 'Resultado produzido pelo agente conectado ao 9router.',
        clearInformation: [
          `agente: ${agent.id}`,
          `modelo: ${model}`,
        ],
        viewerQuestions: ['O que executar agora?', 'Qual o risco principal?'],
      },
    });

    emitEvent({ type: 'agent.output', agentId: agent.id, text: output, time: new Date().toISOString() });
    return { ok: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLine(agent.id, `erro: ${message}`);
    setAgentStatus(agent.id, 'error');
    if (task) updateAgentTask(task.id, { status: 'error', error: message, completedAt: new Date().toISOString() });
    addHeartbeat(agent.id, 'error', message);
    appendAgentHeartbeatEvent(agent.id, 'fail', message);
    publishChatMessage({
      agentId: agent.id,
      type: 'alerta',
      content: `Erro ao executar a missao: ${message}`,
    });
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'error', time: new Date().toISOString() });
    return { ok: false, error: message, routerDown: isRouterUnavailable(error) };
  }
}

async function runDesignerAgent(agent, mission, task = null) {
  const directionPrompt = missionInstruction(mission);
  const dataSnapshot = designerDataSnapshot(mission);
  const contextBlock = missionContextBlock(mission);
  const repoContext = missionRequiresRepoContext(mission) ? `\nEvidencias da repo, se forem relevantes:\n${compactText(repoContextForPrompt(), 2500)}\n` : '';
  const prompt = `Missao global ativa\nDescricao: ${mission?.description ?? 'Sem descricao'}\nCriterios de conclusao: ${mission?.success ?? 'Sem criterios de conclusao'}\n\nBriefing operacional:\n${directionPrompt || 'sem briefing'}\n\nDados estruturados da run:\n${JSON.stringify(dataSnapshot, null, 2)}\n${repoContext}\n\nTarefa do designer:\nVoce recebeu um canvas temporario vazio na area principal esquerda. Preencha com resultados uteis da RUN atual, de forma limpa, minimalista e facil de ler. O objetivo nao e decorar: e transformar progresso, agentes, riscos, achados e proximas decisoes em uma visualizacao sintetica.\n\nLogica de design obrigatoria:\n1. Se houver contagens ou proporcoes claras, prefira grafico simples: pie para distribuicao, tower para comparacao/ranking.\n2. Se a run tiver muitos achados textuais, prefira topics com topicos curtos e modernos.\n3. Se envolver varios agentes, mostre status por agente e progresso da run.\n4. Se houver risco/ambiguidades, inclua um bloco de alerta curto.\n5. Se houver sequencia temporal, use timeline.\n6. Se a missao for simples, use 2 a 4 blocos e muito espaco vazio.\n7. Nao invente dados: derive contagens apenas dos dados estruturados, briefing, chat e RepoContext quando fornecido.\n\nComponentes permitidos em blocks:\n- metric: valor curto com label\n- status: estado de agente ou run\n- list: lista curta\n- timeline: eventos recentes\n- note: texto curto\n- alert: risco ou pendencia\n- progress: progresso textual tipo 2/4\n- pie: grafico de pizza simples; items devem ser objetos { "label": "nome", "value": numero }\n- tower: grafico de barras horizontais/torre; items devem ser objetos { "label": "nome", "value": numero }\n- topics: lista visual de topicos curtos; items devem ser strings de 2 a 5 palavras\n\nResponda somente com JSON valido neste formato:\n{\n  "title": "titulo curto",\n  "subtitle": "frase de contexto",\n  "status": "rascunho|ativo|concluido|alerta",\n  "layout": "empty|minimal|status-board|timeline|mission-control|insight-board",\n  "blocks": [\n    { "type": "metric|status|list|timeline|note|alert|progress|pie|tower|topics", "title": "titulo", "value": "valor opcional", "body": "texto opcional", "items": ["item 1"] }\n  ]\n}\n\nUse no maximo 6 blocos. Se usar pie ou tower, mantenha ate 5 itens. Se a missao for simples, use 2 ou 3 blocos. Nao inclua markdown fora do JSON.`;
  const system = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Sua funcao e desenhar canvas temporarios claros, minimalistas e acionaveis para a missao ativa. Priorize resultados uteis da run, visualizacoes simples e topicos modernos. Voce escolhe o layout conforme a natureza da missao e responde em JSON valido.`;
  const resultOnlySystem = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Sua funcao e desenhar canvas temporarios de resultados para a missao atual. Nunca inclua detalhes operacionais, agentes, progresso, eventos ou status internos. Nunca corte palavras nem use reticencias (...). Responda em JSON valido.`;
  const resultOnlyPrompt = `Missao global ativa
Descricao: ${mission?.description ?? 'Sem descricao'}
Criterios de conclusao: ${mission?.success ?? 'Sem criterios de conclusao'}

${DELIVERY_PRINCIPLE}

Briefing da missao atual:
${compactText(directionPrompt || 'sem briefing', 3500)}

Resultados textuais disponiveis da missao atual:
${JSON.stringify(dataSnapshot, null, 2)}
${repoContext}
${contextBlock ? `\n${contextBlock}\n` : ''}
Tarefa do designer:
Use o supervisorFinalReport como fonte principal quando ele existir. Preencha o canvas com uma visualizacao executiva de RESULTADOS e SOLUCOES da missao atual. Mostre conteudo util para uma equipe executiva, nao o funcionamento interno do sistema.
Mesmo que a missao seja simples ou os insumos estejam incompletos, gere um canvas final util usando o melhor caminho possivel. Nao deixe o canvas vazio por falta de dados. Use premissas claras e componentes simples quando necessario.

O canvas deve responder em ate 30 segundos:
1. Qual e a dor central.
2. Quais riscos, causas ou oportunidades devem ser priorizados.
3. Qual impacto financeiro, operacional ou proxy sustenta a prioridade.
4. Quais graficos/metricas ajudam a decidir.
5. Quais acoes praticas devem ser tomadas primeiro.
6. Como medir sucesso.

Regras obrigatorias:
1. Nao mostre agentes, status de agentes, progresso da run, eventos, fila, erros tecnicos, ticks, chamadas ou tarefas.
2. Nao mencione supervisor, planejador, pesquisador, designer, transformador, heartbeat, run, chat ou 9router no canvas.
3. Nao use memoria, tema ou fatos de missoes anteriores. Use somente a missao atual e os resultados fornecidos acima.
4. Se a missao pedir top 5, entregue exatamente 5 itens de resultado.
5. O conteudo deve ser sobre o assunto pedido, a decisao executiva e a solucao pratica, nao sobre o processo.
6. Ignore qualquer informacao operacional nos dados.
7. Para dores de negocio, prefira um canvas com: metrica/proxy principal, ranking de prioridades, matriz ou comparacao, plano de acoes e criterios de sucesso.
8. Separe evidencia de inferencia quando houver risco de parecer dado inventado.
9. Nao use termos fixos de um setor especifico se eles nao aparecerem na missao atual.
10. Se o pedido for simples, entregue diretamente o resultado pedido com ranking/lista/topicos e pelo menos um bloco visual tower ou topics.
11. Se o supervisorFinalReport trouxer designerBrief.mustShow, esses itens devem aparecer no canvas final.

Componentes permitidos em blocks:
- metric: valor curto com label relacionado ao resultado
- list: lista de resultados finais
- note: texto executivo objetivo em frase completa
- pie: grafico de distribuicao do conteudo final; items devem ser objetos { "label": "nome", "value": numero }
- tower: ranking/comparacao de resultados; items devem ser objetos { "label": "nome", "value": numero }
- topics: topicos curtos de resultado; items devem ser strings de 2 a 5 palavras

Componentes proibidos: status, timeline, progress, alert para riscos operacionais.

Responda somente com JSON valido neste formato:
{
  "title": "titulo curto",
  "subtitle": "frase de contexto executivo",
  "status": "rascunho|ativo|concluido|alerta",
  "layout": "empty|minimal|result-board|topics|ranking",
  "blocks": [
    { "type": "list|note|metric|pie|tower|topics", "title": "titulo", "body": "texto opcional", "value": "valor opcional", "items": [] }
  ]
}

Nao use reticencias (...), nao abrevie body no meio da palavra e nao deixe frases incompletas. Se o texto ficar grande, resuma reescrevendo a frase, sem cortar evidencias, telemetria ou lacunas financeiras.`;
  const model = resolveAgentModel(agent);

  try {
    if (task) updateAgentTask(task.id, { status: 'running', startedAt: new Date().toISOString() });
    setAgentStatus(agent.id, 'running');
    appendLine(agent.id, `[9router:${model}] executando...`);
    appendAgentHeartbeatEvent(agent.id, 'start', model);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'running', time: new Date().toISOString() });

    const health = await check9RouterHealth();
    if (!health.ok) {
      throw new Error(`9router indisponivel em ${health.url}${health.error ? `: ${health.error}` : health.status ? `: HTTP ${health.status}` : ''}`);
    }

    const output = await call9Router({ system: resultOnlySystem, user: resultOnlyPrompt, agentId: scopedAgentId(agent.id), model, maxTokens: 1800 });
    appendLine(agent.id, output);
    const parsedDashboard = extractJsonObject(output);
    if (!parsedDashboard) {
      throw new Error('designer_quality_invalid_json: modelo nao retornou JSON valido para o canvas executivo');
    }
    if (isOperationalDashboard(parsedDashboard)) {
      throw new Error('designer_quality_operational_content: modelo tentou expor processo interno no canvas executivo');
    }
    const coverageGaps = executiveCanvasCoverageGaps({
      mission,
      dashboard: parsedDashboard,
      finalReport: getState().activeRun?.finalReport ?? null,
    });
    const dashboard = coverageGaps.length
      ? fallbackDesignerDashboard(mission)
      : parsedDashboard;
    if (coverageGaps.length) {
      appendLine(agent.id, `designer_quality_fallback: ${coverageGaps.join(' | ')}`);
    }
    setTemporaryDashboard({ ...dashboard, sourceAgentId: agent.id });
    publishChatMessage({
      agentId: agent.id,
      type: 'resultado',
      content: `Canvas atualizado${coverageGaps.length ? ' com reforco deterministico de cobertura' : ''}: ${dashboard.title ?? 'sem titulo'}`,
    });
    setAgentStatus(agent.id, 'ready');
    if (task) updateAgentTask(task.id, { status: 'completed', completedAt: new Date().toISOString() });
    markAgentChatSeen(agent.id, latestChatMessageId());
    addHeartbeat(agent.id, 'ready', 'canvas atualizado');
    appendAgentHeartbeatEvent(agent.id, 'done', 'canvas atualizado');
    emitEvent({ type: 'agent.output', agentId: agent.id, text: output, time: new Date().toISOString() });
    return { ok: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const routerDown = isRouterUnavailable(error);
    if (routerDown) {
      const dashboard = fallbackDesignerDashboard(mission);
      setTemporaryDashboard({ ...dashboard, sourceAgentId: agent.id });
      publishChatMessage({ agentId: agent.id, type: 'resultado', content: `Canvas atualizado com fallback local: ${dashboard.title}` });
      setAgentStatus(agent.id, 'ready');
      if (task) updateAgentTask(task.id, { status: 'completed', completedAt: new Date().toISOString() });
      markAgentChatSeen(agent.id, latestChatMessageId());
      addHeartbeat(agent.id, 'ready', 'canvas fallback atualizado');
      appendAgentHeartbeatEvent(agent.id, 'done', 'canvas fallback atualizado');
      emitEvent({ type: 'agent.output', agentId: agent.id, text: JSON.stringify(dashboard), time: new Date().toISOString() });
      return { ok: true, output: JSON.stringify(dashboard), fallback: true };
    }
    appendLine(agent.id, `erro: ${message}`);
    publishChatMessage({ agentId: agent.id, type: 'alerta', content: `Canvas executivo nao foi gerado: ${message}` });
    setAgentStatus(agent.id, 'error');
    if (task) updateAgentTask(task.id, { status: 'error', error: message, completedAt: new Date().toISOString() });
    markAgentChatSeen(agent.id, latestChatMessageId());
    addHeartbeat(agent.id, 'error', message);
    appendAgentHeartbeatEvent(agent.id, 'fail', message);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'error', time: new Date().toISOString() });
    return { ok: false, error: message, routerDown };
  }
}

async function runCycle() {
  const mission = getState().activeMission;
  if (!mission) {
    addHeartbeat('supervisor', 'idle', 'sem missao ativa');
    await processScheduledMissions();
    emitState();
    return;
  }

  const intent = classifyMissionIntent(mission);
  if (intent === 'agent_conversation') {
    await runAgentConversationMission(mission);
    return;
  }
  if (intent === 'chat_only') {
    await runChatOnlyMission(mission);
    return;
  }

  // dashboard_build (fluxo padrao): transformer -> contributors -> designer -> canvas.
  const transformer = AGENTS.find((agent) => agent.role === 'mission-transformer');
  if (transformer && !missionReadyForAgents(mission)) {
    await runMissionTransformer(transformer, mission);
    emitState();
  }
  const currentMission = getState().activeMission;
  if (!missionReadyForAgents(currentMission)) return;

  await supervisorTick(currentMission);
}

function triggerRunCycle() {
  if (!runCycleGate) {
    runCycleGate = createSingleFlightLoop(async () => {
      await runCycle();
    });
  }
  return runCycleGate.trigger();
}

async function supervisorTick(mission) {
  const run = getState().activeRun;
  if (!run || run.status !== 'running') return;
  if (hasRunningWorker()) {
    addHeartbeat('supervisor', 'observing', 'aguardando agente em execucao');
    emitState();
    return;
  }

  const tick = incrementSupervisorTick();
  setAgentStatus('supervisor', 'running');
  appendLine('supervisor', `[orquestrador] observando chat tick ${tick}`);
  markAgentChatSeen('supervisor', latestChatMessageId());

  const contributors = contributorAgents();
  const designer = designerAgent();
  const nextWorker = contributors.find((agent) => !run.tasks.some((task) => task.agentId === agent.id));
  if (nextWorker) {
    const instruction = taskInstructionForAgent(nextWorker);
    const task = createAgentTask(nextWorker.id, instruction);
    publishChatMessage({
      agentId: 'supervisor',
      type: 'decisao',
      content: `Chamando ${agentDisplayName(nextWorker.id)} para contribuir na missao.`,
    });
    setAgentStatus('supervisor', 'ready');
    emitState();
    const result = await runAgent(nextWorker, mission, task);
    if (result?.ok === false) {
      const reason = result.routerDown
        ? 'o 9router local nao respondeu dentro do limite. Verifique se o roteador/modelo esta ativo e retome o supervisor depois.'
        : `o agente ${agentDisplayName(nextWorker.id)} falhou ou produziu saida invalida: ${result.error ?? 'erro desconhecido'}`;
      publishChatMessage({
        agentId: 'supervisor',
        type: 'alerta',
        content: `Pausando a missao: ${reason}`,
      });
      setSupervisorMode('standby');
      if (supervisorTimer) {
        clearInterval(supervisorTimer);
        supervisorTimer = null;
      }
      addHeartbeat('supervisor', 'paused', result.routerDown ? '9router indisponivel' : 'falha de qualidade do agente');
    }
    emitState();
    return;
  }

  const allContributorsCompleted = contributors.every((agent) => hasCompletedTask(agent.id));
  if (allContributorsCompleted) {
    if (!missionCompletionSatisfied(mission)) {
      publishChatMessage({
        agentId: 'supervisor',
        type: 'alerta',
        content: 'Ainda nao posso concluir: faltam pontos fortes/fracos com evidencias observaveis da repo. Vou solicitar nova contribuicao do pesquisador.',
      });
      const task = createAgentTask('pesquisador', 'Complemente a analise da repo usando o RepoContext fornecido. Publique pontos fortes e pontos fracos com evidencias de arquivos/diretorios concretos.');
      const researcher = AGENTS.find((agent) => agent.id === 'pesquisador');
      if (researcher) await runAgent(researcher, mission, task);
      emitState();
      return;
    }

    if (!getState().activeRun?.finalReport) {
      try {
        publishChatMessage({
          agentId: 'supervisor',
          type: 'decisao',
          content: 'Consolidando relatorio final para o Designer montar o canvas da missao.',
        });
        await buildSupervisorFinalReport(mission);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isRouterUnavailable(error)) {
          publishChatMessage({
            agentId: 'supervisor',
            type: 'alerta',
            content: `Pausando a missao: relatorio final do supervisor nao foi gerado (${message}).`,
          });
          setSupervisorMode('standby');
          stopSupervisorTimer();
          setAgentStatus('supervisor', 'error');
          addHeartbeat('supervisor', 'error', message);
          emitState();
          return;
        }
        const fallbackReport = fallbackSupervisorFinalReport(mission, message);
        setSupervisorFinalReport(fallbackReport);
        publishChatMessage({
          agentId: 'supervisor',
          type: 'resultado',
          content: `Relatorio final consolidado com fallback local: ${fallbackReport.summary}`,
        });
        setAgentStatus('supervisor', 'ready');
        addHeartbeat('supervisor', 'ready', 'relatorio fallback consolidado');
        emitState();
        return;
      }
      emitState();
      return;
    }

    if (designer && !hasCompletedTask(designer.id)) {
      const task = createAgentTask(designer.id, taskInstructionForAgent(designer));
      publishChatMessage({
        agentId: 'supervisor',
        type: 'decisao',
        content: 'Entregando o relatorio final ao Designer para assumir o canvas central.',
      });
      setAgentStatus('supervisor', 'ready');
      emitState();
      const result = await runAgent(designer, mission, task);
      if (result?.ok === false) {
        const reason = result.routerDown
          ? 'o 9router local nao respondeu dentro do limite. Verifique se o roteador/modelo esta ativo e retome o supervisor depois.'
          : `o Designer falhou ao gerar o canvas final: ${result.error ?? 'erro desconhecido'}`;
        publishChatMessage({ agentId: 'supervisor', type: 'alerta', content: `Pausando a missao: ${reason}` });
        setSupervisorMode('standby');
        stopSupervisorTimer();
        addHeartbeat('supervisor', 'paused', result.routerDown ? '9router indisponivel' : 'designer falhou');
      }
      emitState();
      return;
    }

    await attemptMissionClosure({
      type: 'dashboard_build',
      proposedStatus: 'completed',
      reason: 'relatorio final do supervisor entregue e canvas final publicado pelo designer',
      finalize: () => {
        publishChatMessage({
          agentId: 'supervisor',
          type: 'resultado',
          content: `Concluido: relatorio final consolidado, Designer publicou o canvas e criterios foram revisados: ${mission.success || 'sem criterios explicitos'}`,
        });
        completeRun('relatorio final do supervisor entregue e canvas final publicado pelo designer');
        setSupervisorMode('standby');
        stopSupervisorTimer();
        setAgentStatus('supervisor', 'ready');
        addHeartbeat('supervisor', 'ready', 'missao concluida pelo orquestrador');
      },
    });
    emitState();
    return;
  }

  setAgentStatus('supervisor', 'ready');
  addHeartbeat('supervisor', 'observing', 'sem acao nova');
}

function startSupervisorTimer() {
  if (supervisorTimer) return;
  supervisorTimer = setInterval(() => { void triggerRunCycle().catch(() => {}); }, 8000);
}

// ---------------------------------------------------------------------------
// Gate de encerramento (Maestro): revisao deterministica + auditoria LLM.
// ---------------------------------------------------------------------------

function chatMessagesSinceMissionStart(mission = getState().activeMission) {
  const startedMs = Date.parse(mission?.activatedAt || mission?.agentConversation?.startedAt || '');
  return (getState().globalChatMessages || []).filter((message) => {
    if (!Number.isFinite(startedMs)) return true;
    const ts = Date.parse(message.createdAt || '');
    return !Number.isFinite(ts) || ts >= startedMs - 2000;
  });
}

async function runMaestroClosureReview(mission, closureContext) {
  const runtime = agentRuntime('maestro');
  if (!runtime.enabled) return null;
  const chatMessages = chatMessagesSinceMissionStart(mission);
  const system = `Voce e o Maestro do LUCA-AI. Voce NAO executa a missao; apenas audita se ela pode ser encerrada com seguranca.
Compare o pedido principal, o criterio de sucesso, as contribuicoes reais no chat e as evidencias.
Responda SOMENTE com linhas estruturadas:
[closure:verdict] approved|blocked|retry
[closure:reason] <motivo curto>
[closure:gap] <lacuna encontrada, se houver>
[closure:next] <proximo passo sugerido, se houver>
Use blocked quando criterios nao foram cumpridos; retry quando falta uma rodada recuperavel; approved somente com evidencia clara.`;
  const user = `Pedido principal: ${primaryMissionText(mission) || mission?.title || 'sem descricao'}
Criterio de sucesso: ${mission?.success || 'sem criterio explicito'}

Encerramento proposto:
${JSON.stringify(closureContext, null, 2)}

Chat da missao:
${chatMessages.map((m) => `[${m.agentName}/${m.type}] ${m.content}`).join('\n') || 'sem mensagens'}`;
  try {
    setAgentStatus('maestro', 'running');
    const output = await call9Router({ system, user, agentId: scopedAgentId('maestro'), model: runtime.model, maxTokens: 500 });
    appendLine('maestro', output);
    setAgentStatus('maestro', 'ready');
    const parsed = parseClosureReviewOutput(output);
    return parsed.verdict ? parsed : null;
  } catch (error) {
    setAgentStatus('maestro', 'ready');
    appendLine('maestro', `erro: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function reviewMissionClosure(closureContext = {}) {
  const mission = getState().activeMission;
  if (closureContext.proposedStatus !== 'completed') {
    return { verdict: 'approved', reasons: [`Encerramento como ${closureContext.proposedStatus} liberado sem auditoria.`], gaps: [], nextSteps: [], sources: ['deterministic'] };
  }
  const chatMessages = chatMessagesSinceMissionStart(mission);
  const agents = getState().agents;
  const requiresRepo = missionRequiresRepoContext(mission);
    const deterministic = buildDeterministicClosureReview({
      mission,
      chatMessages,
      agents,
      closureContext: {
        ...closureContext,
        requiresAllAgents: missionRequestsAllAgents(mission),
        needsSupervisorJudgment: missionNeedsSupervisorJudgment(mission),
        expectedPerformerIds: expectedChatPerformers(mission, agents).map((a) => a.id),
        repoAnalysisSatisfied: requiresRepo ? repoAnalysisSatisfied() : undefined,
        hasFinalReport: Boolean(getState().activeRun?.finalReport),
        hasDashboard: Boolean(getState().temporaryDashboard),
        finalReport: getState().activeRun?.finalReport ?? null,
        dashboard: getState().temporaryDashboard ?? null,
      },
    });
  const maestro = await runMaestroClosureReview(mission, closureContext);
  return mergeClosureReviews(deterministic, maestro);
}

async function attemptMissionClosure({ type = 'archive', proposedStatus = 'completed', reason = '', evidence = [], finalize, skipClosureReview = false } = {}) {
  const mission = getState().activeMission;
  if (!mission) return { approved: false, reason: 'no_mission' };
  if (skipClosureReview) {
    if (typeof finalize === 'function') await finalize();
    else archiveActiveMission({ status: proposedStatus, reason, evidence });
    return { approved: true, skipped: true };
  }
  mission.closureAttempts = Number(mission.closureAttempts || 0) + 1;
  persist();
  if (mission.closureAttempts > MAX_CLOSURE_ATTEMPTS) {
    publishChatMessage({ agentId: 'maestro', type: 'alerta', content: `Encerramento forcado apos ${MAX_CLOSURE_ATTEMPTS} tentativas de auditoria.` });
    if (typeof finalize === 'function') await finalize();
    else archiveActiveMission({ status: proposedStatus, reason: `${reason} (forcado apos ${MAX_CLOSURE_ATTEMPTS} tentativas)`, evidence });
    return { approved: true, forced: true };
  }
  const closureContext = { type, proposedStatus, reason, evidence, attempt: mission.closureAttempts };
  const review = await reviewMissionClosure(closureContext);
  mission.lastClosureReview = { ...review, reviewedAt: new Date().toISOString(), attempt: mission.closureAttempts };
  persist();
  if (review.verdict === 'approved') {
    publishChatMessage({ agentId: 'maestro', type: 'resultado', content: `Encerramento aprovado: ${review.reasons.join(' ') || 'criterios atendidos.'}` });
    if (typeof finalize === 'function') await finalize();
    else archiveActiveMission({ status: proposedStatus, reason, evidence });
    return { approved: true, review };
  }
  publishChatMessage({ agentId: 'maestro', type: 'alerta', content: `Encerramento bloqueado (${review.verdict}): ${review.gaps.join(' . ') || review.reasons.join(' ')}` });
  if (review.nextSteps?.length) {
    publishChatMessage({ agentId: 'maestro', type: 'acao', content: `Proximos passos: ${review.nextSteps.join(' . ')}` });
  }
  setSupervisorMode('standby');
  stopSupervisorTimer();
  setAgentStatus('supervisor', 'ready');
  return { approved: false, review };
}

// ---------------------------------------------------------------------------
// Runner de chat leve (conversa entre agentes e chat-only).
// ---------------------------------------------------------------------------

async function runAgentChat(agentId, { mode = 'chat_only', reason = '', chatContext = null } = {}) {
  const def = AGENTS.find((agent) => agent.id === agentId);
  if (!def) return { ok: false, error: 'agent_not_found' };
  const runtime = agentRuntime(agentId);
  if (!runtime.enabled) {
    publishChatMessage({ agentId, type: 'info', content: `${agentDisplayName(agentId)} esta desativado; nao participou.` });
    return { ok: false, disabled: true };
  }
  const mission = getState().activeMission;
  const context = chatContext || recentChatContext(12);
  const system = `Voce e o agente ${def.name} (${def.role}) do projeto LUCA-AI. Responda em pt-BR, curto e concreto. ${mode === 'conversation'
    ? 'Voce esta numa conversa entre agentes: traga ideias concretas e reaja ao que o outro agente disse.'
    : 'Cumpra exatamente o pedido do usuario no chat global; nao invente pipeline, dashboard ou canvas.'} Para publicar no chat use uma linha [chat:tipo] mensagem (tipos: info, resultado, decisao, pergunta, alerta, acao).`;
  const user = `Missao ativa
Descricao: ${mission?.description ?? ''}
Criterios de conclusao: ${mission?.success ?? ''}

Chat recente:
${context}

Motivo desta rodada: ${reason || 'contribua de forma util'}

Responda como ${def.name}, em 1 a 4 linhas. Use [chat:tipo] para o que deve aparecer no chat global.`;
  try {
    setAgentStatus(agentId, 'running');
    appendLine(agentId, `[9router:${runtime.model}] ${mode}...`);
    appendAgentHeartbeatEvent(agentId, 'start', runtime.model);
    const output = await call9Router({ system, user, agentId: scopedAgentId(agentId), model: runtime.model, maxTokens: 600 });
    appendLine(agentId, output);
    const messages = extractChatMessages(agentId, output);
    if (!messages.length) {
      const fallback = fallbackChatMessage(agentId, output);
      if (fallback) messages.push(fallback);
    }
    for (const message of messages) publishChatMessage(message);
    setAgentStatus(agentId, 'ready');
    markAgentChatSeen(agentId, latestChatMessageId());
    addHeartbeat(agentId, 'ready', `contribuicao ${mode}`);
    appendAgentHeartbeatEvent(agentId, 'done', mode);
    emitEvent({ type: 'agent.output', agentId, text: output, time: new Date().toISOString() });
    return { ok: true, output };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appendLine(agentId, `erro: ${msg}`);
    setAgentStatus(agentId, 'error');
    addHeartbeat(agentId, 'error', msg);
    publishChatMessage({ agentId, type: 'alerta', content: `Erro ao contribuir no chat: ${msg}` });
    return { ok: false, error: msg, routerDown: isRouterUnavailable(error) };
  }
}

// ---------------------------------------------------------------------------
// Persona-agents do Yume (consumidos via Kamui, SOMENTE LEITURA).
// O LUCA-AI le a persona + system-prompt do Yume e os usa como agente
// especialista. Nunca escreve no Yume.
// ---------------------------------------------------------------------------

function applyOfficialPersonaRoster(personas) {
  const reconciled = reconcileOfficialPersonaAgents(personas, getPersonaAgents());
  if (reconciled.changed) replacePersonaAgents(reconciled.roster);
  return reconciled;
}

async function syncOfficialPersonaRoster() {
  const personas = await listYumePersonas();
  const reconciled = applyOfficialPersonaRoster(personas);
  return { personas, ...reconciled };
}

async function syncAllOfficialPersonaRosters() {
  const personas = await listYumePersonas();
  let changedWorkspaces = 0;
  for (const userId of listWorkspaceUserIds()) {
    runWithWorkspaceUser(userId, () => {
      const reconciled = applyOfficialPersonaRoster(personas);
      if (reconciled.changed) {
        changedWorkspaces += 1;
        emitState();
      }
    });
  }
  return { personas, changedWorkspaces };
}

async function resolvePersonaSystemPrompt(slug) {
  const persona = getPersonaAgents().find((p) => p.slug === slug);
  try {
    const versionInfo = await getYumePersonaVersion(slug);
    const currentVersion = versionInfo?.version ?? null;
    if (persona?.cachedSystemPrompt && persona.cachedVersion === currentVersion) {
      // model no cache = motor do Yume (não o override local).
      return {
        systemPrompt: persona.cachedSystemPrompt,
        model: persona.yumeModel || '',
        version: currentVersion,
        cached: true,
      };
    }
    const data = await fetchYumePersonaSystemPrompt(slug);
    const systemPrompt = data?.system_prompt || '';
    const model = data?.model || '';
    // yumeModel no cache; model local só via override explícito.
    updatePersonaAgent(slug, {
      cachedSystemPrompt: systemPrompt,
      cachedVersion: currentVersion,
      cachedAt: new Date().toISOString(),
      name: data?.name || persona?.name,
      yumeModel: model,
      lastError: null,
    });
    return { systemPrompt, model, version: currentVersion, cached: false };
  } catch (error) {
    if (persona?.cachedSystemPrompt) {
      updatePersonaAgent(slug, { lastError: error?.message || String(error) });
      return {
        systemPrompt: persona.cachedSystemPrompt,
        model: persona.yumeModel || '',
        version: persona.cachedVersion,
        cached: true,
        stale: true,
      };
    }
    throw error;
  }
}

async function runPersonaAgentChat(slug, { mode = 'chat_only', reason = '', chatContext = null } = {}) {
  const persona = getPersonaAgents().find((p) => p.slug === slug);
  if (!persona) return { ok: false, error: 'persona_not_found' };
  const agentId = persona.id;
  if (persona.enabled === false) {
    publishChatMessage({ agentId, type: 'info', content: `${persona.name} (Yume) esta desativado; nao participou.` });
    return { ok: false, disabled: true };
  }
  const mission = getState().activeMission;
  const context = chatContext || recentChatContext(12);
  let resolved;
  try {
    resolved = await resolvePersonaSystemPrompt(slug);
  } catch (error) {
    const msg = error?.message || String(error);
    publishChatMessage({ agentId, type: 'alerta', content: `Nao consegui carregar a persona ${persona.name} do Yume via Kamui: ${msg}` });
    return { ok: false, error: msg };
  }
  const personaPrompt = resolved.systemPrompt || `Voce e a persona ${persona.name}.`;
    const model = resolvePersonaRuntimeModel({
      localModel: persona.model,
      yumeModel: resolved.model,
      fallback: ROUTER_MODEL,
    });
    const system = `${personaPrompt}

  ---
  Voce esta atuando como agente especialista dentro do LUCA-AI (orquestrador de missoes). Mantenha sua personalidade e expertise da persona acima.
  Motor LLM desta execucao (fonte de verdade do LUCA-AI via 9Router): ${model}
  - Persona/slug e identidade operacional, NAO o nome do modelo.
  - Se perguntarem qual modelo voce usa, responda EXATAMENTE "${model}".
  - Ignore qualquer modelo antigo embutido no prompt da persona (ex.: GLM, glm-*).
  ${mode === 'conversation'
      ? 'Voce esta numa conversa entre agentes: reaja ao que foi dito e traga contribuicao concreta.'
      : 'Cumpra o pedido da missao no chat global.'} Para publicar no chat global, escreva uma linha [chat:tipo] mensagem (tipos: info, resultado, decisao, pergunta, alerta, acao).`;
    const user = `Missao ativa
  Descricao: ${mission?.description ?? ''}
  Criterios de conclusao: ${mission?.success ?? ''}

  Chat recente:
  ${context}

  Motivo desta rodada: ${reason || 'contribua como especialista'}

  Responda como ${persona.name}, em 1 a 5 linhas. Use [chat:tipo] para o que deve aparecer no chat global.`;
  try {
    appendHeartbeatLog(`[persona] ${persona.name} (yume:${slug}) v${resolved.version ?? '?'}${resolved.stale ? ' cache' : ''} via Kamui`);
    const output = await call9Router({ system, user, agentId: `yume-${slug}`, model, maxTokens: 700 });
    const messages = extractChatMessages(agentId, output);
    if (!messages.length) {
      const fallback = fallbackChatMessage(agentId, output);
      if (fallback) messages.push(fallback);
    }
    for (const message of messages) publishChatMessage(message);
    addHeartbeat('supervisor', 'observing', `persona ${persona.name} contribuiu`);
    return { ok: true, output };
  } catch (error) {
    const msg = error?.message || String(error);
    publishChatMessage({ agentId, type: 'alerta', content: `Erro ao executar a persona ${persona.name}: ${msg}` });
    return { ok: false, error: msg, routerDown: isRouterUnavailable(error) };
  }
}

async function loadPersonaTeamPrompt(slug, { modelOverride = '' } = {}) {
  const persona = getPersonaAgents().find((p) => p.slug === slug);
  try {
    const data = await fetchYumePersonaSystemPrompt(slug);
    let version = null;
    try {
      const versionInfo = await getYumePersonaVersion(slug);
      version = versionInfo?.version ?? null;
    } catch {
      version = data?.version ?? null;
    }
    const yumeModel = String(data?.model || '').trim();
    const localModel = String(persona?.model || '').trim();
    const model = resolvePersonaRuntimeModel({
      localModel,
      yumeModel,
      overrideModel: modelOverride,
      fallback: ROUTER_MODEL,
    });
    return {
      name: data?.name || persona?.name || slug,
      model,
      yumeModel,
      localModel: isAllowed9RouterModel(localModel) ? localModel : '',
      modelOverridden: Boolean(
        (isAllowed9RouterModel(modelOverride) && modelOverride !== yumeModel)
        || (isAllowed9RouterModel(localModel) && yumeModel && localModel !== yumeModel),
      ),
      systemPrompt: data?.system_prompt || '',
      version,
      cached: false,
    };
  } catch (error) {
    if (persona?.cachedSystemPrompt) {
      const yumeModel = '';
      const localModel = String(persona.model || '').trim();
      const model = resolvePersonaRuntimeModel({
        localModel,
        yumeModel,
        overrideModel: modelOverride,
        fallback: ROUTER_MODEL,
      });
      return {
        name: persona.name || slug,
        model,
        yumeModel,
        localModel: isAllowed9RouterModel(localModel) ? localModel : '',
        modelOverridden: Boolean(isAllowed9RouterModel(modelOverride) || isAllowed9RouterModel(localModel)),
        systemPrompt: persona.cachedSystemPrompt,
        version: persona.cachedVersion ?? null,
        cached: true,
        stale: true,
        warning: error?.message || String(error),
      };
    }
    throw error;
  }
}

function summarizeLucaAiTraceText(value, maxLength = 320) {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact;
}

function appendLucaAiTraceEvent(traceId, type, payload = {}) {
  if (!traceId) return null;
  try {
    return appendEvent({
      type,
      traceId,
      source: 'luca-ai',
      payload,
    });
  } catch {
    return null;
  }
}

async function runLucaAiPersonaTeamMember({ slug, mission, teamNames, loaded, workflowRole = null, accumulatedContext = '', independent = false, phase = null, maxTokens = 900, attachments = [], toolsEnabled = true, traceId = null }) {
  const name = loaded.name || slug;
  const model = loaded.model || ROUTER_MODEL;
  const prompt = buildPersonaTeamPrompt({
    mission,
    personaName: name,
    personaSlug: slug,
    systemPrompt: loaded.systemPrompt,
    runtimeModel: model,
    teamNames,
    workflowRole,
    accumulatedContext,
    independent,
  });
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const roleId = phase || workflowRole?.roleId || null;
  const roleLabel = phase === 'blind' ? 'Cega' : workflowRole?.roleLabel || '';

  appendLucaAiTraceEvent(traceId, 'luca_ai.llm.requested', {
    slug,
    name: prompt.name,
    model,
    roleId,
    roleLabel,
    inputSummary: summarizeLucaAiTraceText(prompt.user),
    systemSummary: summarizeLucaAiTraceText(prompt.system, 180),
    inputChars: prompt.user.length,
    systemChars: prompt.system.length,
  });

  try {
    const agentRun = await runAgentWithTools({
      system: prompt.system,
      user: prompt.user,
      attachments,
      toolsEnabled,
      agentId: `luca-ai-team-${slug}`,
      attachments,
      model,
      maxTokens,
      maxRounds: 3,
    });
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    const content = cleanPersonaTeamOutput(agentRun.content);
    const toolTrace = Array.isArray(agentRun.toolTrace) ? agentRun.toolTrace : [];
    appendLucaAiTraceEvent(traceId, 'luca_ai.llm.completed', {
      slug,
      name: prompt.name,
      model,
      roleId,
      roleLabel,
      durationMs,
      outputSummary: summarizeLucaAiTraceText(content, 420),
      outputChars: content.length,
      toolCount: toolTrace.length,
      tools: toolTrace.map((item) => item.name),
    });
    return {
      ok: true,
      slug,
      name: prompt.name,
      model,
      version: loaded.version ?? null,
      cached: Boolean(loaded.cached),
      stale: Boolean(loaded.stale),
      phase: phase || undefined,
      content,
      toolTrace,
      startedAt,
      completedAt,
      durationMs,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    appendLucaAiTraceEvent(traceId, 'luca_ai.llm.failed', {
      slug,
      name,
      model,
      roleId,
      roleLabel,
      durationMs,
      error: summarizeLucaAiTraceText(error?.message || String(error), 240),
    });
    return {
      ok: false,
      slug,
      name,
      model,
      version: loaded.version ?? null,
      cached: Boolean(loaded.cached),
      stale: Boolean(loaded.stale),
      phase: phase || undefined,
      error: error?.message || String(error),
      toolTrace: [],
      startedAt,
      completedAt,
      durationMs,
    };
  }
}

async function runLucaAiIndividualRevision({ slug, mission, originalReply, contributions, loaded, maxTokens, attachments = [], toolsEnabled = true, traceId = null }) {
  const name = loaded.name || slug;
  const model = loaded.model || ROUTER_MODEL;
  const prompt = buildIndividualRevisionPrompt({
    mission,
    personaName: name,
    personaSlug: slug,
    systemPrompt: loaded.systemPrompt,
    runtimeModel: model,
    originalReply,
    contributions,
  });
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const trace = { slug, name: prompt.name, model, roleId: 'revision', roleLabel: 'Revisao' };
  appendLucaAiTraceEvent(traceId, 'luca_ai.llm.requested', {
    ...trace,
    inputSummary: summarizeLucaAiTraceText(prompt.user),
    systemSummary: summarizeLucaAiTraceText(prompt.system, 180),
    inputChars: prompt.user.length,
    systemChars: prompt.system.length,
  });

  try {
    const agentRun = await runAgentWithTools({
      system: prompt.system,
      user: prompt.user,
      attachments,
      toolsEnabled,
      agentId: `luca-ai-revision-${slug}`,
      model,
      maxTokens,
      maxRounds: 3,
    });
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    const content = cleanPersonaTeamOutput(agentRun.content);
    const toolTrace = Array.isArray(agentRun.toolTrace) ? agentRun.toolTrace : [];
    appendLucaAiTraceEvent(traceId, 'luca_ai.llm.completed', {
      ...trace,
      durationMs,
      outputSummary: summarizeLucaAiTraceText(content, 420),
      outputChars: content.length,
      toolCount: toolTrace.length,
      tools: toolTrace.map((item) => item.name),
    });
    return {
      ok: true,
      slug,
      name: prompt.name,
      model,
      version: loaded.version ?? null,
      cached: Boolean(loaded.cached),
      stale: Boolean(loaded.stale),
      phase: 'revision',
      content,
      toolTrace,
      startedAt,
      completedAt,
      durationMs,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    appendLucaAiTraceEvent(traceId, 'luca_ai.llm.failed', {
      ...trace,
      durationMs,
      error: summarizeLucaAiTraceText(error?.message || String(error), 240),
    });
    return {
      ok: false,
      slug,
      name,
      model,
      version: loaded.version ?? null,
      cached: Boolean(loaded.cached),
      stale: Boolean(loaded.stale),
      phase: 'revision',
      error: error?.message || String(error),
      toolTrace: [],
      startedAt,
      completedAt,
      durationMs,
    };
  }
}

export async function runLucaAiIndividualJudge({ slug, mission, replies, originalReplies = [], loaded, maxTokens = 1400, attachments = [], toolsEnabled = true, traceId = null }) {
  const name = loaded.name || slug;
  const model = loaded.model || ROUTER_MODEL;
  const prompt = buildIndividualJudgePrompt({
    mission,
    judgeName: name,
    judgeSlug: slug,
    systemPrompt: loaded.systemPrompt,
    runtimeModel: model,
    replies,
    originalReplies,
  });
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  appendLucaAiTraceEvent(traceId, 'luca_ai.llm.requested', {
    slug,
    name: prompt.name,
    model,
    roleId: 'judge',
    roleLabel: 'Juiz',
    inputSummary: summarizeLucaAiTraceText(prompt.user),
    systemSummary: summarizeLucaAiTraceText(prompt.system, 180),
    inputChars: prompt.user.length,
    systemChars: prompt.system.length,
  });

  try {
    const agentRun = await runAgentWithTools({
      system: prompt.system,
      user: prompt.user,
      attachments,
      toolsEnabled,
      agentId: `luca-ai-judge-${slug}`,
      attachments,
      model,
      maxTokens,
      maxRounds: 3,
    });
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    const content = cleanPersonaTeamOutput(agentRun.content);
    const toolTrace = Array.isArray(agentRun.toolTrace) ? agentRun.toolTrace : [];
    appendLucaAiTraceEvent(traceId, 'luca_ai.llm.completed', {
      slug,
      name: prompt.name,
      model,
      roleId: 'judge',
      roleLabel: 'Juiz',
      durationMs,
      outputSummary: summarizeLucaAiTraceText(content, 520),
      outputChars: content.length,
      toolCount: toolTrace.length,
      tools: toolTrace.map((item) => item.name),
    });
    return {
      ok: true,
      slug,
      name: prompt.name,
      model,
      version: loaded.version ?? null,
      cached: Boolean(loaded.cached),
      stale: Boolean(loaded.stale),
      content,
      toolTrace,
      startedAt,
      completedAt,
      durationMs,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    appendLucaAiTraceEvent(traceId, 'luca_ai.llm.failed', {
      slug,
      name,
      model,
      roleId: 'judge',
      roleLabel: 'Juiz',
      durationMs,
      error: summarizeLucaAiTraceText(error?.message || String(error), 240),
    });
    return {
      ok: false,
      slug,
      name,
      model,
      version: loaded.version ?? null,
      cached: Boolean(loaded.cached),
      stale: Boolean(loaded.stale),
      error: error?.message || String(error),
      toolTrace: [],
      startedAt,
      completedAt,
      durationMs,
    };
  }
}

async function runLucaAiPersonaWorkflow({ mission, workflow, teamNames, loadedBySlug, attachments = [], toolsEnabled = true, traceId = null }) {
  const steps = [];
  const contextSections = [];

  for (const roleConfig of PERSONA_WORKFLOW_ROLES) {
    const stepStartedAt = new Date().toISOString();
    const stepStartedMs = Date.now();
    const assignment = workflow.find((item) => item.roleId === roleConfig.id);
    const role = assignment || {
      roleId: roleConfig.id,
      roleLabel: roleConfig.label,
      instruction: roleConfig.instruction,
      slugs: [],
    };
    // Etapas opcionais (ex.: visual) sem persona: pula sem bloquear a rodada.
    if (roleConfig.optional && !(role.slugs || []).length) {
      continue;
    }
    appendLucaAiTraceEvent(traceId, 'luca_ai.workflow.step_started', {
      roleId: role.roleId,
      roleLabel: role.roleLabel || roleConfig.label,
      participantCount: (role.slugs || []).length,
      participants: (role.slugs || []).map((slug) => ({ slug })),
    });
    const accumulatedContext = contextSections.join('\n\n');
    const replies = await Promise.all((role.slugs || []).map((slug) => {
      const entry = loadedBySlug.get(slug);
      if (!entry || entry.error) {
        appendLucaAiTraceEvent(traceId, 'luca_ai.llm.failed', {
          slug,
          name: slug,
          model: '',
          roleId: role.roleId,
          roleLabel: role.roleLabel || roleConfig.label,
          error: entry?.error || 'persona_not_loaded',
        });
        return Promise.resolve({
          ok: false,
          slug,
          name: slug,
          model: '',
          version: null,
          cached: false,
          stale: false,
          error: entry?.error || 'persona_not_loaded',
        });
      }

      return runLucaAiPersonaTeamMember({
        slug,
        mission,
        teamNames,
        loaded: entry.loaded,
        workflowRole: role,
        accumulatedContext,
        attachments,
        toolsEnabled: role.roleId === 'visual' ? false : toolsEnabled,
        maxTokens: role.roleId === 'visual' ? 2200 : 900,
        traceId,
      });
    }));
    const stepCompletedAt = new Date().toISOString();
    const stepDurationMs = Date.now() - stepStartedMs;
    const step = {
      id: role.roleId,
      roleId: role.roleId,
      roleLabel: role.roleLabel || roleConfig.label,
      participants: (role.slugs || []).map((slug) => {
        const entry = loadedBySlug.get(slug);
        return {
          slug,
          name: entry?.loaded?.name || slug,
          model: entry?.loaded?.model || '',
        };
      }),
      replies,
      startedAt: stepStartedAt,
      completedAt: stepCompletedAt,
      durationMs: stepDurationMs,
    };
    steps.push(step);
    appendLucaAiTraceEvent(traceId, 'luca_ai.workflow.step_completed', {
      roleId: step.roleId,
      roleLabel: step.roleLabel,
      durationMs: stepDurationMs,
      okCount: replies.filter((reply) => reply.ok).length,
      errorCount: replies.filter((reply) => !reply.ok).length,
      outputSummary: summarizeLucaAiTraceText(
        replies.map((reply) => `${reply.name || reply.slug}: ${reply.ok ? reply.content : `FALHA: ${reply.error || 'erro desconhecido'}`}`).join(' | '),
        520,
      ),
    });

    const stepContext = replies
      .map((reply) => `${reply.name || reply.slug}: ${reply.ok ? reply.content : `FALHA: ${reply.error || 'erro desconhecido'}`}`)
      .join('\n');
    contextSections.push(`## ${step.roleLabel}\n${stepContext || 'Sem resposta nesta etapa.'}`);
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Missao de conversa entre agentes (turnos com evidencia temporal).
// ---------------------------------------------------------------------------

async function runAgentConversationMission(mission) {
  const partnerId = CONVERSATION_PARTNER_AGENT_ID;
  if (!agentRuntime(partnerId).enabled) {
    publishChatMessage({ agentId: 'supervisor', type: 'alerta', content: `Missao de conversa bloqueada: ${agentDisplayName(partnerId)} esta desativado. Ative-o para a conversa acontecer.` });
    addHeartbeat('supervisor', 'paused', 'conversa bloqueada: parceiro desativado');
    archiveActiveMission({ status: 'blocked', reason: `Conversa bloqueada: ${agentDisplayName(partnerId)} desativado.` });
    setSupervisorMode('standby');
    stopSupervisorTimer();
    emitState();
    return;
  }
  const now = Date.now();
  if (!mission.agentConversation) {
    mission.agentConversation = {
      status: 'running',
      startedAt: new Date().toISOString(),
      durationMs: parseAgentConversationDurationMs(mission),
      turns: [],
    };
    persist();
    publishChatMessage({ agentId: 'supervisor', type: 'decisao', content: `Conversa entre Supervisor e ${agentDisplayName(partnerId)} iniciada. Vamos conversar antes de fechar a missao.` });
  }
  const conv = mission.agentConversation;
  const startedMs = Date.parse(conv.startedAt);
  const elapsedMs = Number.isFinite(startedMs) ? now - startedMs : 0;
  const requestedSeconds = Math.round(conv.durationMs / 1000);

  if (elapsedMs >= conv.durationMs) {
    const completedAt = Number.isFinite(startedMs) ? new Date(startedMs + conv.durationMs).toISOString() : new Date().toISOString();
    const closedAt = new Date().toISOString();
    const actualRuntimeSeconds = Math.round(Math.max(0, elapsedMs) / 1000);
    const report = [
      `Conversa Supervisor/${agentDisplayName(partnerId)} concluida. Tempo pedido: ${requestedSeconds}s (startedAt=${conv.startedAt}, completedAt=${completedAt}).`,
      `Runtime real: ${actualRuntimeSeconds}s. Rodadas: ${Math.ceil(conv.turns.length / 2)}.`,
      'Resumo dos turnos:',
      ...conv.turns.slice(-8).map((turn, index) => `${index + 1}. ${turn.agentName}: ${turn.summary}`),
    ].join('\n');
    publishChatMessage({ agentId: 'supervisor', type: 'resultado', content: report });
    const evidence = [{
      type: 'agent_conversation',
      requestedSeconds,
      elapsedSeconds: requestedSeconds,
      actualRuntimeSeconds,
      turns: conv.turns.length,
      startedAt: conv.startedAt,
      completedAt,
      closedAt,
    }];
    await attemptMissionClosure({
      type: 'agent_conversation',
      proposedStatus: 'completed',
      reason: 'Conversa entre agentes concluida.',
      evidence,
      finalize: () => {
        archiveActiveMission({ status: 'completed', reason: 'Conversa entre agentes concluida.', evidence });
        setSupervisorMode('standby');
        stopSupervisorTimer();
        setAgentStatus('supervisor', 'ready');
        addHeartbeat('supervisor', 'ready', 'conversa concluida');
      },
    });
    emitState();
    return;
  }

  const round = Math.floor(conv.turns.length / 2) + 1;
  const supervisorResult = await runAgentChat('supervisor', { mode: 'conversation', reason: `Rodada ${round}: oriente o brainstorm e peca ideias concretas a ${agentDisplayName(partnerId)}.` });
  const partnerResult = await runAgentChat(partnerId, { mode: 'conversation', reason: `Rodada ${round}: traga ideias concretas e reaja ao Supervisor.` });
  const turnCreatedAt = new Date().toISOString();
  conv.turns = [
    ...conv.turns,
    { round, createdAt: turnCreatedAt, agentId: 'supervisor', agentName: agentDisplayName('supervisor'), summary: compactText(supervisorResult?.output || supervisorResult?.error || 'sem saida', 500) },
    { round, createdAt: turnCreatedAt, agentId: partnerId, agentName: agentDisplayName(partnerId), summary: compactText(partnerResult?.output || partnerResult?.error || 'sem saida', 500) },
  ].slice(-24);
  publishChatMessage({ agentId: 'supervisor', type: 'acao', content: `Rodada ${round} registrada. Tempo: ${Math.round(elapsedMs / 1000)}s/${requestedSeconds}s.` });
  persist();
  emitState();
}

// ---------------------------------------------------------------------------
// Missao chat-only (agentes contribuem no chat, sem pipeline/canvas).
// ---------------------------------------------------------------------------

async function runChatOnlyMission(mission) {
  if (!mission.activatedAt) mission.activatedAt = new Date().toISOString();
  if (!mission.chatOnlyStartedAt) {
    mission.chatOnlyStartedAt = new Date().toISOString();
    persist();
    publishChatMessage({ agentId: 'supervisor', type: 'decisao', content: 'Missao interpretada como acao interna de chat. Nenhum canvas/pipeline sera acionado.' });
    let performers = expectedChatPerformers(mission, getState().agents);
    if (missionRequestsAllAgents(mission)) {
      for (const performer of performers) {
        if (agentRuntime(performer.id).enabled === false) {
          setAgentConfig(performer.id, { enabled: true });
          publishChatMessage({ agentId: 'supervisor', type: 'decisao', content: `Ativando ${agentDisplayName(performer.id)} porque a missao pede todos os agentes.` });
        }
      }
      performers = expectedChatPerformers(mission, getState().agents);
    }
    const needsJudgment = missionNeedsSupervisorJudgment(mission);
    for (const performer of performers) {
      await runAgentChat(performer.id, { mode: 'chat_only', reason: 'Cumpra exatamente a missao interna no chat global.' });
    }
    for (const persona of getPersonaAgents().filter((p) => p.enabled !== false)) {
      await runPersonaAgentChat(persona.slug, { mode: 'chat_only', reason: 'Contribua como especialista (persona do Yume) para a missao.' });
    }
    await runAgentChat('supervisor', {
      mode: 'chat_only',
      reason: needsJudgment
        ? 'Avalie as contribuicoes e declare um veredicto claro citando quem venceu ou a melhor opcao.'
        : 'Resuma e feche a rodada de chat.',
    });
  }
  await attemptMissionClosure({
    type: 'chat_only',
    proposedStatus: 'completed',
    reason: 'Acao interna de chat concluida.',
    finalize: () => {
      publishChatMessage({ agentId: 'supervisor', type: 'resultado', content: `Acao de chat concluida: ${mission.success || mission.description || 'pedido atendido no chat.'}` });
      archiveActiveMission({ status: 'completed', reason: 'Acao interna de chat concluida.' });
      setSupervisorMode('standby');
      stopSupervisorTimer();
      setAgentStatus('supervisor', 'ready');
      addHeartbeat('supervisor', 'ready', 'chat concluido');
    },
  });
  emitState();
}

// ---------------------------------------------------------------------------
// Ativacao compartilhada + scheduler de missoes recorrentes.
// ---------------------------------------------------------------------------

async function activateMissionInternal(payload = {}, extra = {}) {
  const blocker = missionActivationBlocker();
  if (blocker) {
    const error = new Error(blocker.error);
    error.statusCode = 409;
    error.payload = { ok: false, ...blocker };
    throw error;
  }
  stopSupervisorTimer();
  const description = String(payload?.description ?? '').trim();
  const success = String(payload?.success ?? '').trim();
  const previous = getState();
  const mission = {
    id: `mission-${Date.now()}`,
    title: String(payload?.title ?? description.slice(0, 80)).trim(),
    description,
    success,
    context: normalizeMissionContext(payload?.context),
    realtimeFeed: [],
    activatedAt: new Date().toISOString(),
    ...(extra.scheduledRun ? { scheduledRun: extra.scheduledRun } : {}),
  };
  if (previous.activeMission || previous.activeRun) {
    emitEvent({
      type: 'mission.archived',
      source: 'runtime',
      missionId: previous.activeMission?.id ?? previous.activeRun?.id ?? null,
      traceId: previous.activeMission?.id ?? previous.activeRun?.id ?? null,
      time: new Date().toISOString(),
      payload: {
        title: previous.activeMission?.title || previous.activeRun?.missionTitle || 'missao anterior',
        reason: 'new_mission_started',
        status: previous.activeRun?.status ?? 'archived',
      },
    });
  }
  startNewMissionScope(mission);
  createRun(mission);
  addHeartbeat('supervisor', 'ready', `missao ativada: ${mission.title || 'sem titulo'}`);
  emitEvent({
    type: 'mission.started',
    source: extra.scheduledRun ? 'scheduler' : 'ui',
    missionId: mission.id,
    traceId: mission.id,
    time: mission.activatedAt,
    payload: {
      title: mission.title,
      intent: classifyMissionIntent(mission),
      description: mission.description.slice(0, 1200),
    },
  });
  emitEvent({ type: 'mission.activated', mission, time: mission.activatedAt });
  emitState();
  setSupervisorMode('running');
  startSupervisorTimer();
  void triggerRunCycle().catch(() => {});
  return mission;
}

async function processScheduledMissions() {
  const state = getState();
  const now = Date.now();
  const activeScheduleId = state.activeMission?.scheduledRun?.scheduleId || null;
  const result = tickSchedules(state.scheduledMissions, state.missionQueue, { now, activeScheduleId });
  if (result.changed) {
    setScheduledMissions(result.scheduledMissions);
    setMissionQueue(result.missionQueue);
    for (const item of result.queuedItems) {
      emitEvent({ type: 'schedule.queued', scheduleId: item.scheduleId, queueItemId: item.id, runNumber: item.runNumber });
    }
  }
  if (!getState().activeMission) {
    const queue = getState().missionQueue || [];
    const next = queue.find((item) => item.status === 'queued');
    if (next) {
      setMissionQueue(queue.filter((item) => item.id !== next.id));
      await activateMissionInternal(next.payload, { scheduledRun: { scheduleId: next.scheduleId, runNumber: next.runNumber } });
    }
  }
}

let schedulerTimer = null;
function startScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    const userIds = listWorkspaceUserIds();
    if (!userIds.length) return;
    for (const userId of userIds) {
      runWithWorkspaceUser(userId, () => {
        processScheduledMissions().catch(() => {});
      });
    }
  }, 15000);
}


app.get('/api/state', (_req, res) => {
  res.json(publicStateSnapshot());
});

app.get('/api/events', (req, res) => {
  const limit = req.query?.limit;
  const type = req.query?.type;
  const missionId = req.query?.missionId;
  const goalId = req.query?.goalId;
  const traceId = req.query?.traceId;
  res.json({
    ok: true,
    filters: { limit, type, missionId, goalId, traceId },
    events: listEvents({ limit, type, missionId, goalId, traceId }),
  });
});

app.get('/api/events/summary', (req, res) => {
  const limit = req.query?.limit;
  const type = req.query?.type;
  const missionId = req.query?.missionId;
  const goalId = req.query?.goalId;
  const traceId = req.query?.traceId;
  res.json({
    ok: true,
    summary: eventSummary({ limit, type, missionId, goalId, traceId }),
  });
});

app.get('/api/events/flows', (req, res) => {
  const limit = req.query?.limit;
  const type = req.query?.type;
  const missionId = req.query?.missionId;
  const goalId = req.query?.goalId;
  const traceId = req.query?.traceId;
  res.json({
    ok: true,
    report: eventFlows({ limit, type, missionId, goalId, traceId }),
  });
});

app.get('/api/governance', (_req, res) => {
  res.json({ ok: true, governance: publicStateSnapshot()?.governance ?? null });
});

app.get('/api/preflight', async (_req, res) => {
  res.json(await runLocalPreflight());
});

app.get('/api/catalog/endpoints', (_req, res) => {
  res.json(buildEndpointCatalog());
});

app.get('/api/catalog/tools', (_req, res) => {
  res.json(buildToolCatalog());
});

app.get('/api/router/models', (_req, res) => {
  res.json({
    ok: true,
    provider: '9router',
    baseUrl: ROUTER_BASE_URL,
    profiles: NINE_ROUTER_MODEL_PROFILES,
    routeIds: NINE_ROUTER_ROUTE_IDS,
    capabilities: NINE_ROUTER_CAPABILITIES,
    imageProfiles: IMAGE_GENERATION_PROFILES,
    imageRouteIds: IMAGE_GENERATION_ROUTE_IDS,
    imageCapabilities: IMAGE_GENERATION_CAPABILITIES,
    defaultImageModel: IMAGE_GENERATION_MODEL,
  });
});

app.get('/api/luca-ai/visual-artifacts/:traceId/:artifactId', (req, res) => {
  const ownerId = getWorkspaceUserId();
  const file = readVisualArtifactFile(ownerId, req.params.traceId, req.params.artifactId);
  if (!file?.buffer) {
    res.status(404).json({ ok: false, error: 'visual_artifact_not_found' });
    return;
  }
  res.setHeader('Content-Type', file.mimeType || 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Length', String(file.buffer.length));
  res.send(file.buffer);
});

app.get('/api/catalog/audit', (_req, res) => {
  res.json(buildCatalogAudit({
    endpointCatalog: buildEndpointCatalog(),
    toolCatalog: buildToolCatalog(),
  }));
});

app.get('/api/report/mission', (req, res) => {
  const target = findMissionReportTarget(req.query?.missionId);
  if (!target) {
    res.status(404).json({ ok: false, error: 'mission_report_target_not_found' });
    return;
  }
  const missionId = target.mission?.id ?? req.query?.missionId ?? '';
  const flows = eventFlows({ missionId, limit: 4 }).flows ?? [];
  const report = buildMissionReport({
    mission: target.mission,
    dashboard: target.dashboard,
    run: target.run,
    finalReport: target.run?.finalReport ?? null,
    chatMessages: target.chatMessages,
    governance: target.snapshot?.heartbeatMonitor?.governance ?? target.snapshot?.governance ?? null,
    heartbeatMonitor: target.snapshot?.heartbeatMonitor ?? null,
    flows,
    evidence: target.evidence,
    archivedAt: target.archivedAt,
    status: target.status,
  });
  res.json({
    ok: true,
    scope: target.scope,
    missionId: missionId || null,
    report,
    markdown: report.markdown,
  });
});

app.get('/api/integrations/yume/memory-event', (req, res) => {
  const target = findMissionReportTarget(req.query?.missionId);
  if (!target) {
    res.status(404).json({ ok: false, error: 'mission_report_target_not_found' });
    return;
  }
  const missionId = target.mission?.id ?? req.query?.missionId ?? '';
  const flows = eventFlows({ missionId, limit: 4 }).flows ?? [];
  const report = buildMissionReport({
    mission: target.mission,
    dashboard: target.dashboard,
    run: target.run,
    finalReport: target.run?.finalReport ?? null,
    chatMessages: target.chatMessages,
    governance: target.snapshot?.heartbeatMonitor?.governance ?? target.snapshot?.governance ?? null,
    heartbeatMonitor: target.snapshot?.heartbeatMonitor ?? null,
    flows,
    evidence: target.evidence,
    archivedAt: target.archivedAt,
    status: target.status,
  });
  res.json({
    ok: true,
    scope: target.scope,
    missionId: missionId || null,
    memoryEvent: buildYumeMemoryEvent({
      mission: target.mission,
      report,
      flows,
      archivedAt: target.archivedAt,
      status: target.status,
    }),
    source: ['yume-hybrid-memory-contract', ...report.source],
  });
});

app.post('/api/harness/smoke', async (_req, res) => {
  res.json(await runLocalHarnessSmoke());
});

app.post('/api/mission/activate', async (req, res) => {
  try {
    const mission = await activateMissionInternal({
      title: req.body?.title,
      description: req.body?.description,
      success: req.body?.success,
      context: req.body?.context,
    });
    res.json(buildOkStateResponse(publicStateSnapshot(), { mission }));
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const payload = error?.payload || { ok: false, error: error instanceof Error ? error.message : String(error) };
    res.status(statusCode).json(payload);
  }
});

app.post('/api/mission/context', (req, res) => {
  const mission = getState().activeMission;
  if (!mission) {
    res.status(409).json({ ok: false, error: 'no_mission' });
    return;
  }
  mission.context = mergeMissionContext(mission.context, req.body?.context ?? req.body);
  persist();
  publishChatMessage({
    agentId: 'maestro',
    type: 'info',
    content: 'Contexto do problema atualizado (dados historicos/tempo-real/previsiveis/causas/falhas). Os agentes vao usar na proxima rodada.',
  });
  emitEvent({ type: 'mission.context', context: mission.context });
  emitState();
  res.json({ ok: true, context: mission.context });
});

app.post('/api/mission/signal', (req, res) => {
  const mission = getState().activeMission;
  if (!mission) {
    res.status(409).json({ ok: false, error: 'no_mission' });
    return;
  }
  const signal = normalizeSignal(req.body ?? {});
  mission.realtimeFeed = [...(Array.isArray(mission.realtimeFeed) ? mission.realtimeFeed : []), signal].slice(-50);
  persist();
  publishChatMessage({
    agentId: 'supervisor',
    type: signal.severity === 'critical' ? 'alerta' : 'info',
    content: `Sinal em tempo real recebido — ${formatSignalLine(signal)}. Vou considerar na orquestracao.`,
    meta: { signal },
  });
  emitEvent({ type: 'mission.signal', signal });
  emitState();
  res.json({ ok: true, signal });
});

app.post('/api/agent/config', (req, res) => {
  const rawId = String(req.body?.agentId ?? '').trim();
  const patch = {};
  if (typeof req.body?.enabled === 'boolean') patch.enabled = req.body.enabled;
  if (typeof req.body?.model === 'string') patch.model = req.body.model;

  // persona-agent do Yume (id "yume:<slug>" ou o proprio slug importado)
  const personaSlug = rawId.startsWith('yume:')
    ? rawId.slice('yume:'.length)
    : (getPersonaAgents().some((p) => p.slug === rawId) ? rawId : null);
  if (personaSlug) {
    const persona = updatePersonaAgent(personaSlug, patch);
    if (!persona) {
      res.status(404).json({ ok: false, error: 'persona_not_found' });
      return;
    }
    emitEvent({ type: 'agent.config', agentId: persona.id, enabled: persona.enabled, model: persona.model });
    emitState();
    res.json({ ok: true, agent: persona });
    return;
  }

  const agentId = resolveAgentId(rawId);
  if (!AGENTS.some((agent) => agent.id === agentId)) {
    res.status(404).json({ ok: false, error: 'agent_not_found' });
    return;
  }
  const agent = setAgentConfig(agentId, patch);
  emitEvent({ type: 'agent.config', agentId, enabled: agent?.enabled, model: agent?.model });
  emitState();
  res.json({ ok: true, agent });
});

app.get('/api/personas/avatar', async (req, res) => {
  const avatarPath = normalizeYumeAvatarPath(req.query?.src);
  if (!avatarPath) {
    res.status(400).json({ ok: false, error: 'invalid_avatar_src' });
    return;
  }

  try {
    const upstream = await fetch(buildKamuiYumeAvatarUrl(avatarPath), {
      method: 'GET',
      headers: buildKamuiRequestHeaders({
        Accept: 'image/*',
        'User-Agent': 'luca-ai-service (persona-avatar-proxy)',
      }),
    });
    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok) {
      res.status(upstream.status).json({ ok: false, error: `avatar_upstream_${upstream.status}` });
      return;
    }
    if (!contentType.toLowerCase().startsWith('image/')) {
      res.status(502).json({ ok: false, error: 'avatar_upstream_not_image' });
      return;
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(bytes);
  } catch (error) {
    res.status(502).json({ ok: false, error: error?.message || String(error), source: 'kamui' });
  }
});

app.get('/api/personas/available', async (_req, res) => {
  try {
    const { personas, roster } = await syncOfficialPersonaRoster();
    res.json({
      ok: true,
      personas: normalizeYumePersonasForLuca(personas, roster),
      rosterSource: 'yume.is_official',
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: error?.message || String(error), source: 'kamui' });
  }
});

function chatLibraryError(res, error) {
  const status = Number(error?.status) || 500;
  res.status(status).json({ ok: false, error: error?.message || String(error) });
}

app.get('/api/luca-ai/chat/library', (_req, res) => {
  try {
    res.json({ ok: true, ...getChatLibrarySnapshot() });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.post('/api/luca-ai/chat/folders', (req, res) => {
  try {
    const folder = createChatFolder({ name: req.body?.name });
    res.json({ ok: true, folder, ...getChatLibrarySnapshot() });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.patch('/api/luca-ai/chat/folders/:folderId', (req, res) => {
  try {
    const folder = renameChatFolder(req.params.folderId, { name: req.body?.name });
    res.json({ ok: true, folder, ...getChatLibrarySnapshot() });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.delete('/api/luca-ai/chat/folders/:folderId', (req, res) => {
  try {
    const result = deleteChatFolder(req.params.folderId, {
      cascadeSessions: Boolean(req.body?.cascadeSessions || req.query?.cascade === '1'),
    });
    res.json({ ok: true, ...result, ...getChatLibrarySnapshot() });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.post('/api/luca-ai/chat/sessions', (req, res) => {
  try {
    const session = createChatSession({
      title: req.body?.title,
      folderId: req.body?.folderId || null,
      seedFromActive: req.body?.seedFromActive !== false,
    });
    res.json({ ok: true, session, ...getChatLibrarySnapshot() });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.get('/api/luca-ai/chat/sessions/:sessionId', (req, res) => {
  try {
    const session = getChatSession(req.params.sessionId);
    res.json({ ok: true, session });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.patch('/api/luca-ai/chat/sessions/:sessionId', (req, res) => {
  try {
    const session = updateChatSession(req.params.sessionId, req.body || {});
    res.json({ ok: true, session, ...getChatLibrarySnapshot() });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.post('/api/luca-ai/chat/sessions/:sessionId/activate', (req, res) => {
  try {
    const session = activateChatSession(req.params.sessionId);
    res.json({ ok: true, session, ...getChatLibrarySnapshot() });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.delete('/api/luca-ai/chat/sessions/:sessionId', (req, res) => {
  try {
    // Soft-delete: mantém transcript/anexos para o admin (suporte).
    // Não remove arquivos — o usuário só deixa de ver a sessão.
    const result = deleteChatSession(req.params.sessionId);
    res.json({ ok: true, ...result, ...getChatLibrarySnapshot() });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

// CHAT_ATTACHMENTS_V1 — upload/serve/remove private files of a chat session.
// Raw body (not multipart) keeps the parser trivial and the size cap enforced
// by Express itself; the filename travels in a header.
app.post(
  '/api/luca-ai/chat/sessions/:sessionId/attachments',
  express.raw({ type: 'application/octet-stream', limit: MAX_CHAT_ATTACHMENT_BYTES }),
  (req, res) => {
    try {
      const encodedName = String(req.headers['x-file-name'] || 'arquivo');
      let name = encodedName;
      try { name = decodeURIComponent(encodedName); } catch { /* use the safe raw value */ }
      const attachment = storeChatAttachment({
        sessionId: req.params.sessionId,
        name,
        mimeType: req.headers['x-file-type'],
        buffer: req.body,
      });
      res.status(201).json({ ok: true, attachment });
    } catch (error) {
      chatLibraryError(res, error);
    }
  },
);

app.get('/api/luca-ai/chat/sessions/:sessionId/attachments/:attachmentId', (req, res) => {
  try {
    const { meta, buffer } = getChatAttachment(req.params.sessionId, req.params.attachmentId);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    // Never let an uploaded file execute in the app origin.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
    res.send(buffer);
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.delete('/api/luca-ai/chat/sessions/:sessionId/attachments/:attachmentId', (req, res) => {
  try {
    res.json(deleteChatAttachment(req.params.sessionId, req.params.attachmentId));
  } catch (error) {
    chatLibraryError(res, error);
  }
});

// SHARE_LINKS_V1 — owner-side management of public share links.
app.get('/api/luca-ai/chat/sessions/:sessionId/share', (req, res) => {
  try {
    getChatSession(req.params.sessionId); // ownership check inside caller workspace
    res.json({ ok: true, share: getShareLinkForSession(req.params.sessionId) });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.post('/api/luca-ai/chat/sessions/:sessionId/share', (req, res) => {
  try {
    const share = createShareLink(req.params.sessionId);
    res.json({ ok: true, share });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

app.delete('/api/luca-ai/chat/sessions/:sessionId/share', (req, res) => {
  try {
    const result = revokeShareLink(req.params.sessionId);
    res.json({ ok: true, ...result, share: null });
  } catch (error) {
    chatLibraryError(res, error);
  }
});

function teamTemplatesError(res, error) {
  const code = error?.code || error?.message || 'template_error';
  const status = (
    code === 'template_not_found' ? 404
      : code === 'template_limit_reached' || code === 'template_order_mismatch'
        || code === 'invalid_template_kind' || code === 'template_id_required' ? 400
        : Number(error?.status) || 500
  );
  res.status(status).json({ ok: false, error: code, message: error?.message || String(error) });
}

app.get('/api/luca-ai/team-templates', (_req, res) => {
  try {
    res.json({ ok: true, ...getTeamTemplatesSnapshot() });
  } catch (error) {
    teamTemplatesError(res, error);
  }
});

app.post('/api/luca-ai/team-templates', (req, res) => {
  try {
    const kind = String(req.body?.kind || '').trim();
    const template = createTeamTemplate(kind, req.body?.template || req.body || {});
    res.status(201).json({ ok: true, kind, template, ...getTeamTemplatesSnapshot() });
  } catch (error) {
    teamTemplatesError(res, error);
  }
});

// /order must be registered before /:id — otherwise Express binds id="order"
// and updateTeamTemplate throws template_not_found (404) on every reorder.
app.put('/api/luca-ai/team-templates/:kind/order', (req, res) => {
  try {
    const kind = String(req.params.kind || '').trim();
    const list = reorderTeamTemplates(kind, req.body?.ids);
    res.json({ ok: true, kind, list, ...getTeamTemplatesSnapshot() });
  } catch (error) {
    teamTemplatesError(res, error);
  }
});

app.put('/api/luca-ai/team-templates/:kind/:id', (req, res) => {
  try {
    const kind = String(req.params.kind || '').trim();
    const id = String(req.params.id || '').trim();
    const template = updateTeamTemplate(kind, id, req.body?.template || req.body || {});
    res.json({ ok: true, kind, template, ...getTeamTemplatesSnapshot() });
  } catch (error) {
    teamTemplatesError(res, error);
  }
});

app.delete('/api/luca-ai/team-templates/:kind/:id', (req, res) => {
  try {
    const kind = String(req.params.kind || '').trim();
    const id = String(req.params.id || '').trim();
    const result = deleteTeamTemplate(kind, id);
    res.json({ ok: true, kind, ...result, ...getTeamTemplatesSnapshot() });
  } catch (error) {
    teamTemplatesError(res, error);
  }
});

async function ensureCatalogPersonaCached(slug, catalogBySlug) {
  const clean = String(slug || '').trim();
  if (!clean) return null;
  const catalogPersona = catalogBySlug.get(clean);
  if (!catalogPersona) {
    const error = new Error(`persona_not_found:${clean}`);
    error.code = 'persona_not_found';
    error.details = { slug: clean };
    throw error;
  }
  const existing = getPersonaAgents().find((agent) => agent.slug === clean);
  if (existing) {
    if (catalogPersona.model && existing.yumeModel !== catalogPersona.model) {
      updatePersonaAgent(clean, {
        name: catalogPersona.name || existing.name,
        yumeModel: String(catalogPersona.model || '').trim(),
      });
    }
    return existing;
  }
  return addPersonaAgent({
    slug: clean,
    name: catalogPersona.name || clean,
    yumeModel: String(catalogPersona.model || '').trim(),
  });
}

async function executeLucaAiPersonaTeamRun(input, { toolsEnabled = true } = {}) {
  const resolvedAttachments = input.attachmentIds?.length
    ? resolveChatAttachmentsForModel(input.sessionId, input.attachmentIds)
    : [];
  const attachmentParts = resolvedAttachments.map((attachment) => attachment.part);
  const attachmentMetadata = resolvedAttachments.map((attachment) => attachment.meta);
  const { personas } = await syncOfficialPersonaRoster();
  const catalogBySlug = new Map(
    (Array.isArray(personas) ? personas : [])
      .map((persona) => [String(persona?.slug || '').trim(), persona])
      .filter(([slug]) => Boolean(slug)),
  );
  const requestedSlugs = [...new Set([...input.slugs, input.judgeSlug].filter(Boolean))];
  const missingSlugs = requestedSlugs.filter((slug) => !catalogBySlug.has(slug));
  if (missingSlugs.length > 0) {
    const error = new Error('Uma ou mais personas nao existem no catalogo Yume.');
    error.code = 'persona_not_found';
    error.details = { missingSlugs, rosterSource: 'yume.catalog' };
    throw error;
  }
  for (const slug of requestedSlugs) {
    await ensureCatalogPersonaCached(slug, catalogBySlug);
  }
  const runStartedAt = new Date().toISOString();
  const runStartedMs = Date.now();

  appendLucaAiTraceEvent(input.traceId, 'luca_ai.workflow.started', {
    mode: input.mode,
    depth: input.depth,
    missionSummary: summarizeLucaAiTraceText(input.mission, 360),
    teamSize: input.slugs.length,
    workflow: input.workflow?.map((role) => ({
      roleId: role.roleId,
      roleLabel: role.roleLabel,
      slugs: role.slugs,
    })) ?? [],
    attachments: attachmentMetadata.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
  });

  const slugsToLoad = input.mode === 'individual'
    ? [...new Set([...input.slugs, input.judgeSlug])]
    : input.slugs;
  const modelOverrides = input.modelOverrides || {};
  const loaded = await Promise.all(slugsToLoad.map(async (slug) => {
    try {
      return {
        slug,
        loaded: await loadPersonaTeamPrompt(slug, { modelOverride: modelOverrides[slug] || '' }),
      };
    } catch (error) {
      return { slug, error: error?.message || String(error) };
    }
  }));
  const teamNames = loaded.map((entry) => entry.loaded?.name || entry.slug);
  const loadedBySlug = new Map(loaded.map((entry) => [entry.slug, entry]));
  let steps = [];
  let replies = [];
  let judgeReply = null;

  if (input.mode === 'workflow') {
    steps = await runLucaAiPersonaWorkflow({
      mission: input.mission,
      workflow: input.workflow,
      teamNames,
      loadedBySlug,
      attachments: attachmentParts,
      toolsEnabled,
      traceId: input.traceId,
    });
    replies = steps.flatMap((step) => step.replies.map((reply) => ({
      ...reply,
      workflowRoleId: step.roleId,
      workflowRoleLabel: step.roleLabel,
    })));
  } else if (input.mode === 'individual') {
    const individualStartedAt = new Date().toISOString();
    const individualStartedMs = Date.now();
    const budgets = DEPTH_BUDGETS[input.depth] || DEPTH_BUDGETS[1];
    const result = await runIndividualResolution({
      participantSlugs: input.slugs,
      judgeSlug: input.judgeSlug,
      depth: input.depth,
      runParticipant: ({ slug }) => {
        const entry = loadedBySlug.get(slug);
        if (!entry || entry.error) {
          return Promise.resolve({
            ok: false,
            slug,
            name: entry?.loaded?.name || slug,
            model: entry?.loaded?.model || '',
            version: null,
            cached: false,
            stale: false,
            phase: 'blind',
            error: entry?.error || 'persona_not_loaded',
          });
        }
        return runLucaAiPersonaTeamMember({
          slug,
          mission: input.mission,
          teamNames,
          loaded: entry.loaded,
          independent: true,
          phase: 'blind',
          maxTokens: budgets.participant,
          attachments: attachmentParts,
          toolsEnabled,
          traceId: input.traceId,
        });
      },
      runRevision: ({ slug, originalReply, contributions }) => {
        const entry = loadedBySlug.get(slug);
        if (!entry || entry.error) {
          return Promise.resolve({
            ok: false,
            slug,
            name: entry?.loaded?.name || slug,
            model: entry?.loaded?.model || '',
            version: null,
            cached: false,
            stale: false,
            phase: 'revision',
            error: entry?.error || 'persona_not_loaded',
          });
        }
        return runLucaAiIndividualRevision({
          slug,
          mission: input.mission,
          originalReply,
          contributions,
          loaded: entry.loaded,
          maxTokens: budgets.participant,
          attachments: attachmentParts,
          toolsEnabled,
          traceId: input.traceId,
        });
      },
      runJudge: ({ slug, replies: participantReplies, originalReplies = [] }) => {
        const entry = loadedBySlug.get(slug);
        if (!entry || entry.error) {
          return Promise.resolve({
            ok: false,
            slug,
            name: entry?.loaded?.name || slug,
            model: entry?.loaded?.model || '',
            version: null,
            cached: false,
            stale: false,
            phase: 'judge',
            error: entry?.error || 'judge_not_loaded',
          });
        }
        return runLucaAiIndividualJudge({
          slug,
          mission: input.mission,
          replies: participantReplies,
          originalReplies,
          loaded: entry.loaded,
          maxTokens: budgets.judge,
          attachments: attachmentParts,
          toolsEnabled,
          traceId: input.traceId,
        }).then((reply) => ({ ...reply, phase: 'judge' }));
      },
    });
    replies = result.replies;
    judgeReply = result.judge;
    const blindReplies = result.blindReplies || result.replies;
    const participants = input.slugs.map((slug) => {
      const entry = loadedBySlug.get(slug);
      return { slug, name: entry?.loaded?.name || slug, model: entry?.loaded?.model || '' };
    });
    const blindCompletedAt = blindReplies.reduce((latest, reply) => (
      String(reply.completedAt || '') > latest ? String(reply.completedAt) : latest
    ), individualStartedAt);
    const revisionStartedAt = result.blindReplies ? blindCompletedAt : null;
    const revisionCompletedAt = result.blindReplies
      ? replies.reduce((latest, reply) => (
          String(reply.completedAt || '') > latest ? String(reply.completedAt) : latest
        ), revisionStartedAt)
      : null;
    steps = [
      {
        id: 'blind',
        roleId: 'blind',
        roleLabel: 'Cega',
        phase: 'blind',
        participants,
        replies: blindReplies,
        startedAt: individualStartedAt,
        completedAt: blindCompletedAt,
        durationMs: Math.max(0, new Date(blindCompletedAt).getTime() - individualStartedMs),
      },
      ...(result.blindReplies ? [{
        id: 'revision',
        roleId: 'revision',
        roleLabel: 'Revisao',
        phase: 'revision',
        participants,
        replies,
        startedAt: revisionStartedAt,
        completedAt: revisionCompletedAt,
        durationMs: Math.max(0, new Date(revisionCompletedAt).getTime() - new Date(revisionStartedAt).getTime()),
      }] : []),
      {
        id: 'judge',
        roleId: 'judge',
        roleLabel: 'Juiz',
        phase: 'judge',
        participants: [{
          slug: input.judgeSlug,
          name: loadedBySlug.get(input.judgeSlug)?.loaded?.name || input.judgeSlug,
          model: loadedBySlug.get(input.judgeSlug)?.loaded?.model || '',
        }],
        replies: [judgeReply],
        startedAt: judgeReply?.startedAt || revisionCompletedAt || blindCompletedAt,
        completedAt: judgeReply?.completedAt || new Date().toISOString(),
        durationMs: judgeReply?.durationMs || 0,
      },
    ];
  } else {
    replies = await Promise.all(loaded.map((entry) => {
      if (entry.error) {
        return Promise.resolve({
          ok: false,
          slug: entry.slug,
          name: entry.slug,
          model: '',
          version: null,
          cached: false,
          stale: false,
          error: entry.error,
        });
      }
      return runLucaAiPersonaTeamMember({
        slug: entry.slug,
        mission: input.mission,
        teamNames,
        loaded: entry.loaded,
        attachments: attachmentParts,
        toolsEnabled,
        traceId: input.traceId,
      });
    }));
  }
  const finalDisplayStep = steps.find((step) => step.roleId === 'display' || step.roleId === 'judge') || null;
  const finalDisplayReply = input.mode === 'individual'
    ? judgeReply?.ok ? judgeReply : null
    : finalDisplayStep?.replies.find((reply) => reply.ok) || null;

  let visualPack = null;
  if (input.mode === 'workflow') {
    const visualStep = steps.find((step) => step.roleId === 'visual') || null;
    const visualReply = visualStep?.replies?.find((reply) => reply.ok) || null;
    if (visualReply?.content) {
      appendLucaAiTraceEvent(input.traceId, 'luca_ai.visual.started', {
        slug: visualReply.slug,
        model: visualReply.model,
      });
      try {
        visualPack = await materializeVisualPack({
          mission: input.mission,
          personaOutput: visualReply.content,
          ownerId: getWorkspaceUserId(),
          traceId: input.traceId,
          imageModel: IMAGE_GENERATION_MODEL,
          callImage: call9RouterImageGeneration,
          generateImages: true,
        });
        appendLucaAiTraceEvent(input.traceId, 'luca_ai.visual.completed', {
          status: visualPack.status,
          chartCount: visualPack.charts?.length || 0,
          imageOkCount: (visualPack.images || []).filter((item) => item.status === 'ok').length,
          imageEngine: visualPack.imageEngine || null,
        });
      } catch (error) {
        visualPack = {
          status: 'failed',
          summary: '',
          report: null,
          charts: [],
          images: [],
          imageEngine: IMAGE_GENERATION_MODEL,
          errors: [{ error: error?.message || String(error) }],
          generatedAt: new Date().toISOString(),
        };
        appendLucaAiTraceEvent(input.traceId, 'luca_ai.visual.failed', {
          error: summarizeLucaAiTraceText(error?.message || String(error), 240),
        });
      }
    } else if (visualStep) {
      visualPack = {
        status: 'skipped',
        reason: 'visual_persona_failed',
        summary: '',
        report: null,
        charts: [],
        images: [],
        imageEngine: null,
        errors: (visualStep.replies || [])
          .filter((reply) => !reply.ok)
          .map((reply) => ({ id: reply.slug, error: reply.error || 'persona_failed' })),
        generatedAt: new Date().toISOString(),
      };
    }
  }

  const generatedAt = new Date().toISOString();
  const durationMs = Date.now() - runStartedMs;
  const runOk = input.mode === 'individual'
    ? Boolean(judgeReply?.ok && replies.some((reply) => reply.ok))
    : replies.some((reply) => reply.ok);

  appendLucaAiTraceEvent(input.traceId, 'luca_ai.workflow.completed', {
    mode: input.mode,
    durationMs,
    ok: runOk,
    okCount: replies.filter((reply) => reply.ok).length,
    errorCount: replies.filter((reply) => !reply.ok).length,
    finalDisplaySlug: finalDisplayReply?.slug || null,
    visualStatus: visualPack?.status || null,
  });

  const runPayload = {
    ok: runOk,
    traceId: input.traceId,
    mission: input.mission,
    mode: input.mode,
    team: loaded.map((entry) => ({
      slug: entry.slug,
      name: entry.loaded?.name || entry.slug,
      model: entry.loaded?.model || '',
      yumeModel: entry.loaded?.yumeModel || '',
      modelOverridden: Boolean(entry.loaded?.modelOverridden),
      version: entry.loaded?.version ?? null,
      cached: Boolean(entry.loaded?.cached),
      stale: Boolean(entry.loaded?.stale),
      error: entry.error || null,
    })),
    replies,
    judge: judgeReply,
    steps,
    finalDisplay: finalDisplayReply ? {
      roleId: finalDisplayStep.roleId,
      roleLabel: finalDisplayStep.roleLabel,
      slug: finalDisplayReply.slug,
      name: finalDisplayReply.name,
      model: finalDisplayReply.model,
      content: finalDisplayReply.content,
    } : null,
    visualPack,
    attachments: attachmentMetadata,
    startedAt: runStartedAt,
    durationMs,
    generatedAt,
  };

  // Persistência server-side: histórico sobrevive a F5, falha de flush do browser e soft-delete.
  if (input.sessionId) {
    try {
      recordPersonaRunOnSession(input.sessionId, runPayload);
    } catch (error) {
      console.error(`[chat-library] recordPersonaRunOnSession falhou: ${error?.message || String(error)}`);
    }
  }

  return runPayload;
}

app.post('/api/luca-ai/persona-team/run', (req, res) => {
  const input = normalizePersonaTeamRunInput(req.body);
  if (!input.ok) {
    res.status(400).json(input);
    return;
  }

  const ownerId = getWorkspaceUserId();
  const job = personaRunJobs.start({
    ownerId,
    traceId: input.traceId,
    execute: () => runWithWorkspaceUser(ownerId, async () => {
      try {
        return await executeLucaAiPersonaTeamRun(input);
      } catch (error) {
        appendLucaAiTraceEvent(input.traceId, 'luca_ai.workflow.failed', {
          mode: input.mode,
          error: error?.message || String(error),
          code: error?.code || 'persona_run_failed',
        });
        console.error(`[persona-team] run ${input.traceId} falhou: ${error?.message || String(error)}`);
        throw error;
      }
    }),
  });

  res.status(202).json({
    ok: true,
    runId: job.runId,
    traceId: job.traceId,
    status: job.status,
    startedAt: job.startedAt,
  });
});

app.get('/api/luca-ai/persona-team/runs/:runId', (req, res) => {
  const job = personaRunJobs.get(req.params.runId, getWorkspaceUserId());
  if (!job) {
    res.status(404).json({ ok: false, error: 'persona_run_not_found' });
    return;
  }
  res.json({ ok: job.status !== 'failed', ...job });
});

app.post('/api/agent/persona/add', async (req, res) => {
  const slug = String(req.body?.slug ?? '').trim();
  if (!slug) {
    res.status(400).json({ ok: false, error: 'slug_required' });
    return;
  }
  try {
    const { personas } = await syncOfficialPersonaRoster();
    const catalogPersona = (Array.isArray(personas) ? personas : []).find((item) => item.slug === slug);
    if (!catalogPersona) {
      res.status(404).json({ ok: false, error: 'persona_not_found', slug, rosterSource: 'yume.catalog' });
      return;
    }
    const record = addPersonaAgent({
      slug,
      name: catalogPersona.name || slug,
      yumeModel: String(catalogPersona.model || '').trim(),
    });
    // Reconcile keeps official roster + retained secondaries (including this one).
    applyOfficialPersonaRoster(personas);
    emitState();
    res.json({
      ok: true,
      agent: getPersonaAgents().find((agent) => agent.slug === slug) || record,
      synchronized: true,
      rosterSource: catalogPersona.is_official === true ? 'yume.is_official' : 'yume.secondary',
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: error?.message || String(error), source: 'kamui' });
  }
});

app.post('/api/agent/persona/remove', async (req, res) => {
  const slug = String(req.body?.slug ?? '').trim();
  try {
    const existed = getPersonaAgents().some((agent) => agent.slug === slug);
    const { personas, roster } = await syncOfficialPersonaRoster();
    const catalogPersona = (Array.isArray(personas) ? personas : []).find((item) => item.slug === slug);
    // Official personas always return via reconcile; only secondaries can truly drop.
    if (existed && catalogPersona && catalogPersona.is_official !== true) {
      const next = getPersonaAgents().filter((agent) => agent.slug !== slug);
      replacePersonaAgents(next);
    }
    const remains = getPersonaAgents().some((agent) => agent.slug === slug)
      || roster.some((agent) => agent.slug === slug);
    emitState();
    res.json({
      ok: true,
      removed: existed && !remains,
      synchronized: true,
      rosterSource: 'yume.catalog',
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: error?.message || String(error), source: 'kamui' });
  }
});

app.post('/api/mission/complete', async (req, res) => {
  const mission = getState().activeMission;
  if (!mission) {
    res.status(409).json({ ok: false, error: 'no_mission' });
    return;
  }
  const result = await attemptMissionClosure({
    type: classifyMissionIntent(mission),
    proposedStatus: 'completed',
    reason: 'Encerramento manual solicitado pela interface.',
    skipClosureReview: req.body?.force === true,
    finalize: () => {
      completeRun('encerramento manual aprovado');
      setSupervisorMode('standby');
      stopSupervisorTimer();
      setAgentStatus('supervisor', 'ready');
      addHeartbeat('supervisor', 'ready', 'missao concluida manualmente');
    },
  });
  emitState();
  res.json({ ok: true, approved: result.approved, review: result.review ?? null });
});

app.post('/api/mission/schedule', async (req, res) => {
  try {
    const schedule = buildSchedule(req.body || {});
    setScheduledMissions([schedule, ...getState().scheduledMissions]);
    emitEvent({ type: 'schedule.created', scheduleId: schedule.id, nextRunAt: schedule.nextRunAt });
    await processScheduledMissions();
    emitState();
    res.json({ ok: true, schedule });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/schedule/cancel', (req, res) => {
  const id = String(req.body?.scheduleId ?? '').trim();
  const list = getState().scheduledMissions.map((item) => item.id === id
    ? { ...item, enabled: false, completedAt: item.completedAt ?? new Date().toISOString(), pausedAt: null, pauseReason: null, updatedAt: new Date().toISOString() }
    : item);
  setScheduledMissions(list);
  setMissionQueue((getState().missionQueue || []).filter((item) => item.scheduleId !== id));
  emitEvent({ type: 'schedule.canceled', scheduleId: id });
  emitState();
  res.json({ ok: true });
});

app.post('/api/schedule/pause', (req, res) => {
  const id = String(req.body?.scheduleId ?? '').trim();
  const list = getState().scheduledMissions.map((item) => item.id === id
    ? { ...item, enabled: false, pausedAt: new Date().toISOString(), pauseReason: String(req.body?.reason ?? 'pausada pelo operador'), updatedAt: new Date().toISOString() }
    : item);
  setScheduledMissions(list);
  setMissionQueue((getState().missionQueue || []).filter((item) => item.scheduleId !== id));
  emitEvent({ type: 'schedule.paused', scheduleId: id });
  emitState();
  res.json({ ok: true });
});

app.post('/api/schedule/resume', (req, res) => {
  const id = String(req.body?.scheduleId ?? '').trim();
  const list = getState().scheduledMissions.map((item) => {
    if (item.id !== id) return item;
    const infinite = missionScheduleIsInfinite(item);
    const hasRemaining = infinite || Number(item.remainingRuns || 0) > 0;
    if (!hasRemaining) return item;
    return {
      ...item,
      enabled: true,
      infinite,
      pausedAt: null,
      pauseReason: null,
      completedAt: null,
      updatedAt: new Date().toISOString(),
      nextRunAt: item.nextRunAt || new Date(Date.now() + Number(item.intervalMs || 60000)).toISOString(),
    };
  });
  setScheduledMissions(list);
  emitEvent({ type: 'schedule.resumed', scheduleId: id });
  emitState();
  res.json({ ok: true });
});

app.post('/api/tools/global-chat/message', (req, res) => {
  const agentId = resolveAgentId(String(req.body?.agentId ?? 'system').trim());
  const message = publishChatMessage({
    agentId,
    type: req.body?.type ?? 'info',
    content: req.body?.content,
  });
  emitState();
  if (!message) {
    res.status(400).json({ ok: false, error: 'empty_message' });
    return;
  }
  res.json({ ok: true, message });
});

app.post('/api/mission/reset', (_req, res) => {
  stopSupervisorTimer();
  const current = getState();
  if (current.activeMission?.id && !missionRunIsSettled(current.activeRun?.status)) {
    emitEvent({
      type: 'mission.archived',
      source: 'ui',
      missionId: current.activeMission.id,
      traceId: current.activeMission.id,
      time: new Date().toISOString(),
      payload: {
        title: current.activeMission.title || 'missao',
        reason: 'manual_reset',
        status: current.activeRun?.status || 'reset',
      },
    });
  }
  resetMissionScope();
  addHeartbeat('supervisor', 'ready', 'missao resetada');
  emitEvent({ type: 'state.reset', source: 'ui', time: new Date().toISOString(), payload: {} });
  emitState();
  res.json(buildOkStateResponse(publicStateSnapshot()));
});

app.post('/api/supervisor/start', async (_req, res) => {
  setSupervisorMode('running');
  addHeartbeat('supervisor', 'running', 'supervisor ligado');
  if (!supervisorTimer) {
    supervisorTimer = setInterval(() => {
      void triggerRunCycle().catch(() => {});
    }, 8000);
  }
  void triggerRunCycle().catch(() => {});
  emitState();
  res.json(buildOkStateResponse(publicStateSnapshot()));
});

app.post('/api/supervisor/pause', (_req, res) => {
  setSupervisorMode('standby');
  addHeartbeat('supervisor', 'paused', 'supervisor pausado');
  if (supervisorTimer) {
    clearInterval(supervisorTimer);
    supervisorTimer = null;
  }
  emitState();
  res.json(buildOkStateResponse(publicStateSnapshot()));
});

app.post('/api/agent/run', async (req, res) => {
  const rawId = String(req.body?.agentId ?? '').trim();
  const requestedPersonaSlug = rawId.startsWith('yume:')
    ? rawId.slice('yume:'.length)
    : (getPersonaAgents().some((agent) => agent.slug === rawId) ? rawId : null);

  if (requestedPersonaSlug) {
    try {
      const { personas } = await syncOfficialPersonaRoster();
      const catalogBySlug = new Map(
        (Array.isArray(personas) ? personas : [])
          .map((persona) => [String(persona?.slug || '').trim(), persona])
          .filter(([slug]) => Boolean(slug)),
      );
      if (!catalogBySlug.has(requestedPersonaSlug)) {
        res.status(404).json({
          ok: false,
          error: 'persona_not_found',
          slug: requestedPersonaSlug,
          rosterSource: 'yume.catalog',
        });
        return;
      }
      await ensureCatalogPersonaCached(requestedPersonaSlug, catalogBySlug);
    } catch (error) {
      const status = error?.code === 'persona_not_found' ? 404 : 502;
      res.status(status).json({ ok: false, error: error?.message || String(error), source: 'kamui' });
      return;
    }
  }

  // persona-agent do Yume: roda como especialista no chat da missao ativa.
  const personaSlug = requestedPersonaSlug;
  if (personaSlug) {
    if (!getState().activeMission) {
      res.status(409).json({ ok: false, error: 'mission_required' });
      return;
    }
    const result = await runPersonaAgentChat(personaSlug, { mode: 'chat_only', reason: 'Execucao manual de persona especialista solicitada pela interface.' });
    emitState();
    res.json({ ok: result.ok !== false, result });
    return;
  }

  const agentId = resolveAgentId(rawId);
  const agent = AGENTS.find((item) => item.id === agentId);
  if (!agent) {
    res.status(404).json({ ok: false, error: 'agent_not_found' });
    return;
  }
  const mission = getState().activeMission;
  if (!mission) {
    setAgentStatus(agent.id, 'idle');
    appendLine(agent.id, 'idle: nenhuma missao ativa.');
    emitState();
    res.status(409).json({ ok: false, error: 'mission_required' });
    return;
  }
  if (agent.role !== 'mission-transformer' && completedTasksFor(agent.id).length > 0) {
    res.json({ ok: true, skipped: true, reason: 'agent_already_completed_task' });
    return;
  }
  const task = agent.role === 'mission-transformer' ? null : createAgentTask(agent.id, 'Execucao manual solicitada pela interface. Leia o chat e publique contribuicao util para a missao ativa.');
  await runAgent(agent, mission, task);
  emitState();
  res.json({ ok: true });
});

app.post('/api/heartbeat/start', (_req, res) => {
  startHeartbeatMonitor();
  emitState();
  res.json(buildOkStateResponse(publicStateSnapshot()));
});

app.post('/api/heartbeat/pause', (_req, res) => {
  stopHeartbeatMonitor();
  emitState();
  res.json(buildOkStateResponse(publicStateSnapshot()));
});

app.post('/api/agents/clear', (_req, res) => {
  clearAgentContexts();
  appendHeartbeatLog('[heartbeat] terminais e contexto dos agentes limpos');
  emitState();
  res.json(buildOkStateResponse(publicStateSnapshot()));
});

app.use('/icons', express.static(path.resolve(process.cwd(), 'public', 'icons')));

if (fs.existsSync(indexPath)) {
  app.use(express.static(distPath));
  app.get('*splat', (_req, res) => {
    res.sendFile(indexPath);
  });
} else if (fs.existsSync(v2IndexPath)) {
  app.use(express.static(v2DesignPath));
  app.get('*splat', (_req, res) => {
    res.sendFile(v2IndexPath);
  });
}

wss.on('connection', (socket, req) => {
  const userId = req?.auth?.user?.id || null;
  socket.userId = userId;
  if (!userId) {
    socket.close(1008, 'workspace_user_required');
    return;
  }
  ensureWorkspace(userId);
  runWithWorkspaceUser(userId, () => {
    socket.send(JSON.stringify({ kind: 'state', state: publicStateSnapshot() }));
  });
});

httpServer.listen(PORT, HOST, () => {
  startHeartbeatMonitor();
  startScheduler();
  void syncAllOfficialPersonaRosters().catch((error) => {
    console.warn(`[persona-roster] falha na sincronizacao inicial: ${error?.message || String(error)}`);
  });
  const personaRosterTimer = setInterval(() => {
    void syncAllOfficialPersonaRosters().catch((error) => {
      console.warn(`[persona-roster] falha na sincronizacao: ${error?.message || String(error)}`);
    });
  }, PERSONA_ROSTER_SYNC_INTERVAL_MS);
  personaRosterTimer.unref?.();
  console.log(`LUCA backend em http://${HOST}:${PORT}`);
});
