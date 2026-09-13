// Legenda das faixas de proximidade: cor, alcance, justificativa do manifesto e área atingida por faixa.
import { useMemo } from 'react';
import type { LabCase } from '../../../shared/lab-telemetry.js';
import { bandColor, hazardsOf } from './labBands';

const decimal = (value: number, digits = 1) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function LabBandLegend({ labCase }: { labCase: LabCase }) {
  const hazards = useMemo(() => hazardsOf(labCase), [labCase]);
  if (!hazards.length) return null;
  const areas = labCase.geofence?.affectedArea ?? [];
  return <div className="lab-band-legend" aria-label="Faixas de proximidade">
    {hazards.map(hazard => <div key={hazard.key} className="lab-band-hazard">
      <strong>{hazard.label}</strong>
      {hazard.bands.map((band, index) => {
        const area = areas.find(item => item.hazardKey === hazard.key && item.bandId === band.id);
        const reach = hazard.unit === 'deg' ? (band.max_m > 0 ? `até ${band.max_m}° do limite` : 'no limite ou acima') : band.max_m > 0 ? `até ${band.max_m} m` : 'dentro do polígono';
        return <div key={band.id} className="lab-band-row"><i style={{ background: bandColor(hazard, index) }} /><span>{band.label || band.id} · {reach}</span>{area && <em>{area.areaM2.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m² · {decimal(area.shareOfAllowed * 100)}%</em>}</div>;
      })}
      {hazard.metric && <small>Limite declarado no perfil da máquina: {hazard.limit}°. Zonas do terreno acima desse limite aparecem no mapa quando há relevo.</small>}
      {hazard.justification && <small>{hazard.justification}</small>}
    </div>)}
    <small className="lab-band-method">Estimativa por {(areas[0]?.method ?? 'grade 2 m').replace('grade ', 'grade de ')}; o restante da área não foi avaliado como seguro.</small>
  </div>;
}
