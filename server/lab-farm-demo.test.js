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
