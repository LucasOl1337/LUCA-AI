import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { heartbeatLineClass, visibleHeartbeatLines } from '@/lib/format';
import CopyLogButton from './CopyLogButton';

export default function SupervisorLog() {
  const theme = useTheme();
  const { getAgentLines, supervisorMode, heartbeatLogs } = useLuca();
  const streamRef = useRef<HTMLDivElement>(null);

  const supervisorLines = getAgentLines('supervisor');
  const heartbeatLines = visibleHeartbeatLines(heartbeatLogs);
  const rows = [
    ...supervisorLines.map((text) => ({ text, cls: '' })),
    ...heartbeatLines.map((l) => ({ text: l.text, cls: heartbeatLineClass(l.raw) })),
  ].slice(-200);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [supervisorLines.length, heartbeatLines.length]);

  const logText = rows.map((r) => r.text).join('\n');

  return (
    <div className="void-panel rounded-2xl flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-2 px-4 h-12 border-b shrink-0" style={{ borderColor: theme.border }}>
        <Terminal className="w-4 h-4" style={{ color: theme.gold, opacity: 0.8 }} />
        <h3 className="text-[11px] font-semibold tracking-[0.2em] uppercase flex-1" style={{ color: theme.textSoft }}>
          Supervisor
        </h3>
        <span className="text-[9px] font-semibold tracking-wider uppercase" style={{ color: theme.textMute }}>
          {supervisorMode}
        </span>
        <CopyLogButton text={logText} label="copiar log do supervisor" />
      </header>

      <div ref={streamRef} className="term flex-1 overflow-y-auto p-3 m-2 rounded-xl border-0">
        <p style={{ color: theme.textMute }}>logs do agente</p>
        {rows.length === 0 ? (
          <p style={{ color: theme.textGhost }}>aguardando atividade...</p>
        ) : (
          rows.map((row, i) => (
            <p key={`${row.text}-${i}`} className={row.cls}>
              {row.text}
            </p>
          ))
        )}
        <p style={{ color: theme.gold }}>$ _</p>
      </div>
    </div>
  );
}
