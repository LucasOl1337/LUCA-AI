// Radar de geofencing: avalia UMA posição contra os perigos do talhão, como o aviso de radar de um GPS de carro.
// Puro, em metros de cena ({x, z}, x para leste/frente, z para sul), sem lat/lon, sem Three.js. Roda no browser e no Node.
// Reaproveita o motor do laboratório: as faixas e os polígonos são o mesmo contrato (manifest.rules.hazards + papéis do GeoJSON).
import { resolveHazards, classifyBand } from './lab-geofence.js';
import { polygonContains } from './lab-telemetry.js';

// Ponto mais próximo do polígono (borda ou interior). Necessário para direção e tempo até o perigo, que polygonDistance não dá.
export function closestPointOnPolygon(point, polygon) {
  if (polygonContains(point, polygon)) return { x: point.x, z: point.z, distance: 0 };
  let best = { x: NaN, z: NaN, distance: Infinity };
  for (const ring of polygon.rings) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length)) : 0;
    const x = a.x + t * dx, z = a.z + t * dz;
    const distance = Math.hypot(point.x - x, point.z - z);
    if (distance < best.distance) best = { x, z, distance };
  }
  return best;
}

// headingDeg segue a convenção do laboratório: 0 = norte (-z), 90 = leste (+x), como heading_deg do CSV.
export function forwardVector(headingDeg) {
  const yaw = (90 - headingDeg) * Math.PI / 180;
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

// Direção relativa ao rumo, em graus: 0 = à frente, +90 = à direita, -90 = à esquerda, ±180 = atrás.
function relativeBearing(forward, dx, dz) {
  const ahead = forward.x * dx + forward.z * dz;
  const right = -forward.z * dx + forward.x * dz; // rotação de 90° do vetor frente, no plano x/z com z para o sul
  return Math.atan2(right, ahead) * 180 / Math.PI;
}

// Resultado por perigo dentro do alcance da faixa mais externa; nearest = o de menor distância.
// timeToHazardS: distância / velocidade de aproximação, só com o perigo à frente (|rumo relativo| ≤ 20°); null parada, de lado, afastando.
// De lado a máquina passa ao largo do ponto mais próximo: um tempo ali sugere um evento que não acontece.
// machine = { profile: { max_roll_deg } }: dá o limite aos perigos de role 'machine'; rollDeg/pitchDeg são o sinal medido.
// A margem em graus não se mistura com metros: fica em result.machine, fora de nearest/all.
export function evaluateGeofence({ x, z, headingDeg = null, speedKph = 0, rollDeg = null, pitchDeg = null, previous = null, elapsedMs = null }, rules, polygons, machine = null) {
  const hazards = resolveHazards(rules, polygons, machine);
  const signals = { roll_deg: rollDeg, pitch_deg: pitchDeg };
  let machineHit = null;
  const allowed = polygons.filter(polygon => polygon.role === 'allowed_area');
  const insideAllowed = allowed.length ? allowed.some(polygon => polygonContains({ x, z }, polygon)) : null;
  const forward = headingDeg === null ? null : forwardVector(headingDeg);
  const speedMs = Math.max(0, speedKph) / 3.6;
  const dt = Number.isFinite(elapsedMs) && Number.isFinite(previous?.elapsedMs) ? elapsedMs - previous.elapsedMs : null;
  const validPrevious = dt !== null && dt >= 125 && dt <= 500 && Number.isFinite(previous.x) && Number.isFinite(previous.z);
  const all = [];
  for (const hazard of hazards) {
    if (hazard.metric) {
      const value = signals[hazard.metric];
      if (!Number.isFinite(value)) continue; // sem sinal de inclinação não há faixa: amostra sem o sinal não abre nem fecha episódio
      const marginDeg = Math.max(0, hazard.limit - Math.abs(value));
      const band = classifyBand(marginDeg, hazard.bands);
      if (band && (!machineHit || marginDeg < machineHit.marginDeg)) machineHit = { hazardKey: hazard.key, hazardLabel: hazard.label, bandId: band.id, bandLabel: band.label ?? band.id, bandMaxDeg: band.max_m, metric: hazard.metric, valueDeg: Math.abs(value), limitDeg: hazard.limit, marginDeg };
      continue;
    }
    const nearest = closestPointOnPolygon({ x, z }, hazard.polygon);
    const band = classifyBand(nearest.distance, hazard.bands);
    if (!band) continue;
    const dx = nearest.x - x, dz = nearest.z - z;
    const bearingDeg = forward && nearest.distance > 0 ? relativeBearing(forward, dx, dz) : null;
    const closingMs = bearingDeg === null ? 0 : speedMs * Math.cos(bearingDeg * Math.PI / 180);
    const previousDistance = validPrevious ? closestPointOnPolygon(previous, hazard.polygon).distance : null;
    const closingSpeedMs = previousDistance === null ? null : (previousDistance - nearest.distance) / (dt / 1000);
    // Dentro do polígono (distância 0) não há para onde aproximar: tendência só fora dele.
    const trend = closingSpeedMs === null || nearest.distance === 0 ? null : closingSpeedMs >= 0.10 ? 'aproximando' : closingSpeedMs <= -0.10 ? 'afastando' : 'estavel';
    const bandIndex = hazard.bands.indexOf(band);
    const nextBand = bandIndex > 0 ? hazard.bands[bandIndex - 1] : null;
    all.push({
      hazardKey: hazard.key, hazardLabel: hazard.label, bandId: band.id, bandLabel: band.label ?? band.id, bandMaxM: band.max_m,
      innermost: band === hazard.bands[0], alertable: hazard.alertable,
      distanceM: nearest.distance, bearingDeg, closestPoint: { x: nearest.x, z: nearest.z },
      timeToHazardS: nearest.distance > 0 && closingMs > 0.05 && Math.abs(bearingDeg) <= 20 ? nearest.distance / closingMs : null,
      closingSpeedMs, trend, nextBandLabel: nextBand?.label ?? nextBand?.id ?? null,
      timeToNextBandS: nextBand && trend === 'aproximando' ? Math.max(0, nearest.distance - nextBand.max_m) / closingSpeedMs : null,
      timeToHazardEdgeS: trend === 'aproximando' ? nearest.distance / closingSpeedMs : null,
    });
  }
  all.sort((a, b) => a.distanceM - b.distanceM);
  // alert: o perigo alertável na faixa mais interna, se houver. Pode não ser o mais próximo (dentro do declive, contexto,
  // com água crítica a 3 m): é ele que acende a bandeira e que o texto descreve.
  const alert = all.find(hit => hit.alertable && hit.innermost) ?? null;
  return { insideAllowed, nearest: all[0] ?? null, alert, all, machine: machineHit, warnings: hazards.warnings };
}

// Texto curto para HUD e telemetria, sem "seguro"/"risco": só proximidade, direção e tempo.
export function describeGeofence(result) {
  const near = result?.alert ?? result?.nearest;
  const outside = result?.insideAllowed === false ? 'Fora da área permitida' : '';
  if (!near) return outside || 'Sem perigo mapeado no alcance';
  const side = near.bearingDeg === null ? '' : Math.abs(near.bearingDeg) <= 20 ? ' à frente' : Math.abs(near.bearingDeg) >= 160 ? ' atrás' : near.bearingDeg > 0 ? ' à direita' : ' à esquerda';
  // Menos de meio segundo arredondaria para "≈ 0 s": nas transições de faixa fica só "aproximando".
  const trendTime = near.trend === 'aproximando'
    ? near.timeToNextBandS !== null && near.timeToNextBandS >= 0.5
      ? ` · aproximando · ≈ ${Math.round(near.timeToNextBandS)} s até a faixa ${(near.nextBandLabel ?? '').toLowerCase()}`
      : near.timeToHazardEdgeS !== null && near.timeToHazardEdgeS >= 0.5 ? ` · aproximando · ≈ ${Math.round(near.timeToHazardEdgeS)} s até a borda` : ' · aproximando'
    : near.trend === 'afastando' ? ' · afastando' : '';
  const time = trendTime || (near.timeToHazardS === null ? '' : ` · ≈ ${Math.round(near.timeToHazardS)} s de aproximação`);
  // Dentro do polígono a distância é 0 por definição: dizer "a 0 m" parece distância até uma queda.
  const where = near.distanceM >= 0.5 ? ` a ${near.distanceM.toFixed(0)} m${side}${time}` : ''; // < 0,5 m arredondaria para "a 0 m"
  return `${outside ? `${outside} · ` : ''}${near.bandLabel} · ${near.hazardLabel}${where}`;
}


// Texto do limite da máquina para o HUD: faixa, inclinação medida e limite declarado. Sem "seguro"/"risco".
export function describeMachineLimit(hit) {
  if (!hit) return '';
  return `${hit.bandLabel} · inclinação ${hit.valueDeg.toFixed(0)}° · limite ${hit.limitDeg}°`;
}
