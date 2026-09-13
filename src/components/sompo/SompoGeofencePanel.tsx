// Painel de geofencing na coluna direita do simulador, só no cenário com talhão: leitura do instante (faixa, perigo,
// distância, lado) e margem até o limite de inclinação da máquina. Todo número vem do radar (shared/sompo-geofence) e do
// perfil do equipamento; aqui só se desenha. Sem "seguro"/"risco": faixas descrevem proximidade e margem.
import { useMemo } from 'react';
import { getSompoAgriScenario, SOMPO_AGRI_EQUIPMENT } from '../../../shared/sompo-agri-scenarios.js';
import { getSompoAgriPosition } from '../../../shared/sompo-agri-brief.js';
import { getSompoGeofenceSite } from '../../../shared/sompo-geofence-sites.js';
import type { SompoGeofenceResult } from '../../../shared/sompo-geofence.js';
import type { LabHazardRule } from '../../../shared/lab-geofence.js';

// Mesma leitura de cor do HUD (SompoTruckSimulator): faixa mais interna forte, intermediária média, externa fraca.
export function bandTone(bandId: string | null | undefined): 'forte' | 'media' | 'fraca' | 'livre' {
  if (!bandId) return 'livre';
  if (['critica', 'dentro', 'acima'].includes(bandId)) return 'forte';
  if (['elevada', 'borda', 'proximo'].includes(bandId)) return 'media';
  return 'fraca';
}
const degrees = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
const seconds = (ms: number) => `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
function sideLabel(bearingDeg: number | null) {
  if (bearingDeg === null) return '';
  const abs = Math.abs(bearingDeg);
  return abs <= 20 ? 'à frente' : abs >= 160 ? 'atrás' : bearingDeg > 0 ? 'à direita' : 'à esquerda';
}

interface Props {
  scenarioId: string;
  outcomeId: string;
  elapsedMs: number;
  geofence: SompoGeofenceResult;
  rollDeg: number | null;
}

export default function SompoGeofencePanel({ scenarioId, outcomeId, elapsedMs, geofence, rollDeg }: Props) {
  const scenario = getSompoAgriScenario(scenarioId);
  const limitDeg = SOMPO_AGRI_EQUIPMENT[scenario.equipmentId].profile.max_roll_deg;
  // Largura da faixa "próximo do limite" vem da regra do talhão (graus de margem), não de um número solto aqui.
  const nearDeg = useMemo(() => {
    const site = getSompoGeofenceSite(scenario.environmentId, Math.abs(2 * getSompoAgriPosition(scenarioId, 0, outcomeId).x));
    const rule = (site?.manifestRules.hazards as LabHazardRule[] | undefined)?.find(hazard => hazard.role === 'machine');
    return rule ? Math.max(...rule.bands_m.map(band => band.max_m)) : 0;
  }, [scenario.environmentId, scenarioId, outcomeId]);

  const near = geofence.nearest;
  const tone = bandTone(near?.bandId);
  const roll = Math.abs(rollDeg ?? 0);
  const marginDeg = Math.max(0, limitDeg - roll);
  const machineTone = bandTone(geofence.machine?.bandId);
  const distance = near && near.distanceM >= 0.5 ? `${near.distanceM.toFixed(0)} m ${sideLabel(near.bearingDeg)}`.trim() : null;
  const approach = near?.timeToHazardS != null ? `≈ ${Math.round(near.timeToHazardS)} s no rumo atual` : null;

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
    </div>
  );
}
