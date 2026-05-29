import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { LucaStateProvider } from './hooks/useLucaState';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LucaStateProvider>
        <App />
      </LucaStateProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
