import { useState } from 'react';
import Layout, { type PageId } from '@/components/Layout';
import LandingPage from '@/pages/LandingPage';
import OperacionalPage from '@/pages/OperacionalPage';
import AgentesPage from '@/pages/AgentesPage';
import DatabasePage from '@/pages/DatabasePage';
import HeartbeatPage from '@/pages/HeartbeatPage';
import HistoricoPage from '@/pages/HistoricoPage';
import EndpointsPage from '@/pages/EndpointsPage';
import ToolsPage from '@/pages/ToolsPage';
import AgentTerminal from '@/components/AgentTerminal';
import { usePersistentState } from '@/hooks/usePersistentState';

export default function App() {
  const [activePage, setActivePage] = usePersistentState<PageId>('activePage', 'inicio');
  // Terminal de agente aberto — compartilhado entre as páginas Operacional e Agentes.
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

  const renderPage = () => {
    switch (activePage) {
      case 'inicio':      return <LandingPage onNavigate={setActivePage} />;
      case 'operacional': return <OperacionalPage onOpenAgent={setActiveAgent} activeAgent={activeAgent} onNavigate={setActivePage} />;
      case 'agentes':     return <AgentesPage onOpenAgent={setActiveAgent} activeAgent={activeAgent} onNavigate={setActivePage} />;
      case 'database':    return <DatabasePage />;
      case 'ferramentas': return <ToolsPage />;
      case 'endpoints':   return <EndpointsPage />;
      case 'heartbeat':   return <HeartbeatPage />;
      case 'historico':   return <HistoricoPage />;
      default:            return <LandingPage onNavigate={setActivePage} />;
    }
  };

  return (
    <Layout activePage={activePage} onPageChange={setActivePage}>
      {renderPage()}
      <AgentTerminal activeAgent={activeAgent} onClose={() => setActiveAgent(null)} />
    </Layout>
  );
}
