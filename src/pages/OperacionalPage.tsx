import AgentRail from '@/components/AgentRail';
import SupervisorLog from '@/components/SupervisorLog';
import MissionCanvas from '@/components/MissionCanvas';
import GlobalChat from '@/components/GlobalChat';
import MissionBar from '@/components/MissionBar';
import type { PageId } from '@/components/Layout';

interface OperacionalPageProps {
  activeAgent: string | null;
  onOpenAgent: (id: string | null) => void;
  onNavigate: (page: PageId) => void;
}

/**
 * Operacional — o cockpit de trabalho (aba 2).
 *
 *  ┌────────────────────────────────────────────┐
 *  │  AgentRail (trilho de corujas)              │
 *  ├──────────┬───────────────────┬─────────────┤
 *  │ Super-   │   MissionCanvas   │  GlobalChat │
 *  │ visorLog │   (canvas)        │  (comms)    │
 *  ├──────────┴───────────────────┴─────────────┤
 *  │  MissionBar (caixa única + estados)         │
 *  └────────────────────────────────────────────┘
 */
export default function OperacionalPage({ activeAgent, onOpenAgent, onNavigate }: OperacionalPageProps) {
  return (
    <div className="h-full flex flex-col gap-3 p-4 min-h-0">
      <AgentRail activeAgent={activeAgent} onOpenAgent={onOpenAgent} onNavigate={onNavigate} />

      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
        <div className="col-span-3 min-h-0 hidden lg:block">
          <SupervisorLog />
        </div>
        <div className="col-span-12 lg:col-span-6 min-h-0">
          <MissionCanvas />
        </div>
        <div className="col-span-12 lg:col-span-3 min-h-0">
          <GlobalChat />
        </div>
      </div>

      <MissionBar />
    </div>
  );
}
