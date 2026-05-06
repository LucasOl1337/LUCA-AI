import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiBase = import.meta.env.DEV ? 'http://127.0.0.1:4242' : window.location.origin;
const wsBase = import.meta.env.DEV
  ? 'ws://127.0.0.1:4242'
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

const fallbackDatabase = {
  source: { name: 'database offline', topic: 'LUCA-AI' },
  layers: {
    rawResearch: { status: 'offline', items: [] },
    processing: { status: 'empty', items: [] },
    dashboardIntegration: { status: 'empty', items: [] },
  },
  heartbeat: [],
};

const agentDefs = [
  { id: 'heartbeat', title: 'heartbeat', icon: '/icons/heartbeat.mp4', fallbackIcon: '/icons/heart.jpg', role: 'system', isHeartbeat: true },
  { id: 'supervisor', title: 'supervisor', icon: '/icons/supervisor.jpg', role: 'supervisor' },
  { id: 'planejador', title: 'planejador', icon: '/icons/planejador.png', role: 'planner' },
  { id: 'pesquisador', title: 'pesquisador', icon: '/icons/riscos.jpg', role: 'researcher' },
  { id: 'database', title: 'database', icon: '/icons/database.png', role: 'database', isDatabase: true },
];

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

function heartbeatFresh(updatedAt) {
  if (!updatedAt) return false;
  const ms = Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return false;
  return (Date.now() - ms) < 12000;
}

function stateTone(state) {
  if (state === 'running' || state === 'online' || state === 'ready') return '#55d26a';
  if (state === 'error' || state === 'offline') return '#ff6b6b';
  return '#f0c969';
}

function getRawResearch(database) {
  return database?.layers?.rawResearch?.items?.[0]?.payload ?? null;
}

function getDatabaseLayers(database) {
  const layers = database?.layers ?? {};
  return [
    {
      id: 'rawResearch',
      index: '01',
      title: 'pesquisa bruta',
      status: layers.rawResearch?.status ?? 'empty',
      visibility: layers.rawResearch?.dashboardVisibility ?? 'blocked',
      rule: layers.rawResearch?.rule ?? 'Base bruta interna. Nao exibir no dashboard.',
      items: layers.rawResearch?.items ?? [],
    },
    {
      id: 'processing',
      index: '02',
      title: 'processamento',
      status: layers.processing?.status ?? 'empty',
      visibility: layers.processing?.dashboardVisibility ?? 'blocked-until-filtered',
      rule: layers.processing?.rule ?? 'Informacao curada e filtrada para agentes.',
      items: layers.processing?.items ?? [],
    },
    {
      id: 'dashboardIntegration',
      index: '03',
      title: layers.dashboardIntegration?.title?.replace('Camada 3 - ', '').replace(' e integracao no dashboard', '') ?? 'pos-processamento',
      status: layers.dashboardIntegration?.status ?? 'empty',
      visibility: layers.dashboardIntegration?.dashboardVisibility === 'allowed-after-approval' ? 'visivel apos curadoria' : (layers.dashboardIntegration?.dashboardVisibility ?? 'visivel apos curadoria'),
      rule: layers.dashboardIntegration?.rule ?? 'Conteudo claro e aprovado para pessoas de diferentes areas.',
      items: layers.dashboardIntegration?.items ?? [],
    },
  ];
}

function countDatabaseItems(database) {
  return getDatabaseLayers(database).reduce((total, layer) => total + layer.items.length, 0);
}

function summarizeDatabaseItem(item) {
  const typeLabels = {
    'public-dashboard-summary': 'resumo amigavel',
    'dashboard-panel': 'painel aprovado',
    'simulation-extension': 'simulacao',
    'simulation-contract': 'contrato de simulacao',
    'legacy-research-snapshot': 'pesquisa bruta',
  };
  return {
    id: item.id ?? item.label ?? 'item',
    label: item.label ?? item.title ?? item.id ?? 'item sem nome',
    type: typeLabels[item.type] ?? item.type ?? 'registro',
    detail: item.publicView?.plainSummary ?? (item.importedAt ? `importado em ${item.importedAt}` : (item.status ?? 'aguardando detalhe')),
  };
}

const databaseObsidianPages = {
  index: 'Index',
  rawResearch: 'Camada 01 - Pesquisa Bruta',
  processing: 'Camada 02 - Processamento',
  dashboardIntegration: 'Camada 03 - Dashboard',
};

function obsidianUrl(page) {
  const params = new URLSearchParams({ vault: 'LUCA-AI', file: page });
  return `obsidian://open?${params.toString()}`;
}

function getLayerObsidianPage(layerId) {
  return databaseObsidianPages[layerId] ?? databaseObsidianPages.index;
}

function getLayerLinks(database, layer) {
  const raw = getRawResearch(database);
  if (layer.id === 'rawResearch') {
    return [
      ...(raw?.reliableSources ?? []).map((source) => ({ label: source.label, url: source.url, detail: source.use })),
      ...(database?.reliableSources ?? []).map((source) => ({ label: source.label, url: source.url, detail: source.use })),
    ];
  }
  if (layer.id === 'processing') {
    return [
      ...(database?.simulations ?? []).map((item) => ({ label: item.title, url: item.path, detail: item.scenario ?? item.thesis })),
      ...(database?.methods ?? []).map((item) => ({ label: item.title, url: item.id, detail: item.objective })),
      ...(database?.procedures ?? []).map((item) => ({ label: item.title, url: item.id, detail: item.trigger })),
    ];
  }
  return [
    ...layer.items.flatMap((item) => (item.publicView?.approvedLinks ?? []).map((link) => ({ label: link.label, url: link.target, detail: 'link aprovado para consulta' }))),
    ...(database?.reports ?? []).map((item) => ({ label: item.title, url: item.path, detail: item.thesis })),
  ];
}

function renderPayloadValue(value) {
  if (value === null || value === undefined) return 'n/a';
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' ? (item.label ?? item.title ?? item.target ?? 'item') : item)).join(', ');
  if (typeof value === 'object') return Object.values(value).filter((item) => typeof item === 'string').join(' ');
  return String(value);
}

function friendlyStatus(value) {
  const statusLabels = {
    ready: 'pronto',
    archived: 'arquivado',
    empty: 'vazio',
    offline: 'offline',
  };
  return statusLabels[value] ?? value ?? 'em revisao';
}

function getPublicRecordSections(item) {
  const view = item?.publicView ?? item?.payload ?? {};
  return [
    { key: 'plainSummary', label: 'resumo claro', value: view.plainSummary },
    { key: 'whyItMatters', label: 'por que importa', value: view.whyItMatters },
    { key: 'clearInformation', label: 'informacoes claras', value: view.clearInformation },
    { key: 'viewerQuestions', label: 'perguntas que ajuda a responder', value: view.viewerQuestions },
  ].filter((section) => section.value);
}

function App() {
  const [backendReady, setBackendReady] = useState(false);
  const [missionDraft, setMissionDraft] = useState({ title: '', description: '', context: '', success: '', constraints: '' });
  const [activeMission, setActiveMission] = useState(null);
  const [supervisorMode, setSupervisorMode] = useState('standby');
  const [terminals, setTerminals] = useState([]);
  const [database, setDatabase] = useState(fallbackDatabase);
  const [heartbeatMonitor, setHeartbeatMonitor] = useState(null);
  const [heartbeatLogs, setHeartbeatLogs] = useState([]);
  const [lines, setLines] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const [activeDatabaseLayer, setActiveDatabaseLayer] = useState('dashboardIntegration');
  const agentLinesRef = useRef({});

  useEffect(() => {
    let socket = null;
    let reconnectTimer = null;
    let pollTimer = null;

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
    pollTimer = setInterval(fetchState, 5000);
    return () => {
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
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
    const supervisor = agents.find((agent) => agent.id === 'supervisor');
    const workingAgents = agents.filter((agent) => agent.role === 'researcher' || agent.role === 'planner');
    setDatabase(state.database ?? fallbackDatabase);
    setHeartbeatMonitor(state.heartbeatMonitor ?? null);
    setHeartbeatLogs(state.heartbeatLogs ?? []);

    if (supervisor) {
      setSupervisorMode(supervisor.status);
      agentLinesRef.current = { ...agentLinesRef.current, supervisor: supervisor.lines };
    }
    setActiveMission(state.activeMission ? { ...state.activeMission, activatedAt: state.activeMission.activatedAt ?? '' } : null);
    if (workingAgents.length) {
      setTerminals(workingAgents);
      workingAgents.forEach((agent) => {
        agentLinesRef.current = { ...agentLinesRef.current, [agent.id]: agent.lines };
      });
    }
    setLines(() => {
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
    if (agentId === 'heartbeat') return heartbeatLogs;
    return agentLinesRef.current[agentId] ?? [];
  }

  function getAgentStatus(agentId) {
    if (agentId === 'heartbeat') return backendReady ? 'online' : 'offline';
    if (agentId === 'database') return `${countDatabaseItems(database)} itens`;
    if (agentId === 'supervisor') return supervisorMode;
    const agent = terminals.find((item) => item.id === agentId);
    return agent?.status ?? 'idle';
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

  async function runAgent(agentId) {
    await apiPost('/api/agent/run', { agentId });
    fetchState();
  }

  async function startHeartbeat() {
    await apiPost('/api/heartbeat/start');
    fetchState();
  }

  async function pauseHeartbeat() {
    await apiPost('/api/heartbeat/pause');
    fetchState();
  }

  async function clearAgents() {
    await apiPost('/api/agents/clear');
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
            isSystemRunning={supervisorMode === 'running'}
            onClick={async () => {
              const nextActive = activeAgent === agent.id ? null : agent.id;
              setActiveAgent(nextActive);
              if (nextActive && !agent.isHeartbeat && !agent.isDatabase) {
                try {
                  await runAgent(agent.id);
                } catch {
                  // terminal will reflect backend status/error on next state sync
                }
              }
            }}
            onToggleSystem={supervisorMode === 'running' ? pauseSupervisor : startSupervisor}
          />
        ))}
      </div>

      {activeAgent && (
        activeAgent === 'database' ? (
          <DatabaseEnvironment
            database={database}
            activeLayerId={activeDatabaseLayer}
            setActiveLayerId={setActiveDatabaseLayer}
            onClose={() => setActiveAgent(null)}
          />
        ) : (
          <AgentTerminal
            activeAgent={activeAgent}
            activeMission={activeMission}
            missionDraft={missionDraft}
            supervisorMode={supervisorMode}
            terminals={terminals}
            heartbeatMonitor={heartbeatMonitor}
            agentDefs={agentDefs}
            getAgentLines={getAgentLines}
            getAgentStatus={getAgentStatus}
            setActiveAgent={setActiveAgent}
            startHeartbeat={startHeartbeat}
            pauseHeartbeat={pauseHeartbeat}
            clearAgents={clearAgents}
            backendReady={backendReady}
          />
        )
      )}

      <div className="empty-stage" aria-hidden="true" />
    </main>
  );
}

function DatabaseEnvironment({ database, activeLayerId, setActiveLayerId, onClose }) {
  const layers = getDatabaseLayers(database);
  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0];
  const [activeItemId, setActiveItemId] = useState(null);
  const activeItem = activeLayer.items.find((item) => (item.id ?? item.label) === activeItemId) ?? activeLayer.items[0] ?? null;
  const layerLinks = getLayerLinks(database, activeLayer);
  const publicSections = activeLayer.id === 'dashboardIntegration' ? getPublicRecordSections(activeItem) : [];
  const activeItemPayload = activeItem?.payload && typeof activeItem.payload === 'object' ? Object.entries(activeItem.payload) : [];

  function selectLayer(layerId) {
    setActiveLayerId(layerId);
    setActiveItemId(null);
  }

  return (
    <div className="agent-terminal-overlay" onClick={onClose}>
      <section className="database-environment" onClick={(event) => event.stopPropagation()}>
        <header className="database-header">
          <div>
            <h2>database do projeto</h2>
            <p>{database.source?.name ?? 'luca-operational-database'}</p>
          </div>
          <a className="database-obsidian-link" href={obsidianUrl(databaseObsidianPages.index)}>
            indice obsidian
          </a>
          <button className="compact-close" onClick={onClose}>x</button>
        </header>

        <nav className="database-tabs" aria-label="camadas do database">
          {layers.map((layer) => (
            <button
              key={layer.id}
              className={activeLayer.id === layer.id ? 'selected' : ''}
              type="button"
              onClick={() => selectLayer(layer.id)}
            >
              <span>{layer.index}</span>
              <strong>{layer.title}</strong>
              <mark>{layer.items.length}</mark>
            </button>
          ))}
        </nav>

        <div className="database-layer-view">
          <aside>
            <span>camada {activeLayer.index}</span>
            <h3>{activeLayer.title}</h3>
            <p>{activeLayer.rule}</p>
            <div className="database-meta">
              <div>
                <strong>{friendlyStatus(activeLayer.status)}</strong>
                <small>status</small>
              </div>
              <div>
                <strong>{activeLayer.visibility}</strong>
                <small>visibilidade</small>
              </div>
            </div>
            <a className="database-layer-link" href={obsidianUrl(getLayerObsidianPage(activeLayer.id))}>
              abrir camada {activeLayer.index} no obsidian
            </a>
            <div className="database-link-index">
              <strong>index de links</strong>
              {layerLinks.slice(0, 6).map((link) => (
                <a key={`${link.label}-${link.url}`} href={link.url?.startsWith('http') ? link.url : obsidianUrl(getLayerObsidianPage(activeLayer.id))}>
                  {link.label}
                </a>
              ))}
            </div>
          </aside>

          <section className="database-items">
            {activeLayer.items.length > 0 ? (
              activeLayer.items.map((item) => {
                const summary = summarizeDatabaseItem(item);
                return (
                  <article key={summary.id} className={activeItem === item ? 'selected' : ''}>
                    <span>{summary.type}</span>
                    <h4>{summary.label}</h4>
                    <p>{summary.detail}</p>
                    <button type="button" onClick={() => setActiveItemId(summary.id)}>abrir informacoes</button>
                  </article>
                );
              })
            ) : (
              <div className="database-empty">
                <h4>camada vazia</h4>
                <p>aguardando preenchimento manual</p>
              </div>
            )}
            {activeItem && (
              <article className="database-record-detail">
                <span>registro aberto</span>
                <h4>{activeItem.label ?? activeItem.title ?? activeItem.id}</h4>
                <p>{friendlyStatus(activeItem.status ?? activeItem.type ?? 'registro real coletado')}</p>
                {publicSections.length > 0 ? (
                  <div className="database-public-view">
                    {publicSections.map((section) => (
                      <div key={section.key}>
                        <strong>{section.label}</strong>
                        {Array.isArray(section.value) ? (
                          <ul>
                            {section.value.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        ) : (
                          <p>{section.value}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="database-payload-grid">
                    {activeItemPayload.slice(0, 8).map(([key, value]) => (
                      <div key={key}>
                        <strong>{key}</strong>
                        <small>{renderPayloadValue(value)}</small>
                      </div>
                    ))}
                  </div>
                )}
                <a href={obsidianUrl(getLayerObsidianPage(activeLayer.id))}>abrir pagina relacionada no obsidian</a>
              </article>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function AgentTerminal({
  activeAgent,
  terminals,
  heartbeatMonitor,
  agentDefs,
  getAgentLines,
  getAgentStatus,
  setActiveAgent,
  startHeartbeat,
  pauseHeartbeat,
  clearAgents,
  backendReady,
}) {
  const heartbeatRows = [
    { label: 'Supervisor', state: getAgentStatus('supervisor'), online: backendReady ? 'ready' : 'offline' },
    { label: 'Planejador', state: getAgentStatus('planejador'), online: backendReady ? 'ready' : 'offline' },
    { label: 'Pesquisador', state: getAgentStatus('pesquisador'), online: backendReady ? 'ready' : 'offline' },
  ];
  const monitorFresh = heartbeatFresh(heartbeatMonitor?.updatedAt);
  const monitorStatus = monitorFresh ? (heartbeatMonitor?.status ?? 'online') : 'stale';

  return (
    <div className="agent-terminal-overlay" onClick={() => setActiveAgent(null)}>
      <div className="agent-terminal" onClick={(event) => event.stopPropagation()}>
        <div className="agent-terminal-header">
          <h2>{activeAgent === 'heartbeat' ? 'heartbeat monitor' : (agentDefs.find((agent) => agent.id === activeAgent)?.title ?? activeAgent)}</h2>
          <mark>{getAgentStatus(activeAgent)}</mark>
          <button className="compact-close" onClick={() => setActiveAgent(null)}>x</button>
        </div>
        <div className="agent-terminal-body">
          {activeAgent === 'heartbeat' ? (
            <div className="heartbeat-workspace" style={{ display: 'block' }}>
              <div className="row-btns" style={{ marginBottom: 12 }}>
                <button onClick={startHeartbeat}>play</button>
                <button onClick={pauseHeartbeat}>pause</button>
                <button onClick={clearAgents}>limpar</button>
              </div>
              <div className="terminal-mini" style={{ minHeight: 320 }}>
                <p>$ heartbeat monitor {monitorStatus}</p>
                <p>last tick: {heartbeatMonitor?.updatedAt ?? 'n/a'}</p>
                {heartbeatRows.map((row) => (
                  <p key={row.label}>
                    <span>{row.label} - </span>
                    <span style={{ color: stateTone(row.state) }}>{row.state}</span>
                    <span> / </span>
                    <span style={{ color: stateTone(row.online) }}>{row.online}</span>
                  </p>
                ))}
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
  );
}

function AgentTile({ agent, status, isActive, isOnline, isSystemRunning, onClick, onToggleSystem }) {
  const tileBody = agent.isDatabase || agent.icon ? (
    <img className="tile-icon" src={agent.icon} alt={agent.title} />
  ) : agent.id === 'planejador' ? (
    <div className="tile-planner">
      <span>plan</span>
    </div>
  ) : (
    <div className="tile-placeholder">{agent.title}</div>
  );

  const tileFooter = (
      <span className="tile-label">{agent.title}</span>
  );

  if (!agent.isHeartbeat) {
    return (
      <button className={`tile clickable ${isActive ? 'active' : ''}`} type="button" onClick={onClick} aria-label={agent.title}>
        {tileBody}
        {tileFooter}
      </button>
    );
  }

  return (
    <div className={`tile clickable ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="tile-heartbeat">
        <video
          className="tile-icon heartbeat-icon"
          src={agent.icon}
          poster={agent.fallbackIcon}
          autoPlay
          loop
          muted
          playsInline
        />
        <div className={`pulse-dot heartbeat-dot ${isOnline ? 'pulse-green' : 'pulse-red'}`} />
        <button
          className={`heartbeat-switch ${isSystemRunning ? 'on' : 'off'}`}
          type="button"
          aria-label={isSystemRunning ? 'desligar sistema' : 'ligar sistema'}
          title={isSystemRunning ? 'desligar sistema' : 'ligar sistema'}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSystem();
          }}
        >
        </button>
      </div>
      {tileFooter}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
