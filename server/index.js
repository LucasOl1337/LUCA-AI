import express from 'express';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { PORT, AGENTS, AGENT_ALIASES, ROUTER_MODEL } from './config.js';
import { call9Router } from './router-client.js';
import {
  addHeartbeat,
  appendLine,
  appendHeartbeatLog,
  clearAgentContexts,
  getState,
  resetMission,
  setAgentStatus,
  setMission,
  setSupervisorMode,
  upsertDashboardItem,
} from './state.js';

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: '1mb' }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

let supervisorTimer = null;
let heartbeatProcess = null;
const heartbeatReportPath = path.resolve(process.cwd(), 'heartbeat-report.json');

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

function emitEvent(event) {
  const payload = JSON.stringify({ kind: 'event', event });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

function emitState() {
  const payload = JSON.stringify({ kind: 'state', state: { ...getState(), heartbeatMonitor: readHeartbeatReport() } });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

async function runAgent(agent, mission) {
  const prompt = `Missao: ${mission?.title ?? 'Sem titulo'}\nDescricao: ${mission?.description ?? 'Sem descricao'}\nContexto: ${mission?.context ?? 'n/a'}\nSucesso: ${mission?.success ?? 'n/a'}\nRestricoes: ${mission?.constraints ?? 'n/a'}`;
  const system = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Responda em pt-BR, objetivo, e entregue resultado operacional.`;

  try {
    setAgentStatus(agent.id, 'running');
    appendLine(agent.id, `[9router:${ROUTER_MODEL}] executando...`);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'running', time: new Date().toISOString() });

    const output = await call9Router({ system, user: prompt, agentId: agent.id });
    appendLine(agent.id, output);
    setAgentStatus(agent.id, 'ready');
    addHeartbeat(agent.id, 'ready', 'resposta recebida do 9router');

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
          `modelo: ${ROUTER_MODEL}`,
        ],
        viewerQuestions: ['O que executar agora?', 'Qual o risco principal?'],
      },
    });

    emitEvent({ type: 'agent.output', agentId: agent.id, text: output, time: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLine(agent.id, `erro: ${message}`);
    setAgentStatus(agent.id, 'error');
    addHeartbeat(agent.id, 'error', message);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'error', time: new Date().toISOString() });
  }
}

async function runCycle() {
  const mission = getState().activeMission;
  if (!mission) {
    addHeartbeat('supervisor', 'idle', 'sem missao ativa');
    emitState();
    return;
  }
  for (const agent of AGENTS) {
    await runAgent(agent, mission);
    emitState();
  }
}

app.get('/api/state', (_req, res) => {
  res.json({ ...getState(), heartbeatMonitor: readHeartbeatReport() });
});

app.post('/api/mission/activate', (req, res) => {
  const mission = {
    title: String(req.body?.title ?? '').trim(),
    description: String(req.body?.description ?? '').trim(),
    context: String(req.body?.context ?? '').trim(),
    success: String(req.body?.success ?? '').trim(),
    constraints: String(req.body?.constraints ?? '').trim(),
    activatedAt: new Date().toISOString(),
  };
  setMission(mission);
  addHeartbeat('supervisor', 'ready', `missao ativada: ${mission.title || 'sem titulo'}`);
  emitEvent({ type: 'mission.activated', mission, time: mission.activatedAt });
  emitState();
  res.json({ ok: true, mission });
});

app.post('/api/mission/reset', (_req, res) => {
  resetMission();
  addHeartbeat('supervisor', 'ready', 'missao resetada');
  emitState();
  res.json({ ok: true });
});

app.post('/api/supervisor/start', async (_req, res) => {
  setSupervisorMode('running');
  addHeartbeat('supervisor', 'running', 'supervisor ligado');
  if (!supervisorTimer) {
    supervisorTimer = setInterval(() => {
      runCycle();
    }, 30000);
  }
  await runCycle();
  emitState();
  res.json({ ok: true });
});

app.post('/api/supervisor/pause', (_req, res) => {
  setSupervisorMode('standby');
  addHeartbeat('supervisor', 'paused', 'supervisor pausado');
  if (supervisorTimer) {
    clearInterval(supervisorTimer);
    supervisorTimer = null;
  }
  emitState();
  res.json({ ok: true });
});

app.post('/api/agent/run', async (req, res) => {
  const agentId = resolveAgentId(String(req.body?.agentId ?? '').trim());
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
  await runAgent(agent, mission);
  emitState();
  res.json({ ok: true });
});

app.post('/api/heartbeat/start', (_req, res) => {
  startHeartbeatMonitor();
  emitState();
  res.json({ ok: true });
});

app.post('/api/heartbeat/pause', (_req, res) => {
  stopHeartbeatMonitor();
  emitState();
  res.json({ ok: true });
});

app.post('/api/agents/clear', (_req, res) => {
  clearAgentContexts();
  appendHeartbeatLog('[heartbeat] terminais e contexto dos agentes limpos');
  emitState();
  res.json({ ok: true });
});

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ kind: 'state', state: getState() }));
});

httpServer.listen(PORT, '127.0.0.1', () => {
  startHeartbeatMonitor();
  console.log(`LUCA backend em http://127.0.0.1:${PORT}`);
});
