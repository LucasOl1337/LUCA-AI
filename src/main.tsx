import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { LucaStateProvider } from './hooks/useLucaState';
import { AuthProvider, useAuth } from './hooks/useAuth';
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
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
