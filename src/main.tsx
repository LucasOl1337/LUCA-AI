import React, { lazy, Suspense, useEffect } from 'react';
import { useDeferredFlag } from './hooks/useDeferredFlag';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { LucaStateProvider } from './hooks/useLucaState';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AppLocationProvider, useAppLocation } from './hooks/useAppLocation';
import AuthPage from './pages/AuthPage';
import PublicReadingPage from './pages/PublicReadingPage';
import EstadosProofPage from './pages/EstadosProofPage';
import './index.css';
import { useStandOffline } from './components/stand/useStandOffline';
import { criarRecarregarAposDeploy } from './lib/recarregarAposDeploy';

/** Chunk sumido depois de um deploy (A5): um reload só, sem loop. */
const BOOT_OK_MS = 10_000;
const recargaAposDeploy = criarRecarregarAposDeploy({
  storage: (() => { try { return window.sessionStorage; } catch { return null; } })(),
  recarregar: () => window.location.reload(),
});
window.addEventListener('vite:preloadError', (e) => recargaAposDeploy.aoFalharPreload(e));

/** /stand sem sessão: Coruja sem voz e Vitrine local no lugar do login (ADR 0001). */
const StandSemLogin = lazy(() => import('./components/stand/StandSemLogin'));

function publicReadingToken() {
  const match = window.location.pathname.match(/^\/leitura\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function AuthenticatedApp() {
  const { loading, user } = useAuth();
  const { location, navigate } = useAppLocation();
  const stand = location.kind === 'app' && location.page === 'stand';
  const offline = useStandOffline(stand);

  useEffect(() => {
    if (!user || location.kind !== 'auth') return;
    navigate({ kind: 'app', page: 'inicio' }, 'replace');
  }, [location.kind, navigate, user]);

  const showSplash = useDeferredFlag(loading);
  if (offline) return <Suspense fallback={<div className="auth-loading auth-loading-quiet" aria-busy="true" />}><StandSemLogin offline /></Suspense>;
  if (loading && !showSplash) return <div className="auth-loading auth-loading-quiet" aria-busy="true" aria-label="Inicializando" />;
  if (loading) return <div className="auth-loading"><img src="/icon-192.png" alt="LUCA" /><span>Inicializando ambiente seguro…</span></div>;
  if (!user && location.kind === 'app' && location.page === 'stand') {
    return <Suspense fallback={<div className="auth-loading auth-loading-quiet" aria-busy="true" />}><StandSemLogin /></Suspense>;
  }
  if (!user) return <AuthPage />;
  return <LucaStateProvider><App /></LucaStateProvider>;
}

const readingToken = publicReadingToken();
const estadosProof = import.meta.env.DEV && window.location.pathname === '/estados';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {estadosProof ? (
        <EstadosProofPage />
      ) : readingToken ? (
        <PublicReadingPage token={readingToken} />
      ) : (
        <AppLocationProvider>
          <AuthProvider>
            <AuthenticatedApp />
          </AuthProvider>
        </AppLocationProvider>
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
window.setTimeout(() => recargaAposDeploy.aoBootOk(), BOOT_OK_MS);
