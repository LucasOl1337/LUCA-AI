import { AnimatePresence, motion } from 'framer-motion';
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
        >
          <motion.div
            className="void-panel rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
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
                onClick={onClose}
                className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
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
                    <button className="btn-fleet !py-1.5 !px-3 !text-xs" onClick={startHeartbeat}>play</button>
                    <button className="btn-fleet !py-1.5 !px-3 !text-xs" onClick={pauseHeartbeat}>pause</button>
                    <button className="btn-fleet !py-1.5 !px-3 !text-xs" onClick={clearAgents}>limpar</button>
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
