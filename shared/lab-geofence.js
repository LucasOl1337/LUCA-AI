// Faixas de proximidade por perigo: episódios, eventos hazard_band e área atingida.
// Roda no browser e no Node (parseLabCase é chamado nos dois), por isso sem node:crypto.
import { polygonDistance, segmentDistance, hasPosition, hashText } from './lab-telemetry.js';

// bands ordenadas por max_m crescente; a borda pertence à faixa; distância 0 = dentro do polígono.
export function classifyBand(distanceM, bands) {
  return bands.find(band => distanceM <= band.max_m) ?? null;
}

function boundingBox(polygon) {
  const box = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const { x, z } of polygon.rings[0]) {
    box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
    box.minZ = Math.min(box.minZ, z); box.maxZ = Math.max(box.maxZ, z);
  }
  return box;
}

// Limite inferior barato: fora do alcance da faixa mais externa não precisa medir as arestas.
// ponytail: O(arestas) por amostra (~2,5 s para 6 mil amostras contra o rio do OSM); índice espacial das arestas se incomodar.
function hazardDistance(point, hazard) {
  const { box } = hazard;
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
  return Math.hypot(dx, dz) > hazard.reach ? Infinity : polygonDistance(point, hazard.polygon);
}

// Sem rules.hazards, uma faixa única reproduz water_warning_distance_m (comportamento da PR).
export function resolveHazards(rules, polygons) {
  const list = rules?.hazards ?? [{ role: 'water', label: 'Água mapeada', bands_m: [{ id: 'aviso', label: 'Aviso de proximidade', max_m: rules?.water_warning_distance_m ?? 20 }] }];
  const hazards = [], warnings = [], keys = new Set();
  for (const rule of list) {
    const matches = polygons.filter(polygon => polygon.role === rule.role && (rule.role !== 'hazard' || polygon.category === rule.category));
    if (!matches.length && rules?.hazards) warnings.push(`Regra "${rule.label || rule.role}" sem polígono correspondente no mapa (${[rule.role, rule.category].filter(Boolean).join('/')}).`);
    for (const polygon of matches) {
      let key = [rule.role, rule.category, polygon.id].filter(Boolean).join(':');
      if (keys.has(key)) { // Dois polígonos com o mesmo id não podem disputar o mesmo episódio.
        let n = 2; while (keys.has(`${key}#${n}`)) n += 1;
        warnings.push(`Polígono "${polygon.id}" repetido no mapa; perigo registrado como ${key}#${n}.`);
        key = `${key}#${n}`;
      }
      keys.add(key);
      hazards.push({
        key,
        label: rule.label || polygon.id, justification: rule.justification ?? null,
        bands: rule.bands_m, reach: rule.bands_m.at(-1).max_m, polygon, box: boundingBox(polygon),
      });
    }
  }
  return Object.assign(hazards, { warnings });
}

function quality(episode) {
  return episode.endMs === null ? 'aberto-no-fim' : episode.gapMs > 0 ? 'com-lacuna' : 'observado';
}

function bandEvent(episode, hazard, band, sample, distance, transition) {
  const label = `"${band.label}" (até ${band.max_m} m)`;
  const shown = Number.isFinite(distance) ? `${distance.toFixed(1)} m` : 'indisponível';
  return {
    id: `${episode.id}:${transition}`, type: 'hazard_band', transition, elapsedMs: sample.elapsedMs, timestamp: sample.timestamp,
    title: transition === 'start' ? 'Entrada em faixa de proximidade' : 'Saída da faixa de proximidade',
    description: transition === 'start'
      ? `Distância horizontal calculada até ${hazard.label}: ${shown}; faixa ${label}. Isso não comprova contato com o perigo.`
      : `Distância horizontal calculada até ${hazard.label}: ${shown}; fora da faixa ${label}.`,
    evidence: {
      gnss_fix: sample.gnss_fix, latitude_deg: sample.latitude_deg, longitude_deg: sample.longitude_deg,
      hazard: hazard.key, hazard_label: hazard.label, band: band.id, band_label: band.label,
      distance_m: Number.isFinite(distance) ? distance : null, threshold_m: band.max_m,
    },
  };
}

// sampleIntervalMs: intervalo sem amostras acima de 1,5× o esperado é lacuna de gravação (mesma regra de getReplayFrame), não exposição.
export function computeGeofenceEpisodes(samples, polygons, rules, caseId, sampleIntervalMs = 0) {
  const hazards = resolveHazards(rules, polygons);
  const episodes = [], events = [];
  for (const hazard of hazards) {
    let open = null, openBand = null;
    for (const [index, sample] of samples.entries()) {
      const gps = hasPosition(sample);
      if (open && index) {
        const dt = sample.elapsedMs - samples[index - 1].elapsedMs;
        const recorded = !sampleIntervalMs || dt <= sampleIntervalMs * 1.5;
        if (gps && recorded && hasPosition(samples[index - 1])) open.observedMs += dt; else open.gapMs += dt;
      }
      if (!gps) continue; // Sem posição, sem faixa: não abre nem fecha episódio.
      const distance = hazardDistance(sample, hazard);
      const band = classifyBand(distance, hazard.bands);
      if (open && band?.id !== open.bandId) {
        open.endMs = sample.elapsedMs; open.quality = quality(open);
        events.push(bandEvent(open, hazard, openBand, sample, Number.isFinite(distance) ? distance : polygonDistance(sample, hazard.polygon), 'end'));
        open = null;
      }
      if (band && !open) {
        open = {
          id: `${caseId}:geo:${hazard.key}:${band.id}:${sample.elapsedMs}`, hazardKey: hazard.key, hazardLabel: hazard.label,
          bandId: band.id, bandLabel: band.label, bandMaxM: band.max_m, startMs: sample.elapsedMs, endMs: null,
          observedMs: 0, gapMs: 0, minDistanceM: distance, minDistanceAtMs: sample.elapsedMs, sampleCount: 0, quality: 'aberto-no-fim',
        };
        openBand = band;
        episodes.push(open);
        events.push(bandEvent(open, hazard, band, sample, distance, 'start'));
      }
      if (open) {
        open.sampleCount += 1; // Só amostras com posição dentro da faixa.
        if (distance < open.minDistanceM) { open.minDistanceM = distance; open.minDistanceAtMs = sample.elapsedMs; }
      }
    }
  }
  events.sort((a, b) => a.elapsedMs - b.elapsedMs);
  const grid = bandGrid(polygons, hazards); // Calculada uma vez; a cena reaproveita (regra 1 do SPEC).
  const summary = { episodes, affectedArea: areaFromGrid(grid, hazards), grid, rulesVersion: hashText(JSON.stringify(rules ?? {})), warnings: hazards.warnings };
  return { summary, events };
}

// Varredura por linhas (par-ímpar sobre todos os anéis, buracos inclusos): chama mark(cell) para cada célula cujo centro cai dentro.
function rasterize(polygon, grid, mark) {
  const { minX, minZ, cellM, cols, rows } = grid;
  const box = boundingBox(polygon);
  const rowStart = Math.max(0, Math.floor((box.minZ - minZ) / cellM)), rowEnd = Math.min(rows - 1, Math.ceil((box.maxZ - minZ) / cellM));
  for (let row = rowStart; row <= rowEnd; row++) {
    const zc = minZ + (row + 0.5) * cellM;
    const xs = [];
    for (const ring of polygon.rings) for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      if ((a.z > zc) !== (b.z > zc)) xs.push(a.x + (zc - a.z) * (b.x - a.x) / (b.z - a.z));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const colStart = Math.max(0, Math.ceil((xs[k] - minX) / cellM - 0.5)), colEnd = Math.min(cols - 1, Math.floor((xs[k + 1] - minX) / cellM - 0.5));
      for (let col = colStart; col <= colEnd; col++) mark(row * cols + col);
    }
  }
}

// A mesma grade que soma a área pinta as faixas na cena (regra 1 do SPEC). Só células dentro de allowed_area.
// bands[h][cell] = índice da faixa em hazards[h].bands, -1 = nenhuma; inside[cell] = 1 dentro da área permitida.
// Custo O(arestas × células no alcance), não O(células × arestas): o rio do OSM (1,9 mil arestas) cai de 15 s para dezenas de ms.
export function bandGrid(polygons, hazards, cellM = 2) {
  const allowed = polygons.filter(polygon => polygon.role === 'allowed_area');
  if (!allowed.length) return null;
  const boxes = allowed.map(boundingBox);
  const minX = Math.min(...boxes.map(b => b.minX)), minZ = Math.min(...boxes.map(b => b.minZ));
  const cols = Math.ceil((Math.max(...boxes.map(b => b.maxX)) - minX) / cellM), rows = Math.ceil((Math.max(...boxes.map(b => b.maxZ)) - minZ) / cellM);
  const grid = { minX, minZ, cellM, cols, rows, inside: new Uint8Array(cols * rows), bands: [] };
  for (const polygon of allowed) rasterize(polygon, grid, cell => { grid.inside[cell] = 1; });
  for (const hazard of hazards) {
    const { reach } = hazard;
    const distance = new Float64Array(cols * rows).fill(Infinity);
    rasterize(hazard.polygon, grid, cell => { distance[cell] = 0; }); // Dentro do perigo: distância 0.
    for (const ring of hazard.polygon.rings) for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const colStart = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach - minX) / cellM)), colEnd = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x) + reach - minX) / cellM));
      const rowStart = Math.max(0, Math.floor((Math.min(a.z, b.z) - reach - minZ) / cellM)), rowEnd = Math.min(rows - 1, Math.ceil((Math.max(a.z, b.z) + reach - minZ) / cellM));
      for (let row = rowStart; row <= rowEnd; row++) for (let col = colStart; col <= colEnd; col++) {
        const cell = row * cols + col;
        if (!grid.inside[cell] || distance[cell] === 0) continue;
        const d = segmentDistance({ x: minX + (col + 0.5) * cellM, z: minZ + (row + 0.5) * cellM }, a, b);
        if (d < distance[cell]) distance[cell] = d;
      }
    }
    const bands = new Int16Array(cols * rows).fill(-1); // Int16: validateManifest aceita mais de 128 faixas.
    for (let cell = 0; cell < bands.length; cell++) if (grid.inside[cell] && distance[cell] <= reach) bands[cell] = hazard.bands.indexOf(classifyBand(distance[cell], hazard.bands));
    grid.bands.push(bands);
  }
  return grid;
}

export function affectedArea(polygons, hazards, cellM = 2) {
  return areaFromGrid(bandGrid(polygons, hazards, cellM), hazards);
}

function areaFromGrid(grid, hazards) {
  if (!grid) return [];
  const { cellM } = grid;
  const cellArea = cellM * cellM;
  const allowedM2 = grid.inside.reduce((sum, value) => sum + value, 0) * cellArea;
  return hazards.flatMap((hazard, h) => hazard.bands.map((band, b) => {
    let cells = 0;
    for (const value of grid.bands[h]) if (value === b) cells += 1; // Cada célula conta numa única faixa: sem dupla contagem.
    return { hazardKey: hazard.key, bandId: band.id, areaM2: cells * cellArea, shareOfAllowed: allowedM2 ? cells * cellArea / allowedM2 : 0, method: `grade ${cellM} m` };
  }));
}
