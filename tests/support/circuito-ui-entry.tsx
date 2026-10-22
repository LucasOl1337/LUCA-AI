import React from 'react';
import { createRoot } from 'react-dom/client';
import SimuladorKiosk from '../../src/components/stand/SimuladorKiosk';
import StandPage from '../../src/pages/StandPage';
import { AppLocationProvider } from '../../src/hooks/useAppLocation';
import { AuthProvider } from '../../src/hooks/useAuth';
import '../../src/experience-pages.css';
import '../../src/stand.css';
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('full')
  ? <AppLocationProvider><AuthProvider><StandPage /></AuthProvider></AppLocationProvider>
  : <main style={{position:'fixed',inset:0}}><SimuladorKiosk /></main>);
