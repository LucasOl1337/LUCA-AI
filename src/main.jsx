import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiBase = window.location.origin;
const wsBase = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

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
  { id: 'heartbeat', title: 'heartbeat', icon: '/icons/heartbeat.mp4', fallbackIcon: null, role: 'system', isHeartbeat: true },
  { id: 'database', title: 'database', icon: '/icons/database.png', role: 'database', isDatabase: true },
  { id: 'transformador-missao', title: 'transformador de missão', icon: '/icons/quest.png', role: 'mission-transformer' },
  { id: 'supervisor', title: 'supervisor', icon: '/icons/supervisor.png', role: 'supervisor' },
  { id: 'planejador', title: 'planejador', icon: '/icons/planejador.png', role: 'planner' },
  { id: 'pesquisador', title: 'pesquisador', icon: '/icons/pesquisador.png', role: 'researcher' },
  { id: 'designer', title: 'designer', icon: '/icons/designer.png', role: 'designer' },
];

const layoutStorageKey = 'luca.grid.layout.light.v1';
const defaultGridLayout = {
  mission: { x: 1430, y: 30, width: 500, height: 202 },
  designer: { x: 170, y: 30, width: 1200, height: 815 },
  chat: { x: 1430, y: 258, width: 500, height: 586 },
};

function getDefaultGridLayout() {
  if (typeof window === 'undefined') return defaultGridLayout;
  const width = window.innerWidth;
  const leftDock = width >= 1200 ? 172 : 24;
  const gap = 26;
  const rightWidth = Math.min(Math.max(width * 0.285, 430), 540);
  const rightX = Math.max(leftDock + 650, width - rightWidth - 36);
  const designerWidth = Math.max(600, rightX - leftDock - gap);
  const designerHeight = Math.max(540, window.innerHeight - 60);
  const chatTop = 258;
  return {
    mission: { x: Math.round(rightX), y: 30, width: Math.round(rightWidth), height: 202 },
    designer: { x: leftDock, y: 30, width: Math.round(designerWidth), height: designerHeight },
    chat: { x: Math.round(rightX), y: chatTop, width: Math.round(rightWidth), height: Math.max(420, window.innerHeight - chatTop - 52) },
  };
}

function loadGridLayout() {
  if (typeof window === 'undefined') return getDefaultGridLayout();
  try {
    const stored = JSON.parse(window.localStorage.getItem(layoutStorageKey) ?? 'null');
    if (stored?.mission && stored?.chat) return { ...getDefaultGridLayout(), ...stored };
  } catch {
    // Invalid saved layout falls back to calculated defaults.
  }
  return getDefaultGridLayout();
}

function clampPanel(panel) {
  if (typeof window === 'undefined') return panel;
  const minWidth = 360;
  const minHeight = 160;
  const width = Math.max(minWidth, Math.min(panel.width, window.innerWidth - 24));
  const height = Math.max(minHeight, Math.min(panel.height, window.innerHeight - 24));
  return {
    ...panel,
    width,
    height,
    x: Math.max(12, Math.min(panel.x, window.innerWidth - width - 12)),
    y: Math.max(12, Math.min(panel.y, window.innerHeight - height - 12)),
  };
}

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

function formatMissionRuntime(activatedAt) {
  if (!activatedAt) return 'Aguardando ativação.';
  const started = Date.parse(activatedAt);
  if (!Number.isFinite(started)) return 'Rodando agora.';
  const totalMinutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `Rodando há ${hours}h ${minutes}min.`;
  if (minutes > 0) return `Rodando há ${minutes}min.`;
  return 'Rodando agora.';
}

function missionBulletItems(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
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

function heartbeatLineTone(line) {
  if (/^\[agent:start\]/.test(line)) return 'heartbeat-line-start';
  if (/^\[agent:done\]/.test(line)) return 'heartbeat-line-done';
  if (/^\[agent:fail\]|^\[stderr\]/.test(line)) return 'heartbeat-line-fail';
  return '';
}

function visibleHeartbeatLines(lines) {
  return lines
    .filter((line) => !/^\[heartbeat\] ok\b/.test(line))
    .map((line) => ({ raw: line, text: line.replace(/^\[agent:(?:start|done|fail)\]\s*/, '') }));
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
      rule: layers.rawResearch?.rule ?? 'Base bruta interna. Nao exibir no canvas.',
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
      title: layers.dashboardIntegration?.title?.replace('Camada 3 - ', '').replace(' e integracao no dashboard', '').replace('Dashboard', 'Canvas') ?? 'pos-processamento',
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
    'mission-archive': 'missao passada',
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
  dashboardIntegration: 'Camada 03 - Canvas',
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

function formatGlobalChatLog(messages) {
  if (!messages.length) return 'chat global sem mensagens.';
  return messages
    .map((message) => `[${message.timestamp}] ${message.agentName} (${message.type}): ${message.content}`)
    .join('\n');
}

function formatAgentLog({ title, status, lines }) {
  return [`${title} (${status})`, ...lines].join('\n');
}

function CopyLogButton({ text, label = 'copiar log' }) {
  const [copied, setCopied] = useState(false);

  async function copyLog(event) {
    event.stopPropagation();
    const value = String(text ?? '').trim();
    if (!value) return;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button className="copy-log-button" type="button" onClick={copyLog} title={label} aria-label={label}>
      {copied ? 'copiado' : 'copiar log'}
    </button>
  );
}

function App() {
  const [backendReady, setBackendReady] = useState(false);
  const [missionDraft, setMissionDraft] = useState({ description: '', success: '' });
  const [activeMission, setActiveMission] = useState(null);
  const [supervisorMode, setSupervisorMode] = useState('standby');
  const [terminals, setTerminals] = useState([]);
  const [database, setDatabase] = useState(fallbackDatabase);
  const [heartbeatMonitor, setHeartbeatMonitor] = useState(null);
  const [heartbeatLogs, setHeartbeatLogs] = useState([]);
  const [lines, setLines] = useState([]);
  const [globalChatMessages, setGlobalChatMessages] = useState([]);
  const [temporaryDashboard, setTemporaryDashboard] = useState(null);
  const [activeAgent, setActiveAgent] = useState(null);
  const [activeDatabaseLayer, setActiveDatabaseLayer] = useState('dashboardIntegration');
  const [gridLayout, setGridLayout] = useState(loadGridLayout);
  const [layoutSaved, setLayoutSaved] = useState(false);
  const [, setRuntimeTick] = useState(0);
  const agentLinesRef = useRef({});

  useEffect(() => {
    const timer = setInterval(() => setRuntimeTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, []);

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
    const visibleAgents = agents.filter((agent) => agent.id !== 'supervisor');
    setDatabase(state.database ?? fallbackDatabase);
    setHeartbeatMonitor(state.heartbeatMonitor ?? null);
    setHeartbeatLogs(state.heartbeatLogs ?? []);
    setGlobalChatMessages(state.globalChatMessages ?? []);
    setTemporaryDashboard(state.temporaryDashboard ?? null);

    if (supervisor) {
      setSupervisorMode(supervisor.status);
      agentLinesRef.current = { ...agentLinesRef.current, supervisor: supervisor.lines };
    }
    setActiveMission(state.activeMission ? { ...state.activeMission, activatedAt: state.activeMission.activatedAt ?? '' } : null);
    if (visibleAgents.length) {
      setTerminals(visibleAgents);
      visibleAgents.forEach((agent) => {
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
    if (event.type === 'chat.message') {
      setGlobalChatMessages((messages) => [...messages, event.message].slice(-120));
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
    if (!missionDraft.success.trim()) return;
    const description = missionDraft.description.trim() || 'Executar a missão conforme os critérios de conclusão definidos.';
    await apiPost('/api/mission/activate', {
      title: description.slice(0, 80),
      description,
      success: missionDraft.success,
    });
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

  function movePanel(panelId, nextPanel) {
    setLayoutSaved(false);
    setGridLayout((layout) => ({ ...layout, [panelId]: clampPanel(nextPanel) }));
  }

  function saveCurrentLayout() {
    window.localStorage.setItem(layoutStorageKey, JSON.stringify(gridLayout));
    setLayoutSaved(true);
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
            }}
            onToggleSystem={supervisorMode === 'running' ? pauseSupervisor : startSupervisor}
          />
        ))}
      </div>

      <DraggablePanel
        id="designer"
        className="temporary-dashboard-panel"
        layout={gridLayout.designer}
        onMove={movePanel}
      >
        <TemporaryDashboard dashboard={temporaryDashboard} activeMission={activeMission} />
      </DraggablePanel>

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

      <DraggablePanel
        id="mission"
        className="mission-menu"
        layout={gridLayout.mission}
        onMove={movePanel}
      >
        <MissionMenu
          activeMission={activeMission}
          missionDraft={missionDraft}
          setMissionDraft={setMissionDraft}
          setupMission={setupMission}
          resetMission={resetMission}
        />
      </DraggablePanel>

      <DraggablePanel
        id="chat"
        className="global-chat"
        layout={gridLayout.chat}
        onMove={movePanel}
      >
        <GlobalMissionChat
          messages={globalChatMessages}
          backendReady={backendReady}
        />
      </DraggablePanel>

      <button
        className={`dashboard-save-layout ${layoutSaved ? 'saved' : ''}`}
        type="button"
        onClick={saveCurrentLayout}
        title="salvar layout padrao"
        aria-label="salvar layout padrao"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 3h11l3 3v15H5V3z" />
          <path d="M8 3v6h8V3" />
          <path d="M8 15h8v6H8v-6z" />
        </svg>
      </button>

      <div className="empty-stage" aria-hidden="true" />
    </main>
  );
}

function DraggablePanel({ id, className, layout, onMove, children }) {
  const interactionRef = useRef(null);

  function startDrag(event) {
    if (event.button !== 0) return;
    const target = event.target;
    if (target.closest('textarea, input, button, a, select')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      mode: target.closest('.panel-resize-handle') ? 'resize' : 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panel: layout,
    };
  }

  function updatePanel(event) {
    const current = interactionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (current.mode === 'resize') {
      onMove(id, {
        ...current.panel,
        width: current.panel.width + deltaX,
        height: current.panel.height + deltaY,
      });
      return;
    }
    onMove(id, { ...current.panel, x: current.panel.x + deltaX, y: current.panel.y + deltaY });
  }

  function stopInteraction(event) {
    if (interactionRef.current?.pointerId === event.pointerId) interactionRef.current = null;
  }

  return (
    <section
      className={`draggable-panel ${className}`}
      style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height }}
      onPointerDown={startDrag}
      onPointerMove={updatePanel}
      onPointerUp={stopInteraction}
      onPointerCancel={stopInteraction}
    >
      <div className="panel-drag-handle" aria-hidden="true" />
      {children}
      <div className="panel-resize-handle" aria-hidden="true" />
    </section>
  );
}

function MissionMenu({ activeMission, missionDraft, setMissionDraft, setupMission, resetMission }) {
  const canActivate = missionDraft.success.trim();
  const missionStateLabel = activeMission ? formatMissionRuntime(activeMission.activatedAt) : 'pronta para nova missão';

  return (
    <div className="mission-menu-inner" aria-label="menu de missão global">
      <div className="mission-inline-row">
        <div className="mission-title-block">
          <strong>Missão</strong>
          <span>{missionStateLabel}</span>
        </div>
        <div className="mission-controls">
          {activeMission && <button type="button" onClick={resetMission}>Parar</button>}
          <button type="button" onClick={resetMission}>Resetar</button>
          <button type="button" onClick={setupMission} disabled={!canActivate}>Ativar</button>
        </div>
      </div>
      <label className="mission-criteria-mini">
        <span>Critérios de conclusão.</span>
        <textarea
          value={missionDraft.success}
          onChange={(event) => setMissionDraft((draft) => ({ ...draft, success: event.target.value }))}
          aria-label="Critérios de conclusão"
        />
      </label>
    </div>
  );
}

function GlobalMissionChat({ messages, backendReady }) {
  const streamRef = useRef(null);
  const logText = formatGlobalChatLog(messages);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="global-chat-inner" aria-label="chat global da missao">
      <header className="global-chat-header">
        <CopyLogButton text={logText} label="copiar log do chat global" />
        <mark className={backendReady ? 'live' : 'offline'}>{backendReady ? 'ao vivo' : 'offline'}</mark>
      </header>

      <div className="global-chat-stream" ref={streamRef}>
        {messages.map((message, index) => (
          <article key={message.id} className={`global-chat-message ${message.type} ${chatSide(index)}`}>
            <div className="global-chat-meta">
              <strong>{message.agentName}</strong>
              <span>{message.type}</span>
              <time>{message.timestamp}</time>
            </div>
            <ChatMessageContent text={message.content} />
          </article>
        ))}
      </div>
    </div>
  );
}

function ChatMessageContent({ text }) {
  return (
    <div className="global-chat-content">
      {formatChatParagraphs(text).map((paragraph, index) => (
        <p key={`${paragraph}-${index}`}>{paragraph}</p>
      ))}
    </div>
  );
}

function formatChatParagraphs(text) {
  return String(text ?? '')
    .replace(/\s+(?=(?:Premissas|Problema priorizado|Ranking|Ações|Acoes|Ordem|Sucesso|Critério|Criterio|Missão|Missao):)/g, '\n')
    .replace(/\s+(?=\d+\)\s)/g, '\n')
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function chatSide(index) {
  return index % 2 === 0 ? 'from-left' : 'from-right';
}

function isOperationalCanvas(dashboard) {
  const { sourceAgentId, updatedAt, ...publicDashboard } = dashboard ?? {};
  const text = JSON.stringify(publicDashboard).toLowerCase();
  return Boolean(dashboard?.fallback) || /\b(run|agentes?|supervisor|planejador|pesquisador|designer|fila|erro|fetch failed|dashboard temporario|canvas gerado localmente|9router|heartbeat|tarefas? conclu[ií]das?)\b/.test(text);
}

function TemporaryDashboard({ dashboard, activeMission }) {
  const displayDashboard = dashboard && !isOperationalCanvas(dashboard) ? dashboard : null;

  if (!displayDashboard) {
    return (
      <section className="temporary-dashboard empty" aria-label="canvas temporario da missao">
        <div className="temporary-dashboard-canvas-label">
          {activeMission ? 'designer aguardando' : 'canvas do designer'}
        </div>
      </section>
    );
  }

  const metrics = Array.isArray(displayDashboard?.metrics) ? displayDashboard.metrics.slice(0, 4) : [];
  const panels = Array.isArray(displayDashboard?.panels) ? displayDashboard.panels.slice(0, 4) : [];
  const blocks = Array.isArray(displayDashboard?.blocks)
    ? displayDashboard.blocks.slice(0, 6)
    : [
        ...metrics.map((metric) => ({ type: 'metric', title: metric.label, value: metric.value })),
        ...panels.map((panel) => ({ type: 'note', title: panel.title, body: panel.body })),
      ];
  const title = displayDashboard?.title ?? 'Canvas temporario';
  const subtitle = displayDashboard?.subtitle ?? 'Visualizacao temporaria criada pelo designer.';

  return (
    <section className="temporary-dashboard" aria-label="canvas temporario da missao">
      <div className="temporary-dashboard-inner">
        <header className="temporary-dashboard-header">
          <div>
            <span>canvas</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </header>

        <div className={`temporary-dashboard-blocks layout-${displayDashboard?.layout ?? 'minimal'}`}>
          {blocks.map((block, index) => (
            <DashboardBlock key={`${block.type}-${block.title}-${index}`} block={block} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardBlock({ block }) {
  const items = Array.isArray(block.items) ? block.items.slice(0, 6) : [];
  const chartItems = normalizeChartItems(items);

  if (block.type === 'pie') {
    return (
      <article className="temporary-dashboard-block pie">
        <h3>{block.title ?? 'distribuicao'}</h3>
        <div className="mini-pie" style={{ '--pie': pieGradient(chartItems) }} aria-label="grafico de pizza" />
        <ChartLegend items={chartItems} />
      </article>
    );
  }

  if (block.type === 'tower') {
    const maxValue = Math.max(...chartItems.map((item) => item.value), 1);
    return (
      <article className="temporary-dashboard-block tower">
        <h3>{block.title ?? 'torre'}</h3>
        <div className="mini-tower" aria-label="grafico de torre">
          {chartItems.map((item) => (
            <div className="tower-row" key={item.label}>
              <span>{item.label}</span>
              <div><i style={{ width: `${Math.max(8, (item.value / maxValue) * 100)}%` }} /></div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </article>
    );
  }

  if (block.type === 'topics') {
    return (
      <article className="temporary-dashboard-block topics">
        <h3>{block.title ?? 'topicos'}</h3>
        <div className="topic-pills">
          {items.map((item) => <span key={item}>{formatTopicLabel(item)}</span>)}
        </div>
      </article>
    );
  }

  return (
    <article className={`temporary-dashboard-block ${block.type ?? 'note'}`}>
      <h3>{block.title ?? block.type ?? 'bloco'}</h3>
      {block.value && <strong>{block.value}</strong>}
      {block.body && <p>{block.body}</p>}
      {items.length > 0 && (
        <ul>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </article>
  );
}

function normalizeChartItems(items) {
  return items.map((item, index) => {
    if (item && typeof item === 'object') {
      return {
        label: String(item.label ?? item.name ?? item.title ?? `item ${index + 1}`),
        value: Number(item.value ?? item.count ?? 1) || 1,
      };
    }
    const text = String(item ?? '');
    const match = text.match(/^(.+?)[\s:=|-]+(\d+(?:\.\d+)?)$/);
    return {
      label: match ? match[1].trim() : text,
      value: match ? Number(match[2]) : 1,
    };
  }).filter((item) => item.label).slice(0, 5);
}

function pieGradient(items) {
  const palette = ['#70a8ff', '#d9b45c', '#70f0c8', '#ff8a8a', '#b58cff'];
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  return items.map((item, index) => {
    const start = cursor;
    cursor += (item.value / total) * 100;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  }).join(', ');
}

function ChartLegend({ items }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label}>{item.label} <b>{item.value}</b></span>
      ))}
    </div>
  );
}

function formatTopicLabel(item) {
  if (item && typeof item === 'object') return String(item.label ?? item.title ?? item.name ?? 'topico');
  return String(item);
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
  const heartbeatLines = visibleHeartbeatLines(getAgentLines('heartbeat'));
  const heartbeatRows = [
    { label: 'Supervisor', state: getAgentStatus('supervisor'), online: backendReady ? 'ready' : 'offline' },
    { label: 'Planejador', state: getAgentStatus('planejador'), online: backendReady ? 'ready' : 'offline' },
    { label: 'Pesquisador', state: getAgentStatus('pesquisador'), online: backendReady ? 'ready' : 'offline' },
  ];
  const monitorFresh = heartbeatFresh(heartbeatMonitor?.updatedAt);
  const monitorStatus = monitorFresh ? (heartbeatMonitor?.status ?? 'online') : 'stale';
  const terminalTitle = activeAgent === 'heartbeat' ? 'heartbeat monitor' : (agentDefs.find((agent) => agent.id === activeAgent)?.title ?? activeAgent);
  const terminalLines = activeAgent === 'heartbeat'
    ? [
        `$ heartbeat monitor ${monitorStatus}`,
        `last tick: ${heartbeatMonitor?.updatedAt ?? 'n/a'}`,
        ...heartbeatRows.map((row) => `${row.label} - ${row.state} / ${row.online}`),
        ...heartbeatLines.map((line) => line.text),
      ]
    : getAgentLines(activeAgent);
  const terminalLog = formatAgentLog({ title: terminalTitle, status: getAgentStatus(activeAgent), lines: terminalLines });

  return (
    <div className="agent-terminal-overlay" onClick={() => setActiveAgent(null)}>
      <div className="agent-terminal" onClick={(event) => event.stopPropagation()}>
        <div className="agent-terminal-header">
          <h2>{terminalTitle}</h2>
          <mark>{getAgentStatus(activeAgent)}</mark>
          <CopyLogButton text={terminalLog} label={`copiar log de ${terminalTitle}`} />
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
                {heartbeatLines.map((line, index) => (
                  <p className={heartbeatLineTone(line.raw)} key={`${line.raw}-${index}`}>{line.text}</p>
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
  const isSystemIcon = agent.isDatabase || agent.role === 'mission-transformer';
  const isMissionTransformer = agent.role === 'mission-transformer';
  const iconClassName = `tile-icon ${isSystemIcon ? 'system-agent-icon zoomed-system-icon' : ''} ${isMissionTransformer ? 'mission-transformer-icon' : ''}`.trim();
  const tileBody = isSystemIcon ? (
    <span className="tile-icon-frame">
      <img className={iconClassName} src={agent.icon} alt={agent.title} />
    </span>
  ) : agent.icon ? (
    <img className={iconClassName} src={agent.icon} alt={agent.title} />
  ) : agent.id === 'planejador' ? (
    <div className="tile-planner">
      <span>plan</span>
    </div>
  ) : agent.id === 'designer' ? (
    <div className="tile-designer">
      <span>design</span>
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
          poster={agent.fallbackIcon ?? undefined}
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
