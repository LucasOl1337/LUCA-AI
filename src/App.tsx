import { useEffect } from 'react';
import Layout, { type PageId } from '@/components/Layout';
import LandingPage from '@/pages/LandingPage';
import LucaAiPage from '@/pages/LucaAiPage';
import PersonasPage from '@/pages/PersonasPage';
import ConfiguracaoPage from '@/pages/ConfiguracaoPage';
import SompoPage from '@/pages/SompoPage';
import AdminPage from '@/pages/AdminPage';
import { useAuth } from '@/hooks/useAuth';
import { useAppLocation } from '@/hooks/useAppLocation';
import { ChatLibraryProvider, useChatLibrary } from '@/hooks/useChatLibrary';
import { isAppPage } from '../shared/app-location.js';

export default function App() {
  const { user } = useAuth();
  const { location, navigate } = useAppLocation();
  const activePage: PageId = isAppPage(location.page) ? location.page : 'inicio';
  const authorizedPage: PageId = activePage === 'admin' && user?.role !== 'admin' ? 'inicio' : activePage;

  useEffect(() => {
    if (activePage === 'admin' && user?.role !== 'admin') {
      navigate({ page: 'inicio' }, 'replace');
    }
  }, [activePage, navigate, user?.role]);

  function goToPage(page: PageId) {
    navigate({ page }, 'push');
  }

  const renderPage = () => {
    switch (authorizedPage) {
      case 'inicio':      return <LandingPage onNavigate={goToPage} />;
      case 'luca-ai':     return <LucaAiPage onNavigate={goToPage} />;
      case 'personas':    return <PersonasPage />;
      case 'configuracao': return <ConfiguracaoPage />;
      case 'sompo':       return <SompoPage onNavigate={goToPage} />;
      case 'admin':       return <AdminPage />;
    }
  };

  return (
    <ChatLibraryProvider>
      <LucaSessionAddress />
      <Layout activePage={authorizedPage} onPageChange={goToPage}>
        {renderPage()}
      </Layout>
    </ChatLibraryProvider>
  );
}

function LucaSessionAddress() {
  const { location, navigate } = useAppLocation();
  const { ready, activeSessionId, activateSession } = useChatLibrary();

  useEffect(() => {
    if (!ready || location.page !== 'luca-ai') return;
    if (location.sessao && location.sessao !== activeSessionId) {
      void activateSession(location.sessao).then((session) => {
        if (!session) navigate({ sessao: activeSessionId || '' }, 'replace');
      });
    }
  }, [activateSession, activeSessionId, location.page, location.sessao, navigate, ready]);

  useEffect(() => {
    if (!ready || location.page !== 'luca-ai') return;
    if (!location.sessao && activeSessionId) {
      navigate({ sessao: activeSessionId }, 'replace');
    }
  }, [activeSessionId, location.page, location.sessao, navigate, ready]);

  return null;
}
