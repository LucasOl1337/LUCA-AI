import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseLabTerrain, createTerrainSampler } from '../shared/lab-terrain.js';
import { parseLabSite, toLocalCoordinate } from '../shared/lab-telemetry.js';

const root = new URL('../public/datasets/frying-pan-farm/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const manifest = read('manifest.json');
const available = existsSync(new URL('terrain-2022-5m.json', root));
const map = existsSync(new URL('mapa.geojson', root)) ? read('mapa.geojson') : { type: 'FeatureCollection', features: [] };
const sample = { version: 1, crs: 'EPSG:4326', unit: 'm', registration: 'pixel-center', vertical_datum: 'NAVD88 / GEOID18', bbox: [0, 0, .002, .002], width: 2, height: 2, values: [0, 10, 20, 30] };

test('terrain samples pixel centers north-to-south, interpolates in meters and never fills outside coverage', () => {
  const grid = parseLabTerrain(sample, sample);
  const origin = [.001, .001];
  const sampler = createTerrainSampler(grid, origin);
  const at = (lon, lat) => { const p = toLocalCoordinate(lon, lat, origin); return sampler(p.x, p.z); };
  assert.equal(at(.0005, .0015), 0);
  assert.equal(at(.0015, .0015), 10);
  assert.equal(at(.0005, .0005), 20);
  assert.equal(at(.0015, .0005), 30);
  assert.equal(at(.001, .001), 15);
  assert.equal(at(0, .002), 0);
  assert.equal(at(.002, 0), 30);
  assert.equal(at(-.00001, .001), null);
  assert.equal(at(.001, .00201), null);
  assert.equal(sampler(NaN, 0), null);
});

test('terrain rejects NoData, mismatched datum, unit, extent and corrupt dimensions', () => {
  for (const change of [
    { values: [0, null, 20, 30] }, { values: [0, -999999, 20, 30] },
    { width: 513 }, { values: [0] }, { unit: 'ft' }, { registration: 'corner' },
    { vertical_datum: 'ellipsoidal' }, { bbox: [0, 0, .003, .002] },
  ]) assert.throws(() => parseLabTerrain({ ...sample, ...change }, sample), /Relevo/);
  for (const change of [
    { sha256: 'missing' }, { vertical_datum: '' }, { resolution_m: 0 },
    { bbox: [-77.42, 38.93, -77.40, 38.94] },
  ]) assert.throws(() => parseLabSite({ ...manifest, terrain: { ...manifest.terrain, ...change } }, map), /Relevo/);
});

test('real DTM matches saved hash, image extent, metric spacing and independent service samples', { skip: available ? false : 'Pacote Fairfax local ausente (redistribuição restrita)' }, () => {
  const bytes = readFileSync(new URL('terrain-2022-5m.json', root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.terrain.sha256);
  const grid = parseLabTerrain(JSON.parse(bytes), manifest.terrain);
  const validation = read('elevation-validation.json');
  assert.equal(grid.width, 257); assert.equal(grid.height, 249);
  assert.deepEqual(grid.bbox, manifest.satellite.bbox);
  assert.equal(grid.minimum, 89.348); assert.equal(grid.maximum, 118.524);
  assert.equal(validation.nodata_count, 0);
  assert.equal(validation.factor_to_m, 1200 / 3937);
  assert.equal(createHash('sha256').update(readFileSync(new URL('dtm-2022-5m.tif', root))).digest('hex'), validation.tiff_sha256);
  assert.ok(Math.abs(validation.width_m / grid.width - 5.1) < .03);
  assert.ok(Math.abs(validation.height_m / grid.height - 5.1) < .03);
  const sampler = createTerrainSampler(grid, manifest.local_origin);
  assert.equal(validation.checks.length, 5);
  for (const check of validation.checks) {
    const point = toLocalCoordinate(check.longitude, check.latitude, manifest.local_origin);
    assert.ok(Math.abs(sampler(point.x, point.z) - check.source_ft * validation.factor_to_m) < .07);
  }
  // Every mapped vertex is inside the measured raster, without remapping coordinates.
  const site = parseLabSite(manifest, map);
  for (const polygon of site.polygons) for (const ring of polygon.rings) for (const point of ring) assert.notEqual(sampler(point.x, point.z), null);
});
