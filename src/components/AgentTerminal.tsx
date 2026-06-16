import { AnimatePresence, motion } from 'framer-motion';
import { useRef } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { findAgentDef } from '@/lib/agents';
import {
  formatAgentLog,
  heartbeatFresh,
  heartbeatLineClass,
  stateTone,
  visibleHeartbeatLines,
} from '@/lib/format';
import CopyLogButton from './CopyLogButton';

interface AgentTerminalProps {
  activeAgent: string | null;
  onClose: () => void;
}

export default function AgentTerminal({ activeAgent, onClose }: AgentTerminalProps) {
  const theme = useTheme();
  const lastDirectActionAt = useRef<Record<string, number>>({});
  const {
    getAgentLines,
    getAgentStatus,
    heartbeatMonitor,
    backendReady,
    startHeartbeat,
    pauseHeartbeat,
    clearAgents,
  } = useLuca();

  const def = findAgentDef(activeAgent);
  const isHeartbeat = activeAgent === 'heartbeat';
  const isDatabase = activeAgent === 'database';
  // O database tem sua própria página dedicada; aqui só agentes/heartbeat.
  const open = Boolean(activeAgent) && !isDatabase;

  const title = def?.title ?? activeAgent ?? '';
  const status = activeAgent ? getAgentStatus(activeAgent) : '';

  const heartbeatLines = visibleHeartbeatLines(getAgentLines('heartbeat'));
  const monitorFresh = heartbeatFresh(heartbeatMonitor?.updatedAt);
  const monitorStatus = monitorFresh ? (heartbeatMonitor?.status ?? 'online') : 'stale';
  const heartbeatRows = [
    { label: 'Supervisor', state: getAgentStatus('supervisor') },
    { label: 'Planejador', state: getAgentStatus('planejador') },
    { label: 'Pesquisador', state: getAgentStatus('pesquisador') },
  ];

  const plainLines = activeAgent ? getAgentLines(activeAgent) : [];
  const logText = isHeartbeat
    ? formatAgentLog({
        title: 'heartbeat monitor',
        status: monitorStatus,
        lines: [
          `last tick: ${heartbeatMonitor?.updatedAt ?? 'n/a'}`,
          ...heartbeatRows.map((r) => `${r.label} - ${r.state}`),
          ...heartbeatLines.map((l) => l.text),
        ],
      })
    : formatAgentLog({ title, status, lines: plainLines });

  function runDirectAction(event: React.SyntheticEvent, key: string, action: () => void | Promise<void>) {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - (lastDirectActionAt.current[key] ?? 0) < 250) return;
    lastDirectActionAt.current[key] = now;
    void action();
  }

  function runClickAction(event: React.MouseEvent<HTMLButtonElement>, key: string, action: () => void | Promise<void>) {
    event.stopPropagation();
    if (Date.now() - (lastDirectActionAt.current[key] ?? 0) < 500) return;
    void action();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(3,9,18,0.72)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          onPointerDown={onClose}
          onMouseDown={onClose}
          onTouchStart={onClose}
        >
          <motion.div
            className="void-panel rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label={isHeartbeat ? 'heartbeat monitor' : `${title} terminal`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center gap-3 px-5 h-14 border-b shrink-0" style={{ borderColor: theme.border }}>
              {def?.owl && <img src={def.owl} alt="" className="w-7 h-7 object-contain" />}
              <h2 className="font-display font-semibold text-base flex-1" style={{ color: theme.text }}>
                {isHeartbeat ? 'heartbeat monitor' : title}
              </h2>
              <span className="state-badge" style={{ color: stateTone(status), border: `1px solid ${theme.border}` }}>
                {isHeartbeat ? monitorStatus : status}
              </span>
              <CopyLogButton text={logText} label={`copiar log de ${title}`} />
              <button
                type="button"
                onClick={(e) => runClickAction(e, 'close', onClose)}
                onPointerDownCapture={(e) => runDirectAction(e, 'close', onClose)}
                onPointerUpCapture={(e) => runDirectAction(e, 'close', onClose)}
                onMouseDownCapture={(e) => runDirectAction(e, 'close', onClose)}
                onMouseUpCapture={(e) => runDirectAction(e, 'close', onClose)}
                onTouchStartCapture={(e) => runDirectAction(e, 'close', onClose)}
                onTouchEndCapture={(e) => runDirectAction(e, 'close', onClose)}
                onPointerDown={(e) => runDirectAction(e, 'close', onClose)}
                onPointerUp={(e) => runDirectAction(e, 'close', onClose)}
                onMouseDown={(e) => runDirectAction(e, 'close', onClose)}
                onMouseUp={(e) => runDirectAction(e, 'close', onClose)}
                onTouchStart={(e) => runDirectAction(e, 'close', onClose)}
                onTouchEnd={(e) => runDirectAction(e, 'close', onClose)}
                className="w-10 h-10 -mr-2 rounded-md flex items-center justify-center transition-colors"
                style={{ color: theme.textMute }}
                aria-label="fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* body */}
            <div className="term flex-1 overflow-y-auto p-4 m-3 rounded-xl">
              {isHeartbeat ? (
                <div>
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      className="btn-fleet !py-1.5 !px-3 !text-xs"
                      onPointerDownCapture={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onPointerUpCapture={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onMouseDownCapture={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onMouseUpCapture={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onTouchStartCapture={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onTouchEndCapture={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onPointerDown={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onPointerUp={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onMouseDown={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onMouseUp={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onTouchStart={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onTouchEnd={(e) => runDirectAction(e, 'heartbeat-play', startHeartbeat)}
                      onClick={(e) => runClickAction(e, 'heartbeat-play', startHeartbeat)}
                    >
                      play
                    </button>
                    <button
                      type="button"
                      className="btn-fleet !py-1.5 !px-3 !text-xs"
                      onPointerDownCapture={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onPointerUpCapture={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onMouseDownCapture={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onMouseUpCapture={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onTouchStartCapture={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onTouchEndCapture={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onPointerDown={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onPointerUp={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onMouseDown={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onMouseUp={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onTouchStart={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onTouchEnd={(e) => runDirectAction(e, 'heartbeat-pause', pauseHeartbeat)}
                      onClick={(e) => runClickAction(e, 'heartbeat-pause', pauseHeartbeat)}
                    >
                      pause
                    </button>
                    <button
                      type="button"
                      className="btn-fleet !py-1.5 !px-3 !text-xs"
                      onPointerDownCapture={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onPointerUpCapture={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onMouseDownCapture={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onMouseUpCapture={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onTouchStartCapture={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onTouchEndCapture={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onPointerDown={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onPointerUp={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onMouseDown={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onMouseUp={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onTouchStart={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onTouchEnd={(e) => runDirectAction(e, 'heartbeat-clear', clearAgents)}
                      onClick={(e) => runClickAction(e, 'heartbeat-clear', clearAgents)}
                    >
                      limpar
                    </button>
                  </div>
                  <p>$ heartbeat monitor {monitorStatus}</p>
                  <p>last tick: {heartbeatMonitor?.updatedAt ?? 'n/a'}</p>
                  {heartbeatRows.map((row) => (
                    <p key={row.label}>
                      <span>{row.label} — </span>
                      <span style={{ color: stateTone(row.state) }}>{row.state}</span>
                      <span> / </span>
                      <span style={{ color: backendReady ? theme.alive : theme.error }}>{backendReady ? 'ready' : 'offline'}</span>
                    </p>
                  ))}
                  {heartbeatLines.map((line, i) => (
                    <p className={heartbeatLineClass(line.raw)} key={`${line.raw}-${i}`}>{line.text}</p>
                  ))}
                </div>
              ) : (
                <>
                  {plainLines.map((line, i) => (
                    <p key={`${line}-${i}`}>{line}</p>
                  ))}
                  {plainLines.length === 0 && (
                    <p style={{ color: theme.textMute }}>aguardando dados...</p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
