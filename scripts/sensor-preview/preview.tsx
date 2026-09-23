import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SensorLabPage from '@/sensor-lab/SensorLabPage';

// Prévia isolada do /sensor: mesma página, sem login, sem Layout e sem API.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ height: '100vh' }}>
      <SensorLabPage />
    </div>
  </StrictMode>,
);
