import { motion } from 'framer-motion';
import type { AgentDef } from '@/lib/agents';
import { useTheme } from '@/hooks/useTheme';
import { friendlyStatus, stateTone } from '@/lib/format';

interface AgentCardProps {
  agent: AgentDef;
  status: string;
  active: boolean;
  online: boolean;
  onClick: () => void;
  /** modo compacto para o trilho horizontal */
  compact?: boolean;
}

export default function AgentCard({ agent, status, active, online, onClick, compact }: AgentCardProps) {
  const theme = useTheme();
  const tone = stateTone(status);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      aria-label={agent.title}
      className={`agent-card rounded-2xl flex flex-col items-center text-center ${active ? 'active' : ''} ${
        compact ? 'p-3 w-[116px]' : 'p-5'
      }`}
    >
      {/* avatar */}
      <div className={`relative ${compact ? 'w-14 h-14' : 'w-20 h-20'} mb-2`}>
        {agent.isHeartbeat ? (
          <video
            className="w-full h-full object-contain rounded-xl"
            src={agent.icon}
            autoPlay
            loop
            muted
            playsInline
          />
        ) : agent.owl ? (
          <img src={agent.owl} alt={agent.title} className="w-full h-full object-contain" />
        ) : agent.icon ? (
          <img src={agent.icon} alt={agent.title} className="w-full h-full object-contain rounded-xl" />
        ) : (
          <div className="w-full h-full rounded-xl flex items-center justify-center text-xs" style={{ background: theme.input, color: theme.textMute }}>
            {agent.title}
          </div>
        )}
        {/* dot de status no canto */}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
          style={{ background: agent.isHeartbeat ? (online ? theme.alive : theme.error) : tone, borderColor: theme.void2 }}
        />
      </div>

      <span
        className={`font-display font-semibold tracking-wide leading-tight luca-wrap ${compact ? 'min-h-[2.2em] text-[11px]' : 'text-sm'}`}
        style={{ color: active ? theme.gold : theme.text }}
      >
        {agent.title}
      </span>
      {!compact && (
        <span className="text-[10px] mt-0.5 tracking-wider uppercase" style={{ color: theme.textMute }}>
          {friendlyStatus(status)}
        </span>
      )}
    </motion.button>
  );
}
