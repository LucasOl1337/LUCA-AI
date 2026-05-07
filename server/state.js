import { AGENTS } from './config.js';
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
    agents: AGENTS.map((a) => ({ id: a.id, role: a.role, status: 'idle', lines: [`${a.name} pronto.`] })),
  };
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
      agents: Array.isArray(parsed.agents) ? parsed.agents : initial.agents,
      heartbeatLogs: Array.isArray(parsed.heartbeatLogs) ? parsed.heartbeatLogs : initial.heartbeatLogs,
      globalChatMessages: Array.isArray(parsed.globalChatMessages) ? parsed.globalChatMessages : initial.globalChatMessages,
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
      agents: state.agents,
    }, null, 2));
  } catch {
    // Runtime persistence must not break the live system.
  }
}

function defaultAgentLine(agent) {
  return `${agent.name} pronto.`;
}

function ensureConfiguredAgents() {
  let changed = false;
  for (const agent of AGENTS) {
    if (!state.agents.some((item) => item.id === agent.id)) {
      state.agents.push({
        id: agent.id,
        role: agent.role,
        status: 'idle',
        lines: [defaultAgentLine(agent)],
      });
      changed = true;
    }
  }
  if (changed) persistState();
}

export function getState() {
  ensureConfiguredAgents();
  return {
      activeMission: state.activeMission,
      activeRun: state.activeRun,
      missionHistory: state.missionHistory,
      temporaryDashboard: state.temporaryDashboard,
      database: state.database,
    heartbeatLogs: state.heartbeatLogs,
    globalChatMessages: state.globalChatMessages,
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
  state.agents = AGENTS.map((agent) => ({
    id: agent.id,
    role: agent.role,
    status: 'idle',
    lines: [defaultAgentLine(agent)],
  }));
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
  state.agents = AGENTS.map((agent) => ({
    id: agent.id,
    role: agent.role,
    status: 'idle',
    lines: [defaultAgentLine(agent)],
  }));
  persistState();
}
