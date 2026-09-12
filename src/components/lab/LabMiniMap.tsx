// Minimapa 2D do trajeto: enquadra a área permitida, pinta as faixas de proximidade da mesma grade da cena
// e desenha o percurso já percorrido até o instante do replay. Clique no mapa leva a linha do tempo até ali.
import { useEffect, useMemo, useRef } from 'react';
import { bandGrid } from '../../../shared/lab-geofence.js';
import { getReplayFrame, type LabCase, type LabPolygon } from '../../../shared/lab-telemetry.js';
import { hazardsOf, bandColor, innermostEpisodeAt, episodeColor, ROUTE_COLOR } from './labBands';

const W = 280, H = 200, PAD = 8, FOOT = 20;
const SCALE_STEPS = [200, 100, 50, 20, 10];

interface TrackPoint { px: number; py: number; x: number; z: number; ms: number; color: string }

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

function buildView(labCase: LabCase) {
  const hazards = hazardsOf(labCase);
  const allowed = labCase.polygons.filter(polygon => polygon.role === 'allowed_area');
  const box = boundsOf(allowed.length ? allowed : labCase.polygons);
  if (!box) return null;
  const margin = hazards.reduce((most, hazard) => Math.max(most, hazard.reach), 0) || 40;
  const spanX = Math.max(1, box.maxX - box.minX + margin * 2), spanZ = Math.max(1, box.maxZ - box.minZ + margin * 2);
  const scale = Math.min((W - PAD * 2) / spanX, (H - FOOT - PAD * 2) / spanZ); // proporção preservada
  const centerX = (box.minX + box.maxX) / 2, centerZ = (box.minZ + box.maxZ) / 2;
  const toX = (x: number) => W / 2 + (x - centerX) * scale;
  const toY = (z: number) => (H - FOOT) / 2 + (z - centerZ) * scale; // z cresce para o sul: norte fica em cima
  const toWorldX = (px: number) => centerX + (px - W / 2) / scale;
  const toWorldZ = (py: number) => centerZ + (py - (H - FOOT) / 2) / scale;

  // Cor de cada amostra: a faixa mais interna ativa naquele instante (uma cor por episódio, reaproveitada).
  const episodeColors = new Map<string, string>();
  const track = labCase.samples.map<TrackPoint | null>(sample => {
    if (sample.x === null || sample.z === null) return null;
    const episode = innermostEpisodeAt(labCase, sample.elapsedMs);
    let color = ROUTE_COLOR;
    if (episode) {
      color = episodeColors.get(episode.id) ?? episodeColor(labCase, episode);
      episodeColors.set(episode.id, color);
    }
    return { px: toX(sample.x), py: toY(sample.z), x: sample.x, z: sample.z, ms: sample.elapsedMs, color };
  });

  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const base = document.createElement('canvas');
  base.width = Math.round(W * dpr);
  base.height = Math.round(H * dpr);
  const ctx = base.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#eef2ea';
    ctx.fillRect(0, 0, W, H);

    const trace = (polygon: LabPolygon) => {
      ctx.beginPath();
      for (const ring of polygon.rings) {
        ring.forEach((point, index) => index ? ctx.lineTo(toX(point.x), toY(point.z)) : ctx.moveTo(toX(point.x), toY(point.z)));
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
    if (grid) {
      const side = grid.cellM * scale + 0.5;
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
        ctx.fillRect(toX(grid.minX + col * grid.cellM), toY(grid.minZ + row * grid.cellM), side, side);
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
      if (pen) ctx.lineTo(point.px, point.py); else ctx.moveTo(point.px, point.py);
      pen = true;
    }
    ctx.stroke();

    // Rodapé: barra de escala arredondada e seta de norte.
    const meters = SCALE_STEPS.find(step => step * scale <= W * 0.32) ?? 10;
    const bar = meters * scale;
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
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${meters} m`, 14 + bar, H - 6);
    ctx.fillText('↑ N', W - 26, H - 6);
  }
  return { base, track, toX, toY, toWorldX, toWorldZ, dpr };
}

export default function LabMiniMap({ labCase, elapsedMs, onSeek }: { labCase: LabCase; elapsedMs: number; onSeek?: (ms: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useMemo(() => buildView(labCase), [labCase]); // camadas estáticas: uma vez por caso

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !view) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(view.base, 0, 0, W, H);

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
          ctx.moveTo(previous.px, previous.py);
          open = true;
        }
        ctx.lineTo(point.px, point.py);
      }
      previous = point;
    }
    flush();

    const frame = getReplayFrame(labCase, elapsedMs);
    if (!frame.position) return; // sem posição no quadro, a máquina não é desenhada
    const px = view.toX(frame.position.x), py = view.toY(frame.position.z);
    const heading = frame.sample.heading_deg;
    if (typeof heading === 'number') {
      const radians = heading * Math.PI / 180; // 0 = norte = -z, 90 = leste = +x
      ctx.strokeStyle = '#17614b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.sin(radians) * 14, py - Math.cos(radians) * 14);
      ctx.stroke();
    }
    ctx.fillStyle = '#17614b';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f8fcf7';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [labCase, elapsedMs, view]);

  if (!view) return null;

  const seekToPoint = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = view.toWorldX((event.clientX - rect.left) / rect.width * W);
    const z = view.toWorldZ((event.clientY - rect.top) / rect.height * H);
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
      aria-label="Trajeto do maquinário no período de plantio, com as faixas de proximidade em cores"
      onClick={seekToPoint}
    />
  </div>;
}
