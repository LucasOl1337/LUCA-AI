import { useEffect } from 'react';
import Layout, { type PageId } from '@/components/Layout';
import LandingPage from '@/pages/LandingPage';
import LucaAiPage from '@/pages/LucaAiPage';
import PersonasPage from '@/pages/PersonasPage';
import { usePersistentState } from '@/hooks/usePersistentState';

const ACTIVE_PAGES: readonly PageId[] = ['inicio', 'luca-ai', 'personas'];

function isPageId(value: string): value is PageId {
  return ACTIVE_PAGES.includes(value as PageId);
}

export default function App() {
  const [storedPage, setStoredPage] = usePersistentState<string>('activePage', 'inicio');
  const activePage: PageId = isPageId(storedPage) ? storedPage : 'inicio';

  useEffect(() => {
    if (storedPage !== activePage) setStoredPage(activePage);
  }, [activePage, setStoredPage, storedPage]);

  function navigate(page: PageId) {
    setStoredPage(page);
  }

  const renderPage = () => {
    switch (activePage) {
      case 'inicio':      return <LandingPage onNavigate={navigate} />;
      case 'luca-ai':     return <LucaAiPage onNavigate={navigate} />;
      case 'personas':    return <PersonasPage />;
    }
  };

  return (
    <Layout activePage={activePage} onPageChange={navigate}>
      {renderPage()}
    </Layout>
  );
}
