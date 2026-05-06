import { AGENTS } from './config.js';

function makeDatabase() {
  return {
    source: { name: 'database online', topic: 'LUCA-AI' },
    layers: {
      rawResearch: { status: 'ready', dashboardVisibility: 'blocked', rule: 'Base bruta interna. Nao exibir no dashboard.', items: [] },
      processing: { status: 'ready', dashboardVisibility: 'blocked-until-filtered', rule: 'Informacao curada e filtrada para agentes.', items: [] },
      dashboardIntegration: {
        status: 'ready',
        dashboardVisibility: 'allowed-after-approval',
        title: 'Camada 3 - Dashboard e integracao no dashboard',
        rule: 'Conteudo claro e aprovado para pessoas de diferentes areas.',
        items: [],
      },
    },
    heartbeat: [],
  };
}

const state = {
  supervisorMode: 'standby',
  activeMission: null,
  database: makeDatabase(),
  heartbeatLogs: [],
  agents: AGENTS.map((a) => ({ id: a.id, role: a.role, status: 'idle', lines: [`${a.name} pronto.`] })),
};

function defaultAgentLine(agent) {
  return `${agent.name} pronto.`;
}

export function getState() {
  return {
    activeMission: state.activeMission,
    database: state.database,
    heartbeatLogs: state.heartbeatLogs,
    agents: state.agents,
  };
}

export function setSupervisorMode(mode) {
  state.supervisorMode = mode;
  const sup = state.agents.find((a) => a.id === 'supervisor');
  if (sup) sup.status = mode;
}

export function appendLine(agentId, line) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  agent.lines = [...agent.lines, line].slice(-80);
}

export function setAgentStatus(agentId, status) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  agent.status = status;
}

export function setMission(mission) {
  state.activeMission = mission;
}

export function resetMission() {
  state.activeMission = null;
}

export function addHeartbeat(agentId, status, note) {
  state.database.heartbeat = [...state.database.heartbeat, { agentId, status, note, time: new Date().toISOString() }].slice(-60);
}

export function upsertDashboardItem(item) {
  const list = state.database.layers.dashboardIntegration.items;
  const next = [...list.filter((x) => x.id !== item.id), item];
  state.database.layers.dashboardIntegration.items = next.slice(-20);
}

export function appendHeartbeatLog(line) {
  state.heartbeatLogs = [...state.heartbeatLogs, line].slice(-120);
}

export function clearAgentContexts() {
  state.heartbeatLogs = [];
  state.database.heartbeat = [];
  state.agents = AGENTS.map((agent) => ({
    id: agent.id,
    role: agent.role,
    status: 'idle',
    lines: [defaultAgentLine(agent)],
  }));
}
