// Determinístico: sem Math.random, sem Date.now(). Gera public/datasets/piracicaba-artemis/.
// Fonte da água: fontes/osm-relation-2708872-2026-09-11.json (relação OSM 2708872, ODbL).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OSM_SOURCE = path.join(path.dirname(ROOT), 'fontes', 'osm-relation-2708872-2026-09-11.json');
const OUT_DIR = path.join(ROOT, 'public', 'datasets', 'piracicaba-artemis');
fs.mkdirSync(OUT_DIR, { recursive: true });

const EARTH_RADIUS_M = 6378137;
const RAD = Math.PI / 180;
const ORIGIN = [-47.8055, -22.6708]; // [longitude, latitude]
const MPER_LON = RAD * EARTH_RADIUS_M * Math.cos(ORIGIN[1] * RAD); // meters per degree longitude at origin
const MPER_LAT = RAD * EARTH_RADIUS_M; // meters per degree latitude
// Same projection as shared/lab-telemetry.js toLocalCoordinate (x=east, north-positive y here for convenience).
function toLonLat(xEast, yNorth) {
  return [ORIGIN[0] + xEast / MPER_LON, ORIGIN[1] + yNorth / MPER_LAT];
}
function toLocalXY([lon, lat]) {
  return [(lon - ORIGIN[0]) * MPER_LON, (lat - ORIGIN[1]) * MPER_LAT];
}

// ---------- 1. Água: monta o MultiPolygon a partir da relação OSM 2708872 ----------
const warnings = [];
const osm = JSON.parse(fs.readFileSync(OSM_SOURCE, 'utf8'));
const nodesById = new Map();
const waysById = new Map();
for (const el of osm.elements) {
  if (el.type === 'node') nodesById.set(el.id, [el.lon, el.lat]);
}
for (const el of osm.elements) {
  if (el.type === 'way') waysById.set(el.id, { nodeIds: el.nodes, coords: el.nodes.map(id => nodesById.get(id)) });
}
const relation = osm.elements.find(el => el.type === 'relation');
if (!relation) throw new Error('Relação OSM não encontrada na fonte.');
const outerRefs = relation.members.filter(m => m.type === 'way' && m.role === 'outer').map(m => m.ref);
const innerRefs = relation.members.filter(m => m.type === 'way' && m.role === 'inner').map(m => m.ref);

// Encadeia ways pelos ids de nós; anel fecha quando o último nó == primeiro. Não inventa ponto.
function chainRing(refs, label) {
  const pool = refs.map(id => waysById.get(id));
  if (!pool.length) return null;
  let nodeIds = pool[0].nodeIds.slice();
  let coords = pool[0].coords.slice();
  const used = new Set([0]);
  let changed = true;
  while (changed && used.size < pool.length) {
    changed = false;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      const cand = pool[i];
      const tail = nodeIds[nodeIds.length - 1];
      const cFirst = cand.nodeIds[0], cLast = cand.nodeIds[cand.nodeIds.length - 1];
      if (cFirst === tail) { nodeIds = nodeIds.concat(cand.nodeIds.slice(1)); coords = coords.concat(cand.coords.slice(1)); used.add(i); changed = true; }
      else if (cLast === tail) { nodeIds = nodeIds.concat(cand.nodeIds.slice(0, -1).reverse()); coords = coords.concat(cand.coords.slice(0, -1).reverse()); used.add(i); changed = true; }
    }
  }
  const closed = nodeIds[0] === nodeIds[nodeIds.length - 1];
  const complete = closed && used.size === pool.length;
  if (!complete) warnings.push(`Anel ${label} não fechou (${used.size}/${pool.length} ways conectados pelos ids de nós); nenhum ponto foi inventado.`);
  return { coords, closed: complete };
}
const outerRing = chainRing(outerRefs, 'exterior da água (outer)');
const innerRing = chainRing(innerRefs, 'ilha interna da água (inner)');
const waterRingsForGeometry = [outerRing, innerRing].filter(r => r && r.closed).map(r => r.coords);
if (!outerRing?.closed) throw new Error('Anel externo da água não fechou; verifique a fonte OSM.');
const waterGeometry = { type: 'Polygon', coordinates: waterRingsForGeometry };
// Ring used for distance calculations while designing the fictitious features (outer boundary only).
const waterOuterLocal = outerRing.coords.map(toLocalXY);

// ---------- 2. Feições fictícias (talhão de cana, way 201798960, bbox no CONTEXTO.md) ----------
function rectRing(x1, y1, x2, y2) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]].map(([x, y]) => toLonLat(x, y));
}
// property_boundary 600x400 m; lado sul a ~25 m da margem do rio (verificado por medição na fonte OSM).
const PROPERTY = { sw: [-130, 98], ne: [470, 498] };
// allowed_area menor, faixa de ~15 m fora do allowed junto ao rio (inset uniforme).
const ALLOWED = { sw: [PROPERTY.sw[0] + 15, PROPERTY.sw[1] + 15], ne: [PROPERTY.ne[0] - 15, PROPERTY.ne[1] - 15] };
// hazard/slope 80x60 m dentro do allowed_area, afastado do rio (lado norte).
const HAZARD = { sw: [210, 350], ne: [290, 410] };

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function distanceToWaterOuter([x, y]) {
  let best = Infinity;
  for (let i = 1; i < waterOuterLocal.length; i++) best = Math.min(best, segmentDistance([x, y], waterOuterLocal[i - 1], waterOuterLocal[i]));
  return best;
}
const propertySouthDistance = distanceToWaterOuter(PROPERTY.sw);
const hazardDistance = distanceToWaterOuter([(HAZARD.sw[0] + HAZARD.ne[0]) / 2, (HAZARD.sw[1] + HAZARD.ne[1]) / 2]);

// ---------- 3. mapa.geojson ----------
const mapaGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'rio-piracicaba', role: 'water', source: 'OpenStreetMap relation 2708872, ODbL, consulta 2026-09-11' },
      geometry: waterGeometry,
    },
    {
      type: 'Feature',
      properties: { id: 'propriedade-artemis-demo', role: 'property_boundary', synthetic: true, note: 'Limite de propriedade fictício, demonstração. Desenhado sobre o talhão de cana way OSM 201798960; não representa cadastro real.' },
      geometry: { type: 'Polygon', coordinates: [rectRing(PROPERTY.sw[0], PROPERTY.sw[1], PROPERTY.ne[0], PROPERTY.ne[1])] },
    },
    {
      type: 'Feature',
      properties: { id: 'area-permitida-artemis-demo', role: 'allowed_area', synthetic: true, note: 'Área permitida fictícia, demonstração. Menor que o limite de propriedade; mantém faixa de segurança operacional junto ao rio.' },
      geometry: { type: 'Polygon', coordinates: [rectRing(ALLOWED.sw[0], ALLOWED.sw[1], ALLOWED.ne[0], ALLOWED.ne[1])] },
    },
    {
      type: 'Feature',
      properties: { id: 'declive-01', role: 'hazard', category: 'slope', source: 'Polígono fictício de demonstração; sem levantamento de campo.', synthetic: true, note: 'Declive acentuado fictício, demonstração. Não representa relevo medido.' },
      geometry: { type: 'Polygon', coordinates: [rectRing(HAZARD.sw[0], HAZARD.sw[1], HAZARD.ne[0], HAZARD.ne[1])] },
    },
  ],
};

// ---------- 4. Percurso do CSV 01 (colheita normal, 10 min a 10 Hz, 6001 amostras) ----------
const HZ = 10;
const SPEED_KMH = 6;
const SPEED_MS = SPEED_KMH / 3.6;

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}
// Resample a polyline at constant speed into N samples covering exactly durationS seconds.
function resamplePolyline(points, durationS) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = distances[distances.length - 1];
  const targetTotal = SPEED_MS * durationS;
  if (total < targetTotal - 0.5) throw new Error(`Percurso curto demais: ${total.toFixed(1)} m < ${targetTotal.toFixed(1)} m necessários.`);
  const n = Math.round(durationS * HZ) + 1;
  const out = [];
  let segment = 1;
  for (let i = 0; i < n; i++) {
    const d = Math.min(targetTotal, SPEED_MS * (i / HZ));
    while (segment < distances.length - 1 && distances[segment] < d) segment++;
    const segStart = distances[segment - 1], segEnd = distances[segment];
    const t = segEnd > segStart ? (d - segStart) / (segEnd - segStart) : 0;
    const [x1, y1] = points[segment - 1], [x2, y2] = points[segment];
    out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
  }
  return out;
}
// Approach subpath: touches the water twice at ~8 m (elevada, não crítica).
// Pontos ficam alguns metros dentro da borda do allowed_area (não exatamente sobre ela) para que
// o arredondamento de latitude/longitude (8 casas decimais) não empurre a amostra para fora por ruído de ponto flutuante.
const APPROACH_A = [-100, 127];
const APPROACH_B = [-20, 116];
const approachPath = [
  [-100, 450], [-100, 300], APPROACH_A, [-100, 300],
  [-20, 300], APPROACH_B, [-20, 300], [100, 300],
];
const approach1 = distanceToWaterOuter(APPROACH_A);
const approach2 = distanceToWaterOuter(APPROACH_B);
// Padding: boustrophedon sweep on safe rows, appended until the total path reaches 1000 m (600 s @ 6 km/h).
const SAFE_ROWS = [450, 400, 350, 250, 200, 150];
const targetTotalM = SPEED_MS * 600;
let remaining = targetTotalM - polylineLength(approachPath);
const padding = [];
let cursor = approachPath[approachPath.length - 1];
let rowIndex = 0;
let goingEast = cursor[0] < 150;
while (remaining > 0.01) {
  const y = SAFE_ROWS[rowIndex % SAFE_ROWS.length];
  const targetX = goingEast ? 400 : -100;
  const step = [targetX, y];
  const segLen = Math.hypot(step[0] - cursor[0], step[1] - cursor[1]);
  if (segLen <= remaining) {
    padding.push(step);
    remaining -= segLen;
    cursor = step;
    goingEast = !goingEast;
    rowIndex++;
  } else {
    const t = remaining / segLen;
    const stop = [cursor[0] + (step[0] - cursor[0]) * t, cursor[1] + (step[1] - cursor[1]) * t];
    padding.push(stop);
    remaining = 0;
  }
}
const route01Points = approachPath.concat(padding);
const path01 = resamplePolyline(route01Points, 600);

// Deterministic small attitude noise (no RNG needed): bounded well under ±2°.
function noise(i, amp, period, phase = 0) { return Math.round(amp * Math.sin(i / period + phase) * 1000) / 1000; }

// GNSS gap: 5 s in the middle of the trip (samples 2998..3047 => t=299.8s..304.7s).
const GAP_START = Math.round(300 * HZ) - 2;
const GAP_SAMPLES = 5 * HZ;

function buildSample01(i) {
  const [xNow, yNow] = path01[i];
  const [xPrev, yPrev] = path01[Math.max(0, i - 1)];
  const dx = xNow - xPrev, dy = yNow - yPrev;
  const heading = Math.hypot(dx, dy) > 1e-6 ? (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 : null;
  const [lon, lat] = toLonLat(xNow, yNow);
  const inGap = i >= GAP_START && i < GAP_START + GAP_SAMPLES;
  const t = new Date(Date.UTC(2026, 8, 11, 9, 0, 0) + i * 100).toISOString();
  return {
    timestamp: t, machine_id: 'COLH-DEMO-01', synthetic: 'true',
    latitude_deg: inGap ? '' : lat.toFixed(8), longitude_deg: inGap ? '' : lon.toFixed(8),
    gnss_fix: inGap ? 'no_fix' : '3d',
    gnss_horizontal_accuracy_m: inGap ? '' : '1.5',
    ground_speed_kmh: inGap ? '' : SPEED_KMH.toFixed(3),
    heading_deg: (heading ?? 90).toFixed(2),
    roll_deg: noise(i, 1.8, 53).toFixed(3),
    pitch_deg: noise(i, 1.2, 71, 1).toFixed(3),
    yaw_rate_deg_s: '0.000',
    engine_rpm: Math.round(1850 + 30 * Math.sin(i / 130)),
    engine_load_pct: (62 + 4 * Math.sin(i / 210)).toFixed(2),
    coolant_temp_c: (86 + 0.5 * Math.sin(i / 400)).toFixed(2),
    oil_pressure_kpa: (420 + 3 * Math.sin(i / 300)).toFixed(2),
    fuel_rate_l_h: (18 + 0.6 * Math.sin(i / 260)).toFixed(3),
    battery_voltage_v: (14.2 + 0.03 * Math.sin(i / 500)).toFixed(2),
    ambient_temp_c: (27 + 0.3 * Math.sin(i / 900)).toFixed(2),
    relative_humidity_pct: (58 + 1 * Math.sin(i / 900)).toFixed(2),
    brake_pressed: 'false', pto_engaged: 'true', coolant_warning_active: 'false',
  };
}

// ---------- 5. Percurso do CSV 02 (declive e tombamento, 4 min a 10 Hz, 2401 amostras) ----------
const ENTRY_S = 120; // entra no declive aos 2 min
const RAMP_S = 4;
const START02 = [10, 380];
const ENTRY02 = [210, 380];
function sample02Position(t) {
  if (t <= ENTRY_S) {
    const x = START02[0] + SPEED_MS * t;
    return [x, START02[1]];
  }
  const s = Math.min(t - ENTRY_S, RAMP_S);
  const x = ENTRY02[0] + SPEED_MS * (s - (s * s) / (2 * RAMP_S));
  return [x, ENTRY02[1]];
}
function sample02Kinematics(t) {
  if (t < ENTRY_S) return { speed: SPEED_KMH, roll: 4 + noise(Math.round(t * HZ), 0.3, 53) };
  if (t < ENTRY_S + RAMP_S) {
    const frac = (t - ENTRY_S) / RAMP_S;
    return { speed: SPEED_KMH * (1 - frac), roll: 4 + (82 - 4) * frac };
  }
  return { speed: 0, roll: 82 + noise(Math.round(t * HZ), 0.3, 53) };
}
const N02 = Math.round(240 * HZ) + 1;
function buildSample02(i) {
  const t = i / HZ;
  const [x, y] = sample02Position(t);
  const { speed, roll } = sample02Kinematics(t);
  const [lon, lat] = toLonLat(x, y);
  const timestamp = new Date(Date.UTC(2026, 8, 11, 10, 0, 0) + i * 100).toISOString();
  const inclination = roll >= 25;
  return {
    timestamp, machine_id: 'COLH-DEMO-01', synthetic: 'true',
    latitude_deg: lat.toFixed(8), longitude_deg: lon.toFixed(8), gnss_fix: '3d',
    gnss_horizontal_accuracy_m: '1.5', ground_speed_kmh: Math.max(0, speed).toFixed(3),
    heading_deg: '90.00',
    roll_deg: roll.toFixed(3), pitch_deg: noise(i, 1.0, 71, 1).toFixed(3), yaw_rate_deg_s: '0.000',
    engine_rpm: Math.round(1850 + 30 * Math.sin(i / 130)),
    engine_load_pct: (62 + 4 * Math.sin(i / 210)).toFixed(2),
    coolant_temp_c: (86 + 0.5 * Math.sin(i / 400)).toFixed(2),
    oil_pressure_kpa: (420 + 3 * Math.sin(i / 300)).toFixed(2),
    fuel_rate_l_h: (18 + 0.6 * Math.sin(i / 260)).toFixed(3),
    battery_voltage_v: (14.2 + 0.03 * Math.sin(i / 500)).toFixed(2),
    ambient_temp_c: (27 + 0.3 * Math.sin(i / 900)).toFixed(2),
    relative_humidity_pct: (58 + 1 * Math.sin(i / 900)).toFixed(2),
    brake_pressed: 'false', pto_engaged: 'true', coolant_warning_active: 'false',
    inclination_warning_active: String(inclination),
  };
}

// ---------- 6. Escreve CSVs ----------
const COLUMNS_01 = ['timestamp', 'machine_id', 'synthetic', 'latitude_deg', 'longitude_deg', 'gnss_fix', 'gnss_horizontal_accuracy_m',
  'ground_speed_kmh', 'heading_deg', 'roll_deg', 'pitch_deg', 'yaw_rate_deg_s', 'engine_rpm', 'engine_load_pct', 'coolant_temp_c',
  'oil_pressure_kpa', 'fuel_rate_l_h', 'battery_voltage_v', 'ambient_temp_c', 'relative_humidity_pct', 'brake_pressed', 'pto_engaged', 'coolant_warning_active'];
const COLUMNS_02 = COLUMNS_01.concat(['inclination_warning_active']);

function toCsv(columns, rows) {
  return columns.join(',') + '\n' + rows.map(row => columns.map(c => row[c]).join(',')).join('\n') + '\n';
}
const rows01 = Array.from({ length: path01.length }, (_, i) => buildSample01(i));
const csv01 = toCsv(COLUMNS_01, rows01);
const rows02 = Array.from({ length: N02 }, (_, i) => buildSample02(i));
const csv02 = toCsv(COLUMNS_02, rows02);

fs.writeFileSync(path.join(OUT_DIR, 'mapa.geojson'), JSON.stringify(mapaGeoJson, null, 2) + '\n');
fs.writeFileSync(path.join(OUT_DIR, '01-colheita-normal.csv'), csv01);
fs.writeFileSync(path.join(OUT_DIR, '02-declive-tombamento.csv'), csv02);

function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }

// ---------- 7. manifest.json ----------
const manifest = {
  version: '1.0',
  coordinate_reference: 'WGS84 / GeoJSON longitude,latitude',
  local_origin: ORIGIN,
  synthetic: true,
  site: {
    id: 'piracicaba-artemis-demo-v1',
    name: 'Piracicaba · Artemis (demonstração)',
    location: 'Piracicaba/SP, Brasil',
    boundary_kind: 'Limite de propriedade e área permitida fictícios, desenhados sobre o talhão de cana (way OSM 201798960, landuse=farmland, crop=sugarcane).',
    water_coverage: 'Superfície do rio Piracicaba conforme relação OSM 2708872 (multipolygon completo: 7 ways externos encadeados e a ilha interna), sem simplificação.',
    vector_attribution: '© OpenStreetMap contributors, ODbL',
    retrieved_at: '2026-09-11',
  },
  map_warning: 'Água conforme OpenStreetMap (ODbL); limite de propriedade, área permitida e declive são fictícios, desenhados sobre o talhão de cana para fins de demonstração. Não representam cadastro real nem levantamento de campo.',
  machine: { id: 'COLH-DEMO-01', model: 'Colheitadeira (demonstração)' },
  export_rate_hz: 10,
  rules: {
    water_warning_distance_m: 35,
    hazards: [
      {
        role: 'water', label: 'Água mapeada (OSM)',
        bands_m: [
          { id: 'critica', label: 'Proximidade crítica', max_m: 5 },
          { id: 'elevada', label: 'Proximidade elevada', max_m: 15 },
          { id: 'atencao', label: 'Atenção', max_m: 35 },
        ],
        justification: 'Valores de demonstração; não são distâncias de segurança calibradas.',
      },
      {
        role: 'hazard', category: 'slope', label: 'Declive acentuado',
        bands_m: [
          { id: 'dentro', label: 'Dentro do declive', max_m: 0 },
          { id: 'borda', label: 'Borda do declive', max_m: 10 },
        ],
        justification: 'Polígono fictício para demonstração.',
      },
    ],
  },
  provenance: 'Água: OpenStreetMap, relação 2708872, consultada em 2026-09-11 via api.openstreetmap.org, licença ODbL, atribuição obrigatória. Limite de propriedade, área permitida, declive e percurso: fictícios, gerados por scripts/generate-piracicaba-dataset.mjs para demonstração, sem correspondência com uma fazenda real.',
  files: [
    { file: '01-colheita-normal.csv', samples: rows01.length, sha256: sha256(path.join(OUT_DIR, '01-colheita-normal.csv')) },
    { file: '02-declive-tombamento.csv', samples: rows02.length, sha256: sha256(path.join(OUT_DIR, '02-declive-tombamento.csv')) },
  ],
};
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ---------- 8. eventos-esperados.json: roda parseLabCase de verdade ----------
const { parseLabCase } = await import(pathToFileURL(path.join(ROOT, 'shared', 'lab-telemetry.js')));
// Todos os eventos do motor atual (inclui hazard_band); server/piracicaba-dataset.test.js compara com o arquivo gerado.
const ALLOWED_TYPES = null;
let manifestForParsing = manifest;
let hazardsDropped = false;
function expectedEventsFor(fileName, rawCsv) {
  try {
    const labCase = parseLabCase(rawCsv, { fileName, manifest: manifestForParsing, map: mapaGeoJson });
    return { events: labCase.events, warnings: labCase.warnings };
  } catch (err) {
    if (manifestForParsing === manifest) {
      hazardsDropped = true;
      const { rules: { hazards, ...restRules }, ...restManifest } = manifest;
      manifestForParsing = { ...restManifest, rules: restRules };
      warnings.push(`parseLabCase rejeitou rules.hazards (${err.message}); revalidado com manifesto sem esse bloco.`);
      return expectedEventsFor(fileName, rawCsv);
    }
    throw err;
  }
}
const eventosEsperados = {};
const parseWarningsByFile = {};
for (const [fileName, rawCsv] of [['01-colheita-normal.csv', csv01], ['02-declive-tombamento.csv', csv02]]) {
  const { events, warnings: caseWarnings } = expectedEventsFor(fileName, rawCsv);
  eventosEsperados[fileName] = events.filter(e => !ALLOWED_TYPES || ALLOWED_TYPES.has(e.type)).map(e => ({ type: e.type, transition: e.transition, elapsedMs: e.elapsedMs }));
  parseWarningsByFile[fileName] = caseWarnings;
}
fs.writeFileSync(path.join(OUT_DIR, 'eventos-esperados.json'), JSON.stringify(eventosEsperados, null, 2) + '\n');

// ---------- 9. README.md ----------
const readme = `# Piracicaba · Artemis (demonstração)

## O que é real
A superfície do rio Piracicaba vem da [relação OSM 2708872](https://www.openstreetmap.org/relation/2708872)
(\`natural=water\`, \`water=river\`), consultada em 2026-09-11 via \`api.openstreetmap.org\`, licença
[ODbL](https://www.openstreetmap.org/copyright) — © OpenStreetMap contributors. O MultiPolygon foi montado
encadeando os 7 ways externos e a ilha interna pelos ids de nós, sem simplificar nem inventar pontos.
O talhão de cana usado como referência é o way OSM 201798960 (\`landuse=farmland\`, \`crop=sugarcane\`).

## O que é fictício
Limite de propriedade, área permitida, o polígono de declive (\`hazard/slope\`, \`declive-01\`) e o percurso das
duas colheitas são inventados para demonstração; não representam uma fazenda, propriedade ou evento reais.
Toda feição fictícia traz \`properties.synthetic: true\` e uma nota em português.

## Como foi gerado
\`node scripts/generate-piracicaba-dataset.mjs\` — determinístico (sem \`Math.random\`, sem relógio do sistema
na geometria; ruído de atitude vem de senos com fase fixa), lê a fonte OSM bruta e escreve todo o conteúdo
desta pasta. Duas execuções produzem os mesmos bytes.

## Licença
Água: ODbL (OpenStreetMap contributors). Demais arquivos desta pasta: mesma licença do repositório LUCA-AI.

## Aviso
Os valores de \`rules.hazards\` (5/15/35 m para água; 0/10 m para declive) são exemplos de demonstração,
não distâncias de segurança calibradas para operação real.
`;
fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme);

// ---------- 10. Resumo determinístico ----------
const files = fs.readdirSync(OUT_DIR).sort();
const summary = {
  directory: path.relative(ROOT, OUT_DIR),
  files: files.map(name => {
    const p = path.join(OUT_DIR, name);
    return { file: name, bytes: fs.statSync(p).size, sha256: sha256(p) };
  }),
  samples: { '01-colheita-normal.csv': rows01.length, '02-declive-tombamento.csv': rows02.length },
  events: Object.fromEntries(Object.entries(eventosEsperados).map(([k, v]) => [k, v.length])),
  water: { outerClosed: outerRing.closed, innerClosed: innerRing?.closed ?? false, outerWays: outerRefs.length, innerWays: innerRefs.length },
  distances_m: {
    propertySouthEdgeToWater: Number(propertySouthDistance.toFixed(1)),
    approach1ToWater: Number(approach1.toFixed(1)),
    approach2ToWater: Number(approach2.toFixed(1)),
    hazardCenterToWater: Number(hazardDistance.toFixed(1)),
  },
  hazardsDroppedForValidation: hazardsDropped,
  warnings,
  parseWarningsByFile,
};
console.log(JSON.stringify(summary, null, 2));
