// Minimapa do trajeto em modo rumo-para-cima: a máquina fica fixa no centro-inferior, o mapa gira com o rumo
// e o que está à frente aparece em cima. As camadas fixas (área, água, perigos, faixas, zonas de inclinação e a
// rota completa) vivem num canvas offscreen em pixels de mapa; cada quadro só gira, recorta e desenha o percurso.
import { useEffect, useMemo, useRef } from 'react';
import { bandGrid } from '../../../shared/geofencing/index.js';
import { getReplayFrame, type LabCase, type LabPolygon } from '../../../shared/lab-telemetry.js';
import { hazardsOf, bandColor, innermostEpisodeAt, episodeColor, ROUTE_COLOR, slopeZones, SLOPE_ZONE_COLORS, machineRollLimit } from './labBands';
import '../geofencing.css';

const W = 240, H = 240, FOOT = 20;
const PX_PER_M = 1.3;                       // escala fixa: ~119 m à frente e 50 m atrás no enquadramento
const BEHIND_M = 50;
const CENTER_X = W / 2, CENTER_Y = H - FOOT - BEHIND_M * PX_PER_M;
const SCALE_STEPS = [200, 100, 50, 20, 10];
const MAX_BASE_PX = 6000;                   // ponytail: teto do canvas do mapa; áreas maiores perdem a escala fixa

interface TrackPoint { mx: number; my: number; x: number; z: number; ms: number; color: string; heading: number }
interface Focus { mx: number; my: number; heading: number }

function boundsOf(polygons: LabPolygon[]) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const polygon of polygons) for (const ring of polygon.rings) for (const point of ring) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  return Number.isFinite(minX) ? { minX, minZ, maxX, maxZ } : null;
}

// Rumo em graus a partir de um deslocamento no plano: 0 = norte = -z, 90 = leste = +x.
const headingOf = (dx: number, dz: number) => Math.atan2(dx, -dz) * 180 / Math.PI;

function buildView(labCase: LabCase, sampleTerrain: ((x: number, z: number) => number | null) | null | undefined) {
  const hazards = hazardsOf(labCase);
  const allowed = labCase.polygons.filter(polygon => polygon.role === 'allowed_area');
  const box = boundsOf(allowed.length ? allowed : labCase.polygons);
  if (!box) return null;
  const margin = hazards.reduce((most, hazard) => Math.max(most, hazard.reach), 0) || 40;
  const spanX = Math.max(1, box.maxX - box.minX + margin * 2), spanZ = Math.max(1, box.maxZ - box.minZ + margin * 2);
  const scale = Math.min(PX_PER_M, MAX_BASE_PX / spanX, MAX_BASE_PX / spanZ);
  const originX = box.minX - margin, originZ = box.minZ - margin;
  const mapX = (x: number) => (x - originX) * scale;
  const mapY = (z: number) => (z - originZ) * scale; // z cresce para o sul; a rotação por quadro coloca o rumo em cima
  const baseW = spanX * scale, baseH = spanZ * scale;

  // Cor e rumo de cada amostra, uma vez por caso (uma cor por episódio, reaproveitada).
  const episodeColors = new Map<string, string>();
  let previous: { x: number; z: number; heading: number } | null = null;
  const track = labCase.samples.map<TrackPoint | null>(sample => {
    if (sample.x === null || sample.z === null) return null;
    const episode = innermostEpisodeAt(labCase, sample.elapsedMs);
    let color = ROUTE_COLOR;
    if (episode) {
      color = episodeColors.get(episode.id) ?? episodeColor(labCase, episode);
      episodeColors.set(episode.id, color);
    }
    const heading = typeof sample.heading_deg === 'number' ? sample.heading_deg
      : previous ? headingOf(sample.x - previous.x, sample.z - previous.z) : 0;
    previous = { x: sample.x, z: sample.z, heading };
    return { mx: mapX(sample.x), my: mapY(sample.z), x: sample.x, z: sample.z, ms: sample.elapsedMs, color, heading };
  });

  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const base = document.createElement('canvas');
  base.width = Math.round(baseW * dpr);
  base.height = Math.round(baseH * dpr);
  const ctx = base.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#eef2ea';
    ctx.fillRect(0, 0, baseW, baseH);

    const trace = (polygon: LabPolygon) => {
      ctx.beginPath();
      for (const ring of polygon.rings) {
        ring.forEach((point, index) => index ? ctx.lineTo(mapX(point.x), mapY(point.z)) : ctx.moveTo(mapX(point.x), mapY(point.z)));
        ctx.closePath();
      }
    };
    for (const polygon of labCase.polygons.filter(item => item.role === 'allowed_area')) {
      trace(polygon);
      ctx.fillStyle = '#dfe9d8';
      ctx.fill('evenodd');
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#53806a';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const polygon of labCase.polygons.filter(item => item.role === 'property_boundary')) {
      trace(polygon);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#d9b24a';
      ctx.stroke();
    }
    for (const polygon of labCase.polygons.filter(item => item.role === 'water')) {
      trace(polygon);
      ctx.fillStyle = '#79b9c0';
      ctx.fill('evenodd');
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#398a96';
      ctx.stroke();
    }
    for (const polygon of labCase.polygons.filter(item => item.role === 'hazard')) {
      trace(polygon);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#c9823e';
      ctx.stroke();
    }

    // Faixas: a mesma grade que somou a área atingida; cada célula recebe a faixa mais interna entre os perigos.
    const grid = hazards.length ? labCase.geofence?.grid ?? bandGrid(labCase.polygons, hazards, 2) : null;
    const side = grid ? grid.cellM * scale + 0.5 : 0;
    if (grid) {
      ctx.globalAlpha = 0.55;
      for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
        const cell = row * grid.cols + col;
        if (!grid.inside[cell]) continue;
        let bestHazard = -1, bestBand = -1, bestMax = Infinity;
        for (let h = 0; h < hazards.length; h++) {
          const band = grid.bands[h][cell];
          if (band < 0) continue;
          const max = hazards[h].bands[band].max_m;
          if (max < bestMax) { bestMax = max; bestHazard = h; bestBand = band; } // empate fica com o primeiro perigo
        }
        if (bestHazard < 0) continue;
        ctx.fillStyle = bandColor(hazards[bestHazard], bestBand);
        ctx.fillRect(mapX(grid.minX + col * grid.cellM), mapY(grid.minZ + row * grid.cellM), side, side);
      }
      ctx.globalAlpha = 1;
    }

    // Zonas de inclinação desta máquina, por cima das faixas (mesma grade).
    const limitDeg = machineRollLimit(labCase);
    if (grid && sampleTerrain && limitDeg !== null) {
      const zones = slopeZones(grid, sampleTerrain, limitDeg);
      ctx.globalAlpha = 0.55;
      for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
        const zone = zones[row * grid.cols + col];
        if (!zone) continue;
        ctx.fillStyle = SLOPE_ZONE_COLORS[zone];
        ctx.fillRect(mapX(grid.minX + col * grid.cellM), mapY(grid.minZ + row * grid.cellM), side, side);
      }
      ctx.globalAlpha = 1;
    }

    // Rota completa em cinza: o percurso colorido do quadro é desenhado por cima.
    ctx.strokeStyle = '#a9b8ad';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let pen = false;
    for (const point of track) {
      if (!point) { pen = false; continue; }
      if (pen) ctx.lineTo(point.mx, point.my); else ctx.moveTo(point.mx, point.my);
      pen = true;
    }
    ctx.stroke();
  }
  // Escala fixa: a barra vale para todos os quadros.
  const meters = SCALE_STEPS.find(step => step * scale <= W * 0.32) ?? 10;
  return { base, baseW, baseH, track, mapX, mapY, scale, originX, originZ, dpr, meters };
}

export default function LabMiniMap({ labCase, elapsedMs, onSeek, sampleTerrain }: {
  labCase: LabCase;
  elapsedMs: number;
  onSeek?: (ms: number) => void;
  sampleTerrain?: ((x: number, z: number) => number | null) | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const focusRef = useRef<Focus | null>(null);
  // Camadas fixas: refeitas só quando o caso ou o relevo muda.
  const view = useMemo(() => buildView(labCase, sampleTerrain), [labCase, sampleTerrain]);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !view) return;

    // Âncora: última amostra com posição até o instante; serve de rumo/posição na falta de GNSS.
    let anchor: TrackPoint | null = null;
    for (const point of view.track) {
      if (!point) continue;
      if (point.ms > elapsedMs) break;
      anchor = point;
    }
    const frame = getReplayFrame(labCase, elapsedMs);
    const live: Focus | null = frame.position
      ? {
        mx: view.mapX(frame.position.x), my: view.mapY(frame.position.z),
        heading: typeof frame.sample.heading_deg === 'number' ? frame.sample.heading_deg : anchor?.heading ?? 0,
      }
      : null;
    const machine = live ?? (anchor ? { mx: anchor.mx, my: anchor.my, heading: anchor.heading } : null);
    const focus = machine ?? { mx: view.baseW / 2, my: view.baseH / 2, heading: 0 };
    focusRef.current = focus;
    const radians = focus.heading * Math.PI / 180;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#eef2ea';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(CENTER_X, CENTER_Y);
    ctx.rotate(-radians);            // o vetor de frente (sin h, -cos h) passa a apontar para cima
    ctx.translate(-focus.mx, -focus.my);
    ctx.drawImage(view.base, 0, 0, view.baseW, view.baseH); // ponytail: blita o mapa inteiro; recortar a vizinhança se pesar

    // Trecho percorrido, colorido pela faixa ativa em cada amostra.
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let previous: TrackPoint | null = null, open = false, color = '';
    const flush = () => { if (open) { ctx.stroke(); open = false; } };
    for (const point of view.track) {
      if (!point) { flush(); previous = null; continue; }
      if (point.ms > elapsedMs) break;
      if (previous) {
        if (!open || point.color !== color) {
          flush();
          ctx.beginPath();
          ctx.strokeStyle = color = point.color;
          ctx.moveTo(previous.mx, previous.my);
          open = true;
        }
        ctx.lineTo(point.mx, point.my);
      }
      previous = point;
    }
    flush();
    ctx.restore();

    // Marcador fixo no centro-inferior, sempre apontando para cima; esmaecido quando não há posição no quadro.
    if (machine) {
      ctx.globalAlpha = live ? 1 : 0.45;
      ctx.strokeStyle = '#17614b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CENTER_X, CENTER_Y);
      ctx.lineTo(CENTER_X, CENTER_Y - 14);
      ctx.stroke();
      ctx.fillStyle = '#17614b';
      ctx.beginPath();
      ctx.arc(CENTER_X, CENTER_Y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f8fcf7';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Bússola: gira junto, apontando para o norte real (0, -1) do mundo.
    const northX = -Math.sin(radians), northY = -Math.cos(radians);
    const cx = W - 24, cy = 24;
    ctx.fillStyle = '#f8fcf7e8';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9e3d5';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = '#3e644b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - northX * 5, cy - northY * 5);
    ctx.lineTo(cx + northX * 5, cy + northY * 5);
    ctx.stroke();
    ctx.fillStyle = '#3e644b';
    ctx.font = '8px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx + northX * 10, cy + northY * 10);

    // Rodapé: barra de escala fixa (a escala do mapa não muda com o rumo).
    const bar = view.meters * view.scale;
    ctx.fillStyle = '#f8fcf7e8';
    ctx.fillRect(0, H - FOOT, W, FOOT);
    ctx.strokeStyle = '#3e644b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, H - 13);
    ctx.lineTo(10, H - 7);
    ctx.lineTo(10 + bar, H - 7);
    ctx.lineTo(10 + bar, H - 13);
    ctx.stroke();
    ctx.fillStyle = '#3e644b';
    ctx.font = '9px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${view.meters} m`, 14 + bar, H - 6);
  }, [labCase, elapsedMs, view]);

  if (!view) return null;

  const seekToPoint = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const focus = focusRef.current;
    if (!onSeek || !focus) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Inverso da transformação do quadro: desfaz o centro e a rotação para voltar aos pixels de mapa.
    const u = (event.clientX - rect.left) / rect.width * W - CENTER_X;
    const v = (event.clientY - rect.top) / rect.height * H - CENTER_Y;
    const radians = focus.heading * Math.PI / 180;
    const x = view.originX + (u * Math.cos(radians) - v * Math.sin(radians) + focus.mx) / view.scale;
    const z = view.originZ + (u * Math.sin(radians) + v * Math.cos(radians) + focus.my) / view.scale;
    let best: TrackPoint | null = null, bestDistance = Infinity;
    for (const point of view.track) {
      if (!point) continue;
      const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
      if (distance < bestDistance) { bestDistance = distance; best = point; }
    }
    if (best) onSeek(best.ms);
  };

  return <div className="lab-minimap" data-lab-minimap>
    <canvas
      ref={canvasRef}
      width={Math.round(W * view.dpr)}
      height={Math.round(H * view.dpr)}
      style={{ width: W, height: H, cursor: onSeek ? 'pointer' : 'default' }}
      role="img"
      aria-label="Trajeto do maquinário com o rumo para cima: faixas de proximidade e zonas de inclinação em cores"
      onClick={seekToPoint}
    />
  </div>;
}
