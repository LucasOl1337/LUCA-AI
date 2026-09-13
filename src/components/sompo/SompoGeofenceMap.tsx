// Mapa do talhão sintético visto de cima, norte para cima, parado: a "instalação" do geofencing antes de rodar a cena.
// Puro desenho: polígonos, faixas e percurso vêm de shared/*; a mesma grade de 2 m que pinta o chão da cena 3D pinta aqui.
// Por cima, só a máquina no instante atual e o trecho já percorrido.
import { useEffect, useMemo, useRef } from 'react';
import { getSompoAgriScenario, SOMPO_AGRI_EQUIPMENT } from '../../../shared/sompo-agri-scenarios.js';
import { getSompoAgriPosition } from '../../../shared/sompo-agri-brief.js';
import { getSompoGeofenceSite, geofenceFieldRelief, geofenceOperacaoRelief } from '../../../shared/sompo-geofence-sites.js';
import { bandGrid, resolveHazards, type LabGeofenceRules } from '../../../shared/lab-geofence.js';
import { polygonContains, type LabPolygon } from '../../../shared/lab-telemetry.js';

const SCALE = 3;          // px por metro no canvas fora da tela (nítido em qualquer largura de painel)
const STEP_MS = 250;      // amostragem do percurso do cenário
const CELL_M = 1;         // só para desenhar, mais fina que os 2 m da cena; aqui ninguém soma área (regra 1 do SPEC não se aplica)
const PAD_M = 8;
// Mesma rampa da cena 3D (createSompoAgriStage): da faixa mais interna para a mais externa, igual para todo perigo.
const BAND_RAMP = ['#d63a2f', '#e8902c', '#e9c74a'];
// Nome curto no mapa quando a regra não serve: a lagoa cai na mesma regra de água do córrego ("Córrego sintético").
const POLYGON_NAMES: Record<string, string> = { 'lagoa-sintetica': 'Lagoa' };
const LABEL_BG = 'rgba(255, 255, 255, 0.8)';

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
  // Relevo: sombreado simples (luz de noroeste) a partir da mesma função de altura da cena, por baixo das faixas.
  if (['geofence-field', 'geofence-operacao'].includes(scenario.environmentId)) {
    const relief = scenario.environmentId === 'geofence-operacao' ? geofenceOperacaoRelief : geofenceFieldRelief;
    const step = 2;
    for (let z = minZ; z < maxZ; z += step) for (let x = minX; x < maxX; x += step) {
      const dx = relief(x + 1, z) - relief(x - 1, z);
      const dz = relief(x, z + 1) - relief(x, z - 1);
      const shade = (dx + dz) * 0.35; // encostas voltadas para noroeste clareiam, para sudeste escurecem
      if (Math.abs(shade) < 0.02) continue;
      ctx.fillStyle = shade > 0 ? `rgba(40,30,10,${Math.min(0.45, shade)})` : `rgba(255,255,255,${Math.min(0.5, -shade)})`;
      ctx.fillRect(px(x), py(z), step * SCALE + 0.5, step * SCALE + 0.5);
    }
  }
  // Faixas célula a célula: entre perigos sobrepostos vence a mais interna (menor max_m), como no chão da cena.
  if (grid) {
    const cellPx = CELL_M * SCALE + 0.5;
    for (let row = 0; row < grid.rows; row += 1) for (let col = 0; col < grid.cols; col += 1) {
      const cell = row * grid.cols + col;
      if (!grid.inside[cell]) continue;
      let best = -1, bestMax = Infinity;
      for (let h = 0; h < hazards.length; h += 1) {
        const band = grid.bands[h][cell];
        if (band < 0 || hazards[h].bands[band].max_m >= bestMax) continue;
        bestMax = hazards[h].bands[band].max_m; best = Math.min(band + (hazards[h].alertable ? 0 : 1), BAND_RAMP.length - 1); // contexto: um degrau mais fraco
      }
      if (best < 0) continue;
      // Faixa "dentro" (max_m 0: declive, ribanceira) em xadrez, mesma paridade da cena: sem isso o declive virava um disco vermelho
      // sólido no centro. Água não tem max_m 0 (crítica = até 5 m), então continua sólida.
      ctx.globalAlpha = bestMax === 0 && ((col + row) & 1) ? 0.15 : 0.6;
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
  // Nome de cada perigo/água no centroide do anel. Anel fino em curva (córrego) pode ter centroide fora dele:
  // aí o rótulo ancora no vértice mais próximo, para ficar colado ao desenho.
  ctx.font = 'bold 17px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const polygon of polygons) {
    if (polygon.role === 'allowed_area') continue;
    const ring = polygon.rings[0].slice(0, -1); // anel fechado: o último ponto repete o primeiro
    const centroid = { x: ring.reduce((sum, p) => sum + p.x, 0) / ring.length, z: ring.reduce((sum, p) => sum + p.z, 0) / ring.length };
    const anchor = polygonContains(centroid, polygon) ? centroid
      : ring.reduce((near, p) => Math.hypot(p.x - centroid.x, p.z - centroid.z) < Math.hypot(near.x - centroid.x, near.z - centroid.z) ? p : near);
    const text = POLYGON_NAMES[polygon.id] ?? hazards.find(hazard => hazard.polygon === polygon)?.label ?? polygon.id;
    // 5 m acima do ponto de ancoragem: o percurso (z ≈ 0) cruza o centro do declive e riscava o texto.
    const width = ctx.measureText(text).width + 14;
    const x = Math.max(width / 2 + 4, Math.min(canvas.width - width / 2 - 4, px(anchor.x))), y = py(anchor.z) - 5 * SCALE;
    ctx.fillStyle = LABEL_BG; ctx.fillRect(x - width / 2, y - 11, width, 22);
    ctx.fillStyle = '#2b2a24'; ctx.fillText(text, x, y);
  }

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
  compact?: boolean; // só o desenho, para o painel de geofencing; legenda e regras ficam no modo grande
}

export default function SompoGeofenceMap({ scenarioId, outcomeId, elapsedMs, position, compact = false }: SompoGeofenceMapProps) {
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
    // Rosa dos ventos (N com seta) e barra de escala de 50 m, sobre fundo claro para ler em cima de qualquer faixa.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = LABEL_BG; ctx.fillRect(8, 8, 30, 48);
    ctx.fillStyle = '#1f3d2b'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillText('N', 23, 19);
    ctx.beginPath(); ctx.moveTo(23, 52); ctx.lineTo(23, 32); ctx.lineWidth = 2; ctx.strokeStyle = '#1f3d2b'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(23, 27); ctx.lineTo(18, 37); ctx.lineTo(28, 37); ctx.closePath(); ctx.fill();
    const bar = 50 * SCALE, bx = 8, by = canvas.height - 12;
    ctx.fillStyle = LABEL_BG; ctx.fillRect(bx - 4, by - 28, bar + 8, 36);
    ctx.fillStyle = '#1f3d2b'; ctx.fillRect(bx, by - 4, bar, 4); ctx.fillRect(bx, by - 10, 2, 10); ctx.fillRect(bx + bar - 2, by - 10, 2, 10);
    ctx.font = 'bold 16px system-ui, sans-serif'; ctx.fillText('50 m', bx + bar / 2, by - 18);
  }, [map, elapsedMs, position]);

  if (!map) return null;
  if (compact) return <canvas ref={canvasRef} className="sompo-geofence-map-canvas" role="img" aria-label="Talhão, perigos mapeados, faixas de proximidade, percurso e posição da máquina" />;
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
        <li><i style={{ background: `conic-gradient(${BAND_RAMP[0]} 25%, ${BAND_RAMP[0]}40 0 50%, ${BAND_RAMP[0]} 0 75%, ${BAND_RAMP[0]}40 0) 0 0 / 6px 6px` }} />Dentro do perigo (hachura)</li>
        <li><i style={{ background: `conic-gradient(${BAND_RAMP[1]} 25%, ${BAND_RAMP[1]}40 0 50%, ${BAND_RAMP[1]} 0 75%, ${BAND_RAMP[1]}40 0) 0 0 / 6px 6px` }} />Declive: contexto, um tom abaixo</li>
        <li><i style={{ background: BAND_RAMP[0] }} />Proximidade crítica (água)</li>
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
