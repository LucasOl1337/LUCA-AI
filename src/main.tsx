import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { LucaStateProvider } from './hooks/useLucaState';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AppLocationProvider, useAppLocation } from './hooks/useAppLocation';
import AuthPage from './pages/AuthPage';
import PublicReadingPage from './pages/PublicReadingPage';
import './index.css';

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

  useEffect(() => {
    if (!user || location.kind !== 'auth') return;
    navigate({ kind: 'app', page: 'inicio' }, 'replace');
  }, [location.kind, navigate, user]);

  if (loading) return <div className="auth-loading"><img src="/icon-192.png" alt="LUCA" /><span>Inicializando ambiente seguro…</span></div>;
  if (!user) return <AuthPage />;
  return <LucaStateProvider><App /></LucaStateProvider>;
}

const readingToken = publicReadingToken();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {readingToken ? (
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
