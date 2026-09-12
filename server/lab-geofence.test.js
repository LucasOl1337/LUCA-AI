import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { classifyBand, resolveHazards, computeGeofenceEpisodes, affectedArea } from '../shared/lab-geofence.js';
import { parseLabCase } from '../shared/lab-telemetry.js';

const dataset = new URL('../datasets/laboratorio-virtual-v1/', import.meta.url);
const read = file => readFileSync(new URL(file, dataset), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const map = JSON.parse(read('mapa.geojson'));
const source = read('02-cerca-e-agua.csv');

// Geometria em metros locais (x para leste, z para sul), sem passar pelo CSV: distâncias exatas.
const rect = (id, role, x0, x1, z0, z1, extra = {}) => ({ id, role, rings: [[{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 }]], ...extra });
const allowed = rect('fence', 'allowed_area', 0, 100, 0, 100);
const water = rect('lago', 'water', 120, 220, -50, 150);          // 20 m à direita do lado x = 100
const slope = rect('declive', 'hazard', 0, 30, 0, 100, { category: 'slope' });
const bands = [{ id: 'critica', label: 'Proximidade crítica', max_m: 5 }, { id: 'elevada', label: 'Proximidade elevada', max_m: 15 }, { id: 'atencao', label: 'Atenção', max_m: 35 }];
const rules = {
  water_warning_distance_m: 35,
  hazards: [
    { role: 'water', label: 'Água mapeada', bands_m: bands },
    { role: 'hazard', category: 'slope', label: 'Declive', bands_m: [{ id: 'dentro', label: 'Dentro', max_m: 0 }, { id: 'borda', label: 'Borda', max_m: 10 }] },
  ],
};
// Amostras a 1 s: x numérico = posição com GNSS; null = sem fix.
const samplesAt = xs => xs.map((x, i) => ({
  elapsedMs: i * 1000, timestamp: new Date(Date.UTC(2026, 8, 9, 12, 0, i)).toISOString(),
  gnss_fix: x === null ? 'no_fix' : '3d', x, z: x === null ? null : 50, latitude_deg: null, longitude_deg: null,
}));

test('classifyBand: borda inclusiva, faixa mais interna, ordenação por max_m', () => {
  assert.equal(classifyBand(0, bands).id, 'critica');
  assert.equal(classifyBand(5, bands).id, 'critica');
  assert.equal(classifyBand(5.001, bands).id, 'elevada');
  assert.equal(classifyBand(35, bands).id, 'atencao');
  assert.equal(classifyBand(35.001, bands), null);
  assert.equal(classifyBand(Infinity, bands), null);
});

test('resolveHazards deriva uma faixa única de water_warning_distance_m sem hazards e ignora polígonos de outro papel', () => {
  const derived = resolveHazards({ water_warning_distance_m: 20 }, [allowed, water, slope]);
  assert.deepEqual(derived.map(h => [h.key, h.bands.map(b => b.max_m)]), [['water:lago', [20]]]);
  const explicit = resolveHazards(rules, [allowed, water, slope]);
  assert.deepEqual(explicit.map(h => h.key), ['water:lago', 'hazard:slope:declive']);
  assert.deepEqual(resolveHazards(rules, [allowed]).warnings.length, 2);
});

test('episódio: borda inclusiva (distância == max_m) e mudança de faixa fecha e abre no mesmo instante', () => {
  const { summary, events } = computeGeofenceEpisodes(samplesAt([50, 85, 85, 115, 115, 50]), [allowed, water], rules, 'c');
  assert.deepEqual(summary.episodes.map(e => [e.bandId, e.startMs, e.endMs, e.observedMs, e.gapMs, e.minDistanceM, e.sampleCount, e.quality]), [
    ['atencao', 1000, 3000, 2000, 0, 35, 2, 'observado'],
    ['critica', 3000, 5000, 2000, 0, 5, 2, 'observado'],
  ]);
  assert.deepEqual(events.map(e => [e.type, e.transition, e.elapsedMs, e.evidence.band, e.evidence.distance_m, e.evidence.threshold_m]), [
    ['hazard_band', 'start', 1000, 'atencao', 35, 35],
    ['hazard_band', 'end', 3000, 'atencao', 5, 35],
    ['hazard_band', 'start', 3000, 'critica', 5, 5],
    ['hazard_band', 'end', 5000, 'critica', 70, 5],
  ]);
  assert.equal(events[0].id, 'c:geo:water:lago:atencao:1000:start');
  for (const e of events) assert.doesNotMatch(`${e.title} ${e.description}`, /seguro|acidente/i);
});

test('dois perigos são independentes: episódios simultâneos não se fundem', () => {
  const { summary } = computeGeofenceEpisodes(samplesAt([15, 15, 90]), [allowed, water, slope], rules, 'c');
  assert.deepEqual(summary.episodes.map(e => [e.hazardKey, e.bandId, e.startMs, e.endMs]), [
    ['water:lago', 'atencao', 2000, null],
    ['hazard:slope:declive', 'dentro', 0, 2000],
  ]);
});

test('lacuna de GNSS não abre nem fecha episódio, conta em gapMs e fica fora de observedMs', () => {
  const { summary } = computeGeofenceEpisodes(samplesAt([90, null, null, 90, 50]), [allowed, water], rules, 'c');
  assert.deepEqual(summary.episodes.map(e => [e.startMs, e.endMs, e.observedMs, e.gapMs, e.sampleCount, e.quality]), [[0, 4000, 1000, 3000, 2, 'com-lacuna']]);
  const openInGap = computeGeofenceEpisodes(samplesAt([90, null]), [allowed, water], rules, 'c').summary.episodes[0];
  assert.deepEqual([openInGap.endMs, openInGap.gapMs, openInGap.quality], [null, 1000, 'aberto-no-fim']);
});

test('episódio aberto no fim mantém endMs null e não gera evento de saída', () => {
  const { summary, events } = computeGeofenceEpisodes(samplesAt([50, 100, 100]), [allowed, water], rules, 'c');
  assert.deepEqual(summary.episodes.map(e => [e.endMs, e.observedMs, e.quality]), [[null, 1000, 'aberto-no-fim']]);
  assert.deepEqual(events.map(e => e.transition), ['start']);
});

test('sem hazards: eventos antigos intactos, near_water presente e a faixa derivada coincide com ele', () => {
  const labCase = parseLabCase(source, { fileName: '02-cerca-e-agua.csv', manifest, map });
  const nearWater = labCase.events.filter(e => e.type === 'near_water');
  assert.ok(nearWater.length >= 2);
  assert.equal(labCase.events.some(e => e.type === 'hazard_band'), false);
  const pairs = nearWater.filter(e => e.transition === 'start').map((start, i) => [20, start.elapsedMs, nearWater.filter(e => e.transition === 'end')[i]?.elapsedMs ?? null]);
  assert.deepEqual(labCase.geofence.episodes.map(e => [e.bandMaxM, e.startMs, e.endMs]), pairs);
  assert.equal(typeof labCase.geofence.rulesVersion, 'string');
  assert.equal(labCase.geofence.affectedArea[0].method, 'grade 2 m');
});

test('com hazards de água: near_water não é duplicado e a faixa externa reproduz o instante do evento antigo', () => {
  const before = parseLabCase(source, { fileName: '02-cerca-e-agua.csv', manifest, map }).events.filter(e => e.type === 'near_water');
  const withBands = { ...manifest, rules: { ...manifest.rules, hazards: [{ role: 'water', label: 'Água', bands_m: [{ id: 'perto', label: 'Perto', max_m: 5 }, { id: 'aviso', label: 'Aviso', max_m: 20 }] }] } };
  const labCase = parseLabCase(source, { fileName: '02-cerca-e-agua.csv', manifest: withBands, map });
  assert.equal(labCase.events.some(e => e.type === 'near_water'), false);
  const outer = labCase.events.filter(e => e.type === 'hazard_band' && e.evidence.band === 'aviso');
  // A faixa externa pode fechar e reabrir ao entrar na interna; o primeiro início e o último fim coincidem com near_water.
  assert.deepEqual([[outer[0].transition, outer[0].elapsedMs], [outer.at(-1).transition, outer.at(-1).elapsedMs]], [['start', before[0].elapsedMs], ['end', before.at(-1).elapsedMs]]);
  assert.ok(labCase.events.every((e, i) => !i || e.elapsedMs >= labCase.events[i - 1].elapsedMs));
  assert.equal(outer[0].title, 'Entrada em faixa de proximidade');
  assert.notEqual(labCase.geofence.rulesVersion, parseLabCase(source, { fileName: '02-cerca-e-agua.csv', manifest, map }).geofence.rulesVersion);
});

test('determinismo: dois parses do mesmo CSV e manifesto são idênticos', () => {
  const options = { fileName: '02-cerca-e-agua.csv', manifest: { ...manifest, rules: { ...manifest.rules, hazards: [{ role: 'water', bands_m: [{ id: 'aviso', max_m: 20 }] }] } }, map };
  assert.deepStrictEqual(parseLabCase(source, options), parseLabCase(source, options));
});

test('affectedArea: quadrado de 100 m com água a 20 m do lado, dentro de ±3 % do analítico e sem dupla contagem', () => {
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 0.03 * expected, `${actual} vs ${expected}`);
  const twoBands = { hazards: [{ role: 'water', bands_m: [{ id: 'a', max_m: 30 }, { id: 'b', max_m: 60 }] }] };
  const areas = affectedArea([allowed, water], resolveHazards(twoBands, [allowed, water]));
  near(areas[0].areaM2, 1000); near(areas[0].shareOfAllowed, 0.10);   // faixa 30 m: x ∈ [90, 100]
  near(areas[1].areaM2, 3000); near(areas[1].shareOfAllowed, 0.30);   // faixa 60 m: x ∈ [60, 90], sem a faixa interna
  assert.equal(areas[0].method, 'grade 2 m');
  const fine = affectedArea([allowed, water], resolveHazards({ water_warning_distance_m: 35 }, [allowed, water]), 1);
  near(fine[0].areaM2, 1500);
  assert.equal(fine[0].method, 'grade 1 m');
  assert.deepEqual(affectedArea([water], resolveHazards(twoBands, [water])), []);
});

test('manifesto rejeita hazards mal formados com mensagens legíveis', () => {
  const withRules = hazards => ({ ...manifest, rules: { ...manifest.rules, hazards } });
  const parse = hazards => parseLabCase(source, { fileName: '02-cerca-e-agua.csv', manifest: withRules(hazards), map });
  assert.throws(() => parse([{ role: 'water', bands_m: [{ id: 'b', max_m: 20 }, { id: 'a', max_m: 5 }] }]), /ordem crescente de max_m/);
  assert.throws(() => parse([{ role: 'water', bands_m: [{ id: 'a', max_m: 5 }, { id: 'a', max_m: 20 }] }]), /repetido/);
  assert.throws(() => parse([{ role: 'lava', bands_m: [{ id: 'a', max_m: 5 }] }]), /water ou hazard/);
  assert.throws(() => parse([{ role: 'hazard', bands_m: [{ id: 'a', max_m: 5 }] }]), /category/);
  assert.throws(() => parse([{ role: 'water', bands_m: [] }]), /pelo menos uma faixa/);
  assert.throws(() => parse([{ role: 'water', bands_m: [{ id: 'a', max_m: 35 }] }]), /water_warning_distance_m/);
  const hazardMap = { ...map, features: [...map.features, { type: 'Feature', properties: { id: 'd', role: 'hazard' }, geometry: map.features[0].geometry }] };
  assert.throws(() => parseLabCase(source, { manifest, map: hazardMap }), /properties\.category/);
});

test('perigos com id de polígono repetido ganham chaves distintas, aviso, e episódios independentes', () => {
  const twin = rect('lago', 'water', -60, -20, -50, 150); // mesmo id do lago, 20 m à esquerda do lado x = 0
  const hazards = resolveHazards({ hazards: [rules.hazards[0]] }, [allowed, water, twin]);
  assert.deepEqual(hazards.map(h => h.key), ['water:lago', 'water:lago#2']);
  assert.ok(hazards.warnings.some(w => /repetido/.test(w)));
  const { summary, events } = computeGeofenceEpisodes(samplesAt([10, 90]), [allowed, water, twin], { hazards: [rules.hazards[0]] }, 'c');
  assert.equal(new Set(events.map(e => e.id)).size, events.length);
  assert.deepEqual(new Set(summary.episodes.map(e => e.hazardKey)), new Set(['water:lago', 'water:lago#2']));
});

test('lacuna de gravação (sem amostras) conta em gapMs, não em observedMs, quando sampleIntervalMs é informado', () => {
  const samples = samplesAt([90, 90, 90, 90]).map((s, i) => ({ ...s, elapsedMs: [0, 1000, 6000, 7000][i] }));
  const { summary } = computeGeofenceEpisodes(samples, [allowed, water], { hazards: [rules.hazards[0]] }, 'c', 1000);
  assert.equal(summary.episodes.length, 1);
  assert.equal(summary.episodes[0].observedMs, 2000);
  assert.equal(summary.episodes[0].gapMs, 5000);
  assert.equal(summary.episodes[0].quality, 'aberto-no-fim');
});

test('grade sobrevive a mais de 128 faixas (Int16) e a área da faixa 129 é contada', () => {
  const polygons = [rect('rio', 'water', 0, 10, 0, 10), rect('permitida', 'allowed_area', 138, 140, 0, 2)];
  const many = { hazards: [{ role: 'water', bands_m: Array.from({ length: 130 }, (_, i) => ({ id: String(i), max_m: i })) }] };
  const areas = affectedArea(polygons, resolveHazards(many, polygons));
  assert.equal(areas.at(-1).areaM2, 4);
});

test('bandGrid por arestas coincide célula a célula com a distância exata, inclusive com ilha no polígono de água', async () => {
  const { polygonContains, polygonDistance } = await import('../shared/lab-telemetry.js');
  const lake = { id: 'lagoa', role: 'water', rings: [rect('', '', 120, 220, -50, 150).rings[0], rect('', '', 150, 190, 40, 60).rings[0]] };
  const field = rect('campo', 'allowed_area', 60, 200, 0, 100); // x 60–85 fica além dos 35 m: -1
  const hazards = resolveHazards({ hazards: [rules.hazards[0]] }, [field, lake]);
  const grid = affectedArea([field, lake], hazards) && (await import('../shared/lab-geofence.js')).bandGrid([field, lake], hazards, 2);
  const expected = [];
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    const point = { x: grid.minX + (col + 0.5) * grid.cellM, z: grid.minZ + (row + 0.5) * grid.cellM };
    expected.push(polygonContains(point, field) ? hazards[0].bands.indexOf(classifyBand(polygonDistance(point, lake), hazards[0].bands)) : -1);
  }
  assert.deepEqual(Array.from(grid.bands[0]), expected);
  assert.ok(expected.includes(0) && expected.includes(2) && expected.includes(-1), 'a fixture cobre dentro, faixa externa e ilha');
});
