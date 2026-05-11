import { useState, useEffect, useRef, useCallback } from 'react';
import { useLuca, type Mission } from './hooks/useLuca';
import { statusColor } from './hooks/useLuca';

// ===== UTILS =====
function fmtRuntime(t?: string) {
  if (!t) return 'Aguardando';
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(t)) / 60000));
  if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}min`;
  if (mins > 0) return `${mins}min`;
  return 'Agora';
}

function hbLineTone(line: string) {
  if (/^\[agent:start\]/.test(line)) return 'terminal-line-start';
  if (/^\[agent:done\]/.test(line)) return 'terminal-line-done';
  if (/^\[agent:fail\]|^\[stderr\]/.test(line)) return 'terminal-line-fail';
  return '';
}

function visibleHbLines(lines: string[]) {
  return lines
    .filter(l => !/^\[heartbeat\] ok\b/.test(l))
    .map(l => ({ raw: l, text: l.replace(/^\[agent:(?:start|done|fail)\]\s*/, '') }));
}

function chatSide(i: number) {
  return i % 2 === 0 ? 'from-left' : 'from-right';
}

function fmtChatParagraphs(text: string) {
  return String(text ?? '')
    .replace(/\s+(?=(?:Premissas|Problema priorizado|Ranking|Acoes|Ordem|Sucesso|Criterio|Missao):)/g, '\n')
    .replace(/\s+(?=\d+\)\s)/g, '\n')
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean);
}

function pieGradient(items: { label: string; value: number }[]) {
  const palette = ['#b85c2e', '#8b6239', '#4a5d3a', '#6a7a6a', '#7a5a3a'];
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  let cursor = 0;
  return items.map((item, i) => {
    const start = cursor;
    cursor += (item.value / total) * 100;
    return `${palette[i % palette.length]} ${start}% ${cursor}%`;
  }).join(', ');
}

function normalizeChartItems(items: any[]) {
  return items.map((item, i) => {
    if (item && typeof item === 'object') {
      return {
        label: String(item.label ?? item.name ?? item.title ?? `item ${i + 1}`),
        value: Number(item.value ?? item.count ?? 1) || 1,
      };
    }
    const text = String(item ?? '');
    const match = text.match(/^(.+?)[\s:=|-]+(\d+(?:\.\d+)?)$/);
    return {
      label: match ? match[1].trim() : text,
      value: match ? Number(match[2]) : 1,
    };
  }).filter(i => i.label).slice(0, 5);
}

function isOperationalCanvas(dashboard: any) {
  const { sourceAgentId, updatedAt, ...publicDashboard } = dashboard ?? {};
  const text = JSON.stringify(publicDashboard).toLowerCase();
  return Boolean(dashboard?.fallback) || /\b(run|agentes?|supervisor|planejador|pesquisador|designer|fila|erro|fetch failed|dashboard temporario|canvas gerado localmente|9router|heartbeat|tarefas? conclu[ií]das?)\b/.test(text);
}

// ===== COPY BUTTON =====
function CopyBtn({ text, label = 'copiar' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = String(text ?? '').trim();
    if (!v) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(v);
    } else {
      const ta = document.createElement('textarea');
      ta.value = v;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, [text]);
  return (
    <button className="copy-btn" onClick={copy} title={label}>
      {copied ? 'copiado' : label}
    </button>
  );
}

// ===== DASHBOARD BLOCK =====
function DashBlock({ block }: { block: any }) {
  const items = Array.isArray(block.items) ? block.items.slice(0, 6) : [];
  const chartItems = normalizeChartItems(items);

  if (block.type === 'pie') {
    return (
      <article className="dash-block pie">
        <h3>{block.title ?? 'distribuicao'}</h3>
        <div className="mini-pie" style={{ background: `conic-gradient(${pieGradient(chartItems)})` }} />
        <div className="chart-legend">
          {chartItems.map(item => (
            <span key={item.label}>{item.label} <b>{item.value}</b></span>
          ))}
        </div>
      </article>
    );
  }

  if (block.type === 'tower') {
    const maxVal = Math.max(...chartItems.map(i => i.value), 1);
    return (
      <article className="dash-block tower">
        <h3>{block.title ?? 'ranking'}</h3>
        {chartItems.map(item => (
          <div className="tower-row" key={item.label}>
            <span>{item.label}</span>
            <div><i style={{ width: `${Math.max(8, (item.value / maxVal) * 100)}%` }} /></div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </article>
    );
  }

  if (block.type === 'topics') {
    return (
      <article className="dash-block topics">
        <h3>{block.title ?? 'topicos'}</h3>
        <div className="topic-pills">
          {items.map((item: any) => (
            <span key={String(item.label ?? item)}>{String(item.label ?? item)}</span>
          ))}
        </div>
      </article>
    );
  }

  return (
    <article className={`dash-block ${block.type ?? 'note'} ${block.type === 'alert' ? 'alert' : ''}`}>
      <h3>{block.title ?? block.type ?? 'bloco'}</h3>
      {block.value && <strong>{block.value}</strong>}
      {block.body && <p>{block.body}</p>}
      {items.length > 0 && (
        <ul>
          {items.map((item: any) => (
            <li key={String(item.label ?? item)}>{String(item.label ?? item)}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ===== TEMPORARY DASHBOARD =====
function TemporaryDashboard({ dashboard, mission }: { dashboard: any; mission: Mission | null }) {
  const displayDashboard = dashboard && !isOperationalCanvas(dashboard) ? dashboard : null;

  if (!displayDashboard) {
    return (
      <div className="dashboard-empty">
        <div className="dashboard-empty-icon">⚡</div>
        <span>{mission ? 'designer aguardando resultados' : 'canvas do designer'}</span>
      </div>
    );
  }

  const metrics = Array.isArray(displayDashboard?.metrics) ? displayDashboard.metrics.slice(0, 4) : [];
  const panels = Array.isArray(displayDashboard?.panels) ? displayDashboard.panels.slice(0, 4) : [];
  const blocks = Array.isArray(displayDashboard?.blocks)
    ? displayDashboard.blocks.slice(0, 6)
    : [
        ...metrics.map((m: any) => ({ type: 'metric', title: m.label, value: m.value })),
        ...panels.map((p: any) => ({ type: 'note', title: p.title, body: p.body })),
      ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      <div>
        <span style={{ color: 'var(--rust)', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>canvas</span>
        <h2 style={{ margin: '4px 0 2px', color: 'var(--cream)', fontSize: 'clamp(18px, 1.6vw, 26px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          {displayDashboard.title ?? 'Canvas'}
        </h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px', lineHeight: 1.5 }}>
          {displayDashboard.subtitle ?? 'Visualizacao temporaria do designer.'}
        </p>
      </div>
      <div className="dashboard-blocks">
        {blocks.map((block: any, i: number) => (
          <DashBlock key={`${block.type}-${block.title}-${i}`} block={block} />
        ))}
      </div>
    </div>
  );
}

// ===== AGENT TERMINAL =====
function AgentTerminal({
  agentId, onClose, lines, status, onRun, onClear, isSv, svRunning, onToggleSv, isHb, hbRunning, onToggleHb,
}: {
  agentId: string; onClose: () => void; lines: string[]; status: string;
  onRun: (id: string) => void; onClear: () => void; isSv: boolean; svRunning: boolean;
  onToggleSv: () => void; isHb: boolean; hbRunning: boolean; onToggleHb: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [lines]);

  const visibleLines = isHb ? visibleHbLines(lines) : lines.map(l => ({ raw: l, text: l }));

  return (
    <div className="terminal-overlay" onClick={onClose}>
      <section className="terminal-window" onClick={e => e.stopPropagation()}>
        <header className="terminal-header">
          <h2>{agentId}</h2>
          <mark style={{ color: statusColor(status) }}>{status}</mark>
          <button className="terminal-close" onClick={onClose}>×</button>
        </header>

        <div className="terminal-body" ref={bodyRef}>
          {visibleLines.length === 0 ? (
            <p className="muted">sem logs.</p>
          ) : (
            visibleLines.map((l, i) => (
              <p key={i} className={hbLineTone(l.raw)}>{l.text}</p>
            ))
          )}
        </div>

        <div className="btn-row">
          {isSv ? (
            <button onClick={onToggleSv}>{svRunning ? 'pausar supervisor' : 'iniciar supervisor'}</button>
          ) : isHb ? (
            <button onClick={onToggleHb}>{hbRunning ? 'pausar heartbeat' : 'iniciar heartbeat'}</button>
          ) : (
            <button onClick={() => onRun(agentId)}>executar</button>
          )}
          <button onClick={onClear}>limpar</button>
        </div>
      </section>
    </div>
  );
}

// ===== APP =====
export default function App() {
  const luca = useLuca();
  const chatRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [luca.chat.length]);

  const activeAgentDef = luca.AGENT_DEFS.find(a => a.id === luca.activeAgent);
  const isHeartbeat = luca.activeAgent === 'heartbeat';
  const isSupervisor = luca.activeAgent === 'supervisor';

  // Format global chat log text for copy
  const chatLogText = luca.chat.length === 0
    ? 'chat global sem mensagens.'
    : luca.chat.map(m => `[${m.timestamp}] ${m.agentName} (${m.type}): ${m.content}`).join('\n');

  return (
    <main className="screen">
      {/* ===== TOP STRIP: AGENT TILES ===== */}
      <div className="strip">
        {luca.AGENT_DEFS.map((agent) => {
          const st = luca.getStatus(agent.id);
          const isActive = luca.activeAgent === agent.id;
          const isSv = agent.id === 'supervisor';

          let pulseClass = 'pulse-idle';
          if (st === 'running' || st === 'online' || st === 'ready') pulseClass = 'pulse-running';
          else if (st === 'error' || st === 'offline') pulseClass = 'pulse-error';
          else if (st === 'standby') pulseClass = 'pulse-ready';

          return (
            <button
              key={agent.id}
              className={`tile ${isActive ? 'active' : ''}`}
              onClick={() => luca.setActiveAgent(isActive ? null : agent.id)}
            >
              <div style={{ position: 'relative' }}>
                <img src={agent.image} alt={agent.title} className="tile-icon" loading="lazy" />
                <div className={`pulse-dot ${pulseClass}`} />
              </div>
              <div className="tile-label">
                {isSv
                  ? (luca.svMode === 'running' ? '◉ supervisor' : '○ supervisor')
                  : agent.title}
              </div>
            </button>
          );
        })}
      </div>

      {/* ===== MAIN LAYOUT ===== */}
      <div className="main-layout">
        {/* LEFT: Dashboard */}
        <div className="main-left">
          <div className="dashboard-panel">
            <div className="dashboard-panel" style={{ border: 'none', borderRadius: 0, background: 'transparent', boxShadow: 'none' }}>
              <div className="dashboard-body">
                <TemporaryDashboard dashboard={luca.ready ? (luca as any).temporaryDashboard ?? null : null} mission={luca.mission} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Mission + Chat */}
        <div className="main-right">
          {/* Mission Panel */}
          <div className="mission-panel">
            <div className="mission-title">
              <strong>Missao</strong>
              <span>{luca.mission ? fmtRuntime(luca.mission.activatedAt) : 'pronta para nova missao'}</span>
            </div>
            <div className="mission-controls">
              {luca.mission && <button onClick={luca.resetMission}>parar</button>}
              <button onClick={luca.resetMission}>resetar</button>
              <button
                className="primary"
                onClick={luca.setupMission}
                disabled={!luca.missionDraft.success.trim()}
              >
                ativar
              </button>
            </div>
            <textarea
              className="mission-textarea"
              placeholder="Descricao da missao (opcional)..."
              value={luca.missionDraft.description}
              onChange={e => luca.setMissionDraft(d => ({ ...d, description: e.target.value }))}
              rows={2}
            />
            <textarea
              className="mission-textarea"
              placeholder="Criterios de conclusao *obrigatorio"
              value={luca.missionDraft.success}
              onChange={e => luca.setMissionDraft(d => ({ ...d, success: e.target.value }))}
              rows={2}
              style={{ borderColor: !luca.missionDraft.success.trim() ? 'rgba(184, 92, 46, 0.35)' : undefined }}
            />
          </div>

          {/* Chat Panel */}
          <div className="chat-panel">
            <div className="chat-header">
              <CopyBtn text={chatLogText} label="copiar log" />
              <span>chat global</span>
              <span className={`chat-live-badge ${luca.ready ? 'online' : 'offline'}`}>
                {luca.ready ? 'ao vivo' : 'offline'}
              </span>
            </div>
            <div className="chat-stream" ref={chatRef}>
              {luca.chat.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '11px', padding: '20px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  chat global vazio
                </div>
              ) : (
                luca.chat.map((msg, i) => (
                  <div key={msg.id} className={`chat-msg ${chatSide(i)} type-${msg.type}`}>
                    <div className="chat-msg-meta">
                      <strong>{msg.agentName}</strong>
                      <span className="msg-type">{msg.type}</span>
                      <time>{msg.timestamp}</time>
                    </div>
                    <div className="chat-msg-content">
                      {fmtChatParagraphs(msg.content).map((p, j) => (
                        <p key={j}>{p}</p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== STATUS BAR ===== */}
      <div className="status-bar">
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: luca.ready ? 'var(--moss)' : '#9b3a2a', display: 'inline-block' }} />
          {luca.ready ? 'backend online' : 'backend offline'}
        </span>
        <span>
          {luca.agents.filter(a => a.status === 'running').length} agentes ativos
          {luca.mission ? ` | missao: ${fmtRuntime(luca.mission.activatedAt)}` : ''}
          {luca.svMode === 'running' ? ' | supervisor: ON' : ''}
        </span>
      </div>

      {/* ===== AGENT TERMINAL OVERLAY ===== */}
      {luca.activeAgent && activeAgentDef && (
        <AgentTerminal
          agentId={luca.activeAgent}
          onClose={() => luca.setActiveAgent(null)}
          lines={luca.getLines(luca.activeAgent)}
          status={luca.getStatus(luca.activeAgent)}
          onRun={luca.runAgent}
          onClear={luca.clearAll}
          isSv={isSupervisor}
          svRunning={luca.svMode === 'running'}
          onToggleSv={luca.svMode === 'running' ? luca.pauseSv : luca.startSv}
          isHb={isHeartbeat}
          hbRunning={luca.hbMonitor?.status === 'online'}
          onToggleHb={luca.hbMonitor?.status === 'online' ? luca.pauseHb : luca.startHb}
        />
      )}
    </main>
  );
}
