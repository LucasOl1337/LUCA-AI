import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createFarmDemo } from '../shared/lab-farm-demo.js';
import { parseLabSite, parseLabCase, getReplayFrame } from '../shared/lab-telemetry.js';
import { parseLabTerrain, createTerrainSampler } from '../shared/lab-terrain.js';
const read = name => JSON.parse(readFileSync(new URL(`../public/datasets/frying-pan-farm/${name}`, import.meta.url)));
test('truck demonstration reuses real terrain, stays explicitly synthetic and roundtrips through ordinary replay', { skip: existsSync(new URL('../public/datasets/frying-pan-farm/terrain-2022-5m.json', import.meta.url)) ? false : 'Pacote Fairfax local ausente (redistribuição restrita)' }, () => {
  const site = parseLabSite(read('manifest.json'), read('mapa.geojson'));
  const original = JSON.stringify(site);
  const demo = createFarmDemo(site);
  assert.equal(demo.durationMs, 90000);
  assert.equal(demo.samples.length, 901);
  assert.equal(demo.synthetic, true);
  assert.equal(demo.machineId, 'CAMINHAO-DEMO');
  assert.equal(JSON.stringify(site), original);
  const heightAt = createTerrainSampler(parseLabTerrain(read('terrain-2022-5m.json'), site.manifest.terrain), site.origin);
  for (const sample of demo.samples) {
    assert.equal(sample.synthetic, true);
    assert.equal(sample.engine_rpm, null);
    assert.notEqual(heightAt(sample.x, sample.z), null);
  }
  assert.notDeepEqual(getReplayFrame(demo, 0).position, getReplayFrame(demo, 30000).position);
  const restored = parseLabCase(demo.rawCsv, { manifest: demo.manifest, map: demo.map, fileName: demo.fileName });
  assert.deepEqual(restored.samples, demo.samples);
  assert.equal(restored.manifest.demo, 'farm-truck-v1');
  assert.throws(() => createFarmDemo({ ...site, manifest: {} }), /específica/);
});

// B2 (21/10/2026): o release público não tem Fairfax; a reserva publicada é Piracicaba · Artemis
// (rio OSM/ODbL + limites, declive e relevo fictícios). A demonstração passa a existir nela.
test('Piracicaba · Artemis oferece a demonstração do caminhão, explícita e determinística', () => {
  const readPira = name => JSON.parse(readFileSync(new URL(`../public/datasets/piracicaba-artemis/${name}`, import.meta.url)));
  const site = parseLabSite(readPira('manifest.json'), readPira('mapa.geojson'));
  assert.equal(site.manifest.synthetic, true);
  const demo = createFarmDemo(site);
  const again = createFarmDemo(site);
  assert.equal(demo.rawCsv, again.rawCsv);
  assert.equal(demo.durationMs, 90000);
  assert.equal(demo.synthetic, true);
  assert.equal(demo.machineId, 'CAMINHAO-DEMO');
  assert.equal(demo.manifest.demo, 'farm-truck-v1');
  assert.match(demo.manifest.provenance, /^DEMONSTRAÇÃO/);
  for (const sample of demo.samples) {
    assert.equal(sample.synthetic, true);
    assert.equal(sample.engine_rpm, null);
    assert.equal(sample.coolant_temp_c, null);
  }
  // Percurso dentro da área permitida fictícia e do relevo sintético publicado.
  const allowed = readPira('mapa.geojson').features.find(f => f.properties.role === 'allowed_area').geometry.coordinates[0];
  const [minX, maxX] = [Math.min(...allowed.map(p => p[0])), Math.max(...allowed.map(p => p[0]))];
  const [minY, maxY] = [Math.min(...allowed.map(p => p[1])), Math.max(...allowed.map(p => p[1]))];
  const heightAt = createTerrainSampler(parseLabTerrain(readPira('relevo-sintetico.json'), site.manifest.terrain), site.origin);
  for (const sample of demo.samples) {
    assert.ok(sample.longitude_deg > minX && sample.longitude_deg < maxX && sample.latitude_deg > minY && sample.latitude_deg < maxY);
    assert.notEqual(heightAt(sample.x, sample.z), null);
  }
  assert.notDeepEqual(getReplayFrame(demo, 0).position, getReplayFrame(demo, 30000).position);
  assert.ok(demo.events.every(event => event.type === 'hazard_band'), 'só o declive fictício gera alerta; sem evento de máquina inventado');
  assert.throws(() => createFarmDemo({ ...site, manifest: { ...site.manifest, site: { id: 'outra' } } }), /específica/);
});
