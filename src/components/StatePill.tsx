import { useTheme } from '@/hooks/useTheme';

interface StatePillProps {
  label: string;
  on: boolean;
  /** cor quando ligado; default = verde alive */
  color?: string;
}

/** Pílula de estado no rodapé do cockpit (ONLINE / DB / IDLE) — dirigida por estado real. */
export default function StatePill({ label, on, color }: StatePillProps) {
  const theme = useTheme();
  const dot = on ? (color ?? theme.alive) : theme.textGhost;
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-[0.18em] uppercase"
      style={{
        background: on ? 'rgba(201,162,39,0.04)' : 'transparent',
        border: `1px solid ${on ? theme.border : 'transparent'}`,
        color: on ? theme.textSoft : theme.textMute,
      }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${on ? 'animate-pulse-void' : ''}`}
        style={{ background: dot }}
      />
      {label}
    </div>
  );
}
