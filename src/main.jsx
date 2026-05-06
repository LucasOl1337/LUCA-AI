import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiBase = import.meta.env.DEV ? 'http://127.0.0.1:4141' : window.location.origin;
const wsBase = import.meta.env.DEV
  ? 'ws://127.0.0.1:4141'
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
  { id: 'riscos-campo', title: 'riscos campo', icon: '/icons/riscos.jpg', role: 'executor' },
  { id: 'database', title: 'database', icon: '/icons/database.png', role: 'database', isDatabase: true },
];

const sompoSimulationCase = {
  title: 'Sompo 001: soja RS',
  subtitle: 'triagem preventiva por restricao hidrica',
  image: '/cases/sompo-field-risk-001/01-field-inspection-drought-soy-rs.png',
  metrics: [
    ['talhoes', '3'],
    ['sinistros', '3'],
    ['prevencoes', '3'],
    ['perda real calculada', '0'],
  ],
  priority: 'Uruguaiana / talhao-11: severidade 92, evidencia 35%, acionar campo e corretor.',
  claimCases: [
    'pre-aviso critico por seca e possivel perda de produtividade',
    'sinistro com evidencia insuficiente devolvido para saneamento',
    'confirmacao na colheita antes de calcular produtividade obtida',
  ],
  preventionCases: [
    'alerta antecipado por municipio, cultura e fase da lavoura',
    'checklist de evidencia antes do pico de aviso',
    'roteamento de vistoria por severidade e lacuna de dados',
  ],
  details: [
    'Produto aderente: Sompo Agricola Produtividade com seca/estiagem.',
    'Evento plausivel: soja RS com restricao hidrica em boletins publicos 2026.',
    'Agentes trabalham em exposicao, evidencia, score, vistoria e briefing.',
    'Bloqueio: sem calculo financeiro real enquanto nao houver carteira interna.',
  ],
};

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

function getRawResearch(database) {
  return database?.layers?.rawResearch?.items?.[0]?.payload ?? null;
}

function formatMoneyMillions(value) {
  return `R$ ${Math.round(value).toLocaleString('pt-BR')} mi`;
}

function buildExecutiveIntel(database) {
  const raw = getRawResearch(database);
  const metrics = database?.metrics ?? raw?.metrics ?? {};
  const firstCase = database?.firstCase ?? {};
  const painPoints = database?.painPoints ?? raw?.painPoints ?? [];
  const topRisks = painPoints.slice(0, 5).map((risk) => ({
    name: risk.name
      .replace('Clima acima do apetite tecnico', 'Clima')
      .replace('Dependencia estrutural do PSR', 'PSR')
      .replace('Pressao de resseguro e capital', 'Resseguro'),
    score: risk.score ?? 0,
    criticality: risk.criticality ?? 'n/a',
    action: risk.agentAction ?? 'definir acao',
  }));
  const portfolioSignals = [
    { label: 'PSR bloqueado', value: metrics.psrBlockedMillions ?? 0 },
    { label: 'PSR orcado', value: metrics.psrBudgetMillions ?? 0 },
    { label: 'Resseguro 2025', value: metrics.reinsurerPremium2025Millions ?? 0 },
    { label: 'Meta resseguro', value: metrics.reinsurerTarget2026Millions ?? 0 },
  ];
  return {
    metrics,
    firstCase,
    topRisks,
    portfolioSignals,
    decisionBrief: [
      {
        label: 'dor da Sompo',
        title: 'seca pode virar fila de sinistro sem evidencia suficiente',
        detail: `${firstCase.crop ?? 'soja'} no ${firstCase.region ?? 'Rio Grande do Sul'} precisa de triagem antes da decisao de campo.`,
      },
      {
        label: 'o que os agentes fizeram',
        title: 'separaram risco, evidencia e acao preventiva',
        detail: 'Planejador organiza missoes; riscos-campo executa jobs; database entrega apenas informacao clara para decisao.',
      },
      {
        label: 'decisao agora',
        title: 'priorizar talhoes criticos e bloquear conclusao sem prova',
        detail: 'Acionar corretor/campo, pedir fotos georreferenciadas, chuva local e fase da lavoura antes de qualquer calculo real.',
      },
    ],
    kpis: [
      { label: 'riscos claros', value: metrics.painPoints ?? painPoints.length },
      { label: 'jobs ativos', value: metrics.activeJobs ?? database?.jobs?.length ?? 0 },
      { label: 'simulacoes', value: metrics.simulations ?? database?.simulations?.length ?? 0 },
      { label: 'fontes verificadas', value: database?.reliableSources?.length ?? raw?.reliableSources?.length ?? 0 },
    ],
    executiveTable: topRisks.map((risk) => ({
      prioridade: risk.name,
      score: risk.score,
      decisao: risk.action,
    })),
  };
}

const initialDashboardBoxes = [
  {
    id: 'global-dashboard',
    title: 'dashboards globais',
    kind: 'blue',
    x: 56,
    y: 16,
    width: 650,
    height: 310,
    content: 'DASHBOARDS COM INFORMACOES POS PROCESSADAS QUE PODEM SER UTEIS NUM ESCOPO GLOBAL DA SOMPO.',
  },
  {
    id: 'savings-estimator',
    title: 'estimador financeiro',
    kind: 'blue greenText',
    x: 730,
    y: 16,
    width: 220,
    height: 255,
    content: 'PAINEL QUE ESTIMA O CUSTO EM DINHEIRO QUE PODE SER ECONOMIZADO COM BASE NA SIMULACAO\n\nEM PORCENTAGEM E TBM VALOR ESTIMADO',
  },
  {
    id: 'mission-definition',
    title: 'definir missao',
    kind: 'red',
    x: 972,
    y: 16,
    width: 260,
    height: 516,
    content: 'MIGRAR ABA DE DEFINIR MISSAO AQUI.\n\nA MISSAO DEVE SER DEFINIDA PELO USUARIO\n\nDENTRO DA ABA DE MISSAO VAI ESTAR CONECTADO UM AGENTE LLM LIGADO ATRAVES DO ENDPOINT DO 9router. modelo gpt 5.4.\n\nEle devera fazer perguntas sobre o que precisa ser feito para o usuario e levantar requisitos e quando termina de levantar os requisitos vai converter isso em um plano ativo\n\nE pensar o que cada um dos agentes deve fazer, e ai passar a missao para eles.',
  },
  {
    id: 'sompo-simulation-case',
    title: 'caso sompo 001',
    kind: 'sompoCase',
    x: 56,
    y: 342,
    width: 894,
    height: 190,
    case: sompoSimulationCase,
  },
];

const dashboardStage = { width: 1288, height: 548 };

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
  const [lines, setLines] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const [activeDatabaseLayer, setActiveDatabaseLayer] = useState('dashboardIntegration');
  const [dashboardBoxes, setDashboardBoxes] = useState(initialDashboardBoxes);
  const [savingsInputs, setSavingsInputs] = useState({ exposedMillions: 120, preventablePct: 18, confidencePct: 62 });
  const [missionBuilder, setMissionBuilder] = useState({
    objective: '',
    area: 'sinistro agro',
    horizon: '30 dias',
    constraints: '',
  });
  const agentLinesRef = useRef({});

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
    const supervisor = agents.find((agent) => agent.id === 'supervisor');
    const executors = agents.filter((agent) => agent.role === 'executor' || agent.role === 'planner');
    setDatabase(state.database ?? fallbackDatabase);

    if (supervisor) {
      setSupervisorMode(supervisor.status);
      agentLinesRef.current = { ...agentLinesRef.current, supervisor: supervisor.lines };
    }
    setActiveMission(state.activeMission ? { ...state.activeMission, activatedAt: state.activeMission.activatedAt ?? '' } : null);
    if (executors.length) {
      setTerminals(executors);
      executors.forEach((agent) => {
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
    if (agentId === 'heartbeat') return lines.map((line) => line.text);
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
            onClick={() => setActiveAgent((current) => (current === agent.id ? null : agent.id))}
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
            agentDefs={agentDefs}
            getAgentLines={getAgentLines}
            getAgentStatus={getAgentStatus}
            setActiveAgent={setActiveAgent}
            setMissionDraft={setMissionDraft}
            setupMission={setupMission}
            resetMission={resetMission}
            startSupervisor={startSupervisor}
            pauseSupervisor={pauseSupervisor}
          />
        )
      )}

      <DashboardCanvas
        boxes={dashboardBoxes}
        setBoxes={setDashboardBoxes}
        database={database}
        savingsInputs={savingsInputs}
        setSavingsInputs={setSavingsInputs}
        missionBuilder={missionBuilder}
        setMissionBuilder={setMissionBuilder}
        setMissionDraft={setMissionDraft}
      />

    </main>
  );
}

function DashboardCanvas({ boxes, setBoxes, database, savingsInputs, setSavingsInputs, missionBuilder, setMissionBuilder, setMissionDraft }) {
  const dragRef = useRef(null);
  const canvasRef = useRef(null);
  const [stageScale, setStageScale] = useState(1);
  const intel = buildExecutiveIntel(database);

  useEffect(() => {
    function updateScale() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nextScale = Math.min(rect.width / dashboardStage.width, rect.height / dashboardStage.height, 0.88);
      setStageScale(Math.max(0.58, Number(nextScale.toFixed(3))));
    }
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (canvasRef.current) observer.observe(canvasRef.current);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  function startBoxAction(event, boxId, mode) {
    event.preventDefault();
    event.stopPropagation();
    const box = boxes.find((item) => item.id === boxId);
    if (!box) return;
    dragRef.current = {
      boxId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      box,
      scale: stageScale,
    };
    window.addEventListener('pointermove', moveBox);
    window.addEventListener('pointerup', stopBoxAction, { once: true });
  }

  function moveBox(event) {
    const action = dragRef.current;
    if (!action) return;
    const dx = (event.clientX - action.startX) / action.scale;
    const dy = (event.clientY - action.startY) / action.scale;
    setBoxes((current) => current.map((box) => {
      if (box.id !== action.boxId) return box;
      if (action.mode === 'resize') {
        return {
          ...box,
            width: Math.max(150, action.box.width + dx),
            height: Math.max(90, action.box.height + dy),
        };
      }
      return {
        ...box,
        x: Math.max(0, action.box.x + dx),
        y: Math.max(0, action.box.y + dy),
      };
    }));
  }

  function stopBoxAction() {
    dragRef.current = null;
    window.removeEventListener('pointermove', moveBox);
  }

  return (
    <section className="dashboard-canvas" ref={canvasRef} aria-label="dashboard operacional">
      <div
        className="dashboard-stage"
        style={{
          width: dashboardStage.width,
          height: dashboardStage.height,
          '--stage-scale': stageScale,
        }}
      >
        {boxes.map((box) => (
          <article
            key={box.id}
            className={`canvas-box ${box.kind}`}
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
            }}
          >
            <button
              className="box-drag-zone"
              type="button"
              aria-label={`mover ${box.title}`}
              onPointerDown={(event) => startBoxAction(event, box.id, 'move')}
            />
            <CanvasBoxContent
              box={box}
              intel={intel}
              savingsInputs={savingsInputs}
              setSavingsInputs={setSavingsInputs}
              missionBuilder={missionBuilder}
              setMissionBuilder={setMissionBuilder}
              setMissionDraft={setMissionDraft}
            />
            <button
              className="box-resize-handle"
              type="button"
              aria-label={`redimensionar ${box.title}`}
              onPointerDown={(event) => startBoxAction(event, box.id, 'resize')}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function CanvasBoxContent({ box, intel, savingsInputs, setSavingsInputs, missionBuilder, setMissionBuilder, setMissionDraft }) {
  if (box.id === 'global-dashboard') return <ExecutiveDashboard intel={intel} />;
  if (box.id === 'savings-estimator') return <SavingsEstimator inputs={savingsInputs} setInputs={setSavingsInputs} />;
  if (box.id === 'sompo-simulation-case') return <SompoSimulationPanel simulation={box.case} />;
  if (box.id === 'mission-definition') {
    return (
      <MissionDefinitionPanel
        missionBuilder={missionBuilder}
        setMissionBuilder={setMissionBuilder}
        setMissionDraft={setMissionDraft}
      />
    );
  }
  return <p>{box.content}</p>;
}

function SompoSimulationPanel({ simulation }) {
  return (
    <div className="sompo-simulation-panel">
      <img src={simulation.image} alt="vistoria simulada em soja no Rio Grande do Sul" />
      <div className="sompo-case-body">
        <span>simulacao validada com fontes publicas</span>
        <h2>{simulation.title}</h2>
        <strong>{simulation.subtitle}</strong>
        <div className="sompo-metrics">
          {simulation.metrics.map(([label, value]) => (
            <div key={label}>
              <b>{value}</b>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <p>{simulation.priority}</p>
        <div className="sompo-case-columns">
          <section>
            <h3>casos de sinistro</h3>
            {simulation.claimCases.map((item) => (
              <small key={item}>{item}</small>
            ))}
          </section>
          <section>
            <h3>prevencao</h3>
            {simulation.preventionCases.map((item) => (
              <small key={item}>{item}</small>
            ))}
          </section>
        </div>
        <ul>
          {simulation.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ExecutiveDashboard({ intel }) {
  return (
    <div className="executive-dashboard">
      <header>
        <span>briefing humano para decisao</span>
        <h2>Sompo 001: evitar atraso e retrabalho no sinistro agro</h2>
        <p>O LUCA-AI transforma sinais de seca em prioridade de campo, evidencia minima e proximo passo claro.</p>
      </header>
      <div className="decision-brief-grid">
        {intel.decisionBrief.map((item) => (
          <section key={item.label}>
            <span>{item.label}</span>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </section>
        ))}
      </div>
      <div className="kpi-row">
        {intel.kpis.map((item) => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <table className="exec-table">
        <thead>
          <tr>
            <th>risco que precisa de atencao</th>
            <th>score</th>
            <th>acao sugerida pelos agentes</th>
          </tr>
        </thead>
        <tbody>
          {intel.executiveTable.slice(0, 3).map((row) => (
            <tr key={row.prioridade}>
              <td>{row.prioridade}</td>
              <td>{row.score}</td>
              <td>{row.decisao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SavingsEstimator({ inputs, setInputs }) {
  const estimated = inputs.exposedMillions * (inputs.preventablePct / 100) * (inputs.confidencePct / 100);
  function update(key, value) {
    setInputs((current) => ({ ...current, [key]: Number(value) }));
  }
  return (
    <div className="savings-estimator">
      <h2>cenario hipotetico</h2>
      <strong>{formatMoneyMillions(estimated)}</strong>
      <span>nao e indenizacao real | {inputs.preventablePct}% evitavel</span>
      <label>
        carteira simulada
        <input type="range" min="20" max="500" value={inputs.exposedMillions} onChange={(event) => update('exposedMillions', event.target.value)} />
      </label>
      <label>
        perda evitavel simulada
        <input type="range" min="1" max="40" value={inputs.preventablePct} onChange={(event) => update('preventablePct', event.target.value)} />
      </label>
      <label>
        confianca
        <input type="range" min="20" max="90" value={inputs.confidencePct} onChange={(event) => update('confidencePct', event.target.value)} />
      </label>
    </div>
  );
}

function MissionDefinitionPanel({ missionBuilder, setMissionBuilder, setMissionDraft }) {
  const plan = [
    `1. levantar requisitos para ${missionBuilder.area}`,
    `2. converter objetivo em missao com horizonte de ${missionBuilder.horizon}`,
    '3. supervisor separa tarefas entre planejador e riscos-campo',
    '4. camada 2 recebe informacao processada antes do dashboard',
  ];
  function update(key, value) {
    setMissionBuilder((current) => ({ ...current, [key]: value }));
  }
  function promoteMission() {
    setMissionDraft({
      title: missionBuilder.objective || `Missao ${missionBuilder.area}`,
      description: plan.join('\n'),
      context: `area=${missionBuilder.area}; horizonte=${missionBuilder.horizon}`,
      success: 'requisitos levantados, plano ativo criado e agentes acionados',
      constraints: missionBuilder.constraints,
    });
  }
  return (
    <div className="mission-panel">
      <header>
        <span>agente de definicao</span>
        <h2>definir missao</h2>
      </header>
      <label>
        o que precisa ser feito?
        <textarea value={missionBuilder.objective} onChange={(event) => update('objective', event.target.value)} placeholder="ex: reduzir atraso de vistoria em soja no RS" />
      </label>
      <div className="mission-row">
        <label>
          area
          <select value={missionBuilder.area} onChange={(event) => update('area', event.target.value)}>
            <option>sinistro agro</option>
            <option>underwriting</option>
            <option>canal corretor</option>
            <option>resseguro</option>
          </select>
        </label>
        <label>
          horizonte
          <select value={missionBuilder.horizon} onChange={(event) => update('horizon', event.target.value)}>
            <option>7 dias</option>
            <option>30 dias</option>
            <option>90 dias</option>
          </select>
        </label>
      </div>
      <label>
        restricoes
        <input value={missionBuilder.constraints} onChange={(event) => update('constraints', event.target.value)} placeholder="ex: sem dados pessoais, sem dado bruto no dashboard" />
      </label>
      <section>
        <h3>plano ativo sugerido</h3>
        <p>{plan[0]}</p>
      </section>
      <button type="button" onClick={promoteMission}>enviar para setup da missao</button>
    </div>
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
  activeMission,
  missionDraft,
  supervisorMode,
  terminals,
  agentDefs,
  getAgentLines,
  getAgentStatus,
  setActiveAgent,
  setMissionDraft,
  setupMission,
  resetMission,
  startSupervisor,
  pauseSupervisor,
}) {
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
            <div className="heartbeat-workspace">
              <div className="workspace-col">
                <h3>missoes</h3>
                <input
                  placeholder="titulo"
                  value={missionDraft.title}
                  onChange={(event) => setMissionDraft((current) => ({ ...current, title: event.target.value }))}
                />
                <textarea
                  placeholder="descricao"
                  value={missionDraft.description}
                  onChange={(event) => setMissionDraft((current) => ({ ...current, description: event.target.value }))}
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
                  {terminals.flatMap((terminal) => (terminal.lines || []).slice(-4)).slice(-12).map((line, index) => (
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
      <div className="tile-footer">
        <span>{agent.title}</span>
        {status && <mark>{status}</mark>}
      </div>
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
          <span />
        </button>
      </div>
      {tileFooter}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
