import type { PhysicalTwin } from './usePhysicalTwin';
import './physical-twin.css';

export function PhysicalTwinOverlay({ twin }: { twin: PhysicalTwin }) {
  const e = twin.effects;
  return <>
    <div className="sompo-physical-vignette" data-severity={e.severity} data-motion={twin.motion} aria-hidden="true" />
    <div className="sompo-physical-hud" data-severity={e.severity} role="status">
      <small>{twin.replay ? 'REPLAY · 0,5× · LEITURAS GRAVADAS' : 'RESPOSTA AO DISPOSITIVO'}</small>
      <strong>{!e.live ? 'Sinal interrompido' : e.labels[0] ?? (e.proximity > 0 ? 'Aproximação detectada' : twin.replay ? 'Faixa normal no evento' : 'Aguardando interação')}</strong>
      <span>{!e.live ? 'Efeitos pausados até chegar uma leitura atual.' : e.distance === null ? 'Ultrassom sem eco válido' : `${e.distance.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} cm à frente`}</span>
      {e.labels.length > 1 && <span>{e.labels.slice(1).join(' · ')}</span>}
      {twin.cargoView && <span>Carga ilustrativa · {e.cargo ? 'ambiente fora da faixa' : 'acompanha temperatura e umidade'}</span>}
    </div>
  </>;
}

export default function PhysicalTwinPanel({ twin }: { twin: PhysicalTwin }) {
  return <section className="sompo-physical-panel" aria-label="Interações físicas e replay">
    <div className="sompo-physical-actions">
      <button type="button" aria-pressed={twin.cargoView} onClick={() => twin.setCargoView(!twin.cargoView)}>{twin.cargoView ? 'Fechar visão da carga' : 'Ver carga em 3D'}</button>
      <button type="button" aria-pressed={twin.motion} onClick={() => twin.setMotion(!twin.motion)}>{twin.motion ? 'Efeitos suaves: desligados' : 'Efeitos suaves: ligados'}</button>
    </div>
    <details><summary>Faixa ambiental da demonstração</summary>
      <p>O sensor mede o ambiente do dispositivo. Cor e movimento das caixas são uma representação ilustrativa.</p>
      <label>Temperatura máxima (°C)<input type="number" min="0" max="60" value={twin.limits.temperature} onChange={e => { if (e.target.value !== '' && e.target.validity.valid) twin.setLimits({ ...twin.limits, temperature: Number(e.target.value) }); }} /></label>
      <label>Umidade máxima (%)<input type="number" min="1" max="100" value={twin.limits.humidity} onChange={e => { if (e.target.value !== '' && e.target.validity.valid) twin.setLimits({ ...twin.limits, humidity: Number(e.target.value) }); }} /></label>
    </details>
    <div className="sompo-physical-event-head"><strong>Replay das interações</strong><span role="status">{twin.recording ? 'Capturando o desfecho…' : 'Últimos 5 eventos nesta sessão'}</span></div>
    {twin.replay && <div className="sompo-physical-replay" aria-label="Reprodução do evento">
      <strong>{twin.replay.label}</strong>
      <progress max={Math.max(1, twin.duration)} value={twin.offset} aria-label="Progresso do replay" />
      <span>{(twin.offset / 1000).toFixed(1)} / {(twin.duration / 1000).toFixed(1)} s · câmera lenta</span>
      <div className="sompo-physical-actions"><button type="button" onClick={twin.toggleReplay}>{twin.playing ? 'Pausar replay' : twin.offset >= twin.duration ? 'Repetir replay' : 'Continuar replay'}</button><button type="button" onClick={twin.exitReplay}>Voltar ao vivo</button></div>
    </div>}
    {!twin.events.length && <p>Aproxime a mão, incline ou movimente o dispositivo. O evento guarda até 8 s anteriores e 4 s posteriores recebidos nesta tela.</p>}
    <ol className="sompo-physical-events">{twin.events.map(event => <li key={event.id}><button type="button" onClick={() => twin.startReplay(event)} aria-pressed={twin.replay?.id === event.id}><time>{new Date(event.at).toLocaleTimeString('pt-BR')}</time><span>{event.label}</span><b>Rever →</b></button></li>)}</ol>
    {twin.replay && <ol className="sompo-physical-timeline" aria-label="Momentos do evento">{twin.replay.frames.filter((frame, i, frames) => frame.effects.labels.join() !== frames[i - 1]?.effects.labels.join()).map(frame => <li key={frame.at}><time>+{((frame.at - twin.replay!.frames[0].at) / 1000).toFixed(1)} s</time> {frame.effects.labels.join(' · ') || 'Retorno à faixa de demonstração'}</li>)}</ol>}
  </section>;
}
