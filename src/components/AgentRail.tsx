import { Power } from 'lucide-react';
import { motion } from 'framer-motion';
import AgentCard from './AgentCard';
import { AGENT_DEFS } from '@/lib/agents';
import { useLuca } from '@/hooks/useLucaState';
import { useTheme } from '@/hooks/useTheme';
import type { PageId } from './Layout';

interface AgentRailProps {
  activeAgent: string | null;
  onOpenAgent: (id: string | null) => void;
  onNavigate: (page: PageId) => void;
}

export default function AgentRail({ activeAgent, onOpenAgent, onNavigate }: AgentRailProps) {
  const theme = useTheme();
  const { getAgentStatus, backendReady, supervisorMode, startSupervisor, pauseSupervisor } = useLuca();
  const running = supervisorMode === 'running';

  return (
    <div className="void-panel rounded-2xl px-4 py-3 flex items-center gap-3 overflow-x-auto">
      {/* botão liga/desliga do sistema (supervisor) */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={() => (running ? pauseSupervisor() : startSupervisor())}
        title={running ? 'desligar sistema' : 'ligar sistema'}
        className="shrink-0 flex flex-col items-center justify-center gap-1 w-[88px] h-[104px] rounded-2xl transition-all"
        style={{
          background: running ? 'rgba(67,209,138,0.08)' : theme.input,
          border: `1px solid ${running ? theme.alive : theme.border}`,
        }}
      >
        <Power className="w-7 h-7" style={{ color: running ? theme.alive : theme.textMute }} />
        <span className="text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color: running ? theme.alive : theme.textMute }}>
          {running ? 'ligado' : 'desligado'}
        </span>
      </motion.button>

      <div className="w-px h-16 shrink-0" style={{ background: theme.border }} />

      {AGENT_DEFS.map((agent) => (
        <div className="shrink-0" key={agent.id}>
          <AgentCard
            agent={agent}
            status={getAgentStatus(agent.id)}
            active={activeAgent === agent.id}
            online={backendReady}
            compact
            onClick={() => {
              if (agent.isDatabase) onNavigate('database');
              else onOpenAgent(activeAgent === agent.id ? null : agent.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
