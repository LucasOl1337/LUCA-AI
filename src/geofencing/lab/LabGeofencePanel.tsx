// Episódios de faixa: tabela no painel do caso e faixa de exposição sobre a linha do tempo.
import { useMemo } from 'react';
import type { GeofenceEpisode } from '../../../shared/geofencing/index.js';
import { formatLabTime, type LabCase } from '../../../shared/lab-telemetry.js';
import { episodeColor } from './labBands';
import '../geofencing.css';

const QUALITY: Record<GeofenceEpisode['quality'], string> = { 'observado': 'Observado', 'com-lacuna': 'Com lacuna', 'aberto-no-fim': 'Aberto no fim' };
// A cor vem de resolveHazards; memoizada porque estes componentes redesenham a cada quadro do replay.
const useEpisodes = (labCase: LabCase) => useMemo(() => [...(labCase.geofence?.episodes ?? [])].sort((a, b) => a.startMs - b.startMs).map(episode => ({ episode, color: episodeColor(labCase, episode) })), [labCase]);
const decimal = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function LabGeofencePanel({ labCase, selectedEventId, onSeek }: { labCase: LabCase; selectedEventId: string | null; onSeek: (ms: number, eventId: string) => void }) {
  const episodes = useEpisodes(labCase);
  if (!episodes.length) return <div className="lab-band-episodes"><p>Nenhuma entrada em faixa registrada.</p></div>;
  return <div className="lab-band-episodes">{episodes.map(({ episode, color }) => <button key={episode.id} data-lab-episode={episode.id} className={selectedEventId?.startsWith(episode.id) ? 'selected' : ''} onClick={() => onSeek(episode.startMs, `${episode.id}:start`)}><i style={{ background: color }} /><span><strong>{episode.hazardLabel} · {episode.bandLabel}</strong><small>{formatLabTime(episode.startMs)} · observado {formatLabTime(episode.observedMs)} · lacuna {formatLabTime(episode.gapMs)} · {episode.hazardKey.startsWith('machine:') ? `margem mín. ${decimal(episode.minDistanceM)}°` : `mín. ${decimal(episode.minDistanceM)} m`} · {QUALITY[episode.quality]}</small></span></button>)}</div>;
}

export function LabExposureStrip({ labCase, onSeek }: { labCase: LabCase; onSeek: (ms: number, eventId: string) => void }) {
  const duration = labCase.durationMs || 1;
  const episodes = useEpisodes(labCase);
  return <div className="lab-exposure-strip" aria-label="Faixas de proximidade na linha do tempo">{episodes.map(({ episode, color }) => {
    const label = `${episode.hazardLabel} · ${episode.bandLabel} · ${formatLabTime(episode.startMs)}`;
    return <button key={episode.id} data-lab-episode={episode.id} style={{ left: `${episode.startMs / duration * 100}%`, width: `${Math.max(0.5, ((episode.endMs ?? labCase.durationMs) - episode.startMs) / duration * 100)}%`, background: color }} title={label} aria-label={`Ir para ${label}`} onClick={() => onSeek(episode.startMs, `${episode.id}:start`)} />;
  })}</div>;
}
