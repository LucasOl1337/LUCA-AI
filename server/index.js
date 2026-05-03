import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { AgentRuntime } from './agent-runtime.js';
import { EventBus } from './event-bus.js';
import { MissionStore } from './mission-store.js';
import { SupervisorLoop } from './supervisor-loop.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const store = new MissionStore({ lucaDir: config.lucaDir });
await store.init();
const bus = new EventBus({ store });
const agents = new AgentRuntime({ store, bus, config });
const supervisor = new SupervisorLoop({ store, bus, agents, heartbeatMs: config.heartbeatMs });

app.use((request, response, next) => {
  response.header('Access-Control-Allow-Origin', '*');
  response.header('Access-Control-Allow-Headers', 'Content-Type');
  response.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') return response.sendStatus(200);
  next();
});

app.use(express.json({ limit: '1mb' }));

async function state() {
  return {
    config: {
      port: config.port,
      heartbeatMs: config.heartbeatMs,
      supervisorModel: config.supervisorModel,
      executorModel: config.executorModel,
      codexBin: config.codexBin,
      codexProfile: config.codexProfile,
      codexExtraArgs: config.codexExtraArgs,
      codexProvider: config.codexProvider,
    },
    supervisorRunning: supervisor.isRunning(),
    activeMission: awaitActiveMissionSnapshot(),
    agents: agents.list(),
    database: await store.databaseSnapshot(),
  };
}

function awaitActiveMissionSnapshot() {
  return currentMissionSnapshot;
}

let currentMissionSnapshot = null;

async function broadcastState() {
  bus.broadcastState(await state());
}

wss.on('connection', async (socket) => {
  bus.addClient(socket);
  socket.send(JSON.stringify({ kind: 'state', state: await state() }));
});

app.get('/api/state', async (request, response) => {
  response.json(await state());
});

app.get('/api/database', async (request, response) => {
  response.json(await store.databaseSnapshot());
});

app.post('/api/mission/activate', async (request, response) => {
  const mission = request.body;
  if (!mission?.title?.trim()) {
    response.status(400).json({ error: 'mission.title required' });
    return;
  }

  await supervisor.reset();
  await agents.resetEnvironment();
  store.clearActiveMission();
  currentMissionSnapshot = null;

  const savedMission = await store.createMission(mission);
  currentMissionSnapshot = savedMission;
  bus.emit('mission.activated', { mission: savedMission });
  await agents.write('supervisor', `[mission] active: ${savedMission.title}`);
  await supervisor.start();
  bus.emit('supervisor.started', { reason: 'mission activated' });
  await broadcastState();
  response.json({ mission: savedMission });
});

app.post('/api/mission/reset', async (request, response) => {
  await supervisor.reset();
  await agents.resetEnvironment();
  store.clearActiveMission();
  currentMissionSnapshot = null;
  bus.emit('mission.reset');
  await broadcastState();
  response.json({ ok: true });
});

app.post('/api/supervisor/start', async (request, response) => {
  await supervisor.start();
  bus.emit('supervisor.started');
  await broadcastState();
  response.json({ ok: true });
});

app.post('/api/supervisor/pause', async (request, response) => {
  await supervisor.pause();
  bus.emit('supervisor.paused');
  await broadcastState();
  response.json({ ok: true });
});

app.post('/api/supervisor/step', async (request, response) => {
  await supervisor.step();
  bus.emit('supervisor.stepped');
  await broadcastState();
  response.json({ ok: true });
});

app.post('/api/agent/:id/pause', async (request, response) => {
  await agents.setStatus(request.params.id, 'paused');
  await agents.write(request.params.id, '[pause] manual');
  await broadcastState();
  response.json({ ok: true });
});

app.post('/api/agent/:id/restart', async (request, response) => {
  await agents.setStatus(request.params.id, 'running');
  await agents.write(request.params.id, '[restart] manual');
  await broadcastState();
  response.json({ ok: true });
});

const distDir = path.join(config.workspace, 'dist');
app.use(express.static(distDir));
app.get(/.*/, (request, response) => {
  response.sendFile(path.join(distDir, 'index.html'));
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`LUCA backend listening on http://127.0.0.1:${config.port}`);
  bus.emit('system.ready', { port: config.port });
});
