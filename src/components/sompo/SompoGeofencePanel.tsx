// Painel de geofencing na coluna direita do simulador, só no cenário com talhão: leitura do instante (faixa, perigo,
// distância, lado), margem até o limite de inclinação da máquina, régua de exposição da corrida, episódios de faixa e
// o mapa do talhão em miniatura. Todo número vem do radar (shared/sompo-geofence), do motor de episódios do laboratório
// (getSompoAgriGeofenceEpisodes) e do perfil do equipamento; aqui só se desenha. Sem "seguro"/"risco": faixas descrevem
// proximidade e margem.
import { useMemo } from 'react';
import { Maximize2 } from 'lucide-react';
import { getSompoAgriScenario, SOMPO_AGRI_EQUIPMENT } from '../../../shared/sompo-agri-scenarios.js';
import { getSompoAgriGeofenceEpisodes, getSompoAgriPosition } from '../../../shared/sompo-agri-brief.js';
import { getSompoGeofenceSite } from '../../../shared/sompo-geofence-sites.js';
import type { SompoGeofenceResult } from '../../../shared/sompo-geofence.js';
import { resolveHazards, type GeofenceEpisode, type LabGeofenceRules } from '../../../shared/lab-geofence.js';
import type { LabPolygon } from '../../../shared/lab-telemetry.js';
import SompoGeofenceMap from './SompoGeofenceMap';

// Mesma leitura de cor do HUD (SompoTruckSimulator): faixa mais interna forte, intermediária média, externa fraca.
// Perigo não alertável (declive: contexto territorial) nunca passa de médio; o forte ali vem do limite da máquina.
export function bandTone(bandId: string | null | undefined, alertable = true): 'forte' | 'media' | 'fraca' | 'livre' {
  if (!bandId) return 'livre';
  if (['critica', 'dentro', 'acima'].includes(bandId)) return alertable ? 'forte' : 'media';
  if (['elevada', 'borda', 'proximo'].includes(bandId)) return alertable ? 'media' : 'fraca';
  return 'fraca';
}
const decimal = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const degrees = (value: number) => `${decimal(value)}°`;
const seconds = (ms: number) => `${decimal(ms / 1000)} s`;
const isMachine = (episode: GeofenceEpisode) => episode.hazardKey.startsWith('machine:');
function sideLabel(bearingDeg: number | null) {
  if (bearingDeg === null) return '';
  const abs = Math.abs(bearingDeg);
  return abs <= 20 ? 'à frente' : abs >= 160 ? 'atrás' : bearingDeg > 0 ? 'à direita' : 'à esquerda';
}
// Mínimo do episódio: metros até o perigo do mapa, ou graus de margem até o limite da máquina.
function minimumLabel(episode: GeofenceEpisode) {
  if (!isMachine(episode)) return episode.bandMaxM === 0 ? 'dentro' : `${decimal(episode.minDistanceM)} m`;
  return episode.minDistanceM === 0 ? 'no limite' : `${degrees(episode.minDistanceM)} de margem`;
}

interface Props {
  scenarioId: string;
  outcomeId: string;
  elapsedMs: number;
  geofence: SompoGeofenceResult;
  rollDeg: number | null;
  position: { x: number; z: number; headingDeg: number } | null;
  onSeek: (ms: number) => void;
  onOpenMap: () => void;
  locked?: boolean; // gravação de episódio em curso: saltos e mapa desabilitados, como o slider do simulador
}

// Régua: uma pista por perigo, um segmento por episódio. Dentro de um perigo os episódios são sequenciais (a troca de
// faixa fecha um e abre outro), então nada se sobrepõe e todo segmento fica clicável.
function Lane({ episodes, totalMs, elapsedMs, label, onSeek, locked }: { episodes: GeofenceEpisode[]; totalMs: number; elapsedMs: number; label: string; onSeek: (ms: number) => void; locked: boolean }) {
  return (
    <div className="sompo-geofence-lane">
      <span>{label}</span>
      <div>
        {episodes.map(episode => {
          const end = episode.endMs ?? totalMs;
          return (
            <button
              key={episode.id}
              type="button"
              className={`sompo-geofence-tone-${bandTone(episode.bandId, episode.alertable)}`}
              style={{ left: `${episode.startMs / totalMs * 100}%`, width: `${Math.max(0.4, (end - episode.startMs) / totalMs * 100)}%` }}
              title={`${episode.hazardLabel} · ${episode.bandLabel} · ${seconds(episode.startMs)}`}
              aria-label={`Ir para ${episode.hazardLabel}, ${episode.bandLabel}, ${seconds(episode.startMs)}`}
              disabled={locked}
              onClick={() => onSeek(episode.startMs)}
            />
          );
        })}
        <u style={{ left: `${Math.min(100, elapsedMs / totalMs * 100)}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}

export default function SompoGeofencePanel({ scenarioId, outcomeId, elapsedMs, geofence, rollDeg, position, onSeek, onOpenMap, locked = false }: Props) {
  const scenario = getSompoAgriScenario(scenarioId);
  const totalMs = scenario.totalMs;
  const limitDeg = SOMPO_AGRI_EQUIPMENT[scenario.equipmentId].profile.max_roll_deg;
  // Faixas de cada perigo pelo mesmo resolveHazards do motor: a largura de "próximo do limite" (graus de margem) e o
  // nome da próxima faixa mais interna na tendência vêm da regra do talhão, não de números soltos aqui.
  const hazards = useMemo(() => {
    const site = getSompoGeofenceSite(scenario.environmentId, Math.abs(2 * getSompoAgriPosition(scenarioId, 0, outcomeId).x));
    return site ? resolveHazards(site.manifestRules as unknown as LabGeofenceRules, site.polygons as LabPolygon[], { profile: { max_roll_deg: limitDeg } }) : [];
  }, [scenario.environmentId, scenarioId, outcomeId, limitDeg]);
  const nearDeg = hazards.find(hazard => hazard.metric)?.reach ?? 0;
  const episodes = useMemo(() => getSompoAgriGeofenceEpisodes(scenarioId, outcomeId), [scenarioId, outcomeId]);
  // Pistas na ordem em que cada perigo aparece na corrida; o limite da máquina sempre por último.
  const lanes = useMemo(() => {
    const byHazard = new Map<string, GeofenceEpisode[]>();
    for (const episode of episodes) {
      const label = isMachine(episode) ? 'Limite da máquina' : episode.hazardLabel; // rótulo curto para a pista
      byHazard.set(label, [...(byHazard.get(label) ?? []), episode]);
    }
    return [...byHazard.entries()].sort(([, a], [, b]) => Number(isMachine(a[0])) - Number(isMachine(b[0])));
  }, [episodes]);

  // O perigo que acende a bandeira tem prioridade sobre o mais próximo (dentro do declive, contexto, com água crítica ao lado).
  const near = geofence.alert ?? geofence.nearest;
  const roll = Math.abs(rollDeg ?? 0);
  const marginDeg = Math.max(0, limitDeg - roll);
  const machineTone = bandTone(geofence.machine?.bandId);
  // O limite da máquina vira o estado principal quando não há perigo geométrico por perto ou quando pesa mais que ele
  // (dentro do declive, nivelada: médio; passando do limite: forte, e é o limite que manda).
  const RANK = { livre: 0, fraca: 1, media: 2, forte: 3 } as const;
  const nearTone = bandTone(near?.bandId, near?.alertable);
  const machineLeads = !!geofence.machine && (!near || RANK[machineTone] > RANK[nearTone]);
  const tone = machineLeads ? machineTone : nearTone;
  const distance = near && near.distanceM >= 0.5 ? `${near.distanceM.toFixed(0)} m ${sideLabel(near.bearingDeg)}`.trim() : null;
  // Tendência por distância (independe do rumo): selo textual, nunca muda o tom. Tempo "se nada mudar".
  const trend = near?.trend === 'aproximando'
    ? near.timeToNextBandS != null && near.timeToNextBandS >= 0.5 && near.nextBandLabel ? `≈ ${Math.round(near.timeToNextBandS)} s até ${near.nextBandLabel.toLowerCase()} se nada mudar`
      : near.timeToHazardEdgeS != null && near.timeToHazardEdgeS >= 0.5 ? `≈ ${Math.round(near.timeToHazardEdgeS)} s até a borda se nada mudar` : null
    : null;
  const seekAt = (ms: number) => Math.min(ms, totalMs);

  return (
    <div className="sompo-geofence-panel" data-sompo-geofence-panel>
      <section className={`sompo-geofence-now sompo-geofence-tone-${tone}`} data-sompo-geofence-now>
        <i className="sompo-geofence-stripe" aria-hidden="true" />
        <div>
          <span>Agora · {seconds(Math.min(elapsedMs, totalMs))}</span>
          <strong aria-live="polite">{machineLeads ? geofence.machine!.bandLabel : near ? near.bandLabel : geofence.insideAllowed === false ? 'Fora da área permitida' : 'Sem perigo no alcance'}</strong>
          <p>{machineLeads
            ? <>Limite de inclinação da máquina <em>·</em> {degrees(geofence.machine!.valueDeg)} de {geofence.machine!.limitDeg}°{near && <> <em>·</em> {near.bandLabel.toLowerCase()}, {near.hazardLabel}</>}</>
            : near
              ? <>{near.hazardLabel}{distance && <> <em>·</em> {distance}</>}{near.trend && near.trend !== 'estavel' && <> <em>·</em> <b data-trend={near.trend}>{near.trend}</b></>}{trend && <> <em>·</em> {trend}</>}</>
              : 'Nenhum perigo mapeado dentro das faixas declaradas.'}</p>
          <div className={`sompo-geofence-meter sompo-geofence-tone-${machineTone}`} data-sompo-geofence-meter>
            <div>
              <span>Inclinação <b>{degrees(roll)}</b></span>
              <span>{geofence.machine ? <b data-tone>{geofence.machine.bandLabel}</b> : <>margem <b>{degrees(marginDeg)}</b> até o limite</>}</span>
            </div>
            <div className="sompo-geofence-bar" role="meter" aria-label="Inclinação em relação ao limite da máquina" aria-valuemin={0} aria-valuemax={limitDeg} aria-valuenow={Math.min(roll, limitDeg)}>
              <i style={{ width: `${Math.min(100, roll / limitDeg * 100)}%` }} />
              {nearDeg > 0 && <u style={{ left: `${(limitDeg - nearDeg) / limitDeg * 100}%` }} />}
              <u data-limit style={{ left: '100%' }} />
            </div>
            <div className="sompo-geofence-scale"><span>0°</span>{nearDeg > 0 && <span>{limitDeg - nearDeg}° · próximo</span>}<span>{limitDeg}° · limite</span></div>
          </div>
        </div>
      </section>

      <h3 className="sompo-geofence-title">Exposição da corrida <small>0–{Math.round(totalMs / 1000)} s · clique numa faixa para ir ao instante</small></h3>
      <section className="sompo-geofence-strip" data-sompo-geofence-strip aria-label="Faixas de proximidade ao longo da corrida">
        {lanes.map(([label, laneEpisodes]) => <Lane key={label} label={label} episodes={laneEpisodes} totalMs={totalMs} elapsedMs={elapsedMs} onSeek={onSeek} locked={locked} />)}
        <div className="sompo-geofence-axis"><span /><div>{[0, 0.25, 0.5, 0.75, 1].map(fraction => <span key={fraction}>{Math.round(totalMs * fraction / 1000)}{fraction === 0 || fraction === 1 ? ' s' : ''}</span>)}</div></div>
        <ul className="sompo-geofence-legend" aria-label="Legenda das faixas">
          <li className="sompo-geofence-tone-livre"><i />Sem perigo no alcance</li>
          <li className="sompo-geofence-tone-fraca"><i />Atenção</li>
          <li className="sompo-geofence-tone-media"><i />Borda · elevada · próximo do limite</li>
          <li className="sompo-geofence-tone-forte"><i />Dentro · crítica · no limite ou acima</li>
        </ul>
      </section>

      <h3 className="sompo-geofence-title">Episódios <small>{episodes.length} na corrida</small></h3>
      <table className="sompo-geofence-episodes" data-sompo-geofence-episodes>
        <thead><tr><th scope="col">Faixa · perigo</th><th scope="col">Entrada</th><th scope="col">Duração</th><th scope="col">Mínimo</th></tr></thead>
        <tbody>
          {episodes.map(episode => {
            const end = episode.endMs ?? totalMs;
            const state = episode.startMs <= elapsedMs && (episode.endMs === null || elapsedMs < episode.endMs) ? 'open' : episode.startMs > elapsedMs ? 'next' : 'done';
            return (
              <tr key={episode.id} data-state={state} className={`sompo-geofence-tone-${bandTone(episode.bandId, episode.alertable)}`}>
                <td><button type="button" disabled={locked} onClick={() => onSeek(seekAt(episode.startMs))}><i aria-hidden="true" /><b>{episode.bandLabel}</b><small>{episode.hazardLabel}</small></button></td>
                <td>{seconds(episode.startMs)}</td>
                <td>{state === 'next' ? '—' : seconds(end - episode.startMs)}{episode.endMs === null && state !== 'next' ? <small>até o fim</small> : null}</td>
                <td>{state === 'next' ? '—' : minimumLabel(episode)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="sompo-geofence-title">Mapa do talhão <small>norte para cima</small></h3>
      <section className="sompo-geofence-minimap" data-sompo-geofence-minimap>
        <SompoGeofenceMap compact scenarioId={scenarioId} outcomeId={outcomeId} elapsedMs={elapsedMs} position={position} />
        <button type="button" disabled={locked} onClick={onOpenMap} aria-label="Ampliar o mapa do talhão"><Maximize2 /> Ampliar</button>
        <p>As mesmas faixas pintadas no chão da cena. Máquina e trecho percorrido seguem o relógio.</p>
      </section>
      <p className="sompo-geofence-foot">Dados sintéticos de demonstração. As faixas indicam proximidade e margem, não um rótulo de segurança.</p>
    </div>
  );
}
