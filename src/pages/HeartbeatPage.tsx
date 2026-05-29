import { useEffect, useRef } from 'react';
import { Play, Pause, Trash2, Activity } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { heartbeatFresh, heartbeatLineClass, stateTone, visibleHeartbeatLines } from '@/lib/format';

export default function HeartbeatPage() {
  const theme = useTheme();
  const {
    heartbeatMonitor,
    heartbeatLogs,
    backendReady,
    getAgentStatus,
    startHeartbeat,
    pauseHeartbeat,
    clearAgents,
  } = useLuca();

  const lines = visibleHeartbeatLines(heartbeatLogs);
  const fresh = heartbeatFresh(heartbeatMonitor?.updatedAt);
  const monitorStatus = fresh ? (heartbeatMonitor?.status ?? 'online') : 'stale';
  const streamRef = useRef<HTMLDivElement>(null);

  const rows = [
    { label: 'Supervisor', state: getAgentStatus('supervisor') },
    { label: 'Planejador', state: getAgentStatus('planejador') },
    { label: 'Pesquisador', state: getAgentStatus('pesquisador') },
    { label: 'Designer', state: getAgentStatus('designer') },
  ];

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [lines.length]);

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-[1100px] mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: theme.aliveSoft, border: `1px solid ${theme.border}` }}>
              <Activity className="w-5 h-5" style={{ color: theme.alive }} />
            </div>
            <div>
              <h1 className="void-title text-3xl">Heartbeat</h1>
              <p className="text-sm" style={{ color: theme.textMute }}>o pulso vital do sistema</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-fleet flex items-center gap-2" onClick={startHeartbeat}><Play className="w-4 h-4" /> play</button>
            <button className="btn-fleet flex items-center gap-2" onClick={pauseHeartbeat}><Pause className="w-4 h-4" /> pause</button>
            <button className="btn-fleet flex items-center gap-2" onClick={clearAgents}><Trash2 className="w-4 h-4" /> limpar</button>
          </div>
        </header>

        {/* status cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="void-panel rounded-2xl p-5">
            <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.textMute }}>monitor</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full animate-pulse-void" style={{ background: stateTone(monitorStatus) }} />
              <strong className="text-lg font-display" style={{ color: theme.text }}>{monitorStatus}</strong>
            </div>
          </div>
          <div className="void-panel rounded-2xl p-5">
            <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.textMute }}>último tick</span>
            <strong className="block text-xs font-mono mt-2 truncate" style={{ color: theme.textSoft }}>
              {heartbeatMonitor?.updatedAt ?? 'n/a'}
            </strong>
          </div>
          <div className="void-panel rounded-2xl p-5">
            <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.textMute }}>backend</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full" style={{ background: backendReady ? theme.alive : theme.error }} />
              <strong className="text-lg font-display" style={{ color: theme.text }}>{backendReady ? 'online' : 'offline'}</strong>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* rows dos agentes */}
          <div className="col-span-12 md:col-span-4 void-panel rounded-2xl p-5">
            <strong className="text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.textSoft }}>agentes</strong>
            <div className="mt-3 space-y-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: theme.input }}>
                  <span className="text-xs" style={{ color: theme.textSoft }}>{row.label}</span>
                  <span className="text-xs font-mono" style={{ color: stateTone(row.state) }}>{row.state}</span>
                </div>
              ))}
            </div>
          </div>

          {/* log */}
          <div className="col-span-12 md:col-span-8">
            <div ref={streamRef} className="term p-4 h-[420px] overflow-y-auto">
              <p style={{ color: theme.textMute }}>$ heartbeat monitor {monitorStatus}</p>
              {lines.length === 0 ? (
                <p style={{ color: theme.textGhost }}>sem eventos recentes...</p>
              ) : (
                lines.map((line, i) => (
                  <p key={`${line.raw}-${i}`} className={heartbeatLineClass(line.raw)}>{line.text}</p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
