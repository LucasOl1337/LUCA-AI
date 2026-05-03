import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './styles.css';

const apiBase = window.location.port === '5173' ? 'http://127.0.0.1:4141' : window.location.origin;
const wsBase = window.location.port === '5173'
  ? 'ws://127.0.0.1:4141'
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

const COLORS = ['#8ee4a8', '#c4c2bd', '#92918d', '#5f5e5a', '#d09a9a', '#c4ad72'];

const fallbackDatabase = {
  source: { name: 'database offline', topic: 'Sompo agro' },
  summary: 'aguardando database...',
  metrics: {
    painPoints: 0,
    veryHigh: 0,
    high: 0,
    psrBlockedMillions: 0,
    psrBudgetMillions: 0,
    ruralLossRatioPct: 0,
  },
  painPoints: [],
  jobs: [],
  autonomousMissions: [],
  contributions: [],
  simulations: [],
  reports: [],
  heartbeat: [],
  charts: {
    criticality: [],
    pressure: [],
    capital: [],
  },
};

const agentDefs = [
  { id: 'heartbeat', title: 'heartbeat', icon: null, role: 'system', isHeartbeat: true },
  { id: 'supervisor', title: 'supervisor', icon: '/agents/agent-supervisor.jpg', role: 'supervisor' },
  { id: 'riscos-campo', title: 'riscos campo', icon: '/agents/agent-riscos-campo.jpg', role: 'executor' },
];

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

function App() {
  const [backendReady, setBackendReady] = useState(false);
  const [missionDraft, setMissionDraft] = useState({ title: '', description: '', context: '', success: '', constraints: '' });
  const [activeMission, setActiveMission] = useState(null);
  const [supervisorMode, setSupervisorMode] = useState('standby');
  const [terminals, setTerminals] = useState([]);
  const [database, setDatabase] = useState(fallbackDatabase);
  const [lines, setLines] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const agentLinesRef = useRef({});
  const dashboardData = {
    missions: database.charts.criticality.map((item) => ({ name: item.name, completed: item.value })),
    economy: database.charts.pressure,
    sompo: database.charts.capital,
  };
  const completedJobs = database.jobs.filter((job) => job.status === 'done').length;
  const latestMission = database.autonomousMissions[0];
  const latestSimulation = database.simulations[0];
  const latestReport = database.reports[0];
  const latestContributions = database.contributions.slice(0, 3);

  useEffect(() => {
    let socket = null;
    let reconnectTimer = null;

    function connect() {
      fetchState();
      socket = new WebSocket(`${wsBase}/ws`);

      socket.addEventListener('open', () => {
        setBackendReady(true);
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      });

      socket.addEventListener('close', () => {
        setBackendReady(false);
        reconnectTimer = setTimeout(connect, 3000);
      });

      socket.addEventListener('error', () => setBackendReady(false));

      socket.addEventListener('message', (message) => {
        const payload = JSON.parse(message.data);
        if (payload.kind === 'state') syncBackendState(payload.state);
        if (payload.kind === 'event') applyBackendEvent(payload.event);
      });
    }

    connect();
    return () => {
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  async function fetchState() {
    try {
      const response = await fetch(`${apiBase}/api/state`);
      if (!response.ok) return;
      syncBackendState(await response.json());
      setBackendReady(true);
    } catch {
      setBackendReady(false);
    }
  }

  async function apiPost(path, body = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  function syncBackendState(state) {
    const agents = state.agents ?? [];
    const supervisor = agents.find((a) => a.id === 'supervisor');
    const executors = agents.filter((a) => a.role === 'executor');
    setDatabase(state.database ?? fallbackDatabase);

    if (supervisor) {
      setSupervisorMode(supervisor.status);
      agentLinesRef.current = { ...agentLinesRef.current, supervisor: supervisor.lines };
    }
    if (state.activeMission) {
      setActiveMission({ ...state.activeMission, activatedAt: state.activeMission.activatedAt ?? '' });
    } else {
      setActiveMission(null);
    }
    if (executors.length) {
      setTerminals(executors);
      executors.forEach((agent) => {
        agentLinesRef.current = { ...agentLinesRef.current, [agent.id]: agent.lines };
      });
    }
    setLines((current) => {
      const heartbeatLines = (state.database?.heartbeat ?? []).map((item) => `${item.agentId} ${item.status ?? item.state}: ${item.note}`);
      const supervisorLines = supervisor?.lines ?? [];
      return [...supervisorLines, ...heartbeatLines].map((line) => ({ time: timestamp(), text: line })).slice(-20);
    });
  }

  function applyBackendEvent(event) {
    if (event.type === 'mission.activated') {
      setActiveMission({ ...event.mission, activatedAt: event.time });
    }
    if (event.type === 'agent.output' || event.type === 'agent.status') fetchState();
  }

  function getAgentLines(agentId) {
    if (agentId === 'heartbeat') return lines.map((l) => l.text);
    return agentLinesRef.current[agentId] ?? [];
  }

  function getAgentStatus(agentId) {
    if (agentId === 'heartbeat') return backendReady ? 'online' : 'offline';
    if (agentId === 'supervisor') return supervisorMode;
    const executor = terminals.find((t) => t.id === agentId);
    if (executor) return executor.status;
    return 'idle';
  }

  function toggleAgent(agentId) {
    setActiveAgent((current) => (current === agentId ? null : agentId));
  }

  async function setupMission() {
    if (!missionDraft.title.trim()) return;
    await apiPost('/api/mission/activate', missionDraft);
    fetchState();
  }

  async function resetMission() {
    await apiPost('/api/mission/reset');
    fetchState();
  }

  async function startSupervisor() {
    await apiPost('/api/supervisor/start');
    fetchState();
  }

  async function pauseSupervisor() {
    await apiPost('/api/supervisor/pause');
    fetchState();
  }

  return (
    <main className="screen">
      <div className="strip">
        {agentDefs.map((agent) => (
          <AgentTile
            key={agent.id}
            agent={agent}
            status={getAgentStatus(agent.id)}
            isActive={activeAgent === agent.id}
            isOnline={backendReady}
            onClick={() => toggleAgent(agent.id)}
          />
        ))}
      </div>

      {activeAgent && (
        <div className="agent-terminal-overlay" onClick={() => setActiveAgent(null)}>
          <div className="agent-terminal" onClick={(e) => e.stopPropagation()}>
            <div className="agent-terminal-header">
              <h2>{activeAgent === 'heartbeat' ? 'heartbeat monitor' : (agentDefs.find((a) => a.id === activeAgent)?.title ?? activeAgent)}</h2>
              <mark>{getAgentStatus(activeAgent)}</mark>
              <button className="compact-close" onClick={() => setActiveAgent(null)}>×</button>
            </div>
            <div className="agent-terminal-body">
              {activeAgent === 'heartbeat' ? (
                <div className="heartbeat-workspace">
                  <div className="workspace-col">
                    <h3>missoes</h3>
                    <input
                      placeholder="titulo"
                      value={missionDraft.title}
                      onChange={(e) => setMissionDraft((c) => ({ ...c, title: e.target.value }))}
                    />
                    <textarea
                      placeholder="descricao"
                      value={missionDraft.description}
                      onChange={(e) => setMissionDraft((c) => ({ ...c, description: e.target.value }))}
                    />
                    <div className="row-btns">
                      <button onClick={setupMission}>setup missao</button>
                      <button onClick={resetMission}>resetar</button>
                    </div>
                    <p className="muted">ativa: {activeMission?.title ?? 'nenhuma'}</p>
                  </div>
                  <div className="workspace-col">
                    <h3>supervisor</h3>
                    <p>status: {supervisorMode}</p>
                    <div className="row-btns">
                      <button onClick={startSupervisor}>rodar</button>
                      <button onClick={pauseSupervisor}>pausar</button>
                    </div>
                    <div className="terminal-mini">
                      {getAgentLines('supervisor').slice(-12).map((line, index) => (
                        <p key={`${line}-${index}`}>{line}</p>
                      ))}
                    </div>
                  </div>
                  <div className="workspace-col">
                    <h3>terminais</h3>
                    <div className="terminal-mini">
                      {terminals.flatMap((t) => (t.lines || []).slice(-4)).slice(-12).map((line, index) => (
                        <p key={`${line}-${index}`}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {getAgentLines(activeAgent).map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                  {getAgentLines(activeAgent).length === 0 && (
                    <p className="muted">aguardando dados...</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="dashboard">
        <div className="dashboard-header">
          <h2>database</h2>
          <mark>{backendReady ? 'connected' : 'offline'}</mark>
        </div>
        <div className="dashboard-stats">
          <div className="stat-card">
            <h3>missoes autonomas</h3>
            <p>{database.metrics.autonomousMissions} ciclos · {latestMission?.status ?? 'preparando'}</p>
          </div>
          <div className="stat-card">
            <h3>agentes</h3>
            <p>{supervisorMode} · {terminals.length} executor · {completedJobs}/{database.jobs.length} jobs</p>
          </div>
          <div className="stat-card">
            <h3>database viva</h3>
            <p>{database.metrics.contributions} insights · {database.metrics.simulations} simulacoes · {database.metrics.reports} relatorios</p>
          </div>
        </div>
        <div className="dashboard-reports">
          <div className="report-panel">
            <h3>criticidade</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dashboardData.missions}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(250,249,246,0.08)" />
                  <XAxis dataKey="name" tick={{ fill: '#92918d', fontSize: 11 }} axisLine={{ stroke: 'rgba(250,249,246,0.16)' }} tickLine={false} />
                  <YAxis tick={{ fill: '#92918d', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#181816', border: '1px solid rgba(250,249,246,0.16)', borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="completed" fill="#8ee4a8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="report-panel">
            <h3>pressao agro</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={dashboardData.economy}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(250,249,246,0.08)" />
                  <XAxis dataKey="name" tick={{ fill: '#92918d', fontSize: 11 }} axisLine={{ stroke: 'rgba(250,249,246,0.16)' }} tickLine={false} />
                  <YAxis tick={{ fill: '#92918d', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#181816', border: '1px solid rgba(250,249,246,0.16)', borderRadius: 6, fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" stroke="#8ee4a8" strokeWidth={2} dot={{ fill: '#8ee4a8', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="report-panel">
            <h3>capital e psr</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={dashboardData.sompo} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4} dataKey="value">
                    {dashboardData.sompo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#181816', border: '1px solid rgba(250,249,246,0.16)', borderRadius: 6, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="operations-grid">
          <section className="visual-panel">
            <img src="/agents/agent-riscos-campo.jpg" alt="riscos campo" />
            <div>
              <h3>simulacao ativa</h3>
              <p>{latestSimulation?.title ?? 'aguardando simulacao do heartbeat'}</p>
              <strong>{latestSimulation ? `${latestSimulation.avoidedLossProxy} pontos de perda proxy evitada` : 'sem cenario processado'}</strong>
            </div>
          </section>
          <section className="scenario-panel">
            <h3>otimizacao da situacao</h3>
            {latestSimulation ? (
              <>
                <p>{latestSimulation.scenario}</p>
                <div className="scenario-compare">
                  <span>{latestSimulation.before}</span>
                  <span>{latestSimulation.after}</span>
                </div>
              </>
            ) : (
              <p>o proximo ciclo do supervisor cria uma simulacao operacional.</p>
            )}
          </section>
          <section className="job-panel">
            <h3>fila incessante</h3>
            {database.jobs.slice(-6).reverse().map((job) => (
              <div className="job-row" key={job.id}>
                <span>{job.title}</span>
                <mark>{job.status}</mark>
              </div>
            ))}
          </section>
        </div>
        <div className="database-detail">
          <div className="database-summary">
            <h3>diagnostico</h3>
            <p>{database.summary}</p>
            <div className="report-box">
              <h3>{latestReport?.title ?? 'relatorio em construcao'}</h3>
              <p>{latestReport?.thesis ?? 'o agente riscos-campo ainda esta consolidando o proximo relatorio.'}</p>
            </div>
          </div>
          <div className="risk-list">
            {(latestContributions.length ? latestContributions : database.painPoints.slice(0, 3)).map((item) => (
              <article className="risk-item" key={item.id}>
                <div>
                  <h3>{item.title ?? item.name}</h3>
                  <p>{item.recommendation ?? item.impact}</p>
                </div>
                <mark>{item.chart?.value ?? item.score}</mark>
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function AgentTile({ agent, status, isActive, isOnline, onClick }) {
  return (
    <div className={`tile ${isActive ? 'active' : ''} ${agent.icon || agent.isHeartbeat ? 'clickable' : ''}`} onClick={onClick}>
      {agent.isHeartbeat ? (
        <div className="tile-heartbeat">
          <div className={`pulse-dot ${isOnline ? 'pulse-green' : 'pulse-red'}`} />
          <span className="pulse-label">heartbeat</span>
        </div>
      ) : agent.icon ? (
        <img className="tile-icon" src={agent.icon} alt={agent.title} />
      ) : (
        <div className="tile-placeholder">{agent.title}</div>
      )}
      <div className="tile-footer">
        <span>{agent.title}</span>
        {status && <mark>{status}</mark>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
