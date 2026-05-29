import AgentCard from '@/components/AgentCard';
import { ALL_AGENT_DEFS } from '@/lib/agents';
import { useLuca } from '@/hooks/useLucaState';
import { useTheme } from '@/hooks/useTheme';
import type { PageId } from '@/components/Layout';

interface AgentesPageProps {
  activeAgent: string | null;
  onOpenAgent: (id: string | null) => void;
  onNavigate: (page: PageId) => void;
}

export default function AgentesPage({ activeAgent, onOpenAgent, onNavigate }: AgentesPageProps) {
  const theme = useTheme();
  const { getAgentStatus, backendReady } = useLuca();

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-[1200px] mx-auto">
        <header className="mb-8">
          <h1 className="void-title text-3xl">Esquadrão</h1>
          <p className="text-sm mt-2" style={{ color: theme.textMute }}>
            Cada coruja é um agente. Clique para abrir o terminal e acompanhar logs em tempo real.
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {ALL_AGENT_DEFS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              status={getAgentStatus(agent.id)}
              active={activeAgent === agent.id}
              online={backendReady}
              onClick={() => {
                // O database tem página dedicada; os demais abrem terminal.
                if (agent.isDatabase) onNavigate('database');
                else onOpenAgent(activeAgent === agent.id ? null : agent.id);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
