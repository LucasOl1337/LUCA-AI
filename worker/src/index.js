import { DurableObject } from 'cloudflare:workers';
import {
  buildAgentPlaybook,
  businessWorkflowHint,
  agentCollaborationContract,
  insuranceAgentMessageIssues,
  insuranceRoleOutputContract,
} from '../../shared/agent-playbooks.js';
import {
  buildDeterministicClosureReview,
} from '../../shared/closure-review.js';
import {
  executiveDashboardContractIssues,
  executiveDashboardContractTitles,
} from '../../shared/dashboard-contract.js';
import { buildDeterministicExecutiveDashboard } from '../../shared/executive-dashboard.js';
import {
  missionRequestsAllAgents,
  missionNeedsSupervisorJudgment,
} from '../../shared/mission-intent.js';
import { buildEndpointCatalog } from '../../shared/endpoint-catalog.js';
import { buildToolCatalog } from '../../shared/tool-catalog.js';
import { buildCatalogAudit } from '../../shared/catalog-audit.js';
import { normalizeGoalInput, publicGoal, summarizeGoals } from '../../shared/goals.js';
import { buildGovernanceSummary } from '../../shared/governance.js';
import { resolveModelSelector, modelSelectorSummary } from '../../shared/model-selector.js';
import { serializePublicState } from '../../shared/state-payload.js';
import { normalizeSupervisorFinalReport } from '../../shared/supervisor-final-report.js';
import { runOperationalPreflight } from '../../shared/preflight.js';
import { formatBrazilTime } from '../../shared/time.js';

const AGENTS = [
  { id: 'maestro', role: 'router', name: 'Maestro', status: 'ready', lines: ['cloud: pronto para rotear missao real'] },
  { id: 'transformador-missao', role: 'mission-transformer', name: 'Transformador de Missao', status: 'ready', lines: ['cloud: aguardando missao'] },
  { id: 'supervisor', role: 'supervisor', name: 'Supervisor', status: 'ready', lines: ['cloud: supervisor conectado ao modelo do runtime'] },
  { id: 'planejador', role: 'planner', name: 'Planejador', status: 'ready', lines: ['cloud: planejador pronto'] },
  { id: 'pesquisador', role: 'researcher', name: 'Pesquisador', status: 'ready', lines: ['cloud: pesquisador pronto'] },
  { id: 'designer', role: 'designer', name: 'Designer', status: 'ready', lines: ['cloud: designer pronto'] },
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MISSION_LOCK_TIMEOUT_MS = 20 * 60 * 1000;
const MISSION_JOB_RETRY_LIMIT = 2;
const MISSION_JOB_RETRY_DELAY_MS = 3500;
const MISSION_JOB_STALE_MS = 4 * 60 * 1000;
const MISSION_ALARM_DELAY_MS = 100;
const GLM_REQUEST_TIMEOUT_MS = 120 * 1000;
const FORBIDDEN_PRESENTATION_LANGUAGE = /mock|demo|simulad/i;
const REQUIRED_BLOCK_TITLES = executiveDashboardContractTitles();
const FINAL_MISSION_EVENT_TYPES = ['mission.completed', 'mission.failed', 'mission.chat_completed', 'mission.archived'];
const RUNTIME_STATE_READ_EVENT_LIMIT = 24;
const RUNTIME_STATE_HEAVY_READ_EVENT_LIMIT = 80;
const RUNTIME_MEMORY_EVENT_LIMIT = 120;

let runtimeMemoryState = null;
let runtimeMemoryEvents = [];
let runtimeLastStorageError = '';

function runtimeModelSelector(env = {}) {
  return resolveModelSelector(env || {});
}

function runtimeModel(env = {}) {
  return runtimeModelSelector(env).model;
}

function runtimeAgents(model = runtimeModel()) {
  return AGENTS.map((agent) => (
    agent.id === 'supervisor'
      ? { ...agent, lines: [`cloud: supervisor conectado ao ${model}`] }
      : { ...agent }
  ));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function nowTime() {
  return formatBrazilTime();
}

function eventTimestampMs(event) {
  const explicit = Number(event?.ts);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const parsed = Date.parse(event?.timestamp || event?.time || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function baseState(extra = {}, env = {}) {
  const modelSelector = runtimeModelSelector(env);
  const model = modelSelector.model;
  const governance = buildGovernanceSummary({ provider: model });
  return {
    supervisorMode: 'ready',
    activeMission: null,
    activeRun: null,
    missionHistory: [],
    temporaryDashboard: null,
    database: {
      source: { name: `${model} runtime`, topic: 'missao real em nuvem' },
      layers: {
        rawResearch: { status: 'empty', items: [], dashboardVisibility: 'internal' },
        processing: { status: 'empty', items: [], dashboardVisibility: 'technical' },
        dashboardIntegration: { status: 'empty', items: [], dashboardVisibility: 'public' },
      },
      heartbeat: [{ agentId: 'supervisor', status: 'ready', note: `${model} configurado em runtime cloud`, time: nowTime() }],
    },
    heartbeatLogs: [`[${nowTime()}] cloud: aguardando missao real via ${model}`],
    globalChatMessages: [],
    scheduledMissions: [],
    missionQueue: [],
    goals: [],
    personaAgents: [],
    agents: runtimeAgents(model),
    heartbeatMonitor: {
      service: 'luca-ai-cloud',
      status: 'online',
      updatedAt: nowIso(),
      intervalSeconds: 0,
      summary: `Runtime serverless real. Missoes chamam ${model}.`,
      provider: model,
      modelSelector,
      governance,
    },
    governance,
    ...extra,
  };
}

function normalizeRuntimeEvent(event = {}) {
  const timestamp = event.timestamp || event.time || nowIso();
  const ts = eventTimestampMs({ ...event, timestamp }) || Date.now();
  return {
    id: event.id || `mem_${crypto.randomUUID()}`,
    type: String(event.type || 'event'),
    ts,
    time: timestamp,
    timestamp,
    source: event.source || 'runtime',
    missionId: event.missionId ?? event.mission_id ?? null,
    goalId: event.goalId ?? event.goal_id ?? null,
    traceId: event.traceId ?? event.trace_id ?? null,
    payload: event.payload || {},
  };
}

function rememberRuntimeEvent(event = {}) {
  const normalized = normalizeRuntimeEvent(event);
  runtimeMemoryEvents = [normalized, ...runtimeMemoryEvents].slice(0, RUNTIME_MEMORY_EVENT_LIMIT);
  return normalized;
}

function summarizeRuntimeEvents(events = [], filters = {}) {
  const byType = new Map();
  const bySource = new Map();
  for (const event of events) {
    byType.set(event.type, (byType.get(event.type) || 0) + 1);
    const source = event.source || 'unknown';
    bySource.set(source, (bySource.get(source) || 0) + 1);
  }
  return {
    total: events.length,
    latest: events[0] || null,
    oldest: events[events.length - 1] || null,
    filters: {
      type: String(filters.type || '').trim() || null,
      missionId: String(filters.missionId || '').trim() || null,
      goalId: String(filters.goalId || '').trim() || null,
      traceId: String(filters.traceId || '').trim() || null,
      sampledLimit: Math.max(1, Number(filters.limit) || events.length || RUNTIME_STATE_READ_EVENT_LIMIT),
    },
    byType: Array.from(byType.entries()).map(([type, total]) => ({ type, total })),
    bySource: Array.from(bySource.entries()).map(([source, total]) => ({ source, total })),
  };
}

function filterRuntimeMemoryEvents(filters = {}) {
  const limit = Math.max(1, Math.min(250, Number(filters.limit) || RUNTIME_STATE_READ_EVENT_LIMIT));
  const wantedType = String(filters.type || '').trim();
  const wantedMissionId = String(filters.missionId || '').trim();
  const wantedGoalId = String(filters.goalId || '').trim();
  const wantedTraceId = String(filters.traceId || '').trim();
  return runtimeMemoryEvents.filter((event) => {
    if (wantedType && event.type !== wantedType) return false;
    if (wantedMissionId && event.missionId !== wantedMissionId) return false;
    if (wantedGoalId && event.goalId !== wantedGoalId) return false;
    if (wantedTraceId && event.traceId !== wantedTraceId) return false;
    return true;
  }).slice(0, limit);
}

function rememberRuntimeState(state, env = {}) {
  const serialized = serializePublicState(state || baseState({}, env));
  runtimeMemoryState = serialized;
  return serialized;
}

function storageErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'storage_unavailable');
}

function isDurableObjectStorageLimitError(error) {
  const message = storageErrorMessage(error).toLowerCase();
  return /rows?_read|daily usage limit|free tier|limit exceeded|storage|durable object|sqlite/.test(message);
}

function runtimeDegradedState(env = {}, error = 'storage_unavailable', overlay = {}) {
  const message = compactText(storageErrorMessage(error), 360);
  runtimeLastStorageError = message;
  const modelSelector = runtimeModelSelector(env);
  const cached = runtimeMemoryState || baseState({}, env);
  const events = runtimeMemoryEvents.slice(0, RUNTIME_STATE_READ_EVENT_LIMIT);
  const summary = summarizeRuntimeEvents(events, { limit: RUNTIME_STATE_READ_EVENT_LIMIT });
  const governance = buildGovernanceSummary({
    provider: modelSelector.model,
    events,
    missionLockTimeoutMs: MISSION_LOCK_TIMEOUT_MS,
  });
  const heartbeatLogs = [
    ...(Array.isArray(cached.heartbeatLogs) ? cached.heartbeatLogs : []),
    `[${nowTime()}] cloud: Durable Objects em modo degradado; ${message || 'limite de leitura atingido'}`,
  ].slice(-30);
  return serializePublicState({
    ...cached,
    ...overlay,
    heartbeatLogs,
    governance,
    heartbeatMonitor: {
      ...(cached.heartbeatMonitor || {}),
      service: 'luca-ai-cloud',
      status: 'degraded',
      updatedAt: nowIso(),
      intervalSeconds: 0,
      summary: 'Cloudflare Durable Objects com limite de leitura atingido; usando estado transitório em memória.',
      beats: summary.total,
      lastAction: events[0]?.type || 'storage.degraded',
      eventTypes: summary.byType,
      goalsSummary: summarizeGoals(cached.goals || []),
      provider: modelSelector.model,
      modelSelector,
      governance,
      storageDegraded: true,
      storageError: message,
    },
  });
}

function runtimeStub(env) {
  return env.LUCA_RUNTIME?.getByName('public');
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function compactText(value, max = 220) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const candidate = text.slice(0, max).trimEnd();
  const sentenceCut = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('; '), candidate.lastIndexOf(': '));
  if (sentenceCut > Math.floor(max * 0.55)) return candidate.slice(0, sentenceCut + 1).trim();
  const wordCut = candidate.lastIndexOf(' ');
  return (wordCut > Math.floor(max * 0.55) ? candidate.slice(0, wordCut) : candidate).trim();
}

function eventFiltersFromSearchParams(searchParams) {
  const limit = searchParams.get('limit');
  return {
    limit: limit ? Number(limit) : 100,
    type: searchParams.get('type') || '',
    missionId: searchParams.get('missionId') || '',
    goalId: searchParams.get('goalId') || '',
    traceId: searchParams.get('traceId') || '',
  };
}

function eventLine(event) {
  const time = formatBrazilTime(event.timestamp || event.time || Date.now());
  const payload = event.payload || {};
  if (event.type === 'mission.started') return `[${time}] mission: ${payload.title || 'missao iniciada'}`;
  if (event.type === 'mission.progress') return `[${time}] mission: ${payload.label || payload.phase || 'em processamento'}`;
  if (event.type === 'mission.completed') return `[${time}] verifier: ${payload.approved ? 'aprovado' : 'reprovado'}`;
  if (event.type === 'mission.chat_completed') return `[${time}] chat: ${payload.title || 'acao concluida'}`;
  if (event.type === 'mission.failed') return `[${time}] error: ${payload.error || 'falha na missao'}`;
  if (event.type === 'heartbeat.play') return `[${time}] heartbeat: monitor ligado`;
  if (event.type === 'heartbeat.pause') return `[${time}] heartbeat: monitor pausado`;
  if (event.type === 'state.reset') return `[${time}] state: missao resetada`;
  return `[${time}] ${event.type}`;
}

export class LucaRuntime extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.processingMissionJob = null;
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          ts INTEGER NOT NULL,
          timestamp TEXT NOT NULL,
          source TEXT NOT NULL,
          mission_id TEXT,
          payload_json TEXT NOT NULL
        );
      `);
      this.ensureEventSchema();
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          timestamp TEXT NOT NULL,
          state_json TEXT NOT NULL
        );
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS mission_jobs (
          id TEXT PRIMARY KEY,
          mission_json TEXT NOT NULL,
          intent TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_error TEXT
        );
      `);
      this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS idx_mission_jobs_status ON mission_jobs(status, created_at)');
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS goals (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          definition_of_done TEXT NOT NULL,
          status TEXT NOT NULL,
          origin TEXT NOT NULL,
          parent_id TEXT,
          depth INTEGER NOT NULL,
          priority INTEGER NOT NULL,
          max_iterations INTEGER NOT NULL,
          max_seconds INTEGER NOT NULL,
          max_tool_calls INTEGER NOT NULL,
          iterations INTEGER NOT NULL,
          tool_calls INTEGER NOT NULL,
          tokens_used INTEGER NOT NULL,
          result_json TEXT,
          verifier_json TEXT,
          error TEXT,
          trace_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          started_at TEXT,
          finished_at TEXT
        );
      `);
    });
  }

  ensureEventSchema() {
    const columns = new Set(
      this.ctx.storage.sql.exec('PRAGMA table_info(events)').toArray().map((row) => row.name),
    );
    if (!columns.has('goal_id')) {
      this.ctx.storage.sql.exec('ALTER TABLE events ADD COLUMN goal_id TEXT');
    }
    if (!columns.has('trace_id')) {
      this.ctx.storage.sql.exec('ALTER TABLE events ADD COLUMN trace_id TEXT');
    }
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC)');
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)');
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS idx_events_mission ON events(mission_id, ts DESC)');
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS idx_events_goal ON events(goal_id, ts DESC)');
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS idx_events_trace ON events(trace_id, ts DESC)');
  }

  appendEvent(type, payload = {}, source = 'runtime', missionId = null, metadata = {}) {
    const id = `evt_${crypto.randomUUID()}`;
    const timestamp = nowIso();
    const ts = Date.now();
    const goalId = metadata.goalId || null;
    const traceId = metadata.traceId || null;
    this.ctx.storage.sql.exec(
      'INSERT INTO events (id, type, ts, timestamp, source, mission_id, goal_id, trace_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      String(type || 'event'),
      ts,
      timestamp,
      String(source || 'runtime'),
      missionId,
      goalId,
      traceId,
      JSON.stringify(payload || {}),
    );
    return rememberRuntimeEvent({ id, type, ts, timestamp, source, missionId, goalId, traceId, payload });
  }

  listEvents(options = 80) {
    const filters = typeof options === 'number' ? { limit: options } : (options || {});
    const limit = Math.max(1, Math.min(250, Number(filters.limit) || 80));
    const where = [];
    const params = [];
    if (filters.type) {
      where.push('type = ?');
      params.push(String(filters.type));
    }
    if (filters.missionId) {
      where.push('mission_id = ?');
      params.push(String(filters.missionId));
    }
    if (filters.goalId) {
      where.push('goal_id = ?');
      params.push(String(filters.goalId));
    }
    if (filters.traceId) {
      where.push('trace_id = ?');
      params.push(String(filters.traceId));
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const rows = this.ctx.storage.sql.exec(
      `SELECT * FROM events${clause} ORDER BY ts DESC LIMIT ?`,
      ...params,
      limit,
    ).toArray();
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      ts: row.ts,
      time: row.timestamp,
      timestamp: row.timestamp,
      source: row.source,
      missionId: row.mission_id,
      goalId: row.goal_id ?? null,
      traceId: row.trace_id ?? null,
      payload: safeJsonParse(row.payload_json, {}),
    }));
  }

  eventSummary(options = {}) {
    const filters = typeof options === 'number' ? { limit: options } : (options || {});
    const events = this.listEvents({ limit: filters.limit || 250, ...filters });
    return summarizeRuntimeEvents(events, {
      ...filters,
      limit: Math.max(1, Math.min(250, Number(filters.limit) || 250)),
    });
  }

  eventFlows(options = {}) {
    const filters = typeof options === 'number' ? { limit: options } : (options || {});
    const limit = Math.max(1, Math.min(80, Number(filters.limit) || 40));
    const events = this.listEvents({ ...filters, limit: Math.max(limit * 8, 120) }).slice().reverse();
    const flows = [];
    let current = null;
    const windowMs = 20_000;

    const finalize = (flow, index) => {
      const steps = flow.steps;
      const tsStart = steps[0]?.ts ?? null;
      const tsEnd = steps[steps.length - 1]?.ts ?? null;
      const types = Array.from(new Set(steps.map((step) => step.type).filter(Boolean)));
      return {
        id: flow.traceId || `win-${tsStart}-${index}`,
        traceId: flow.traceId,
        missionId: flow.missionId,
        goalId: flow.goalId,
        source: flow.source,
        tsStart,
        tsEnd,
        totalMs: typeof tsStart === 'number' && typeof tsEnd === 'number' ? Math.max(0, tsEnd - tsStart) : 0,
        stepCount: steps.length,
        inferred: flow.inferred,
        summary: `${steps.length} evento(s): ${types.join(' -> ') || 'sequencia operacional'}`,
        steps,
      };
    };

    for (const event of events) {
      const step = {
        id: event.id,
        ts: event.ts,
        time: event.time,
        type: event.type,
        source: event.source || 'unknown',
        missionId: event.missionId,
        goalId: event.goalId,
        traceId: event.traceId,
        label: `${event.type}${event.source ? ` · ${event.source}` : ''}`,
        payload: event.payload,
      };
      const eventTraceId = event.traceId || null;
      if (!current) {
        current = {
          traceId: eventTraceId,
          missionId: event.missionId || null,
          goalId: event.goalId || null,
          source: event.source || 'unknown',
          steps: [step],
          lastTs: event.ts,
          inferred: !eventTraceId,
        };
        continue;
      }
      const sameTrace = Boolean(eventTraceId) && eventTraceId === current.traceId;
      const inWindow = !eventTraceId && !current.traceId && (event.ts - current.lastTs) <= windowMs;
      if (sameTrace || inWindow) {
        current.steps.push(step);
        current.lastTs = event.ts;
        if (!current.missionId && event.missionId) current.missionId = event.missionId;
        if (!current.goalId && event.goalId) current.goalId = event.goalId;
        continue;
      }
      flows.push(current);
      current = {
        traceId: eventTraceId,
        missionId: event.missionId || null,
        goalId: event.goalId || null,
        source: event.source || 'unknown',
        steps: [step],
        lastTs: event.ts,
        inferred: !eventTraceId,
      };
    }
    if (current) flows.push(current);

    return {
      flows: flows.slice(-limit).reverse().map((flow, index) => finalize(flow, index)),
      generatedAt: nowIso(),
      filters: {
        type: String(filters.type || '').trim() || null,
        missionId: String(filters.missionId || '').trim() || null,
        goalId: String(filters.goalId || '').trim() || null,
        traceId: String(filters.traceId || '').trim() || null,
        sampledLimit: limit,
      },
    };
  }

  latestSnapshot() {
    const row = this.ctx.storage.sql.exec(
      'SELECT * FROM snapshots ORDER BY ts DESC, id DESC LIMIT 1',
    ).toArray()[0];
    return row ? safeJsonParse(row.state_json, null) : null;
  }

  listGoals(limit = 40, status = '') {
    const max = Math.max(1, Math.min(200, Number(limit) || 40));
    const rows = status
      ? this.ctx.storage.sql.exec(
          'SELECT * FROM goals WHERE status = ? ORDER BY priority ASC, created_at DESC LIMIT ?',
          String(status),
          max,
        ).toArray()
      : this.ctx.storage.sql.exec(
          'SELECT * FROM goals ORDER BY priority ASC, created_at DESC LIMIT ?',
          max,
        ).toArray();
    return rows.map((row) => publicGoal({
      id: row.id,
      title: row.title,
      description: row.description,
      definitionOfDone: row.definition_of_done,
      status: row.status,
      origin: row.origin,
      parentId: row.parent_id,
      depth: row.depth,
      priority: row.priority,
      maxIterations: row.max_iterations,
      maxSeconds: row.max_seconds,
      maxToolCalls: row.max_tool_calls,
      iterations: row.iterations,
      toolCalls: row.tool_calls,
      tokensUsed: row.tokens_used,
      result: safeJsonParse(row.result_json, null),
      verifier: safeJsonParse(row.verifier_json, null),
      error: row.error,
      traceId: row.trace_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }));
  }

  createGoal(input = {}, source = 'ui') {
    const goal = normalizeGoalInput(input, {
      id: `goal-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      now: nowIso(),
      origin: source,
    });
    this.ctx.storage.sql.exec(
      `INSERT INTO goals (
        id, title, description, definition_of_done, status, origin, parent_id, depth, priority,
        max_iterations, max_seconds, max_tool_calls, iterations, tool_calls, tokens_used,
        result_json, verifier_json, error, trace_id, created_at, updated_at, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      goal.id,
      goal.title,
      goal.description,
      goal.definitionOfDone,
      goal.status,
      goal.origin,
      goal.parentId,
      goal.depth,
      goal.priority,
      goal.maxIterations,
      goal.maxSeconds,
      goal.maxToolCalls,
      goal.iterations,
      goal.toolCalls,
      goal.tokensUsed,
      goal.result ? JSON.stringify(goal.result) : null,
      goal.verifier ? JSON.stringify(goal.verifier) : null,
      goal.error,
      goal.traceId,
      goal.createdAt,
      goal.updatedAt,
      goal.startedAt,
      goal.finishedAt,
    );
    this.appendEvent('goal.created', {
      title: goal.title,
      status: goal.status,
      priority: goal.priority,
      definitionOfDone: Boolean(goal.definitionOfDone),
      budget: {
        maxIterations: goal.maxIterations,
        maxSeconds: goal.maxSeconds,
        maxToolCalls: goal.maxToolCalls,
      },
    }, source, null, { goalId: goal.id, traceId: goal.traceId });
    return publicGoal(goal);
  }

  missionHistory(limit = 12) {
    const rows = this.ctx.storage.sql.exec(
      'SELECT * FROM snapshots ORDER BY ts DESC, id DESC LIMIT ?',
      Math.max(1, Math.min(50, Number(limit) || 12)),
    ).toArray();
    return rows.map((row) => {
      const state = safeJsonParse(row.state_json, {});
      return {
        id: `archive-${row.id}`,
        reason: state?.activeRun?.status || 'completed',
        archivedAt: row.timestamp,
        mission: state.activeMission || null,
        run: state.activeRun || null,
        dashboard: state.temporaryDashboard || null,
        chatMessages: state.globalChatMessages || [],
        agents: state.agents || [],
      };
    }).filter((item) => item.mission);
  }

  snapshotState(state) {
    const timestamp = nowIso();
    this.ctx.storage.sql.exec(
      'INSERT INTO snapshots (ts, timestamp, state_json) VALUES (?, ?, ?)',
      Date.now(),
      timestamp,
      JSON.stringify(state),
    );
  }

  saveState(state, eventPayload = {}, eventType = 'mission.completed', metadata = {}) {
    const missionId = metadata.missionId ?? state?.activeMission?.id ?? null;
    if (missionId && !this.missionCanWrite(missionId)) {
      return this.getState();
    }
    if (missionId && FINAL_MISSION_EVENT_TYPES.includes(eventType) && this.missionHasFinalEvent(missionId)) {
      return this.getState();
    }
    this.snapshotState(state);
    const traceId = metadata.traceId ?? missionId ?? null;
    this.appendEvent(eventType, eventPayload, metadata.source || runtimeModel(this.env), missionId, { traceId, goalId: metadata.goalId || null });
    return this.getState();
  }

  latestResetTs() {
    const row = this.ctx.storage.sql.exec(
      "SELECT max(ts) AS ts FROM events WHERE type = 'state.reset'",
    ).toArray()[0];
    return Number(row?.ts || 0);
  }

  missionStartTs(missionId = '') {
    const id = String(missionId || '').trim();
    if (!id) return 0;
    const row = this.ctx.storage.sql.exec(
      "SELECT max(ts) AS ts FROM events WHERE mission_id = ? AND type = 'mission.started'",
      id,
    ).toArray()[0];
    return Number(row?.ts || 0);
  }

  latestMissionStart() {
    const row = this.ctx.storage.sql.exec(
      "SELECT mission_id, ts FROM events WHERE type = 'mission.started' ORDER BY ts DESC LIMIT 1",
    ).toArray()[0];
    if (!row) return null;
    return {
      missionId: row.mission_id,
      ts: Number(row.ts || 0),
    };
  }

  missionCanWrite(missionId = '') {
    const id = String(missionId || '').trim();
    if (!id) return true;
    const startedTs = this.missionStartTs(id);
    if (!startedTs) return true;
    if (this.latestResetTs() > startedTs) return false;
    const latestStart = this.latestMissionStart();
    if (latestStart?.missionId && latestStart.missionId !== id && latestStart.ts > startedTs) return false;
    return true;
  }

  missionHasFinalEvent(missionId = '') {
    const id = String(missionId || '').trim();
    if (!id) return false;
    const row = this.ctx.storage.sql.exec(
      `SELECT count(*) AS total FROM events
       WHERE mission_id = ? AND type IN (?, ?, ?, ?)`,
      id,
      ...FINAL_MISSION_EVENT_TYPES,
    ).toArray()[0];
    return Number(row?.total || 0) > 0;
  }

  saveMissionProgress(mission, intent = 'dashboard_build', phase = 'accepted', payload = {}) {
    if (!this.missionCanWrite(mission?.id)) {
      return this.getState();
    }
    if (this.missionHasFinalEvent(mission?.id)) {
      return this.getState();
    }
    const state = stateFromMissionProgress(mission, intent, phase, payload, this.env);
    return this.saveState(
      state,
      {
        title: mission.title,
        intent,
        phase,
        label: missionProgressLabel(phase),
        ...payload,
      },
      'mission.progress',
      { traceId: mission.id, missionId: mission.id, source: 'runtime' },
    );
  }

  saveMissionFailure(mission, error, payload = {}) {
    const state = stateFromMissionFailure(mission, error, payload, this.env);
    return this.saveState(
      state,
      {
        title: mission.title,
        error: compactText(error, 700),
        ...payload,
      },
      'mission.failed',
      { traceId: mission.id, missionId: mission.id, source: payload.source || runtimeModel(this.env) },
    );
  }

  expireStaleMissionStarts({ timeoutMs = MISSION_LOCK_TIMEOUT_MS } = {}) {
    const events = this.listEvents(250);
    const now = Date.now();
    const latestResetTs = events.reduce((latest, event) => (
      event?.type === 'state.reset' ? Math.max(latest, eventTimestampMs(event)) : latest
    ), 0);
    const finalIds = new Set();
    const starts = [];
    for (const event of events) {
      const eventTs = eventTimestampMs(event);
      if (['mission.completed', 'mission.failed', 'mission.chat_completed', 'mission.archived'].includes(event?.type) && event?.missionId && eventTs > latestResetTs) {
        finalIds.add(event.missionId);
      }
      if (event?.type === 'mission.started' && event?.missionId && eventTs > latestResetTs) {
        starts.push({
          missionId: event.missionId,
          title: String(event?.payload?.title || 'missao'),
          timestamp: event.timestamp || null,
          ts: eventTs,
        });
      }
    }
    const expired = starts.filter((event) => !finalIds.has(event.missionId) && event.ts && (now - event.ts) > timeoutMs);
    for (const event of expired) {
      const reason = 'Missao sem fechamento foi expirada automaticamente pelo lock operacional.';
      this.snapshotState(stateFromMissionFailure(
        {
          id: event.missionId,
          runId: runIdForMission({ id: event.missionId }),
          title: event.title,
          description: '',
          success: '',
          activatedAt: event.timestamp,
        },
        'mission_timeout_auto_closed',
        { reason, startedAt: event.timestamp },
        this.env,
      ));
      this.appendEvent(
        'mission.failed',
        {
          title: event.title,
          error: 'mission_timeout_auto_closed',
          reason,
          timeoutMinutes: Math.round(timeoutMs / 60000),
          startedAt: event.timestamp,
        },
        'runtime',
        event.missionId,
        { traceId: event.missionId },
      );
    }
    return expired;
  }

  async scheduleMissionAlarm(delayMs = MISSION_ALARM_DELAY_MS) {
    await this.ctx.storage.setAlarm(Date.now() + Math.max(0, Number(delayMs) || 0));
  }

  enqueueMissionJob(mission, intent = 'dashboard_build') {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO mission_jobs (
        id, mission_json, intent, status, attempts, created_at, updated_at, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      mission.id,
      JSON.stringify(mission),
      intent,
      'queued',
      0,
      now,
      now,
      null,
    );
  }

  nextMissionJob() {
    const staleBefore = Date.now() - MISSION_JOB_STALE_MS;
    const row = this.ctx.storage.sql.exec(
      `SELECT * FROM mission_jobs
       WHERE status = 'queued' OR (status = 'running' AND updated_at < ?)
       ORDER BY created_at ASC
       LIMIT 1`,
      staleBefore,
    ).toArray()[0];
    if (!row) return null;
    return {
      id: row.id,
      mission: safeJsonParse(row.mission_json, null),
      intent: row.intent || 'dashboard_build',
      status: row.status,
      attempts: Number(row.attempts || 0),
      lastError: row.last_error || '',
    };
  }

  oldestRunningMissionJob() {
    const row = this.ctx.storage.sql.exec(
      "SELECT id, updated_at FROM mission_jobs WHERE status = 'running' ORDER BY updated_at ASC LIMIT 1",
    ).toArray()[0];
    if (!row) return null;
    return {
      id: row.id,
      updatedAt: Number(row.updated_at || 0),
    };
  }

  setMissionJobStatus(id, status, lastError = '') {
    this.ctx.storage.sql.exec(
      'UPDATE mission_jobs SET status = ?, updated_at = ?, last_error = ? WHERE id = ?',
      status,
      Date.now(),
      lastError || null,
      id,
    );
  }

  claimMissionJob(job) {
    const attempts = Number(job.attempts || 0) + 1;
    this.ctx.storage.sql.exec(
      'UPDATE mission_jobs SET status = ?, attempts = ?, updated_at = ? WHERE id = ?',
      'running',
      attempts,
      Date.now(),
      job.id,
    );
    return { ...job, attempts };
  }

  hasRunnableMissionJobs() {
    const staleBefore = Date.now() - MISSION_JOB_STALE_MS;
    const row = this.ctx.storage.sql.exec(
      "SELECT count(*) AS total FROM mission_jobs WHERE status = 'queued' OR (status = 'running' AND updated_at < ?)",
      staleBefore,
    ).toArray()[0];
    return Number(row?.total || 0) > 0;
  }

  async processNextMissionJob() {
    if (this.processingMissionJob) return this.processingMissionJob;
    const processing = this.processNextMissionJobInner()
      .finally(() => {
        if (this.processingMissionJob === processing) this.processingMissionJob = null;
      });
    this.processingMissionJob = processing;
    return processing;
  }

  async processNextMissionJobInner() {
    const pending = this.nextMissionJob();
    if (!pending) {
      const running = this.oldestRunningMissionJob();
      if (running) {
        const ageMs = Date.now() - running.updatedAt;
        await this.scheduleMissionAlarm(Math.max(1000, MISSION_JOB_STALE_MS - ageMs));
      } else {
        await this.ctx.storage.deleteAlarm();
      }
      return { ok: true, processed: false };
    }

    const job = this.claimMissionJob(pending);
    if (!job.mission || typeof job.mission !== 'object') {
      this.setMissionJobStatus(job.id, 'failed', 'mission_payload_invalid');
      return { ok: false, error: 'mission_payload_invalid' };
    }
    if (this.missionHasFinalEvent(job.mission.id)) {
      this.setMissionJobStatus(job.id, 'completed');
      return { ok: true, skipped: true, reason: 'mission_already_finalized' };
    }

    try {
      await processMissionLifecycle(this.env, this, job.mission, job.intent);
      this.setMissionJobStatus(job.id, 'completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (job.attempts < MISSION_JOB_RETRY_LIMIT) {
        this.saveMissionProgress(job.mission, job.intent, 'retrying', {
          attempt: job.attempts + 1,
          error: message,
        });
        this.ctx.storage.sql.exec(
          'UPDATE mission_jobs SET status = ?, updated_at = ?, last_error = ? WHERE id = ?',
          'queued',
          Date.now(),
          message,
          job.id,
        );
        await this.scheduleMissionAlarm(MISSION_JOB_RETRY_DELAY_MS * job.attempts);
        return { ok: false, retrying: true, error: message };
      }
      this.saveMissionFailure(job.mission, message, { attempts: job.attempts, source: runtimeModel(this.env) });
      this.setMissionJobStatus(job.id, 'failed', message);
    }

    if (this.hasRunnableMissionJobs()) {
      await this.scheduleMissionAlarm(MISSION_ALARM_DELAY_MS);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
    return { ok: true, processed: true };
  }

  async alarm() {
    await this.processNextMissionJob();
  }

  async beginMission(mission, intent = 'dashboard_build') {
    this.expireStaleMissionStarts();
    const governance = buildGovernanceSummary({
      provider: runtimeModel(this.env),
      events: this.listEvents(250),
      missionLockTimeoutMs: MISSION_LOCK_TIMEOUT_MS,
    });
    if (governance.missionConcurrency?.blocked) {
      return {
        ok: false,
        error: 'mission_concurrency_locked',
        lock: governance.missionConcurrency,
        state: this.getState(),
      };
    }
    const event = this.appendEvent(
      'mission.started',
      { title: mission.title, intent, description: mission.description.slice(0, 1200) },
      'ui',
      mission.id,
      { traceId: mission.id },
    );
    this.saveMissionProgress(mission, intent, 'accepted');
    this.enqueueMissionJob(mission, intent);
    await this.scheduleMissionAlarm(MISSION_ALARM_DELAY_MS);
    return { ok: true, event, state: this.getState() };
  }

  async resetState() {
    const current = this.latestSnapshot() || baseState({}, this.env);
    const activeMission = current?.activeMission || null;
    if (activeMission?.id && !this.missionHasFinalEvent(activeMission.id)) {
      this.appendEvent(
        'mission.archived',
        {
          title: activeMission.title || 'missao',
          reason: 'manual_reset',
          status: current?.activeRun?.status || 'reset',
        },
        'ui',
        activeMission.id,
        { traceId: activeMission.id },
      );
    }
    this.processingMissionJob = null;
    const blank = baseState({}, this.env);
    this.ctx.storage.sql.exec("DELETE FROM mission_jobs WHERE status IN ('queued', 'running')");
    await this.ctx.storage.deleteAlarm();
    this.ctx.storage.sql.exec(
      'INSERT INTO snapshots (ts, timestamp, state_json) VALUES (?, ?, ?)',
      Date.now(),
      nowIso(),
      JSON.stringify(blank),
    );
    this.appendEvent('state.reset', {}, 'ui');
    return this.getState({ includeLatestSnapshot: false });
  }

  heartbeat(action = 'tick') {
    const type = action === 'play' ? 'heartbeat.play' : action === 'pause' ? 'heartbeat.pause' : 'heartbeat.tick';
    this.appendEvent(type, {}, 'heartbeat');
    return this.getState();
  }

  getState(options = {}) {
    if (options.expireStale === true) this.expireStaleMissionStarts();
    const eventLimit = options.heavyRead === true ? RUNTIME_STATE_HEAVY_READ_EVENT_LIMIT : RUNTIME_STATE_READ_EVENT_LIMIT;
    const events = this.listEvents(eventLimit);
    const summary = summarizeRuntimeEvents(events, { limit: eventLimit });
    const latest = options.includeLatestSnapshot === false ? null : this.latestSnapshot();
    const history = options.includeHistory === true ? this.missionHistory(12) : (latest?.missionHistory || []);
    const goals = options.includeGoals === true ? this.listGoals(12) : (latest?.goals || []);
    const goalsSummary = summarizeGoals(goals);
    const heartbeatLogs = events.slice(0, 30).reverse().map(eventLine);
    const modelSelector = runtimeModelSelector(this.env);
    const base = latest || baseState({}, this.env);
    const governance = buildGovernanceSummary({
      provider: modelSelector.model,
      events,
      missionLockTimeoutMs: MISSION_LOCK_TIMEOUT_MS,
    });
    return rememberRuntimeState({
      ...base,
      goals,
      governance,
      missionHistory: history,
      heartbeatLogs: heartbeatLogs.length ? heartbeatLogs : base.heartbeatLogs,
      heartbeatMonitor: {
        ...(base.heartbeatMonitor || {}),
        service: 'luca-ai-cloud',
        status: 'online',
        updatedAt: nowIso(),
        intervalSeconds: 0,
        summary: `${summary.total} eventos persistidos no runtime`,
        beats: Number(summary.total || 0),
        lastAction: events[0]?.type || 'idle',
        eventTypes: summary.byType,
        goalsSummary,
        provider: modelSelector.model,
        modelSelector,
        governance,
      },
    });
  }
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

async function callGlm(env, messages, { temperature = 0.25, maxTokens = 2600 } = {}) {
  const apiKey = env.GLM_API_KEY;
  if (!apiKey) throw new Error('GLM_API_KEY ausente no Worker');
  const base = (env.GLM_BASE || 'https://api.z.ai/api/coding/paas/v4').replace(/\/+$/, '');
  const model = runtimeModel(env);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GLM_REQUEST_TIMEOUT_MS);
  let response;
  let body = '';
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    });
    body = await response.text();
  } catch (error) {
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      throw new Error(`GLM timeout apos ${Math.round(GLM_REQUEST_TIMEOUT_MS / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`GLM ${response.status}: ${body.slice(0, 600)}`);
  }
  const data = JSON.parse(body);
  return {
    content: data?.choices?.[0]?.message?.content || '',
    usage: data?.usage || null,
    model: data?.model || model,
  };
}

async function callGlmJson(env, messages, options = {}) {
  const first = await callGlm(env, messages, options);
  try {
    return { parsed: parseJsonObject(first.content), meta: first };
  } catch (firstError) {
    const content = String(first.content || '').trim();
    const repairMessages = content
      ? [
          {
            role: 'system',
            content: 'Voce corrige JSON invalido. Retorne somente JSON valido, sem markdown, sem explicacao. Preserve os dados e campos recebidos.',
          },
          {
            role: 'user',
            content: `JSON invalido a corrigir:\n${content.slice(0, 16000)}\n\nErro do parser: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
          },
        ]
      : messages;
    const second = await callGlm(env, repairMessages, {
      temperature: 0.05,
      maxTokens: Math.max(Number(options.maxTokens || 2600), 3800),
    });
    return { parsed: parseJsonObject(second.content), meta: second };
  }
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 12).map((block) => ({
    type: String(block.type || 'note'),
    title: String(block.title || 'Bloco'),
    value: block.value,
    body: block.body ? String(block.body) : undefined,
    items: Array.isArray(block.items) ? block.items.slice(0, 8) : undefined,
  }));
}

function hasForbiddenPresentationLanguage(value) {
  return FORBIDDEN_PRESENTATION_LANGUAGE.test(JSON.stringify(value || {}));
}

function cleanPublicText(text) {
  return String(text || '')
    .replace(/mock/gi, 'linguagem proibida')
    .replace(/demo/gi, 'linguagem proibida')
    .replace(/simulado|simulada/gi, 'linguagem proibida');
}

function cleanPublicValue(value) {
  if (Array.isArray(value)) return value.map(cleanPublicValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanPublicValue(item)]));
  }
  if (typeof value === 'string') return cleanPublicText(value);
  return value;
}

function dashboardQualityIssues(analysis) {
  return executiveDashboardContractIssues(analysis?.dashboard || {});
}

function analysisContractIssues(mission, analysis) {
  return [
    ...dashboardQualityIssues(analysis),
    ...insuranceAgentMessageIssues(mission, analysis?.agentMessages || []),
  ];
}

function workerFinalReportFromAnalysis(mission = {}, analysis = {}, fallbackReason = '') {
  const contributions = Array.isArray(analysis?.agentMessages) ? analysis.agentMessages : [];
  return normalizeSupervisorFinalReport({
    mission,
    snapshot: { contributions },
    report: {
      summary: analysis?.finalReport || analysis?.briefing || analysis?.dashboard?.subtitle || '',
      findings: Array.isArray(analysis?.findings) ? analysis.findings : [],
      designerBrief: analysis?.designerBrief || {},
      successCriteria: Array.isArray(analysis?.successCriteria) ? analysis.successCriteria : [],
      fallback: Boolean(fallbackReason),
    },
    fallbackReason,
  });
}

function technicalFallbackText(value = '') {
  return /\b(glm|contrato incompleto|revisao deterministica|contingencia deterministica|fallback|erro|tecnico|metricas executivas|blocos obrigatorios)\b/i.test(String(value || ''));
}

function publicFallbackSummary(mission = {}, report = {}) {
  const summary = String(report?.summary || '').trim();
  if (summary && !technicalFallbackText(summary)) return summary;
  const finding = Array.isArray(report?.findings)
    ? report.findings.find((item) => item?.detail && !technicalFallbackText(item.detail))
    : null;
  if (finding?.detail) return compactText(finding.detail, 360);
  const missionTitle = String(mission?.title || '').trim();
  return compactText(
    `Leitura executiva${missionTitle ? ` para ${missionTitle}` : ''}: priorizar riscos do briefing, explicitar premissas, manter valor financeiro como proxy/pendente e fechar plano preventivo com criterio de sucesso verificavel.`,
    360,
  );
}

function hasRoleContribution(messages = [], agentId = '') {
  return messages.some((message) => message?.agentId === agentId && message?.type !== 'info');
}

function deterministicClosureAgentMessages(mission = {}, analysis = {}, report = {}, fallbackReason = '') {
  const existing = Array.isArray(analysis?.agentMessages) ? analysis.agentMessages : [];
  const messages = [...existing];
  const evidence = missionEvidenceBrief(mission, 1000);
  const summary = compactText(report?.summary || mission?.description || 'missao em fechamento', 320);
  const findingText = Array.isArray(report?.findings)
    ? compactText(report.findings.map((finding) => `${finding?.title || ''}: ${finding?.detail || ''}`).filter(Boolean).join(' '), 520)
    : '';

  if (!hasRoleContribution(messages, 'pesquisador')) {
    messages.push({
      agentId: 'pesquisador',
      agentName: 'Pesquisador',
      type: 'resultado',
      content: `Evidencia: ${evidence}. Lacuna critica: valor segurado, premio, datas por apolice e base financeira consolidada ficam pendentes quando nao fornecidos no briefing. Risco principal: ${summary}`,
    });
  }

  if (!hasRoleContribution(messages, 'planejador')) {
    messages.push({
      agentId: 'planejador',
      agentName: 'Planejador',
      type: 'acao',
      content: 'Prioridade: carteira, regiao ou ativo com maior risco descrito no briefing. Acao imediata: validar evidencias, cruzar apolices/ZARC quando aplicavel, priorizar carteira critica e notificar responsaveis. Dono sugerido: underwriting com apoio de sinistros/operacao.',
    });
  }

  if (!messages.some((message) => message?.agentId === 'designer')) {
    messages.push({
      agentId: 'designer',
      agentName: 'Designer',
      type: 'resultado',
      content: `Leitura executiva: ${findingText || summary} Mensagem-chave: publicar dor, evidencias, ranking, plano, valor/proxy e criterio de sucesso sem inventar dados financeiros.`,
    });
  }

  if (!messages.some((message) => message?.agentId === 'supervisor' && /veredito/i.test(String(message?.content || '')))) {
    messages.push({
      agentId: 'supervisor',
      agentName: 'Supervisor',
      type: 'verificacao',
      content: `Veredito: publicar canvas com proxy explicito e trilha de pendencias. Proxima acao: usar o plano preventivo para coletar dados pendentes e fechar a decisao. Pendencia critica: ${compactText(fallbackReason || report?.summary || 'validacao executiva final', 260)}`,
    });
  }

  return messages;
}

function withDeterministicDashboard(mission = {}, analysis = {}, fallbackReason = 'dashboard contract fallback') {
  const seedReport = workerFinalReportFromAnalysis(mission, analysis, fallbackReason);
  const publicSeedReport = {
    ...seedReport,
    summary: publicFallbackSummary(mission, seedReport),
  };
  const agentMessages = deterministicClosureAgentMessages(mission, analysis, publicSeedReport, fallbackReason);
  const report = workerFinalReportFromAnalysis(
    mission,
    {
      ...analysis,
      agentMessages,
      finalReport: publicSeedReport.summary,
    },
    fallbackReason,
  );
  return {
    ...analysis,
    agentMessages,
    finalReport: publicFallbackSummary(mission, report),
    dashboard: buildDeterministicExecutiveDashboard({
      mission,
      finalReport: report,
      snapshot: { contributions: agentMessages },
    }),
    dashboardContractFallback: true,
  };
}

function missionEvidenceBrief(mission = {}, max = 900) {
  const text = primaryMissionText(mission) || mission?.success || mission?.title || 'Briefing sem detalhe adicional.';
  return compactText(text, max);
}

function buildRuntimeFallbackAnalysis(mission = {}, reason = 'fallback deterministico acionado') {
  const evidence = missionEvidenceBrief(mission);
  const success = compactText(mission?.success || 'Canvas executivo publicado com prioridade, plano e criterio verificavel.', 360);
  const title = compactText(mission?.title || primaryMissionText(mission) || 'Missao LUCA-AI', 140);
  return withDeterministicDashboard(
    mission,
    {
      briefing: `Fallback deterministico acionado para manter a missao entregue: ${title}.`,
      assumptions: [
        'Usar somente dados declarados no briefing como evidencia.',
        'Marcar dados ausentes como premissa, proxy ou pendente.',
        'Nao inventar valores financeiros sem base informada.',
      ],
      agentMessages: [
        {
          agentId: 'transformador-missao',
          agentName: 'Transformador de Missao',
          type: 'resultado',
          content: `Objetivo: transformar o briefing em canvas executivo. Decisao esperada: priorizar riscos e acao operacional defensavel. Criterio de sucesso: ${success}`,
        },
        {
          agentId: 'pesquisador',
          agentName: 'Pesquisador',
          type: 'resultado',
          content: `Evidencia: ${evidence}. Lacuna critica: qualquer dado ausente, especialmente financeiro, fica como pendente/proxy. Risco principal: decisao sem priorizacao explicita atrasaria underwriting, prevencao ou acionamento operacional.`,
        },
        {
          agentId: 'planejador',
          agentName: 'Planejador',
          type: 'acao',
          content: 'Prioridade: ordenar carteira/ativo/regiao com maior risco declarado no briefing. Acao imediata: validar evidencias, acionar responsavel e coletar dados pendentes. Dono sugerido: underwriting com apoio de sinistros/operacao.',
        },
        {
          agentId: 'designer',
          agentName: 'Designer',
          type: 'resultado',
          content: 'Leitura executiva: apresentar dor, evidencias, ranking, plano preventivo, valor decisorio e criterio de sucesso em blocos curtos. Mensagem-chave: avancar com proxy explicito quando a base ainda estiver incompleta.',
        },
        {
          agentId: 'supervisor',
          agentName: 'Supervisor',
          type: 'decisao',
          content: 'Veredito: publicar canvas de contingencia validavel. Proxima acao: usar o ranking e o plano para destravar a decisao. Pendencia critica: base financeira, premio, valor segurado ou evidencias complementares seguem pendentes quando nao constarem no briefing.',
        },
      ],
      database: {
        sourceName: 'Briefing da missao + fallback deterministico',
        rawItems: [
          { label: 'Briefing recebido', type: 'mission', status: 'loaded', detail: evidence },
        ],
        processingItems: [
          { label: 'Normalizacao deterministica', type: 'fallback', status: 'ready', detail: compactText(reason, 360) },
        ],
        publicItems: [
          {
            label: 'Canvas executivo',
            type: 'dashboard',
            status: 'published',
            summary: 'Resultado gerado por contingencia deterministica para evitar missao sem fechamento.',
            whyItMatters: 'A operacao recebe uma leitura acionavel mesmo quando o GLM falha ou retorna contrato incompleto.',
          },
        ],
      },
      finalReport: `Leitura executiva de contingencia: ${title}. A decisao usa evidencias do briefing, premissas explicitas, lacunas pendentes e criterio de sucesso verificavel.`,
    },
    reason,
  );
}

function primaryMissionText(mission = {}) {
  return String(mission?.description || mission?.title || '').trim();
}

function missionRequestsAgentConversation(mission = {}) {
  const description = primaryMissionText(mission).toLowerCase();
  if (!description) return false;
  const mentionsConversation = /\b(conversar|conversarem|conversem|conversa|dialogar|discutir|debater|brainstorm)\b/i.test(description)
    && /\b(supervisor|pesquisador|planejador|designer|agente|agentes)\b/i.test(description);
  const asksDashboard = /\b(dashboard|canvas|grafico|gr[aá]fico|relatorio|relat[oó]rio|visualiz)\b/i.test(description);
  return mentionsConversation && !asksDashboard;
}

function missionRequestsChatOnlyAction(mission = {}) {
  const text = primaryMissionText(mission).toLowerCase();
  if (!text || missionRequestsAgentConversation(mission)) return false;
  const asksDashboard = /\b(dashboard|canvas|grafico|gr[aá]fico|relatorio|relat[oó]rio|visualiz|sompo|sinistro|underwriting|risco|telemetria|csv)\b/i.test(text);
  if (asksDashboard) return false;
  const asksChat = /\b(chat|global|mensagem|mandem|manda|mauda|mandar|respondam|responder|digam|dizer|falem|falar|oi|ola|ol[aá]|salve)\b/i.test(text);
  const asksSimpleAction = /\b(contar|contem|conte|piada|brincadeira|historia|escolh(er|a|am|em)|avali(ar|e|em)|julgar|reag(ir|em|am|e)|debater|recomend(ar|e|em))\b/i.test(text);
  return asksChat || asksSimpleAction;
}

function classifyMissionIntent(mission = {}) {
  if (missionRequestsAgentConversation(mission)) return 'agent_conversation';
  if (missionRequestsChatOnlyAction(mission)) return 'chat_only';
  return 'dashboard_build';
}

function chatMessage(agentId, agentName, type, content) {
  const createdAt = nowIso();
  return {
    id: `${agentId}-${crypto.randomUUID()}`,
    agentId,
    agentName,
    type,
    content: String(content || '').slice(0, 1800),
    timestamp: formatBrazilTime(createdAt),
    createdAt,
  };
}

function runIdForMission(mission = {}) {
  if (mission?.runId) return String(mission.runId);
  const id = String(mission?.id || Date.now()).replace(/^mission-/, '');
  return `run-${id}`;
}

function missionProgressLabel(phase = 'accepted') {
  const labels = {
    accepted: 'missao aceita pelo runtime',
    glm_started: 'modelo analisando briefing',
    analysis_generated: 'analise GLM recebida',
    repairing: 'normalizando contrato executivo',
    verifying: 'verificando fechamento',
    retrying: 'retentativa GLM agendada',
    fallback: 'canvas deterministico de contingencia',
  };
  return labels[phase] || 'missao em processamento';
}

function missionProgressRunStatus(phase = 'accepted') {
  if (phase === 'accepted') return 'pending';
  if (phase === 'verifying') return 'verifying';
  return 'running';
}

function missionProgressMessages(mission, intent, phase = 'accepted', payload = {}) {
  const title = compactText(mission?.title || mission?.description || 'missao', 120);
  const messages = [
    chatMessage('maestro', 'Maestro', 'sistema', `Missao aceita: ${title}. Lock operacional ativo e job persistido no runtime.`),
    chatMessage('transformador-missao', 'Transformador de Missao', 'info', 'Objetivo normalizado; vou manter criterio de sucesso e dados faltantes explicitos.'),
    chatMessage('supervisor', 'Supervisor', 'decisao', intent === 'chat_only'
      ? 'Contrato: responder no chat global com falas rastreaveis dos agentes.'
      : 'Contrato: gerar canvas executivo com evidencias, ranking, plano, valor e criterio de sucesso.'),
  ];

  if (phase !== 'accepted') {
    messages.push(chatMessage('pesquisador', 'Pesquisador', 'info', 'Extraindo evidencias do briefing e lacunas que nao podem ser inventadas.'));
    messages.push(chatMessage('planejador', 'Planejador', 'acao', 'Preparando priorizacao e proxima acao operacional com dono claro.'));
  }
  if (['analysis_generated', 'repairing', 'verifying'].includes(phase)) {
    messages.push(chatMessage('designer', 'Designer', 'info', 'Convertendo a analise em blocos executivos legiveis para decisao.'));
  }
  if (phase === 'verifying') {
    messages.push(chatMessage('supervisor', 'Supervisor', 'decisao', 'Fechamento em verificacao: contrato, lacunas e criterio de sucesso.'));
  }
  if (phase === 'retrying') {
    messages.push(chatMessage('supervisor', 'Supervisor', 'alerta', `GLM falhou na tentativa anterior; retentativa ${payload.attempt || 2} agendada. Motivo: ${compactText(payload.error, 220)}`));
  }
  return messages;
}

function agentsFromProgressMessages(messages = [], model = runtimeModel()) {
  return runtimeAgents(model).map((agent) => {
    const agentMsgs = messages.filter((message) => message.agentId === agent.id);
    const active = agentMsgs.length > 0;
    return {
      ...agent,
      status: agent.id === 'supervisor' ? 'running' : active ? 'processing' : 'queued',
      lines: [
        ...agent.lines,
        ...agentMsgs.map((message) => `[${message.timestamp}] ${message.agentName}: ${message.content}`),
      ].slice(-80),
    };
  });
}

function stateFromMissionProgress(mission, intent, phase = 'accepted', payload = {}, env = {}) {
  const model = runtimeModel(env);
  const messages = missionProgressMessages(mission, intent, phase, payload);
  return baseState({
    supervisorMode: 'running',
    activeMission: mission,
    activeRun: {
      id: runIdForMission(mission),
      status: missionProgressRunStatus(phase),
      intent,
      phase,
      progressLabel: missionProgressLabel(phase),
      createdAt: mission?.activatedAt || nowIso(),
      updatedAt: nowIso(),
      attempts: payload.attempt || 1,
    },
    temporaryDashboard: null,
    database: {
      source: { name: `${model} runtime`, topic: mission?.title || 'missao real' },
      layers: {
        rawResearch: { status: phase === 'accepted' ? 'queued' : 'loading', items: [], dashboardVisibility: 'internal' },
        processing: { status: phase === 'accepted' ? 'queued' : 'running', items: [], dashboardVisibility: 'technical' },
        dashboardIntegration: { status: 'pending', items: [], dashboardVisibility: 'public' },
      },
      heartbeat: [
        { agentId: 'supervisor', status: 'running', note: missionProgressLabel(phase), time: nowTime() },
      ],
    },
    heartbeatLogs: [
      `[${nowTime()}] mission: ${missionProgressLabel(phase)}`,
      `[${nowTime()}] ${model}: ${phase === 'accepted' ? 'job aguardando alarm' : 'execucao em andamento'}`,
    ],
    globalChatMessages: messages,
    agents: agentsFromProgressMessages(messages, model),
  }, env);
}

function stateFromMissionFailure(mission, error, payload = {}, env = {}) {
  const model = runtimeModel(env);
  const reason = payload.reason || compactText(error, 700);
  const messages = [
    chatMessage('maestro', 'Maestro', 'sistema', `Missao encerrada com falha operacional: ${compactText(mission?.title || mission?.id || 'missao', 120)}.`),
    chatMessage('supervisor', 'Supervisor', 'alerta', `Falha: ${compactText(reason, 700)}`),
  ];
  const agents = runtimeAgents(model).map((agent) => {
    const agentMsgs = messages.filter((message) => message.agentId === agent.id);
    return {
      ...agent,
      status: agent.id === 'supervisor' ? 'error' : 'ready',
      lines: [
        ...agent.lines,
        ...agentMsgs.map((message) => `[${message.timestamp}] ${message.agentName}: ${message.content}`),
      ].slice(-80),
    };
  });
  return baseState({
    supervisorMode: 'error',
    activeMission: mission,
    activeRun: {
      id: runIdForMission(mission),
      status: 'failed',
      error: compactText(error, 1000),
      completedAt: nowIso(),
      verifier: { approved: false, reason: compactText(reason, 700), missing: [] },
      attempts: payload.attempts || payload.attempt || null,
    },
    temporaryDashboard: null,
    heartbeatLogs: [
      `[${nowTime()}] error: ${compactText(error, 240)}`,
    ],
    globalChatMessages: messages,
    agents,
  }, env);
}

function stateFromChatOnly(mission, analysis, meta, verifier = { approved: true, reason: '', missing: [] }, env = {}) {
  const model = meta.model || runtimeModel(env);
  const agentMessages = Array.isArray(analysis.agentMessages) ? analysis.agentMessages.slice(0, 6) : [];
  const content = String(analysis.finalMessage || analysis.message || analysis.response || 'Pedido atendido no chat.').slice(0, 1800);
  const messages = [
    chatMessage('maestro', 'Maestro', 'sistema', `Missao de chat processada por ${model} em runtime cloud real.`),
    ...(analysis.briefing ? [chatMessage('supervisor', 'Supervisor', 'decisao', analysis.briefing)] : []),
    ...agentMessages.map((message) => (
      chatMessage(message.agentId || 'supervisor', message.agentName || message.agentId || 'Agente', message.type || 'info', message.content || '')
    )),
    chatMessage('supervisor', 'Supervisor', 'resultado', content),
    ...(!verifier.approved ? [chatMessage('supervisor', 'Supervisor', 'alerta', verifier.reason || 'Verificador bloqueou o fechamento do chat.')] : []),
  ];
  const agents = runtimeAgents(model).map((agent) => ({
    ...agent,
    status: 'ready',
    lines: [
      ...agent.lines,
      ...messages.filter((message) => message.agentId === agent.id).map((m) => `[${m.timestamp}] ${m.agentName}: ${m.content}`),
    ].slice(-80),
  }));
  return baseState({
    supervisorMode: verifier.approved ? 'ready' : 'error',
    activeMission: mission,
    activeRun: {
      id: runIdForMission(mission),
      status: verifier.approved ? 'chat_completed' : 'needs_revision',
      verifier,
      usage: meta.usage || null,
    },
    temporaryDashboard: null,
    heartbeatLogs: [
      `[${nowTime()}] ${model}: chat gerado`,
      `[${nowTime()}] chat: ${verifier.approved ? 'concluido sem canvas' : 'bloqueado por verificador'}`,
    ],
    globalChatMessages: messages,
    agents,
  }, env);
}

function buildChatOnlyPrompt(mission) {
  return [
    {
      role: 'system',
      content: `Voce e o runtime multiagente do LucaAI no Chat Global. Responda somente JSON valido.

${buildAgentPlaybook(['maestro', 'transformador-missao', 'supervisor', 'pesquisador', 'planejador', 'designer'])}

${businessWorkflowHint(mission)}
${agentCollaborationContract(mission)}
${insuranceRoleOutputContract(mission, { mode: 'chat_only' })}

Cumpra exatamente o pedido do usuario no chat. Nao gere canvas, dashboard, analise longa ou pipeline se o usuario so pediu uma mensagem/conversa.
Entregue colaboracao real entre papeis, nao uma unica resposta mascarada de multiagente.
Use entre 3 e 5 agentMessages. Sempre inclua Supervisor no fechamento e pelo menos um entre Pesquisador ou Planejador quando houver qualquer julgamento, recomendacao ou risco.
Se o pedido for casual, mantenha as falas curtas. Se o pedido tocar negocio, risco, underwriting ou Sompo, cada fala deve trazer utilidade concreta.

Schema:
{
  "briefing":"resumo curto do pedido",
  "agentMessages":[
    {"agentId":"pesquisador|planejador|designer|supervisor","agentName":"...","type":"info|acao|decisao|resultado","content":"..."}
  ],
  "finalMessage":"mensagem final curta do Supervisor para aparecer no chat global"
}`,
    },
    {
      role: 'user',
      content: mission.description,
    },
  ];
}

function buildPrompt({ title, description, success }) {
  const mission = { title, description, success };
  return [
    {
      role: 'system',
      content: `Voce e o runtime real do LucaAI para uma apresentacao da Sompo. Responda somente JSON valido.

${buildAgentPlaybook(['maestro', 'transformador-missao', 'supervisor', 'pesquisador', 'planejador', 'designer'])}

${businessWorkflowHint(mission)}
${agentCollaborationContract(mission)}
${insuranceRoleOutputContract(mission, { mode: 'dashboard' })}

Proibido inventar dados como se fossem reais. Se faltar dado real, rotule como "premissa", "estimativa" ou "necessita CSV/telemetria".
Proibido usar linguagem de mock, demo, simulado ou simulada em qualquer campo. Dados citados na missao do usuario sao dados fornecidos pelo briefing e devem ser tratados como entrada real do caso.
Seja objetivo, mas sempre com frases completas. Nao use reticencias (...), nao corte palavras e nao abrevie evidencias, telemetria ou lacunas financeiras no meio da frase. Gere no maximo 4 metricas, 5 blocos e 5 mensagens de agentes.
Use portugues executivo claro. Nao use palavras inventadas, jargoes estranhos ou verbos incomuns quando uma acao operacional simples resolver.
Obrigatorio: gere exatamente 5 blocos de dashboard com estes titles exatos: "Dor e evidencias", "Ranking de risco", "Plano preventivo", "Valor para seguradora", "Criterio de sucesso".
No bloco "Plano preventivo", sempre escreva pelo menos uma acao concreta e um dono/responsavel claro.
O bloco "Valor para seguradora" deve explicar valor operacional/decisorio e marcar valores financeiros como pendentes se nao houver dado.
O bloco "Criterio de sucesso" deve explicar como a Sompo saberia que a solucao foi aprovada.
Sua funcao e transformar a missao em uma analise executiva defensavel para seguradora: dor, evidencias, risco, acoes, criterios de sucesso e canvas.
As mensagens dos agentes precisam refletir papeis reais: Pesquisador evidencia/lacunas, Planejador prioriza acoes, Designer sintetiza para leitura executiva, Supervisor fecha o julgamento.

Schema obrigatorio:
{
  "briefing": "resumo da missao interpretada",
  "assumptions": ["premissas adotadas"],
  "agentMessages": [
    {"agentId":"transformador-missao|pesquisador|planejador|designer","agentName":"nome","type":"info|resultado|acao|decisao","content":"frase completa sem reticencias"}
  ],
  "dashboard": {
    "title": "titulo",
    "subtitle": "frase executiva",
    "metrics": [{"label":"metrica","value":"valor"}],
    "blocks": [
      {"type":"note|tower|pie|topics|metric","title":"titulo","body":"frase completa sem reticencias","items":[{"label":"item","value":1}]}
    ]
  },
  "database": {
    "sourceName": "fonte",
    "rawItems": [{"label":"entrada","type":"tipo","status":"status","detail":"detalhe completo"}],
    "processingItems": [{"label":"processamento","type":"tipo","status":"status","detail":"detalhe completo"}],
    "publicItems": [{"label":"resultado","type":"tipo","status":"status","summary":"resumo completo","whyItMatters":"por que importa"}]
  },
  "finalReport": "veredito executivo curto"
}`,
    },
    {
      role: 'user',
      content: `Titulo: ${title || ''}
Missao: ${description || ''}
Criterio de sucesso: ${success || ''}

Contexto: o usuario quer um caso de uso real para apresentacao da Sompo. Se a missao mencionar CSV, telemetria, fazenda ou sinistros, use isso como dados fornecidos pelo briefing, mas marque qualquer numero nao fornecido como estimativa/premissa. Nao classifique o caso como mock, demo ou simulado.`,
    },
  ];
}

async function repairPresentationLanguage(env, mission, analysis) {
  const issues = analysisContractIssues(mission, analysis);
  if (!hasForbiddenPresentationLanguage(analysis) && !issues.length) return analysis;
  let repaired;
  try {
    repaired = await callGlmJson(
      env,
      [
        {
          role: 'system',
          content: `Voce corrige uma analise JSON do LucaAI para apresentacao real da Sompo. Retorne somente JSON valido.
Remova linguagem proibida de material ficticio. Preserve os dados fornecidos pelo briefing: sinistros, telemetria, fazenda, lacunas e premissas. Nao invente dados financeiros.
${insuranceRoleOutputContract(mission, { mode: 'dashboard' })}
O dashboard deve ter exatamente estes 5 blocos com titles exatos: "Dor e evidencias", "Ranking de risco", "Plano preventivo", "Valor para seguradora", "Criterio de sucesso".
No bloco "Plano preventivo", explicite acao concreta e dono/responsavel.
Nao use reticencias (...), nao corte palavras e nao deixe body com frase incompleta.`,
        },
        {
          role: 'user',
          content: `Missao:
${mission.description}

Problemas a corrigir:
${issues.join('\n') || 'linguagem proibida'}

JSON a corrigir:
${JSON.stringify(analysis).slice(0, 16000)}`,
        },
      ],
      { temperature: 0.05, maxTokens: 2600 },
    );
  } catch (error) {
    const fallbackAnalysis = withDeterministicDashboard(
      mission,
      analysis,
      `normalizacao GLM falhou: ${error instanceof Error ? error.message : String(error)}`,
    );
    const fallbackIssues = analysisContractIssues(mission, fallbackAnalysis);
    if (!fallbackIssues.length) return fallbackAnalysis;
    throw error;
  }
  if (hasForbiddenPresentationLanguage(repaired.parsed)) {
    const fallbackAnalysis = withDeterministicDashboard(
      mission,
      repaired.parsed,
      'GLM retornou linguagem proibida para apresentacao real',
    );
    const fallbackIssues = analysisContractIssues(mission, fallbackAnalysis);
    if (!fallbackIssues.length) return fallbackAnalysis;
    throw new Error('GLM retornou linguagem proibida para apresentacao real');
  }
  const remainingIssues = analysisContractIssues(mission, repaired.parsed);
  if (remainingIssues.length) {
    const dashboardIssues = dashboardQualityIssues(repaired.parsed);
    const agentIssues = insuranceAgentMessageIssues(mission, repaired.parsed?.agentMessages || []);
    if (dashboardIssues.length) {
      const fallbackAnalysis = withDeterministicDashboard(
        mission,
        repaired.parsed,
        `GLM retornou dashboard incompleto: ${dashboardIssues.join('; ')}${agentIssues.length ? `; agentMessages: ${agentIssues.join('; ')}` : ''}`,
      );
      const fallbackIssues = analysisContractIssues(mission, fallbackAnalysis);
      if (!fallbackIssues.length) return fallbackAnalysis;
    }
    throw new Error(`GLM retornou contrato incompleto: ${remainingIssues.join('; ')}`);
  }
  return repaired.parsed;
}

async function repairChatOnlyInsuranceMessages(env, mission, analysis) {
  const issues = insuranceAgentMessageIssues(mission, analysis?.agentMessages || []);
  if (!issues.length) return analysis;
  const repaired = await callGlmJson(
    env,
    [
      {
        role: 'system',
        content: `Voce corrige um JSON de chat multiagente do LucaAI para um caso real de seguradora. Retorne somente JSON valido.
Preserve a intencao do pedido e aplique os rotulos obrigatorios por papel sem enrolacao.
${insuranceRoleOutputContract(mission, { mode: 'chat_only' })}`,
      },
      {
        role: 'user',
        content: `Missao:
${mission.description}

Problemas a corrigir:
${issues.join('\n')}

JSON a corrigir:
${JSON.stringify(analysis).slice(0, 12000)}`,
      },
    ],
    { temperature: 0.05, maxTokens: 1400 },
  );
  const remaining = insuranceAgentMessageIssues(mission, repaired.parsed?.agentMessages || []);
  if (remaining.length) {
    throw new Error(`chat insurance contract incompleto: ${remaining.join('; ')}`);
  }
  return repaired.parsed;
}

function normalizeVerifier(verifier) {
  const missing = Array.isArray(verifier?.missing) ? verifier.missing.filter(Boolean).map(cleanPublicText) : [];
  return {
    approved: Boolean(verifier?.approved) && missing.length === 0,
    reason: cleanPublicText(verifier?.reason || ''),
    missing,
    presentationUse: cleanPublicText(verifier?.presentationUse || ''),
  };
}

function normalizeModelClosureReview(verifier) {
  const normalized = normalizeVerifier(verifier);
  return {
    verdict: normalized.approved ? 'approved' : 'blocked',
    reasons: normalized.reason ? [normalized.reason] : [],
    gaps: normalized.missing || [],
    nextSteps: [],
    presentationUse: normalized.presentationUse || '',
    source: 'model',
  };
}

function closureReviewToVerifier(review = {}) {
  const gaps = Array.isArray(review?.gaps) ? review.gaps.filter(Boolean).map(cleanPublicText) : [];
  const reasons = Array.isArray(review?.reasons) ? review.reasons.filter(Boolean).map(cleanPublicText) : [];
  return {
    approved: review?.verdict === 'approved' && gaps.length === 0,
    reason: reasons[0] || (review?.verdict === 'approved' ? 'Revisao aprovada.' : 'Revisao bloqueou o encerramento.'),
    missing: gaps,
    presentationUse: cleanPublicText(review?.presentationUse || ''),
    review,
  };
}

function buildDeterministicWorkerReview({ mission, analysis, mode }) {
  const chatMessages = [
    ...(Array.isArray(analysis?.agentMessages) ? analysis.agentMessages : []),
    ...(analysis?.finalReport ? [{ agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: analysis.finalReport }] : []),
    ...(analysis?.finalMessage ? [{ agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: analysis.finalMessage }] : []),
  ];
  const agents = AGENTS.map((agent) => ({ id: agent.id, name: agent.name, enabled: true }));
  const finalReport = workerFinalReportFromAnalysis(mission, analysis);
  const review = buildDeterministicClosureReview({
    mission,
    chatMessages,
    agents,
    closureContext: {
      type: mode,
      proposedStatus: 'completed',
      requiresAllAgents: missionRequestsAllAgents(mission),
      needsSupervisorJudgment: missionNeedsSupervisorJudgment(mission),
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: mode === 'dashboard_build' ? Boolean(analysis?.dashboard?.blocks?.length) : true,
      hasFinalReport: Boolean(analysis?.finalReport || analysis?.finalMessage),
      requireResearchEvidence: mode === 'dashboard_build',
      dashboard: mode === 'dashboard_build' ? analysis?.dashboard || null : null,
      finalReport,
    },
  });
  const contractIssues = insuranceAgentMessageIssues(mission, analysis?.agentMessages || []);
  if (!contractIssues.length) return review;
  return {
    ...review,
    verdict: 'blocked',
    reasons: [...(review.reasons || []), 'Agentes nao seguiram o contrato de saida para seguradora.'],
    gaps: [...(review.gaps || []), ...contractIssues],
  };
}

function reviewNeedsDeterministicFallback(review = {}) {
  return Array.isArray(review?.gaps)
    && review.gaps.some((gap) => /^(Canvas executivo|Contribuicao obrigatoria ausente|Pesquisador nao)/i.test(String(gap || '')));
}

function prepareAnalysisForClosure(mission, analysis, mode) {
  const initialReview = buildDeterministicWorkerReview({ mission, analysis, mode });
  if (mode !== 'dashboard_build' || initialReview.verdict === 'approved' || !reviewNeedsDeterministicFallback(initialReview)) {
    return { analysis, review: initialReview };
  }

  const fallbackAnalysis = cleanPublicValue(withDeterministicDashboard(
    mission,
    analysis,
    `revisao deterministica: ${initialReview.gaps.join('; ')}`,
  ));
  const fallbackReview = buildDeterministicWorkerReview({ mission, analysis: fallbackAnalysis, mode });
  return { analysis: fallbackAnalysis, review: fallbackReview };
}

function buildVerifierPrompt({ description, success, analysis }) {
  return [
    {
      role: 'system',
      content: `Voce e um verificador separado do LucaAI. Responda somente JSON valido.
Avalie se a analise atende ao criterio de sucesso sem aceitar resultado vazio, linguagem proibida de material ficticio ou autopromocional.
Se houver agentMessages de caso de seguradora, reprove se um papel nao trouxer seus rotulos obrigatorios.
Se missing tiver qualquer item, approved deve ser false.
Nao repita palavras de linguagem proibida no reason; escreva apenas "linguagem proibida" se precisar citar o problema.
Seja objetivo.
Schema: {"approved":true,"reason":"...","missing":["..."],"presentationUse":"..."}`
    },
    {
      role: 'user',
      content: `Missao original:
${description}

Criterio de sucesso:
${success}

Analise gerada:
${JSON.stringify(analysis).slice(0, 14000)}`,
    },
  ];
}

function stateFromAnalysis(mission, analysis, verifier, meta, env = {}) {
  const model = meta.model || runtimeModel(env);
  const dashboard = analysis.dashboard || {};
  const database = analysis.database || {};
  const rawItems = Array.isArray(database.rawItems) ? database.rawItems : [];
  const processingItems = Array.isArray(database.processingItems) ? database.processingItems : [];
  const publicItems = Array.isArray(database.publicItems) ? database.publicItems : [];
  const messages = [
    chatMessage('maestro', 'Maestro', 'sistema', `Missao processada por ${model} em runtime cloud real.`),
    chatMessage('supervisor', 'Supervisor', 'decisao', analysis.briefing || mission.description),
    ...(Array.isArray(analysis.agentMessages) ? analysis.agentMessages.slice(0, 8).map((m) => (
      chatMessage(m.agentId || 'supervisor', m.agentName || m.agentId || 'Agente', m.type || 'info', m.content || '')
    )) : []),
    ...(analysis.finalReport ? [chatMessage('supervisor', 'Supervisor', 'resultado', analysis.finalReport)] : []),
    chatMessage('supervisor', verifier.approved ? 'Supervisor' : 'Supervisor', verifier.approved ? 'resultado' : 'alerta', `${verifier.approved ? 'Verificacao aprovada' : 'Verificacao reprovada'}: ${verifier.reason || 'sem justificativa'}`),
  ];

  const agents = runtimeAgents(model).map((agent) => {
    const agentMsgs = messages.filter((m) => m.agentId === agent.id);
    return {
      ...agent,
      status: verifier.approved ? 'ready' : agent.id === 'supervisor' ? 'error' : 'ready',
      lines: [
        ...agent.lines,
        ...agentMsgs.map((m) => `[${m.timestamp}] ${m.agentName}: ${m.content}`),
      ].slice(-80),
    };
  });

  return baseState({
    supervisorMode: verifier.approved ? 'ready' : 'error',
    activeMission: mission,
    activeRun: {
      id: runIdForMission(mission),
      status: verifier.approved ? 'completed' : 'needs_revision',
      verifier,
      usage: meta.usage || null,
      finalReport: workerFinalReportFromAnalysis(mission, analysis),
      completedAt: nowIso(),
    },
    temporaryDashboard: {
      title: dashboard.title || `Canvas gerado pelo ${model}`,
      subtitle: dashboard.subtitle || analysis.finalReport || '',
      metrics: Array.isArray(dashboard.metrics) ? dashboard.metrics.slice(0, 4) : [],
      blocks: normalizeBlocks(dashboard.blocks),
      sourceAgentId: model,
      updatedAt: nowIso(),
    },
    database: {
      source: { name: database.sourceName || `${model} analysis`, topic: mission.title || 'missao real' },
      layers: {
        rawResearch: {
          status: rawItems.length ? 'loaded' : 'empty',
          dashboardVisibility: 'internal',
          rule: 'Entradas citadas pelo briefing e classificadas pela IA.',
          items: rawItems.map((item, index) => ({
            id: `raw-${index}`,
            label: item.label,
            type: item.type,
            status: item.status,
            payload: { detail: item.detail },
          })),
        },
        processing: {
          status: processingItems.length ? 'ready' : 'empty',
          dashboardVisibility: 'technical',
          rule: `Inferencias e transformacoes geradas pelo ${model}.`,
          items: processingItems.map((item, index) => ({
            id: `processing-${index}`,
            label: item.label,
            type: item.type,
            status: item.status,
            payload: { detail: item.detail },
          })),
        },
        dashboardIntegration: {
          status: publicItems.length ? 'published' : 'empty',
          dashboardVisibility: 'public',
          rule: 'Conclusoes aptas para apresentacao.',
          items: publicItems.map((item, index) => ({
            id: `public-${index}`,
            label: item.label,
            type: item.type,
            status: item.status,
            publicView: {
              plainSummary: item.summary,
              whyItMatters: item.whyItMatters,
            },
          })),
        },
      },
      heartbeat: [
        { agentId: 'supervisor', status: verifier.approved ? 'ready' : 'error', note: verifier.reason, time: nowTime() },
      ],
    },
    heartbeatLogs: [
      `[${nowTime()}] ${model}: analise gerada`,
      `[${nowTime()}] verifier: ${verifier.approved ? 'aprovado' : 'reprovado'}`,
      ...(Array.isArray(verifier.missing) ? verifier.missing.map((m) => `[${nowTime()}] missing: ${m}`) : []),
    ],
    globalChatMessages: messages,
    agents,
  }, env);
}

async function processMissionLifecycle(env, runtime, mission, intent) {
  if (runtime) await runtime.saveMissionProgress(mission, intent, 'glm_started');

  if (intent === 'chat_only') {
    const generated = await callGlmJson(env, buildChatOnlyPrompt(mission), { temperature: 0.25, maxTokens: 650 });
    const analysis = cleanPublicValue(await repairChatOnlyInsuranceMessages(env, mission, generated.parsed));
    const deterministicReview = buildDeterministicWorkerReview({ mission, analysis, mode: 'chat_only' });
    const verifier = closureReviewToVerifier(deterministicReview);
    const state = stateFromChatOnly(mission, analysis, { model: generated.meta.model, usage: generated.meta.usage }, verifier, env);
    const persistedState = runtime
      ? await runtime.saveState(state, { title: mission.title, mode: 'chat_only' }, 'mission.chat_completed', { traceId: mission.id, missionId: mission.id })
      : state;
    return { ok: true, mission, verifier, state: persistedState };
  }

  let generated = null;
  let analysis = null;
  let modelMeta = { model: runtimeModel(env), usage: null };
  try {
    generated = await callGlmJson(env, buildPrompt(mission), { temperature: 0.18, maxTokens: 2600 });
    modelMeta = { model: generated.meta.model, usage: generated.meta.usage };
    if (runtime) await runtime.saveMissionProgress(mission, intent, 'analysis_generated');

    const needsRepair = hasForbiddenPresentationLanguage(generated.parsed) || analysisContractIssues(mission, generated.parsed).length > 0;
    if (runtime && needsRepair) await runtime.saveMissionProgress(mission, intent, 'repairing');

    analysis = cleanPublicValue(await repairPresentationLanguage(env, mission, generated.parsed));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (runtime) await runtime.saveMissionProgress(mission, intent, 'fallback', { error: reason });
    analysis = cleanPublicValue(buildRuntimeFallbackAnalysis(mission, reason));
    modelMeta = {
      model: 'deterministic-fallback',
      usage: generated?.meta?.usage || null,
    };
  }
  if (runtime) await runtime.saveMissionProgress(mission, intent, 'verifying');

  const prepared = prepareAnalysisForClosure(mission, analysis, 'dashboard_build');
  analysis = prepared.analysis;
  const verifier = closureReviewToVerifier(prepared.review);
  const state = stateFromAnalysis(mission, analysis, verifier, modelMeta, env);
  const persistedState = runtime
    ? await runtime.saveState(
      state,
      { title: mission.title, approved: verifier.approved, tokens: modelMeta.usage?.total_tokens || 0, model: modelMeta.model },
      'mission.completed',
      { traceId: mission.id, missionId: mission.id },
    )
    : state;
  return { ok: true, mission, verifier, state: persistedState };
}

async function processTransientMissionLifecycle(env, mission, intent) {
  try {
    const result = await processMissionLifecycle(env, null, mission, intent);
    if (result?.state) {
      rememberRuntimeEvent({
        type: intent === 'chat_only' ? 'mission.chat_completed' : 'mission.completed',
        source: result?.state?.activeRun?.sourceAgentId || runtimeModel(env),
        missionId: mission.id,
        traceId: mission.id,
        payload: {
          title: mission.title,
          transient: true,
          approved: result?.verifier?.approved ?? true,
        },
      });
      rememberRuntimeState(result.state, env);
    }
    return result;
  } catch (error) {
    const failedState = stateFromMissionFailure(mission, error, {
      reason: 'Execucao transitoria falhou durante modo degradado do Durable Object.',
      source: runtimeModel(env),
    }, env);
    rememberRuntimeEvent({
      type: 'mission.failed',
      source: runtimeModel(env),
      missionId: mission.id,
      traceId: mission.id,
      payload: {
        title: mission.title,
        transient: true,
        error: storageErrorMessage(error),
      },
    });
    rememberRuntimeState(failedState, env);
    return { ok: false, mission, error: storageErrorMessage(error), state: failedState };
  }
}

async function activateMission(request, env, ctx) {
  const body = await request.json();
  const description = String(body.description || '').trim();
  if (!description) return json({ ok: false, error: 'description_required' }, 400);
  const missionId = `mission-${Date.now()}`;
  const mission = {
    id: missionId,
    runId: runIdForMission({ id: missionId }),
    title: String(body.title || description.slice(0, 80)).trim(),
    description,
    success: String(body.success || 'Gerar canvas executivo aprovado pelo verificador.').trim(),
    activatedAt: nowIso(),
  };
  const intent = classifyMissionIntent(mission);
  const runtime = runtimeStub(env);
  if (runtime) {
    try {
      const begin = await runtime.beginMission(mission, intent);
      if (!begin.ok) {
        return json({
          ok: false,
          error: begin.error || 'mission_concurrency_locked',
          lock: begin.lock || null,
          state: begin.state || await runtime.getState(),
        }, 409);
      }
      if (ctx?.waitUntil) {
        ctx.waitUntil(runtime.processNextMissionJob().catch(() => {}));
      }
      return json({ ok: true, accepted: true, mission, state: begin.state || await runtime.getState() }, 202);
    } catch (error) {
      const progressState = rememberRuntimeState(stateFromMissionProgress(
        mission,
        intent,
        'accepted',
        { warning: 'durable_object_storage_degraded' },
        env,
      ), env);
      rememberRuntimeEvent({
        type: 'mission.started',
        source: 'ui',
        missionId: mission.id,
        traceId: mission.id,
        payload: {
          title: mission.title,
          intent,
          transient: true,
          storageDegraded: isDurableObjectStorageLimitError(error),
        },
      });
      const transientRun = processTransientMissionLifecycle(env, mission, intent);
      if (ctx?.waitUntil) {
        ctx.waitUntil(transientRun.catch(() => {}));
      } else {
        transientRun.catch(() => {});
      }
      return json({
        ok: true,
        accepted: true,
        degraded: true,
        mission,
        state: runtimeDegradedState(env, error, progressState),
      }, 202);
    }
  }

  const result = await processTransientMissionLifecycle(env, mission, intent);
  return json(result);
}

async function runHarnessSmoke(env) {
  const runtime = runtimeStub(env);
  const modelSelector = runtimeModelSelector(env);
  let state = baseState({}, env);
  let degraded = false;
  if (runtime) {
    try {
      state = await runtime.getState();
    } catch (error) {
      degraded = true;
      state = runtimeDegradedState(env, error);
    }
  }
  const checks = [
    { id: 'glm-key', label: 'GLM secret', ok: Boolean(env.GLM_API_KEY), detail: env.GLM_API_KEY ? 'secret configurado' : 'GLM_API_KEY ausente' },
    { id: 'model-selector', label: 'Model selector', ok: Boolean(modelSelector.model), detail: modelSelectorSummary(modelSelector) },
    { id: 'runtime-state', label: 'Runtime state', ok: Boolean(state?.heartbeatMonitor), detail: state?.heartbeatMonitor?.summary || 'sem monitor' },
    { id: 'event-store', label: 'Event store', ok: runtime ? !degraded : false, detail: degraded ? 'Durable Objects em modo degradado' : `${state?.heartbeatMonitor?.beats ?? 0} eventos` },
    { id: 'agents', label: 'Agent roster', ok: Array.isArray(state?.agents) && state.agents.length >= 5, detail: `${state?.agents?.length || 0} agentes` },
    { id: 'governance-summary', label: 'Governance summary', ok: Array.isArray(state?.heartbeatMonitor?.governance?.summaryLines) && state.heartbeatMonitor.governance.summaryLines.length >= 4, detail: state?.heartbeatMonitor?.governance?.summaryText || 'governanca ausente' },
    { id: 'canvas-contract', label: 'Canvas contract', ok: true, detail: REQUIRED_BLOCK_TITLES.join(', ') },
  ];
  const result = {
    ok: checks.every((check) => check.ok),
    status: checks.every((check) => check.ok) ? 'passed' : 'failed',
    timestamp: nowIso(),
    checks,
  };
  if (runtime) {
    try {
      await runtime.appendEvent('harness.smoke', result, 'harness');
    } catch {
      rememberRuntimeEvent({ type: 'harness.smoke', source: 'harness', payload: result });
    }
  }
  return result;
}

async function runCloudPreflight(env) {
  const runtime = runtimeStub(env);
  const modelSelector = runtimeModelSelector(env);
  let state = baseState({}, env);
  let degradedError = null;
  if (runtime) {
    try {
      state = await runtime.getState();
    } catch (error) {
      degradedError = error;
      state = runtimeDegradedState(env, error);
    }
  }
  const governance = state?.governance || state?.heartbeatMonitor?.governance || buildGovernanceSummary({ provider: modelSelector.model });
  return runOperationalPreflight({
    mode: 'cloud',
    governance,
    state,
    probeEndpoint: async (path) => {
      if (path === '/api/health') {
        return {
          ok: true,
          body: { ok: true, service: 'luca-ai-cloud', model: modelSelector.model, modelSelector },
          detail: env.GLM_API_KEY ? 'GLM secret configurado' : 'GLM_API_KEY ausente',
        };
      }
      if (path === '/api/state') {
        return {
          ok: Boolean(state && Array.isArray(state.agents)),
          body: state,
          detail: `${state?.agents?.length || 0} agentes`,
        };
      }
      if (path === '/api/events') {
        let events = [];
        if (runtime && !degradedError) {
          try {
            events = await runtime.listEvents({ limit: RUNTIME_STATE_READ_EVENT_LIMIT });
          } catch (error) {
            degradedError = error;
            events = runtimeMemoryEvents.slice(0, RUNTIME_STATE_READ_EVENT_LIMIT);
          }
        } else {
          events = runtimeMemoryEvents.slice(0, RUNTIME_STATE_READ_EVENT_LIMIT);
        }
        return {
          ok: Array.isArray(events),
          body: { ok: true, events },
          detail: degradedError ? 'eventos em cache transitorio' : `${events.length} evento(s) recentes`,
        };
      }
      return { ok: false, error: 'endpoint_not_supported' };
    },
  });
}

async function handleApi(request, env, pathname, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (pathname === '/api/health') {
    const modelSelector = runtimeModelSelector(env);
    return json({ ok: true, service: 'luca-ai-cloud', model: modelSelector.model, modelSelector, hasGlmKey: Boolean(env.GLM_API_KEY) });
  }
  if (pathname === '/api/state' && request.method === 'GET') {
    const runtime = runtimeStub(env);
    try {
      return json(runtime ? await runtime.getState() : rememberRuntimeState(baseState({}, env), env));
    } catch (error) {
      return json(runtimeDegradedState(env, error));
    }
  }
  if (pathname === '/api/governance' && request.method === 'GET') {
    const modelSelector = runtimeModelSelector(env);
    const runtime = runtimeStub(env);
    let state = baseState({}, env);
    try {
      state = runtime ? await runtime.getState() : rememberRuntimeState(baseState({}, env), env);
    } catch (error) {
      state = runtimeDegradedState(env, error);
    }
    return json({ ok: true, governance: state?.governance || buildGovernanceSummary({ provider: modelSelector.model }) });
  }
  if (pathname === '/api/preflight' && request.method === 'GET') {
    return json(await runCloudPreflight(env));
  }
  if (pathname === '/api/catalog/endpoints' && request.method === 'GET') {
    return json(buildEndpointCatalog({ mode: 'cloud' }));
  }
  if (pathname === '/api/catalog/tools' && request.method === 'GET') {
    return json(buildToolCatalog({ mode: 'cloud' }));
  }
  if (pathname === '/api/catalog/audit' && request.method === 'GET') {
    return json(buildCatalogAudit({
      mode: 'cloud',
      endpointCatalog: buildEndpointCatalog({ mode: 'cloud' }),
      toolCatalog: buildToolCatalog({ mode: 'cloud' }),
    }));
  }
  if (pathname === '/api/goals' && request.method === 'GET') {
    const runtime = runtimeStub(env);
    let goals = [];
    try {
      goals = runtime ? await runtime.listGoals(100, new URL(request.url).searchParams.get('status') || '') : [];
    } catch {
      goals = runtimeMemoryState?.goals || [];
    }
    return json({ ok: true, goals, summary: summarizeGoals(goals) });
  }
  if (pathname === '/api/goals' && request.method === 'POST') {
    const runtime = runtimeStub(env);
    if (!runtime) return json({ ok: false, error: 'runtime_unavailable' }, 503);
    try {
      const body = await request.json();
      const goal = await runtime.createGoal(body, 'ui');
      return json({ ok: true, goal, summary: summarizeGoals(await runtime.listGoals(100)) }, 201);
    } catch (error) {
      return json({
        ok: false,
        error: 'durable_object_storage_degraded',
        detail: storageErrorMessage(error),
      }, isDurableObjectStorageLimitError(error) ? 503 : 500);
    }
  }
  if (pathname === '/api/mission/activate' && request.method === 'POST') {
    try {
      return await activateMission(request, env, ctx);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : String(error), source: runtimeModel(env) }, 502);
    }
  }
  if (pathname === '/api/mission/reset' && request.method === 'POST') {
    const runtime = runtimeStub(env);
    let state = null;
    try {
      state = runtime ? await runtime.resetState() : baseState({}, env);
      rememberRuntimeState(state, env);
    } catch (error) {
      rememberRuntimeEvent({ type: 'state.reset', source: 'ui', payload: { transient: true } });
      state = rememberRuntimeState(baseState({}, env), env);
      state = runtimeDegradedState(env, error, state);
    }
    return json({ ok: true, state });
  }
  if (pathname === '/api/heartbeat/start' && request.method === 'POST') {
    const runtime = runtimeStub(env);
    let state = null;
    try {
      state = runtime ? await runtime.heartbeat('play') : baseState({}, env);
      rememberRuntimeState(state, env);
    } catch (error) {
      rememberRuntimeEvent({ type: 'heartbeat.play', source: 'heartbeat', payload: { transient: true } });
      state = runtimeDegradedState(env, error);
    }
    return json({ ok: true, state });
  }
  if (pathname === '/api/heartbeat/pause' && request.method === 'POST') {
    const runtime = runtimeStub(env);
    let state = null;
    try {
      state = runtime ? await runtime.heartbeat('pause') : baseState({}, env);
      rememberRuntimeState(state, env);
    } catch (error) {
      rememberRuntimeEvent({ type: 'heartbeat.pause', source: 'heartbeat', payload: { transient: true } });
      state = runtimeDegradedState(env, error);
    }
    return json({ ok: true, state });
  }
  if (pathname === '/api/events' && request.method === 'GET') {
    const runtime = runtimeStub(env);
    const filters = eventFiltersFromSearchParams(new URL(request.url).searchParams);
    try {
      return json({ ok: true, filters, events: runtime ? await runtime.listEvents(filters) : filterRuntimeMemoryEvents(filters) });
    } catch (error) {
      return json({ ok: true, degraded: true, detail: storageErrorMessage(error), filters, events: filterRuntimeMemoryEvents(filters) });
    }
  }
  if (pathname === '/api/events/summary' && request.method === 'GET') {
    const runtime = runtimeStub(env);
    const filters = eventFiltersFromSearchParams(new URL(request.url).searchParams);
    try {
      return json({
        ok: true,
        summary: runtime
          ? await runtime.eventSummary(filters)
          : summarizeRuntimeEvents(filterRuntimeMemoryEvents(filters), filters),
      });
    } catch (error) {
      return json({
        ok: true,
        degraded: true,
        detail: storageErrorMessage(error),
        summary: summarizeRuntimeEvents(filterRuntimeMemoryEvents(filters), filters),
      });
    }
  }
  if (pathname === '/api/events/flows' && request.method === 'GET') {
    const runtime = runtimeStub(env);
    const filters = eventFiltersFromSearchParams(new URL(request.url).searchParams);
    try {
      return json({ ok: true, ...(runtime ? await runtime.eventFlows(filters) : { flows: [], filters }) });
    } catch (error) {
      return json({ ok: true, degraded: true, detail: storageErrorMessage(error), flows: [], filters });
    }
  }
  if (pathname === '/api/harness/smoke' && request.method === 'POST') {
    return json(await runHarnessSmoke(env));
  }
  if (request.method === 'POST') {
    const runtime = runtimeStub(env);
    try {
      const state = runtime ? await runtime.heartbeat('tick') : baseState({}, env);
      return json({ ok: true, state: rememberRuntimeState(state, env) });
    } catch (error) {
      rememberRuntimeEvent({ type: 'heartbeat.tick', source: 'heartbeat', payload: { transient: true } });
      return json({ ok: true, degraded: true, state: runtimeDegradedState(env, error) });
    }
  }
  return json({ ok: false, error: 'not_found' }, 404);
}

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url.pathname, ctx);
    return env.ASSETS.fetch(request);
  },
};
