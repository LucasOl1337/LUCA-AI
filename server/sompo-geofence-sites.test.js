import assert from 'node:assert/strict';
import test from 'node:test';
import { describeGeofence, evaluateGeofence } from '../shared/sompo-geofence.js';
import { resolveHazards } from '../shared/lab-geofence.js';
import { getSompoGeofenceSite, geofenceOperacaoRelief } from '../shared/sompo-geofence-sites.js';
import { polygonContains } from '../shared/lab-telemetry.js';

// Mesmo perfil de SOMPO_AGRI_EQUIPMENT.harvester (sompo-agri-scenarios.js); resolveHazards só lê profile.max_roll_deg.
const HARVESTER = { profile: { max_roll_deg: 15, synthetic: true } };

test('talhão 2: geometria, faixas e relevo sintéticos de demonstração', () => {
  const site = getSompoGeofenceSite('geofence-operacao', 450);
  const [field, stream, slope, gully, barn] = site.polygons;
  assert.equal(site.synthetic, true);
  assert.match(site.label, /demonstração/);
  assert.deepEqual(site.polygons.map(p => [p.role, p.category ?? null]), [
    ['allowed_area', null], ['water', null], ['hazard', 'slope'], ['hazard', 'gully'], ['hazard', 'structure'],
  ]);
  for (const polygon of site.polygons) {
    assert.equal(polygon.synthetic, true);
    const ring = polygon.rings[0];
    assert.deepEqual(ring[0], ring.at(-1));
    for (const point of ring) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z));
      if (polygon !== gully) assert.equal(polygonContains(point, field), true, `${polygon.id}: ${JSON.stringify(point)}`);
    }
  }
  // O talhão é convexo: conter todos os vértices contém também cada segmento dos outros polígonos.
  assert.equal(polygonContains({ x: 90, z: 0 }, gully), true, 'ribanceira cruza a borda leste');
  assert.equal(polygonContains({ x: 91, z: 0 }, field), false);
  const bounds = polygon => ['x', 'z'].map(axis => [Math.min(...polygon.rings[0].map(p => p[axis])), Math.max(...polygon.rings[0].map(p => p[axis]))]);
  assert.deepEqual(bounds(field), [[-90, 90], [-70, 70]]);
  assert.deepEqual(bounds(slope), [[-70, -20], [-35, -5]]);
  assert.deepEqual(bounds(barn), [[53, 67], [-59, -51]]);
  assert.equal(polygonContains({ x: 30, z: 43 }, stream), true);
  assert.equal(polygonContains({ x: 30, z: 40 }, stream), false);
  const hazards = resolveHazards(site.manifestRules, site.polygons, HARVESTER);
  assert.deepEqual(hazards.warnings, []);
  assert.equal(hazards.length, 5);
  assert.deepEqual(site.manifestRules.hazards.map(r => r.bands_m.map(b => b.max_m)), [[5, 15, 35], [0, 6], [0, 15], [0, 10], [0, 5]]);
  assert.equal(site.manifestRules.hazards[1].alertable, false);
  assert.equal(site.manifestRules.hazards[3].label, 'Galpão');
  for (const rule of site.manifestRules.hazards) {
    assert.equal(rule.synthetic, true);
    assert.match(rule.justification, /demonstração/);
    for (const label of [rule.label, ...rule.bands_m.map(b => b.label)]) assert.doesNotMatch(label, /segur[o]|risco alto|neglig[eê]ncia|vai tombar/i);
  }
  assert.equal(geofenceOperacaoRelief(-45, -20), 4);
  assert.ok(Math.abs(geofenceOperacaoRelief(91, 0) + 6) < 1e-10);
  assert.ok(Math.abs(geofenceOperacaoRelief(30, 43) + 0.9) < 1e-10);
  for (const z of [-100, -62, -35, 0, 35, 62, 100]) {
    assert.ok(Number.isFinite(geofenceOperacaoRelief(85, z)));
    assert.ok(Math.abs(geofenceOperacaoRelief(85, z - 1e-6) - geofenceOperacaoRelief(85, z + 1e-6)) < 1e-5);
  }
});

test('fazenda sintética: anéis fechados, formas curvas, regras ordenadas, sem avisos e sem rótulos proibidos', () => {
  const site = getSompoGeofenceSite('geofence-field', 47);
  assert.equal(site.synthetic, true);
  assert.deepEqual(site.polygons.map(polygon => polygon.id), ['talhao-sintetico', 'corrego-sintetico', 'lagoa-sintetica', 'declive-sintetico', 'ribanceira-sintetica']);
  for (const polygon of site.polygons) {
    assert.equal(polygon.synthetic, true);
    assert.deepEqual(polygon.rings[0][0], polygon.rings[0].at(-1));
    assert.ok(polygon.rings[0].length >= 9, `${polygon.id} tem ${polygon.rings[0].length} vértices: sem retângulos`);
  }
  const hazards = resolveHazards(site.manifestRules, site.polygons, HARVESTER);
  assert.deepEqual(hazards.warnings, []);
  assert.equal(hazards.length, 5, 'córrego, lagoa (mesma regra de água), declive, ribanceira e máquina');
  for (const rule of site.manifestRules.hazards) {
    assert.equal(rule.synthetic, true);
    const maxes = rule.bands_m.map(band => band.max_m);
    assert.deepEqual(maxes, [...maxes].sort((a, b) => a - b));
  }
  const labels = [site.label, ...hazards.flatMap(hazard => [hazard.label, ...hazard.bands.map(band => band.label)])];
  for (const label of labels) assert.doesNotMatch(label, /seguro|risco|acidente/i);
});

test('radar: lado e tempo de aproximação na fazenda sintética', () => {
  const site = getSompoGeofenceSite('geofence-field', 47);
  const beside = evaluateGeofence({ x: 20, z: 0, headingDeg: 90, speedKph: 7 }, site.manifestRules, site.polygons);
  assert.equal(beside.nearest.hazardLabel, 'Córrego sintético');
  assert.ok(beside.nearest.bearingDeg > 20, 'córrego fica à direita de quem vai para leste');
  assert.equal(beside.nearest.timeToHazardS, null, 'de lado não há tempo de aproximação');
  const toward = evaluateGeofence({ x: 24, z: 0, headingDeg: 180, speedKph: 7.2 }, site.manifestRules, site.polygons);
  assert.ok(Math.abs(toward.nearest.bearingDeg) <= 20);
  assert.ok(toward.nearest.timeToHazardS > 0);
  assert.match(describeGeofence(toward.geofence ?? toward), /à frente · ≈ \d+ s de aproximação$/);
  for (const text of [describeGeofence(beside), describeGeofence(toward)]) assert.doesNotMatch(text, /seguro|risco|acidente/i);
});
