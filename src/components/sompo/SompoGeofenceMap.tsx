// Mapa do talhão sintético visto de cima, norte para cima, parado: a "instalação" do geofencing antes de rodar a cena.
// Puro desenho: polígonos, faixas e percurso vêm de shared/*; a mesma grade de 2 m que pinta o chão da cena 3D pinta aqui.
// Por cima, só a máquina no instante atual e o trecho já percorrido.
import { useEffect, useMemo, useRef } from 'react';
import { getSompoAgriScenario, SOMPO_AGRI_EQUIPMENT } from '../../../shared/sompo-agri-scenarios.js';
import { getSompoAgriPosition } from '../../../shared/sompo-agri-brief.js';
import { getSompoGeofenceSite } from '../../../shared/sompo-geofence-sites.js';
import { bandGrid, resolveHazards, type LabGeofenceRules } from '../../../shared/lab-geofence.js';
import type { LabPolygon } from '../../../shared/lab-telemetry.js';

const SCALE = 3;          // px por metro no canvas fora da tela (nítido em qualquer largura de painel)
const STEP_MS = 250;      // amostragem do percurso do cenário
const CELL_M = 1;         // só para desenhar, mais fina que os 2 m da cena; aqui ninguém soma área (regra 1 do SPEC não se aplica)
const PAD_M = 8;
// Mesma rampa da cena 3D (createSompoAgriStage): da faixa mais interna para a mais externa, igual para todo perigo.
const BAND_RAMP = ['#d63a2f', '#e8902c', '#e9c74a'];

interface StaticMap {
  canvas: HTMLCanvasElement;
  minX: number; minZ: number;
  path: { t: number; x: number; z: number }[];
  hazards: { label: string; bands: string; justification: string | null }[];
  label: string;
}

function buildStaticMap(scenarioId: string, outcomeId: string): StaticMap | null {
  const scenario = getSompoAgriScenario(scenarioId);
  const site = getSompoGeofenceSite(scenario.environmentId, Math.abs(2 * getSompoAgriPosition(scenarioId, 0, outcomeId).x));
  if (!site) return null;
  const polygons = site.polygons as LabPolygon[];
  const rules = site.manifestRules as unknown as LabGeofenceRules;
  const hazards = resolveHazards(rules, polygons, { profile: { max_roll_deg: SOMPO_AGRI_EQUIPMENT[scenario.equipmentId].profile.max_roll_deg } });
  const grid = bandGrid(polygons, hazards, CELL_M);

  const path: StaticMap['path'] = [];
  for (let t = 0; t <= scenario.totalMs; t += STEP_MS) {
    const point = getSompoAgriPosition(scenarioId, t, outcomeId);
    path.push({ t, x: point.x, z: point.z });
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const polygon of polygons) for (const ring of polygon.rings) for (const point of ring) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  }
  if (!Number.isFinite(minX)) return null;
  minX -= PAD_M; maxX += PAD_M; minZ -= PAD_M; maxZ += PAD_M;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxX - minX) * SCALE);
  canvas.height = Math.ceil((maxZ - minZ) * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const px = (x: number) => (x - minX) * SCALE, py = (z: number) => (z - minZ) * SCALE;
  const trace = (ring: { x: number; z: number }[]) => {
    ctx.beginPath();
    ring.forEach((point, index) => (index ? ctx.lineTo(px(point.x), py(point.z)) : ctx.moveTo(px(point.x), py(point.z))));
    ctx.closePath();
  };
  ctx.fillStyle = '#e9e4d6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineJoin = 'round';
  for (const polygon of polygons) if (polygon.role === 'allowed_area') for (const ring of polygon.rings) {
    trace(ring); ctx.fillStyle = '#d9d2b4'; ctx.fill();
  }
  // Faixas célula a célula: entre perigos sobrepostos vence a mais interna (menor max_m), como no chão da cena.
  if (grid) {
    const cellPx = CELL_M * SCALE + 0.5;
    ctx.globalAlpha = 0.6;
    for (let row = 0; row < grid.rows; row += 1) for (let col = 0; col < grid.cols; col += 1) {
      const cell = row * grid.cols + col;
      if (!grid.inside[cell]) continue;
      let best = -1, bestMax = Infinity;
      for (let h = 0; h < hazards.length; h += 1) {
        const band = grid.bands[h][cell];
        if (band < 0 || hazards[h].bands[band].max_m >= bestMax) continue;
        bestMax = hazards[h].bands[band].max_m; best = Math.min(band, BAND_RAMP.length - 1);
      }
      if (best < 0) continue;
      ctx.fillStyle = BAND_RAMP[best];
      ctx.fillRect(px(grid.minX + col * CELL_M), py(grid.minZ + row * CELL_M), cellPx, cellPx);
    }
    ctx.globalAlpha = 1;
  }
  for (const polygon of polygons) for (const ring of polygon.rings) {
    trace(ring);
    if (polygon.role === 'allowed_area') { ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeStyle = '#4f7d5c'; }
    else if (polygon.role === 'water') { ctx.setLineDash([]); ctx.fillStyle = '#79b9c0'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#398a96'; }
    else { ctx.setLineDash([]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#8b3a12'; }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.beginPath();
  path.forEach((point, index) => (index ? ctx.lineTo(px(point.x), py(point.z)) : ctx.moveTo(px(point.x), py(point.z))));
  ctx.lineWidth = 2; ctx.strokeStyle = '#6b7a6f'; ctx.stroke();

  return {
    canvas, minX, minZ, path, label: site.label,
    hazards: [...new Map(hazards.map(hazard => [hazard.label, hazard])).values()].map(hazard => ({
      label: hazard.label,
      // Intervalos exclusivos: "até 5 m · de 5 a 15 m", para "até 15 m" não parecer que engloba "até 5 m".
      bands: hazard.bands.map((band, index) => {
        const name = band.label ?? band.id;
        if (band.max_m === 0) return name;
        const unit = hazard.metric ? '°' : ' m';
        const previous = hazard.bands[index - 1]?.max_m ?? 0;
        const range = previous > 0 ? `de ${previous} a ${band.max_m}${unit}` : `até ${band.max_m}${unit}`;
        return hazard.metric ? `${name}: margem ${range}` : `${name}: ${range}`;
      }).join(' · '),
      justification: hazard.justification,
    })),
  };
}

export interface SompoGeofenceMapProps {
  scenarioId: string;
  outcomeId: string;
  elapsedMs: number;
  position: { x: number; z: number; headingDeg: number } | null;
}

export default function SompoGeofenceMap({ scenarioId, outcomeId, elapsedMs, position }: SompoGeofenceMapProps) {
  const map = useMemo(() => buildStaticMap(scenarioId, outcomeId), [scenarioId, outcomeId]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    if (canvas.width !== map.canvas.width) { canvas.width = map.canvas.width; canvas.height = map.canvas.height; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(map.canvas, 0, 0);
    const px = (x: number) => (x - map.minX) * SCALE, py = (z: number) => (z - map.minZ) * SCALE;
    // Trecho já percorrido por cima do percurso planejado.
    const done = map.path.filter(point => point.t <= elapsedMs);
    if (done.length > 1) {
      ctx.beginPath();
      done.forEach((point, index) => (index ? ctx.lineTo(px(point.x), py(point.z)) : ctx.moveTo(px(point.x), py(point.z))));
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#1f3d2b'; ctx.stroke();
    }
    if (position) {
      // headingDeg: 0 = norte (-z), 90 = leste (+x). Na tela, y cresce para o sul: seta = (sin, -cos).
      const rad = position.headingDeg * Math.PI / 180;
      const x = px(position.x), y = py(position.z), r = 7;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1f3d2b'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(rad) * r * 2.4, y - Math.cos(rad) * r * 2.4); ctx.lineWidth = 3; ctx.strokeStyle = '#1f3d2b'; ctx.stroke();
    }
    // Norte e escala.
    ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = '#1f3d2b'; ctx.fillText('N ↑', 8, 20);
    const bar = 20 * SCALE;
    ctx.fillRect(8, canvas.height - 14, bar, 3); ctx.font = '12px system-ui, sans-serif'; ctx.fillText('20 m', 8, canvas.height - 18);
  }, [map, elapsedMs, position]);

  if (!map) return null;
  return (
    <aside className="sompo-geofence-map" aria-label="Mapa do talhão com geofencing" data-sompo-geofence-map>
      <div className="sompo-simulator-control-head">
        <div>
          <span>Geofencing · demonstração</span>
          <strong>{map.label}</strong>
          <p>Vista de cima, norte para cima. As mesmas faixas pintadas no chão da cena; a máquina e o trecho percorrido seguem o relógio da simulação.</p>
        </div>
      </div>
      <canvas ref={canvasRef} role="img" aria-label="Talhão, perigos mapeados, faixas de proximidade, percurso e posição da máquina" />
      <ul className="sompo-geofence-map-legend" aria-label="Legenda">
        <li><i style={{ background: '#d9d2b4', borderColor: '#4f7d5c' }} />Área permitida</li>
        <li><i style={{ background: '#79b9c0', borderColor: '#398a96' }} />Água</li>
        <li><i style={{ background: BAND_RAMP[0] }} />Dentro / crítica</li>
        <li><i style={{ background: BAND_RAMP[1] }} />Borda / elevada</li>
        <li><i style={{ background: BAND_RAMP[2] }} />Atenção</li>
        <li><i style={{ background: '#6b7a6f' }} />Percurso do cenário</li>
      </ul>
      <p className="sompo-geofence-map-note">As cores indicam a faixa de cada perigo, não uma gravidade equivalente entre perigos. Nenhuma faixa é rótulo de segurança.</p>
      <dl className="sompo-geofence-map-rules">
        {map.hazards.map(hazard => (
          <div key={hazard.label}>
            <dt>{hazard.label}</dt>
            <dd>{hazard.bands}{hazard.justification ? <small>{hazard.justification}</small> : null}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
