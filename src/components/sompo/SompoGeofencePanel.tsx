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
import type { GeofenceEpisode, LabHazardRule } from '../../../shared/lab-geofence.js';
import SompoGeofenceMap from './SompoGeofenceMap';

// Mesma leitura de cor do HUD (SompoTruckSimulator): faixa mais interna forte, intermediária média, externa fraca.
export function bandTone(bandId: string | null | undefined): 'forte' | 'media' | 'fraca' | 'livre' {
  if (!bandId) return 'livre';
  if (['critica', 'dentro', 'acima'].includes(bandId)) return 'forte';
  if (['elevada', 'borda', 'proximo'].includes(bandId)) return 'media';
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
}

// Régua: um segmento por episódio, faixas externas por baixo das internas (mesma regra da grade: vence a mais interna).
function Lane({ episodes, totalMs, elapsedMs, label, onSeek }: { episodes: GeofenceEpisode[]; totalMs: number; elapsedMs: number; label: string; onSeek: (ms: number) => void }) {
  const ordered = [...episodes].sort((a, b) => b.bandMaxM - a.bandMaxM);
  return (
    <div className="sompo-geofence-lane">
      <span>{label}</span>
      <div>
        {ordered.map(episode => {
          const end = episode.endMs ?? totalMs;
          return (
            <button
              key={episode.id}
              type="button"
              className={`sompo-geofence-tone-${bandTone(episode.bandId)}`}
              style={{ left: `${episode.startMs / totalMs * 100}%`, width: `${Math.max(0.4, (end - episode.startMs) / totalMs * 100)}%` }}
              title={`${episode.hazardLabel} · ${episode.bandLabel} · ${seconds(episode.startMs)}`}
              aria-label={`Ir para ${episode.hazardLabel}, ${episode.bandLabel}, ${seconds(episode.startMs)}`}
              onClick={() => onSeek(episode.startMs)}
            />
          );
        })}
        <u style={{ left: `${Math.min(100, elapsedMs / totalMs * 100)}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}

export default function SompoGeofencePanel({ scenarioId, outcomeId, elapsedMs, geofence, rollDeg, position, onSeek, onOpenMap }: Props) {
  const scenario = getSompoAgriScenario(scenarioId);
  const totalMs = scenario.totalMs;
  const limitDeg = SOMPO_AGRI_EQUIPMENT[scenario.equipmentId].profile.max_roll_deg;
  // Largura da faixa "próximo do limite" vem da regra do talhão (graus de margem), não de um número solto aqui.
  const nearDeg = useMemo(() => {
    const site = getSompoGeofenceSite(scenario.environmentId, Math.abs(2 * getSompoAgriPosition(scenarioId, 0, outcomeId).x));
    const rule = (site?.manifestRules.hazards as LabHazardRule[] | undefined)?.find(hazard => hazard.role === 'machine');
    return rule ? Math.max(...rule.bands_m.map(band => band.max_m)) : 0;
  }, [scenario.environmentId, scenarioId, outcomeId]);
  const episodes = useMemo(() => getSompoAgriGeofenceEpisodes(scenarioId, outcomeId), [scenarioId, outcomeId]);
  const mapEpisodes = episodes.filter(episode => !isMachine(episode));
  const machineEpisodes = episodes.filter(isMachine);

  const near = geofence.nearest;
  const tone = bandTone(near?.bandId);
  const roll = Math.abs(rollDeg ?? 0);
  const marginDeg = Math.max(0, limitDeg - roll);
  const machineTone = bandTone(geofence.machine?.bandId);
  const distance = near && near.distanceM >= 0.5 ? `${near.distanceM.toFixed(0)} m ${sideLabel(near.bearingDeg)}`.trim() : null;
  const approach = near?.timeToHazardS != null ? `≈ ${Math.round(near.timeToHazardS)} s no rumo atual` : null;
  const seekAt = (ms: number) => Math.min(ms, totalMs);

  return (
    <div className="sompo-geofence-panel" data-sompo-geofence-panel>
      <section className={`sompo-geofence-now sompo-geofence-tone-${tone}`} data-sompo-geofence-now aria-live="polite">
        <i className="sompo-geofence-stripe" aria-hidden="true" />
        <div>
          <span>Agora · {seconds(elapsedMs)}</span>
          <strong>{near ? near.bandLabel : geofence.insideAllowed === false ? 'Fora da área permitida' : 'Sem perigo no alcance'}</strong>
          <p>{near
            ? <>{near.hazardLabel}{distance && <> <em>·</em> {distance}</>}{approach && <> <em>·</em> {approach}</>}</>
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

      <h3 className="sompo-geofence-title">Exposição da corrida <small>0 a {Math.round(totalMs / 1000)} s · roteiro · clique salta no tempo</small></h3>
      <section className="sompo-geofence-strip" data-sompo-geofence-strip aria-label="Faixas de proximidade ao longo da corrida">
        <Lane label="Perigos do mapa" episodes={mapEpisodes} totalMs={totalMs} elapsedMs={elapsedMs} onSeek={onSeek} />
        <Lane label="Limite da máquina" episodes={machineEpisodes} totalMs={totalMs} elapsedMs={elapsedMs} onSeek={onSeek} />
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
        <thead><tr><th scope="col">Faixa · perigo</th><th scope="col">Entrou</th><th scope="col">Ficou</th><th scope="col">Mínimo</th></tr></thead>
        <tbody>
          {episodes.map(episode => {
            const end = episode.endMs ?? totalMs;
            const state = episode.startMs <= elapsedMs && (episode.endMs === null || elapsedMs < episode.endMs) ? 'open' : episode.startMs > elapsedMs ? 'next' : 'done';
            return (
              <tr key={episode.id} data-state={state} className={`sompo-geofence-tone-${bandTone(episode.bandId)}`}>
                <td><button type="button" onClick={() => onSeek(seekAt(episode.startMs))}><i aria-hidden="true" /><b>{episode.bandLabel}</b><small>{episode.hazardLabel}</small></button></td>
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
        <button type="button" onClick={onOpenMap} aria-label="Ampliar o mapa do talhão"><Maximize2 /> Ampliar</button>
        <p>As mesmas faixas pintadas no chão da cena. Máquina e trecho percorrido seguem o relógio.</p>
      </section>
      <p className="sompo-geofence-foot">Fazenda, distâncias e limite são sintéticos, de demonstração. As faixas descrevem proximidade e margem; nenhuma é rótulo de segurança.</p>
    </div>
  );
}
