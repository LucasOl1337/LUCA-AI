import { useEffect } from 'react';
import Layout, { type PageId } from '@/components/Layout';
import LandingPage from '@/pages/LandingPage';
import LucaAiPage from '@/pages/LucaAiPage';
import PersonasPage from '@/pages/PersonasPage';
import AdminPage from '@/pages/AdminPage';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useAuth } from '@/hooks/useAuth';
import { ChatLibraryProvider } from '@/hooks/useChatLibrary';

const ACTIVE_PAGES: readonly PageId[] = ['inicio', 'luca-ai', 'personas', 'admin'];

function isPageId(value: string): value is PageId {
  return ACTIVE_PAGES.includes(value as PageId);
}

export default function App() {
  const { user } = useAuth();
  const [storedPage, setStoredPage] = usePersistentState<string>('activePage', 'inicio');
  const activePage: PageId = isPageId(storedPage) ? storedPage : 'inicio';
  const authorizedPage: PageId = activePage === 'admin' && user?.role !== 'admin' ? 'inicio' : activePage;

  useEffect(() => {
    if (storedPage !== authorizedPage) setStoredPage(authorizedPage);
  }, [authorizedPage, setStoredPage, storedPage]);

  function navigate(page: PageId) {
    setStoredPage(page);
  }

  const renderPage = () => {
    switch (authorizedPage) {
      case 'inicio':      return <LandingPage onNavigate={navigate} />;
      case 'luca-ai':     return <LucaAiPage onNavigate={navigate} />;
      case 'personas':    return <PersonasPage />;
      case 'admin':       return <AdminPage />;
    }
  };

  return (
    <ChatLibraryProvider>
      <Layout activePage={authorizedPage} onPageChange={navigate}>
        {renderPage()}
      </Layout>
    </ChatLibraryProvider>
  );
}
