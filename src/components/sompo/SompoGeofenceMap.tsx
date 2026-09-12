// Mapa de operação 2D do talhão sintético: as mesmas zonas e faixas que a cena 3D pinta, vistas de cima,
// no estilo de um GPS de carro (máquina fixa no centro-inferior, mapa girando com o rumo).
// Puro desenho: toda a geometria vem de shared/*, nenhuma regra de distância vive aqui.
import { useEffect, useMemo, useRef } from 'react';
import { getSompoAgriFrame, getSompoAgriScenario } from '../../../shared/sompo-agri-scenarios.js';
import { getSompoAgriStartX, getSompoAgriTravelMeters } from '../../../shared/sompo-agri-brief.js';
import { getSompoGeofenceSite } from '../../../shared/sompo-geofence-sites.js';
import { suggestSafeLane } from '../../../shared/sompo-geofence.js';
import { bandGrid, resolveHazards, type LabGeofenceRules, type LabHazard } from '../../../shared/lab-geofence.js';
import type { LabPolygon } from '../../../shared/lab-telemetry.js';

const SIZE = 260;          // lado do canvas em px CSS
const SCALE = 1.6;         // px por metro (fixo: não acompanha o zoom da cena)
const STEP_MS = 250;       // amostragem do percurso do cenário
const CELL_M = 2;          // mesma célula da grade de faixas do laboratório
const SCALE_BAR_M = 40;

// Rampas do laboratório (src/components/lab/labBands.ts), copiadas para não importar da frente do lab.
const RAMPS: Record<'water' | 'hazard', string[]> = {
  water: ['#1b5e8a', '#3f8fbf', '#9ac8e2'],
  hazard: ['#8b4a1a', '#c9823e', '#e7c39a'],
};

function bandColor(hazard: LabHazard, bandIndex: number): string {
  const ramp = RAMPS[hazard.polygon?.role === 'water' ? 'water' : 'hazard'];
  const n = Math.max(1, hazard.bands.length - 1);
  return ramp[Math.round(bandIndex * (ramp.length - 1) / n)];
}

interface StaticMap {
  canvas: HTMLCanvasElement;
  widthPx: number; heightPx: number;
  minX: number; minZ: number;
  path: { t: number; x: number; z: number }[];
  lane: { z: number; offsetM: number } | null;
}

// Camadas fixas do cenário, desenhadas uma vez num canvas fora da tela: fundo, zonas, faixas, percurso e rota.
function buildStaticMap(scenarioId: string, outcomeId: string): StaticMap | null {
  const scenario = getSompoAgriScenario(scenarioId);
  const totalMs = scenario.totalMs;
  const totalTravel = getSompoAgriTravelMeters(scenarioId, totalMs, outcomeId);
  const startX = getSompoAgriStartX(scenarioId, outcomeId);
  const site = getSompoGeofenceSite(scenario.environmentId, totalTravel);
  const polygons = site.polygons as LabPolygon[];
  // manifestRules declara role como string livre; o motor de faixas espera a união do laboratório.
  const hazards = resolveHazards(site.manifestRules as unknown as LabGeofenceRules, polygons);
  const grid = bandGrid(polygons, hazards, CELL_M);

  const path: { t: number; x: number; z: number }[] = [];
  for (let t = 0; t <= totalMs; t += STEP_MS) {
    path.push({
      t,
      x: startX + getSompoAgriTravelMeters(scenarioId, t, outcomeId),
      z: getSompoAgriFrame(scenarioId, t, outcomeId).lateral,
    });
  }
  const lane = suggestSafeLane({ xStart: startX, xEnd: startX + totalTravel, preferredZ: 0, maxOffsetM: 60 }, site.manifestRules as LabGeofenceRules, site.polygons as LabPolygon[]);

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const grow = (x: number, z: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };
  for (const polygon of polygons) for (const ring of polygon.rings) for (const point of ring) grow(point.x, point.z);
  for (const point of path) grow(point.x, point.z);
  if (lane) { grow(startX, lane.z); grow(startX + totalTravel, lane.z); }
  if (!Number.isFinite(minX)) return null;
  const pad = 12;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;

  const widthPx = Math.ceil((maxX - minX) * SCALE), heightPx = Math.ceil((maxZ - minZ) * SCALE);
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const px = (x: number) => (x - minX) * SCALE, py = (z: number) => (z - minZ) * SCALE;
  const trace = (ring: { x: number; z: number }[]) => {
    ctx.beginPath();
    ring.forEach((point, index) => (index ? ctx.lineTo(px(point.x), py(point.z)) : ctx.moveTo(px(point.x), py(point.z))));
    ctx.closePath();
  };

  ctx.fillStyle = '#eef2ea';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.lineJoin = 'round';

  for (const polygon of polygons) if (polygon.role === 'allowed_area') for (const ring of polygon.rings) {
    trace(ring);
    ctx.fillStyle = '#dfe9d8';
    ctx.fill();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#53806a';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Faixas célula a célula: entre perigos sobrepostos vence a faixa mais interna (menor max_m).
  if (grid) {
    const cellPx = grid.cellM * SCALE + 0.5;
    ctx.globalAlpha = 0.55;
    for (let row = 0; row < grid.rows; row += 1) for (let col = 0; col < grid.cols; col += 1) {
      const cell = row * grid.cols + col;
      if (!grid.inside[cell]) continue;
      let best: { hazard: LabHazard; index: number; maxM: number } | null = null;
      for (let h = 0; h < grid.bands.length; h += 1) {
        const hazard = hazards[h];
        const index = grid.bands[h][cell];
        if (!hazard || index < 0) continue;
        const maxM = hazard.bands[index]?.max_m ?? Infinity;
        if (!best || maxM < best.maxM) best = { hazard, index, maxM };
      }
      if (!best) continue;
      ctx.fillStyle = bandColor(best.hazard, best.index);
      ctx.fillRect(px(grid.minX + col * grid.cellM), py(grid.minZ + row * grid.cellM), cellPx, cellPx);
    }
    ctx.globalAlpha = 1;
  }

  for (const polygon of polygons) {
    if (polygon.role === 'allowed_area') continue;
    for (const ring of polygon.rings) {
      trace(ring);
      if (polygon.role === 'water') {
        ctx.fillStyle = '#79b9c0';
        ctx.fill();
        ctx.strokeStyle = '#398a96';
      } else ctx.strokeStyle = '#c9823e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  ctx.beginPath();
  path.forEach((point, index) => (index ? ctx.lineTo(px(point.x), py(point.z)) : ctx.moveTo(px(point.x), py(point.z))));
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#7d8f83';
  ctx.stroke();

  if (lane) {
    ctx.beginPath();
    ctx.moveTo(px(startX), py(lane.z));
    ctx.lineTo(px(startX + totalTravel), py(lane.z));
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#17614b';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  return { canvas, widthPx, heightPx, minX, minZ, path, lane };
}

export interface SompoGeofenceMapProps {
  scenarioId: string;
  outcomeId: string;
  elapsedMs: number;
  position: { x: number; z: number; headingDeg: number } | null;
}

export default function SompoGeofenceMap({ scenarioId, outcomeId, elapsedMs, position }: SompoGeofenceMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const map = useMemo(() => {
    try { return buildStaticMap(scenarioId, outcomeId); } catch { return null; }
  }, [scenarioId, outcomeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixels = Math.round(SIZE * dpr);
    if (canvas.width !== pixels) { canvas.width = pixels; canvas.height = pixels; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#eef2ea';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const px = (x: number) => (x - map.minX) * SCALE, py = (z: number) => (z - map.minZ) * SCALE;
    const anchor = position ?? map.path[0] ?? { x: map.minX, z: map.minZ };
    const headingRad = (position?.headingDeg ?? 0) * Math.PI / 180;
    const cx = SIZE / 2, cy = SIZE * 0.72;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-headingRad);          // rumo 0 = norte (-z): a frente da máquina aponta sempre para cima
    ctx.translate(-px(anchor.x), -py(anchor.z));
    ctx.drawImage(map.canvas, 0, 0, map.widthPx, map.heightPx);

    // Trecho já percorrido, por cima do percurso cinza.
    const done = map.path.filter(point => point.t <= elapsedMs);
    if (done.length > 1) {
      ctx.beginPath();
      done.forEach((point, index) => (index ? ctx.lineTo(px(point.x), py(point.z)) : ctx.moveTo(px(point.x), py(point.z))));
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#215f47';
      ctx.stroke();
    }
    ctx.restore();

    // Máquina: sempre no centro-inferior, sempre apontando para cima.
    ctx.strokeStyle = '#17614b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#17614b';
    ctx.fill();
    ctx.strokeStyle = '#f8fcf7';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bússola: o "N" gira junto com o mapa.
    const bx = SIZE - 30, by = 30;
    // O norte (-z) depois da rotação de -rumo: (-sen rumo, -cos rumo).
    const north = { x: -Math.sin(headingRad), y: -Math.cos(headingRad) };
    ctx.beginPath();
    ctx.arc(bx, by, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    ctx.strokeStyle = '#d9e3d5';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx - north.x * 8, by - north.y * 8);
    ctx.lineTo(bx + north.x * 8, by + north.y * 8);
    ctx.strokeStyle = '#7d8f83';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17614b';
    ctx.fillText('N', bx + north.x * 20, by + north.y * 20);

    // Barra de escala fixa: a escala não muda com o rumo nem com o zoom da cena.
    const barPx = SCALE_BAR_M * SCALE, bx0 = 14, by0 = SIZE - 16;
    ctx.strokeStyle = '#4b5f52';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx0, by0 - 4);
    ctx.lineTo(bx0, by0);
    ctx.lineTo(bx0 + barPx, by0);
    ctx.lineTo(bx0 + barPx, by0 - 4);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillStyle = '#4b5f52';
    ctx.fillText(`${SCALE_BAR_M} m`, bx0, by0 - 6);
  }, [map, elapsedMs, position]);

  if (!map) return null;
  return (
    <div className="sompo-geofence-map" data-sompo-geofence-map data-safe-lane={map.lane ? map.lane.z.toFixed(1) : 'none'}>
      <canvas
        ref={canvasRef}
        style={{ width: SIZE, height: SIZE }}
        role="img"
        aria-label="Mapa de operação do talhão: zonas mapeadas, faixas de proximidade, percurso do cenário e rota sugerida, com a máquina no centro."
      />
      <ul className="sompo-geofence-map-legend" aria-hidden="true">
        <li><i style={{ background: '#dfe9d8', borderColor: '#53806a' }} />Área permitida</li>
        <li><i style={{ background: '#79b9c0', borderColor: '#398a96' }} />Zona de água</li>
        <li><i style={{ background: '#c9823e', borderColor: '#8b4a1a' }} />Faixas de proximidade</li>
        <li><i style={{ background: '#7d8f83', borderColor: '#215f47' }} />Percurso do cenário</li>
        <li><i style={{ background: 'transparent', borderColor: '#17614b', borderStyle: 'dashed' }} />{map.lane ? 'Rota sugerida' : 'Rota sugerida indisponível'}</li>
      </ul>
    </div>
  );
}
