import assert from 'node:assert/strict';
import test from 'node:test';
import { SOMPO_AGRI_SCENARIOS, getSompoAgriFrame } from '../shared/sompo-agri-scenarios.js';
import { createSompoAgriSimulationSnapshot, getSompoAgriStartX, getSompoAgriTravelMeters } from '../shared/sompo-agri-brief.js';
import { describeGeofence, evaluateGeofence, suggestSafeLane } from '../shared/sompo-geofence.js';
import { resolveHazards } from '../shared/lab-geofence.js';
import { getSompoGeofenceSite, SOMPO_GEOFENCE_SITE_VERSION } from '../shared/sompo-geofence-sites.js';

const snapshotAt = (id, outcome, elapsedMs) => createSompoAgriSimulationSnapshot(id, outcome, {
  elapsedMs, observedAt: '2026-09-12T12:00:00.000Z',
});
const samples = (id, outcome) => Array.from({ length: SOMPO_AGRI_SCENARIOS[id].totalMs / 250 + 1 },
  (_, i) => snapshotAt(id, outcome, i * 250));

test('colheita aproxima do córrego no meio do percurso e mantém avanço crescente', () => {
  const frames = samples('agri-harvest-dust', 'clean-pass');
  assert.ok(!frames[0].geofence.nearest || frames[0].geofence.nearest.bandId === 'atencao');
  assert.ok(frames.slice(1, -1).some(frame => frame.geofence.nearest?.bandId === 'elevada'));
  assert.ok(frames.some(frame => frame.geofence.nearest?.bandLabel === 'Atenção'));
  assert.ok(frames.every(frame => frame.geofence.nearest?.bandId !== 'critica'));
  for (let i = 1; i < frames.length; i += 1) assert.ok(frames[i].position.x > frames[i - 1].position.x);
});

test('ambientes têm geometrias sintéticas e regras correspondentes sem avisos', () => {
  const expected = {
    'row-crop-field': ['corrego-sintetico', 'lagoa-sintetica', 'ribanceira-sintetica'],
    'row-crop-field-night': ['corrego-sintetico', 'lagoa-sintetica', 'ribanceira-sintetica'],
    'muddy-field': ['corrego-sintetico', 'alagado-sintetico'],
    'sloped-field': ['corrego-sintetico', 'declive-sintetico', 'ribanceira-sintetica'],
    'farm-barn': [],
  };
  for (const [environment, ids] of Object.entries(expected)) {
    const site = getSompoGeofenceSite(environment, 40);
    const hazards = resolveHazards(site.manifestRules, site.polygons);
    assert.deepEqual(hazards.warnings, []);
    assert.deepEqual(site.polygons.slice(1).map(polygon => polygon.id), ids);
    assert.equal(hazards.length, ids.length);
    assert.deepEqual(site.polygons[0].rings[0].map(point => point.z), [-70, -70, 70, 70, -70]);
    assert.equal(site.manifestRules.synthetic, true);
    for (const polygon of site.polygons) {
      assert.equal(polygon.synthetic, true);
      assert.deepEqual(polygon.rings[0][0], polygon.rings[0].at(-1));
    }
    for (const rule of site.manifestRules.hazards) {
      assert.equal(rule.synthetic, true);
      assert.deepEqual(rule.bands_m.map(band => band.max_m), rule.role === 'water' ? [5, 15, 35] : rule.category === 'slope' ? [0, 10] : [0, 15]);
    }
    const labels = [site.label, ...hazards.flatMap(hazard => [hazard.label, ...hazard.bands.map(band => band.label)])];
    for (const label of labels) assert.doesNotMatch(label, /seguro|risco|acidente/i);
  }
});

test('colheita tem pista sugerida dentro do talhão e fora das faixas em até 60 m', () => {
  const scenario = SOMPO_AGRI_SCENARIOS['agri-harvest-dust'];
  for (const outcome of Object.keys(scenario.outcomes)) {
    const travel = getSompoAgriTravelMeters(scenario.scenarioId, scenario.totalMs, outcome);
    const startX = getSompoAgriStartX(scenario.scenarioId, outcome);
    const site = getSompoGeofenceSite(scenario.environmentId, travel);
    const lane = suggestSafeLane({ xStart: startX, xEnd: startX + travel, preferredZ: 0, maxOffsetM: 60 }, site.manifestRules, site.polygons);
    assert.ok(lane);
    assert.ok(lane.offsetM <= 60);
    for (let i = 0; i <= 100; i += 1) {
      const result = evaluateGeofence({ x: startX + travel * i / 100, z: lane.z }, site.manifestRules, site.polygons);
      assert.equal(result.insideAllowed, true);
      assert.equal(result.nearest, null);
    }
  }
});

test('declive cruza o trecho em que a inclinação aumenta', () => {
  const frames = samples('agri-tractor-rollover', 'side-rollover');
  assert.ok(frames.some(frame => frame.geofence.nearest?.hazardKey.startsWith('hazard:slope')));
  assert.equal(snapshotAt('agri-tractor-rollover', 'side-rollover', 7000).geofence.nearest.bandId, 'dentro');
});

test('barracão contém todas as manobras sem perigo mapeado', () => {
  for (const outcome of Object.keys(SOMPO_AGRI_SCENARIOS['agri-barn-maneuver'].outcomes)) {
    for (const frame of samples('agri-barn-maneuver', outcome)) {
      assert.equal(frame.geofence.nearest, null);
      assert.equal(frame.geofence.insideAllowed, true);
    }
  }
});

test('todos os desfechos compartilham posição do palco e preservam as flags do roteiro', () => {
  for (const scenario of Object.values(SOMPO_AGRI_SCENARIOS)) {
    for (const outcome of Object.keys(scenario.outcomes)) {
      for (const snapshot of samples(scenario.scenarioId, outcome)) {
        const elapsed = snapshot.deviceTimestamp;
        const frame = getSompoAgriFrame(scenario.scenarioId, elapsed, outcome);
        assert.equal(snapshot.position.x, getSompoAgriStartX(scenario.scenarioId, outcome)
          + getSompoAgriTravelMeters(scenario.scenarioId, elapsed, outcome));
        assert.equal(snapshot.position.z, frame.lateral);
        assert.equal(snapshot.position.headingDeg, 90 - frame.yaw);
        assert.equal(snapshot.risks.proximity, !!snapshot.geofence.nearest);
        assert.equal(snapshot.risks.collision, frame.collisionRisk);
        assert.equal(snapshot.risks.inclination, frame.inclinationRisk);
        assert.deepEqual(snapshot.geofence.warnings, []);
        assert.doesNotMatch(describeGeofence(snapshot.geofence), /seguro|risco|acidente/i);
      }
    }
  }
});

test('mapa sintético tem anéis fechados, faixas ordenadas e água à direita', () => {
  const site = getSompoGeofenceSite('row-crop-field', 40);
  assert.equal(SOMPO_GEOFENCE_SITE_VERSION, 1);
  assert.equal(site.synthetic, true);
  assert.deepEqual(site, getSompoGeofenceSite('row-crop-field-night', 40));
  assert.throws(() => getSompoGeofenceSite('row-crop-field', NaN), TypeError);
  for (const polygon of site.polygons) {
    assert.equal(polygon.synthetic, true);
    assert.deepEqual(polygon.rings[0][0], polygon.rings[0].at(-1));
  }
  assert.deepEqual(site.manifestRules.hazards[0].bands_m.map(band => band.max_m), [5, 15, 35]);
  const beside = evaluateGeofence({ x: 0, z: 0, headingDeg: 90, speedKph: 7 }, site.manifestRules, site.polygons);
  assert.equal(beside.nearest.distanceM, 13);
  assert.equal(beside.nearest.bearingDeg, 90);
  assert.equal(beside.nearest.timeToHazardS, null);
  const lateral = evaluateGeofence({ x: 0, z: 9, headingDeg: 180, speedKph: 7.2 }, site.manifestRules, site.polygons);
  assert.equal(lateral.nearest.bandId, 'critica');
  assert.equal(lateral.nearest.timeToHazardS, 2);
});
