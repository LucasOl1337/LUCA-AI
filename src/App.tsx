import { useEffect } from 'react';

import Layout, { type PageId } from '@/components/Layout';
import { usePersistentState } from '@/hooks/usePersistentState';
import LucaAiPage from '@/pages/LucaAiPage';
import PersonasPage from '@/pages/PersonasPage';

const validPages = new Set<PageId>(['luca-ai', 'personas']);

export default function App() {
  const [storedPage, setStoredPage] = usePersistentState<PageId>('activePage', 'luca-ai');
  const activePage = validPages.has(storedPage) ? storedPage : 'luca-ai';

  useEffect(() => {
    if (storedPage !== activePage) setStoredPage(activePage);
  }, [activePage, setStoredPage, storedPage]);

  return (
    <Layout activePage={activePage} onPageChange={setStoredPage}>
      {activePage === 'personas' ? <PersonasPage /> : <LucaAiPage />}
    </Layout>
  );
}
