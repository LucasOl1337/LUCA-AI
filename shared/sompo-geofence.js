// Radar de geofencing: avalia UMA posição contra os perigos do talhão, como o aviso de radar de um GPS de carro.
// Puro, em metros de cena ({x, z}, x para leste/frente, z para sul), sem lat/lon, sem Three.js. Roda no browser e no Node.
// Reaproveita o motor do laboratório: as faixas e os polígonos são o mesmo contrato (manifest.rules.hazards + papéis do GeoJSON).
import { resolveHazards, classifyBand, bandGrid } from './lab-geofence.js';
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
// timeToHazardS: distância / velocidade de aproximação; null quando a máquina não se aproxima (parada, paralela ou afastando).
export function evaluateGeofence({ x, z, headingDeg = null, speedKph = 0 }, rules, polygons) {
  const hazards = resolveHazards(rules, polygons);
  const allowed = polygons.filter(polygon => polygon.role === 'allowed_area');
  const insideAllowed = allowed.length ? allowed.some(polygon => polygonContains({ x, z }, polygon)) : null;
  const forward = headingDeg === null ? null : forwardVector(headingDeg);
  const speedMs = Math.max(0, speedKph) / 3.6;
  const all = [];
  for (const hazard of hazards) {
    if (!hazard.polygon) continue; // Perigo de máquina (inclinação) não tem geometria; o radar é espacial.
    const nearest = closestPointOnPolygon({ x, z }, hazard.polygon);
    const band = classifyBand(nearest.distance, hazard.bands);
    if (!band) continue;
    const dx = nearest.x - x, dz = nearest.z - z;
    const bearingDeg = forward && nearest.distance > 0 ? relativeBearing(forward, dx, dz) : null;
    const closingMs = bearingDeg === null ? 0 : speedMs * Math.cos(bearingDeg * Math.PI / 180);
    all.push({
      hazardKey: hazard.key, hazardLabel: hazard.label, bandId: band.id, bandLabel: band.label ?? band.id, bandMaxM: band.max_m,
      distanceM: nearest.distance, bearingDeg, closestPoint: { x: nearest.x, z: nearest.z },
      timeToHazardS: nearest.distance > 0 && closingMs > 0.05 ? nearest.distance / closingMs : null,
    });
  }
  all.sort((a, b) => a.distanceM - b.distanceM);
  return { insideAllowed, nearest: all[0] ?? null, all, warnings: hazards.warnings };
}

// Texto curto para HUD e telemetria, sem "seguro"/"risco": só proximidade, direção e tempo.
export function describeGeofence(result) {
  const near = result?.nearest;
  if (!near) return result?.insideAllowed === false ? 'Fora da área permitida' : 'Sem perigo mapeado no alcance';
  const side = near.bearingDeg === null ? '' : Math.abs(near.bearingDeg) <= 20 ? ' à frente' : Math.abs(near.bearingDeg) >= 160 ? ' atrás' : near.bearingDeg > 0 ? ' à direita' : ' à esquerda';
  const time = near.timeToHazardS === null ? '' : ` · ${Math.round(near.timeToHazardS)} s`;
  return `${near.bandLabel} · ${near.hazardLabel} a ${near.distanceM.toFixed(0)} m${side}${time}`;
}

// Rota sugerida: uma passada paralela ao eixo x (como o percurso dos cenários agrícolas) que fica dentro da área
// permitida e fora de TODAS as faixas, o mais perto possível da lateral preferida. Varre z em passos de cellM até
// maxOffsetM para cada lado. null quando não há pista limpa. Puro, determinístico; usa a mesma grade das faixas.
// ponytail: só pistas retas em x; roteamento em grade (A*) se os percursos deixarem de ser passadas paralelas.
export function suggestSafeLane({ xStart, xEnd, preferredZ = 0, maxOffsetM = 60, cellM = 2 }, rules, polygons) {
  const hazards = resolveHazards(rules, polygons);
  const grid = bandGrid(polygons, hazards, cellM);
  if (!grid) return null;
  const clean = (x, z) => {
    const col = Math.floor((x - grid.minX) / grid.cellM), row = Math.floor((z - grid.minZ) / grid.cellM);
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
    const cell = row * grid.cols + col;
    return grid.inside[cell] === 1 && grid.bands.every(bands => bands[cell] < 0);
  };
  const lo = Math.min(xStart, xEnd), hi = Math.max(xStart, xEnd);
  for (let offset = 0; offset <= maxOffsetM; offset += cellM) {
    for (const z of offset ? [preferredZ - offset, preferredZ + offset] : [preferredZ]) {
      let ok = true;
      for (let x = lo; x <= hi && ok; x += cellM) ok = clean(x, z);
      if (ok) return { z, offsetM: Math.abs(z - preferredZ), points: [{ x: xStart, z }, { x: xEnd, z }] };
    }
  }
  return null;
}
