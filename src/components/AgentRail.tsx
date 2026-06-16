import { Loader2, Power } from 'lucide-react';
import { useState } from 'react';
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
  const { getAgentStatus, backendReady, runtimeMode, supervisorMode, startSupervisor, pauseSupervisor } = useLuca();
  const [supervisorAction, setSupervisorAction] = useState<'start' | 'pause' | null>(null);
  const running = supervisorMode === 'running';
  const online = backendReady || runtimeMode === 'cloud';
  const supervisorBusy = supervisorAction !== null;
  const supervisorLabel = supervisorAction === 'start'
    ? 'ligando'
    : supervisorAction === 'pause'
      ? 'pausando'
      : running
        ? 'ligado'
        : 'desligado';
  const supervisorTone = supervisorBusy ? theme.gold : running ? theme.alive : theme.textMute;

  async function toggleSupervisor() {
    if (supervisorBusy) return;
    const nextAction = running ? 'pause' : 'start';
    setSupervisorAction(nextAction);
    try {
      await (running ? pauseSupervisor() : startSupervisor());
    } finally {
      setSupervisorAction(null);
    }
  }

  return (
    <div className="void-panel rounded-2xl px-4 py-3 flex items-center gap-3 overflow-x-auto overflow-y-hidden shrink-0 min-h-[132px]">
      {/* botão liga/desliga do sistema (supervisor) */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={toggleSupervisor}
        title={supervisorBusy ? supervisorLabel : running ? 'desligar sistema' : 'ligar sistema'}
        disabled={supervisorBusy}
        aria-busy={supervisorBusy}
        className="shrink-0 flex flex-col items-center justify-center gap-1 w-[88px] h-[104px] rounded-2xl transition-all"
        style={{
          background: running || supervisorBusy ? 'rgba(67,209,138,0.08)' : theme.input,
          border: `1px solid ${running ? theme.alive : supervisorBusy ? theme.gold : theme.border}`,
        }}
      >
        {supervisorBusy ? (
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: supervisorTone }} />
        ) : (
          <Power className="w-7 h-7" style={{ color: supervisorTone }} />
        )}
        <span className="text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color: supervisorTone }}>
          {supervisorLabel}
        </span>
      </motion.button>

      <div className="w-px h-16 shrink-0" style={{ background: theme.border }} />

      {AGENT_DEFS.map((agent) => (
        <div className="shrink-0" key={agent.id}>
          <AgentCard
            agent={agent}
            status={getAgentStatus(agent.id)}
            active={activeAgent === agent.id}
            online={online}
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
