import assert from 'node:assert/strict';
import nodeTest from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseLabSite, associateLabSite, parseLabCase, getReplayFrame, toLocalCoordinate, LAB_COLUMNS } from '../shared/lab-telemetry.js';
import { convertSompoDataset } from '../shared/sompo-lab-export.js';

const root = new URL('../public/datasets/frying-pan-farm/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const manifest = read('manifest.json');
const available = existsSync(new URL('mapa.geojson', root));
const map = available ? read('mapa.geojson') : null;
const test = (name, run) => nodeTest(name, { skip: available ? false : 'Pacote Fairfax local ausente (redistribuição restrita)' }, run);
const csvAt = points => [LAB_COLUMNS.join(','), ...points.map(([lon, lat], i) => LAB_COLUMNS.map(key => ({
  timestamp: `2026-09-09T12:00:0${i}.000Z`, machine_id: 'SYNTHETIC-GEOMETRY-TEST', synthetic: true,
  longitude_deg: lon, latitude_deg: lat, gnss_fix: '3d',
}[key] ?? '')).join(','))].join('\n');

test('real farm preserves source vertices, ponds, attribution and north-up image extent at 0.6 m/px', () => {
  const originals = [...read('source-boundary.geojson').features, ...read('source-water.geojson').features];
  assert.deepEqual(map.features.map(f => f.geometry), originals.map(f => f.geometry));
  const site = parseLabSite(manifest, map);
  assert.deepEqual(site.polygons.map(p => p.role), ['property_boundary', 'water', 'water', 'water', 'water']);
  assert.match(site.warnings.join(' '), /sem área permitida/);
  assert.equal(site.manifest.synthetic, undefined);
  const { bbox: [west, south, east, north], width_px, height_px } = manifest.satellite;
  const nw = toLocalCoordinate(west, north, site.origin), se = toLocalCoordinate(east, south, site.origin);
  assert.ok(nw.x < 0 && nw.z < 0 && se.x > 0 && se.z > 0); // East +X, north -Z.
  assert.ok(Math.abs((se.x - nw.x) / width_px - 0.6) < 0.001);
  assert.ok(Math.abs((se.z - nw.z) / height_px - 0.6) < 0.001);
  for (const feature of map.features) for (const ring of feature.geometry.coordinates) for (const [lon, lat] of ring) {
    assert.ok(lon >= west && lon <= east && lat >= south && lat <= north);
  }
  const image = readFileSync(new URL('naip-2023.jpg', root));
  assert.equal(createHash('sha256').update(image).digest('hex'), manifest.satellite.sha256);
  assert.equal(image.readUInt16BE(0), 0xffd8);
  assert.ok(manifest.satellite.attribution && manifest.site.vector_license_url);
});

test('property boundaries never authorize operation; water and allowed-area rules remain separate', () => {
  const pondCorner = map.features[1].geometry.coordinates[0][0];
  const farAway = [-77.42, 38.95];
  const csv = csvAt([pondCorner, farAway]);
  const parsed = parseLabCase(csv, { manifest, map });
  assert.deepEqual(parsed.events.map(e => [e.type, e.transition]), [['near_water', 'start'], ['near_water', 'end']]);
  assert.equal(parsed.events[0].evidence.distance_to_water_m, 0);
  // A synthetic authorization polygon exists ONLY in this test, never in the farm package.
  const [lon, lat] = pondCorner;
  const operational = { type: 'Feature', properties: { role: 'allowed_area' }, geometry: { type: 'Polygon', coordinates: [[
    [lon - .001, lat - .001], [lon + .001, lat - .001], [lon + .001, lat + .001], [lon - .001, lat + .001], [lon - .001, lat - .001],
  ]] } };
  const withOperation = parseLabCase(csv, { manifest, map: { ...map, features: [...map.features, operational] } });
  assert.deepEqual(withOperation.events.filter(e => e.type === 'outside_fence').map(e => [e.transition, e.elapsedMs]), [['start', 1000]]);
  assert.deepEqual(getReplayFrame(withOperation, 1000).position, toLocalCoordinate(...farAway, withOperation.origin));
});

test('associating farm to ESP32 preserves identity, provenance and null GNSS throughout replay', () => {
  const converted = convertSompoDataset({ samples: [0, 1].map(i => ({ tractorId: 'ESP32-001', sourceKind: 'firebase', observedAt: `2026-09-09T12:00:0${i}.000Z`, temperatura: 29, distancia: 10, riscoColisao: true })) });
  const site = parseLabSite({ ...manifest, synthetic: true, machine: { id: 'UNRELATED' } }, map);
  const associated = associateLabSite(converted.manifest, site);
  const parsed = parseLabCase(converted.csv, { ...associated, schema: converted.schema });
  assert.equal(parsed.synthetic, false);
  assert.equal(parsed.machineId, 'ESP32-001');
  assert.equal(parsed.manifest.timestamp_basis, 'server_received');
  assert.deepEqual(parsed.manifest.conversion_warnings, converted.manifest.conversion_warnings);
  assert.equal(parsed.events.some(e => ['near_water', 'outside_fence'].includes(e.type)), false);
  for (const ms of [0, 500, 1000]) assert.equal(getReplayFrame(parsed, ms).position, null);
  assert.deepEqual(parsed.origin, manifest.local_origin);
  assert.deepEqual(parsed.manifest.terrain, manifest.terrain);
});

test('invalid raster georeferences fail explicitly; map CRS and third ordinates are not silently reinterpreted', () => {
  for (const satellite of [
    { ...manifest.satellite, bbox: [-77, 38, -78, 39] },
    { ...manifest.satellite, crs: 'EPSG:3857' },
    { ...manifest.satellite, url: 'javascript:alert(1)' },
    { ...manifest.satellite, url: 'blob:https://localhost/image' },
    { ...manifest.satellite, attribution: '' },
  ]) assert.throws(() => parseLabSite({ ...manifest, satellite }, map), /Imagem aérea|Relevo/);
  assert.throws(() => parseLabSite(manifest, { ...map, crs: { properties: { name: 'EPSG:2283' } } }), /reprojete/);
  const elevated = structuredClone(map);
  elevated.features[0].geometry.coordinates[0] = elevated.features[0].geometry.coordinates[0].map(point => [...point, 123]);
  const site = parseLabSite(manifest, elevated);
  assert.ok(site.warnings.some(w => w.includes('Altitudes')));
  assert.equal(site.map.features[0].geometry.coordinates[0][0][2], 123);
});
