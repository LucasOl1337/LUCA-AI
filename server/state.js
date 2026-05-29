import {
  AGENTS,
  defaultAgentEnabled,
  normalizeAgentEnabled,
  sanitizeAgentModel,
} from './config.js';
import fs from 'node:fs';
import path from 'node:path';

const stateDir = path.resolve(process.cwd(), '.luca');
const statePath = path.join(stateDir, 'system-state.json');

function makeDatabase() {
  return {
    source: { name: 'database online', topic: 'LUCA-AI' },
    layers: {
      rawResearch: { status: 'ready', dashboardVisibility: 'blocked', rule: 'Base bruta interna. Nao exibir no canvas.', items: [] },
      processing: { status: 'ready', dashboardVisibility: 'blocked-until-filtered', rule: 'Informacao curada e filtrada para agentes.', items: [] },
      dashboardIntegration: {
        status: 'ready',
        dashboardVisibility: 'allowed-after-approval',
        title: 'Camada 3 - Canvas e integracao no canvas',
        rule: 'Conteudo claro e aprovado para pessoas de diferentes areas.',
        items: [],
      },
    },
    heartbeat: [],
  };
}

function makeAgentEntry(agent) {
  return {
    id: agent.id,
    role: agent.role,
    name: agent.name,
    status: 'idle',
    enabled: defaultAgentEnabled(agent.id),
    model: sanitizeAgentModel(agent.model, agent.model),
    lines: [`${agent.name} pronto.`],
  };
}

function makeInitialState() {
  return {
    supervisorMode: 'standby',
    activeMission: null,
    activeRun: null,
    missionHistory: [],
    temporaryDashboard: null,
    database: makeDatabase(),
    heartbeatLogs: [],
    globalChatMessages: [],
    scheduledMissions: [],
    missionQueue: [],
    personaAgents: [],
    agents: AGENTS.map(makeAgentEntry),
  };
}

function normalizeAgentList(savedAgents) {
  const saved = Array.isArray(savedAgents) ? savedAgents : [];
  return AGENTS.map((agent) => {
    const previous = saved.find((item) => item.id === agent.id);
    const enabled = normalizeAgentEnabled(agent.id, previous?.enabled);
    return {
      id: agent.id,
      role: agent.role,
      name: agent.name,
      status: previous?.status ?? 'idle',
      enabled,
      model: sanitizeAgentModel(previous?.model, agent.model),
      lines: Array.isArray(previous?.lines) && previous.lines.length ? previous.lines.slice(-80) : [`${agent.name} pronto.`],
    };
  });
}

function loadPersistedState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const initial = makeInitialState();
    return {
      ...initial,
      ...parsed,
      database: {
        ...initial.database,
        ...(parsed.database ?? {}),
        layers: {
          ...initial.database.layers,
          ...(parsed.database?.layers ?? {}),
        },
        heartbeat: parsed.database?.heartbeat ?? initial.database.heartbeat,
      },
      agents: normalizeAgentList(parsed.agents),
      heartbeatLogs: Array.isArray(parsed.heartbeatLogs) ? parsed.heartbeatLogs : initial.heartbeatLogs,
      globalChatMessages: Array.isArray(parsed.globalChatMessages) ? parsed.globalChatMessages : initial.globalChatMessages,
      scheduledMissions: Array.isArray(parsed.scheduledMissions) ? parsed.scheduledMissions : initial.scheduledMissions,
      missionQueue: Array.isArray(parsed.missionQueue) ? parsed.missionQueue : initial.missionQueue,
      personaAgents: Array.isArray(parsed.personaAgents) ? parsed.personaAgents : initial.personaAgents,
    };
  } catch {
    return makeInitialState();
  }
}

const state = loadPersistedState();

function persistState() {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({
      activeMission: state.activeMission,
      activeRun: state.activeRun,
      missionHistory: state.missionHistory,
      temporaryDashboard: state.temporaryDashboard,
      database: state.database,
      heartbeatLogs: state.heartbeatLogs,
      globalChatMessages: state.globalChatMessages,
      scheduledMissions: state.scheduledMissions,
      missionQueue: state.missionQueue,
      personaAgents: state.personaAgents,
      agents: state.agents,
    }, null, 2));
  } catch {
    // Runtime persistence must not break the live system.
  }
}

export function persist() {
  persistState();
}

function defaultAgentLine(agent) {
  return `${agent.name} pronto.`;
}

function ensureConfiguredAgents() {
  let changed = false;
  for (const agent of AGENTS) {
    if (!state.agents.some((item) => item.id === agent.id)) {
      state.agents.push(makeAgentEntry(agent));
      changed = true;
    }
  }
  for (const item of state.agents) {
    if (typeof item.enabled !== 'boolean') {
      item.enabled = defaultAgentEnabled(item.id);
      changed = true;
    } else {
      const normalized = normalizeAgentEnabled(item.id, item.enabled);
      if (normalized !== item.enabled) {
        item.enabled = normalized;
        changed = true;
      }
    }
    if (!item.model) {
      item.model = sanitizeAgentModel(undefined, AGENTS.find((a) => a.id === item.id)?.model);
      changed = true;
    }
  }
  if (changed) persistState();
}

function rebuildAgentsPreservingConfig() {
  const config = new Map(state.agents.map((agent) => [agent.id, { enabled: agent.enabled, model: agent.model }]));
  return AGENTS.map((agent) => ({
    id: agent.id,
    role: agent.role,
    name: agent.name,
    status: 'idle',
    enabled: normalizeAgentEnabled(agent.id, config.get(agent.id)?.enabled),
    model: sanitizeAgentModel(config.get(agent.id)?.model, agent.model),
    lines: [defaultAgentLine(agent)],
  }));
}

export function getState() {
  ensureConfiguredAgents();
  return {
    supervisorMode: state.supervisorMode,
    activeMission: state.activeMission,
    activeRun: state.activeRun,
    missionHistory: state.missionHistory,
    temporaryDashboard: state.temporaryDashboard,
    database: state.database,
    heartbeatLogs: state.heartbeatLogs,
    globalChatMessages: state.globalChatMessages,
    scheduledMissions: state.scheduledMissions,
    missionQueue: state.missionQueue,
    personaAgents: state.personaAgents,
    agents: state.agents,
  };
}

function archiveCurrentMission(reason = 'archived') {
  if (!state.activeMission && !state.activeRun) return;
  const archived = {
    id: state.activeRun?.id ?? `mission-${Date.now()}`,
    reason,
    archivedAt: new Date().toISOString(),
    mission: state.activeMission,
    run: state.activeRun,
    dashboard: state.temporaryDashboard,
    chatMessages: state.globalChatMessages,
    agents: state.agents,
  };
  state.missionHistory = [archived, ...(state.missionHistory ?? [])].slice(0, 20);
  state.database.layers.dashboardIntegration.items = [
    {
      id: archived.id,
      label: `missao passada - ${archived.mission?.title ?? 'sem titulo'}`,
      type: 'mission-archive',
      status: archived.run?.status ?? reason,
      payload: archived,
      publicView: {
        plainSummary: archived.mission?.description ?? archived.mission?.success ?? 'missao arquivada',
        whyItMatters: 'Registro persistido de uma missao anterior para consulta e possivel restauracao futura.',
        clearInformation: [
          `status: ${archived.run?.status ?? reason}`,
          `mensagens: ${archived.chatMessages?.length ?? 0}`,
          `arquivada em: ${archived.archivedAt}`,
        ],
        viewerQuestions: ['Quais agentes participaram?', 'A missao foi concluida ou pausada?'],
      },
    },
    ...state.database.layers.dashboardIntegration.items,
  ].slice(0, 30);
}

function resetActiveScope() {
  state.activeMission = null;
  state.activeRun = null;
  state.temporaryDashboard = null;
  state.globalChatMessages = [];
  state.database.layers.dashboardIntegration.items = [];
  state.database.heartbeat = [];
  state.agents = rebuildAgentsPreservingConfig();
}

export function startNewMissionScope(mission) {
  archiveCurrentMission('new_mission_started');
  resetActiveScope();
  state.activeMission = mission;
  persistState();
}

export function resetMissionScope() {
  archiveCurrentMission('manual_reset');
  resetActiveScope();
  persistState();
}

function makeRunAgentState() {
  return Object.fromEntries(AGENTS.map((agent) => [agent.id, {
    status: agent.role === 'supervisor' ? 'observing' : 'idle',
    lastSeenChatMessageId: null,
    lastRunAt: null,
    lastCompletedAt: null,
    assignedTaskId: null,
  }]));
}

export function createRun(mission) {
  const run = {
    id: `run-${Date.now()}`,
    missionTitle: mission?.title ?? 'missao sem titulo',
    status: 'running',
    briefing: '',
    finalReport: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    agents: makeRunAgentState(),
    tasks: [],
    supervisorTickCount: 0,
  };
  state.activeRun = run;
  persistState();
  return run;
}

export function setRunBriefing(briefing) {
  if (!state.activeRun) return;
  state.activeRun.briefing = String(briefing ?? '');
  persistState();
}

export function setSupervisorFinalReport(report) {
  if (!state.activeRun) return;
  state.activeRun.finalReport = report ? {
    ...report,
    createdAt: report.createdAt ?? new Date().toISOString(),
  } : null;
  persistState();
}

export function incrementSupervisorTick() {
  if (!state.activeRun) return 0;
  state.activeRun.supervisorTickCount = (state.activeRun.supervisorTickCount ?? 0) + 1;
  persistState();
  return state.activeRun.supervisorTickCount;
}

export function createAgentTask(agentId, instruction) {
  if (!state.activeRun) return null;
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    agentId,
    instruction: String(instruction ?? '').trim(),
    status: 'queued',
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
  };
  state.activeRun.tasks.push(task);
  if (state.activeRun.agents[agentId]) {
    state.activeRun.agents[agentId].status = 'queued';
    state.activeRun.agents[agentId].assignedTaskId = task.id;
  }
  persistState();
  return task;
}

export function updateAgentTask(taskId, patch) {
  if (!state.activeRun) return null;
  const task = state.activeRun.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  Object.assign(task, patch);
  const agentState = state.activeRun.agents[task.agentId];
  if (agentState && patch.status) {
    agentState.status = patch.status === 'completed' ? 'done' : patch.status;
    if (patch.status === 'running') agentState.lastRunAt = patch.startedAt ?? new Date().toISOString();
    if (patch.status === 'completed') {
      agentState.lastCompletedAt = patch.completedAt ?? new Date().toISOString();
      agentState.assignedTaskId = null;
    }
  }
  persistState();
  return task;
}

export function markAgentChatSeen(agentId, messageId) {
  if (!state.activeRun?.agents?.[agentId]) return;
  state.activeRun.agents[agentId].lastSeenChatMessageId = messageId ?? null;
  persistState();
}

export function completeRun(reason) {
  if (!state.activeRun) return;
  state.activeRun.status = 'completed';
  state.activeRun.completedAt = new Date().toISOString();
  state.activeRun.completionReason = reason;
  persistState();
}

export function setTemporaryDashboard(dashboard) {
  state.temporaryDashboard = dashboard ? {
    ...dashboard,
    updatedAt: new Date().toISOString(),
  } : null;
  persistState();
}

export function addGlobalChatMessage(message) {
  const next = {
    id: message.id ?? `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    missionId: message.missionId ?? state.activeMission?.title ?? 'standby',
    agentId: message.agentId ?? 'system',
    agentName: message.agentName ?? message.agentId ?? 'system',
    type: message.type ?? 'info',
    content: String(message.content ?? '').trim(),
    meta: message.meta ?? null,
    timestamp: message.timestamp ?? new Date().toLocaleTimeString('pt-BR', { hour12: false }),
    createdAt: message.createdAt ?? new Date().toISOString(),
  };
  if (!next.content) return null;
  state.globalChatMessages = [...state.globalChatMessages, next].slice(-120);
  persistState();
  return next;
}

export function setSupervisorMode(mode) {
  state.supervisorMode = mode;
  const sup = state.agents.find((a) => a.id === 'supervisor');
  if (sup) sup.status = mode;
  persistState();
}

export function appendLine(agentId, line) {
  ensureConfiguredAgents();
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  agent.lines = [...agent.lines, line].slice(-80);
  persistState();
}

export function setAgentStatus(agentId, status) {
  ensureConfiguredAgents();
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  agent.status = status;
  persistState();
}

export function setAgentConfig(agentId, patch = {}) {
  ensureConfiguredAgents();
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  if (typeof patch.model === 'string') {
    agent.model = sanitizeAgentModel(patch.model, agent.model);
  }
  if (typeof patch.enabled === 'boolean') {
    const nextEnabled = normalizeAgentEnabled(agentId, patch.enabled);
    if (agent.enabled !== nextEnabled) {
      agent.enabled = nextEnabled;
      agent.status = nextEnabled ? 'idle' : 'disabled';
      agent.lines = [...agent.lines, `[config] agente ${nextEnabled ? 'ativado' : 'desativado'}`].slice(-80);
    }
  } else {
    agent.enabled = normalizeAgentEnabled(agentId, agent.enabled);
  }
  agent.lines = [...agent.lines, `[config] modelo=${agent.model}`].slice(-80);
  persistState();
  return agent;
}

export function getAgentConfig(agentId) {
  ensureConfiguredAgents();
  return state.agents.find((a) => a.id === agentId) ?? null;
}

export function setMission(mission) {
  state.activeMission = mission;
  persistState();
}

export function resetMission() {
  archiveCurrentMission('mission_stopped');
  resetActiveScope();
  persistState();
}

export function addHeartbeat(agentId, status, note) {
  state.database.heartbeat = [...state.database.heartbeat, { agentId, status, note, time: new Date().toISOString() }].slice(-60);
  persistState();
}

export function upsertDashboardItem(item) {
  const list = state.database.layers.dashboardIntegration.items;
  const next = [...list.filter((x) => x.id !== item.id), item];
  state.database.layers.dashboardIntegration.items = next.slice(-20);
  persistState();
}

export function appendHeartbeatLog(line) {
  state.heartbeatLogs = [...state.heartbeatLogs, line].slice(-120);
  persistState();
}

export function clearAgentContexts() {
  state.heartbeatLogs = [];
  state.database.heartbeat = [];
  state.globalChatMessages = [];
  state.agents = rebuildAgentsPreservingConfig();
  persistState();
}

export function archiveActiveMission({ status = 'completed', reason = '', evidence = [] } = {}) {
  const mission = state.activeMission;
  if (!mission && !state.activeRun) return false;
  const completedAt = new Date().toISOString();
  state.missionHistory = [{
    id: state.activeRun?.id ?? mission?.id ?? `mission-${Date.now()}`,
    archivedAt: completedAt,
    completedAt,
    status,
    reason,
    mission: mission ? { ...mission, completedAt } : null,
    run: state.activeRun,
    dashboard: state.temporaryDashboard,
    evidence,
    chatMessages: state.globalChatMessages,
    agents: state.agents,
  }, ...(state.missionHistory ?? [])].slice(0, 20);
  resetActiveScope();
  persistState();
  return true;
}

export function setScheduledMissions(list) {
  state.scheduledMissions = Array.isArray(list) ? list.slice(0, 30) : [];
  persistState();
}

export function setMissionQueue(list) {
  state.missionQueue = Array.isArray(list) ? list.slice(-80) : [];
  persistState();
}

export function getPersonaAgents() {
  if (!Array.isArray(state.personaAgents)) state.personaAgents = [];
  return state.personaAgents;
}

export function addPersonaAgent(entry = {}) {
  const slug = String(entry.slug || '').trim();
  if (!slug) return null;
  if (!Array.isArray(state.personaAgents)) state.personaAgents = [];
  const existing = state.personaAgents.find((p) => p.slug === slug);
  const record = {
    id: `yume:${slug}`,
    slug,
    source: 'yume',
    name: entry.name || existing?.name || slug,
    model: entry.model ?? existing?.model ?? '',
    enabled: entry.enabled !== undefined ? Boolean(entry.enabled) : (existing?.enabled !== false),
    cachedVersion: entry.cachedVersion ?? existing?.cachedVersion ?? null,
    cachedSystemPrompt: entry.cachedSystemPrompt ?? existing?.cachedSystemPrompt ?? null,
    cachedAt: entry.cachedAt ?? existing?.cachedAt ?? null,
    lastError: null,
    addedAt: existing?.addedAt || new Date().toISOString(),
  };
  state.personaAgents = [record, ...state.personaAgents.filter((p) => p.slug !== slug)].slice(0, 50);
  persistState();
  return record;
}

export function updatePersonaAgent(slug, patch = {}) {
  if (!Array.isArray(state.personaAgents)) state.personaAgents = [];
  const record = state.personaAgents.find((p) => p.slug === slug);
  if (!record) return null;
  Object.assign(record, patch);
  persistState();
  return record;
}

export function removePersonaAgent(slug) {
  if (!Array.isArray(state.personaAgents)) state.personaAgents = [];
  const before = state.personaAgents.length;
  state.personaAgents = state.personaAgents.filter((p) => p.slug !== slug);
  const changed = state.personaAgents.length !== before;
  if (changed) persistState();
  return changed;
}
