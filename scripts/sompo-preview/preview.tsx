import React, { useState } from 'react';
import { normalizeSompoTelemetry } from '../../shared/sompo-telemetry.js';
import { createRoot } from 'react-dom/client';
import { lucaApi } from '../../src/lib/api';
import { createSompoSimulationSnapshot } from '../../shared/sompo-telemetry-simulator.js';
import SompoTruckSimulator from '../../src/components/SompoTruckSimulator';
import '../../src/sompo-page.css';
import './preview.css';

// Browser-only fixture: no Express, database, Firebase stream or authenticated app.
const fixture = (window as any).__sompoPreview;
Object.assign(lucaApi, {
  postSompoTelemetrySimulation: async (samples: unknown[], episodeId?: string) => {
    if (fixture.fail === 'samples') throw new Error('Fixture: samples offline');
    fixture.samples.push({ samples, episodeId });
    if (fixture.samples.length > 512) fixture.samples.shift(); return { ok: true, inserted: samples.length };
  },
  postSompoTelemetryEpisodeStart: async () => {
    if (fixture.fail === 'start') throw new Error('Fixture: start offline');
    return { ok: true, episode: { publicId: 'preview-episode', kind: 'roteiro' } };
  },
  postSompoTelemetryEpisodeFinish: async (_id: string, status: string) => {
    fixture.finished = status; return { ok: true, episode: { publicId: 'preview-episode', status } };
  },
  postSompoTelemetryEpisodeFrames: async (_id: string, frames: unknown[]) => {
    if (fixture.fail === 'frames') throw new Error('Fixture: frames offline');
    fixture.frames.push(...frames); return { ok: true };
  },
});
const physical = new URLSearchParams(location.search).get('source') === 'firebase';
const snapshot = createSompoSimulationSnapshot({ scenarioId: 'normal', pitch: 12, roll: 7 }, { elapsedMs: 0 });
snapshot.source.kind = 'firebase';
snapshot.source.provider = 'Fixture local, sem conexão física';
function Preview() {
  const [reading, setReading] = useState(snapshot);
  fixture.setPhysicalReading = (raw: Record<string, unknown>) => {
    const next = normalizeSompoTelemetry({ trator: '001', timestamp: Date.now(), distancia: 250, pitch: 0, roll: 0, aceleracaoX: 9.81, aceleracaoY: 0, aceleracaoZ: 0, rotacaoX: 0, rotacaoY: 0, rotacaoZ: 0, temperatura: 23, umidade: 55, riscoColisao: false, riscoInclinacao: false, ...raw });
    next.connection.state = 'live';
    next.freshness = 'fresh';
    next.source.provider = 'Fixture local, sem conexão física';
    setReading(next);
  };
  return <SompoTruckSimulator source={physical ? 'firebase' : 'simulation'} telemetry={physical ? reading : undefined} onTelemetry={(snapshot) => { fixture.snapshot = snapshot; }} />;
}
createRoot(document.getElementById('root')!).render(<Preview />);
