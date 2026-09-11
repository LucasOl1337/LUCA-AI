// Faixas de proximidade por perigo: episódios, eventos hazard_band e área atingida.
// Roda no browser e no Node (parseLabCase é chamado nos dois), por isso sem node:crypto.
import { polygonDistance, polygonContains, hasPosition, hashText } from './lab-telemetry.js';

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
function hazardDistance(point, hazard) {
  const { box } = hazard;
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
  return Math.hypot(dx, dz) > hazard.reach ? Infinity : polygonDistance(point, hazard.polygon);
}

// Sem rules.hazards, uma faixa única reproduz water_warning_distance_m (comportamento da PR).
export function resolveHazards(rules, polygons) {
  const list = rules?.hazards ?? [{ role: 'water', label: 'Água mapeada', bands_m: [{ id: 'aviso', label: 'Aviso de proximidade', max_m: rules?.water_warning_distance_m ?? 20 }] }];
  const hazards = [], warnings = [];
  for (const rule of list) {
    const matches = polygons.filter(polygon => polygon.role === rule.role && (rule.role !== 'hazard' || polygon.category === rule.category));
    if (!matches.length && rules?.hazards) warnings.push(`Regra "${rule.label || rule.role}" sem polígono correspondente no mapa (${[rule.role, rule.category].filter(Boolean).join('/')}).`);
    for (const polygon of matches) {
      hazards.push({
        key: [rule.role, rule.category, polygon.id].filter(Boolean).join(':'),
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

export function computeGeofenceEpisodes(samples, polygons, rules, caseId) {
  const hazards = resolveHazards(rules, polygons);
  const episodes = [], events = [];
  for (const hazard of hazards) {
    let open = null, openBand = null;
    for (const [index, sample] of samples.entries()) {
      const gps = hasPosition(sample);
      if (open && index) {
        const dt = sample.elapsedMs - samples[index - 1].elapsedMs;
        if (gps && hasPosition(samples[index - 1])) open.observedMs += dt; else open.gapMs += dt;
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
  const summary = { episodes, affectedArea: affectedArea(polygons, hazards), rulesVersion: hashText(JSON.stringify(rules ?? {})), warnings: hazards.warnings };
  return { summary, events };
}

// A mesma grade que soma a área pinta as faixas na cena (regra 1 do SPEC). Só células dentro de allowed_area.
// bands[h][cell] = índice da faixa em hazards[h].bands, -1 = nenhuma; inside[cell] = 1 dentro da área permitida.
export function bandGrid(polygons, hazards, cellM = 2) {
  const allowed = polygons.filter(polygon => polygon.role === 'allowed_area');
  if (!allowed.length) return null;
  const boxes = allowed.map(boundingBox);
  const minX = Math.min(...boxes.map(b => b.minX)), minZ = Math.min(...boxes.map(b => b.minZ));
  const cols = Math.ceil((Math.max(...boxes.map(b => b.maxX)) - minX) / cellM), rows = Math.ceil((Math.max(...boxes.map(b => b.maxZ)) - minZ) / cellM);
  const inside = new Uint8Array(cols * rows);
  const bands = hazards.map(() => new Int8Array(cols * rows).fill(-1));
  // ponytail: O(células × arestas); se > 2 s, cellM = 4 e method registra
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const point = { x: minX + (col + 0.5) * cellM, z: minZ + (row + 0.5) * cellM };
    if (!allowed.some(polygon => polygonContains(point, polygon))) continue;
    const cell = row * cols + col;
    inside[cell] = 1;
    hazards.forEach((hazard, h) => { bands[h][cell] = hazard.bands.indexOf(classifyBand(hazardDistance(point, hazard), hazard.bands)); });
  }
  return { minX, minZ, cellM, cols, rows, inside, bands };
}

export function affectedArea(polygons, hazards, cellM = 2) {
  const grid = bandGrid(polygons, hazards, cellM);
  if (!grid) return [];
  const cellArea = cellM * cellM;
  const allowedM2 = grid.inside.reduce((sum, value) => sum + value, 0) * cellArea;
  return hazards.flatMap((hazard, h) => hazard.bands.map((band, b) => {
    let cells = 0;
    for (const value of grid.bands[h]) if (value === b) cells += 1; // Cada célula conta numa única faixa: sem dupla contagem.
    return { hazardKey: hazard.key, bandId: band.id, areaM2: cells * cellArea, shareOfAllowed: allowedM2 ? cells * cellArea / allowedM2 : 0, method: `grade ${cellM} m` };
  }));
}
