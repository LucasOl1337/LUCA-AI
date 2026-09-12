import assert from 'node:assert/strict';
import test from 'node:test';
import { SOMPO_AGRI_EQUIPMENT, SOMPO_AGRI_SCENARIOS, getSompoAgriFrame } from '../shared/sompo-agri-scenarios.js';
import { createSompoAgriSimulationSnapshot } from '../shared/sompo-agri-brief.js';
import { describeGeofence, describeMachineLimit, evaluateGeofence } from '../shared/sompo-geofence.js';
import { resolveHazards } from '../shared/lab-geofence.js';
import { getSompoGeofenceSite, SOMPO_GEOFENCE_SITE_VERSION } from '../shared/sompo-geofence-sites.js';

const SCENARIO = 'agri-geofencing';
const snapshotAt = (outcome, elapsedMs) => createSompoAgriSimulationSnapshot(SCENARIO, outcome, {
  elapsedMs, observedAt: '2026-09-12T12:00:00.000Z',
});
const samples = (outcome) => Array.from({ length: SOMPO_AGRI_SCENARIOS[SCENARIO].totalMs / 250 + 1 }, (_, i) => snapshotAt(outcome, i * 250));
const bands = (outcome) => samples(outcome).map(frame => frame.geofence.nearest ? `${frame.geofence.nearest.hazardKey.split(':')[0]}:${frame.geofence.nearest.bandId}` : 'nenhum');

test('só o ambiente do cenário de geofencing tem talhão; os cenários originais ficam sem radar', () => {
  assert.equal(SOMPO_GEOFENCE_SITE_VERSION, 2);
  for (const scenario of Object.values(SOMPO_AGRI_SCENARIOS)) {
    const site = getSompoGeofenceSite(scenario.environmentId, 40);
    if (scenario.scenarioId === SCENARIO) { assert.ok(site); continue; }
    assert.equal(site, null);
    const snapshot = createSompoAgriSimulationSnapshot(scenario.scenarioId, undefined, { elapsedMs: 3000, observedAt: '2026-09-12T12:00:00.000Z' });
    assert.equal(snapshot.geofence, null);
    assert.equal(snapshot.risks.proximity, false);
    assert.ok(Number.isFinite(snapshot.position.x));
  }
  assert.throws(() => getSompoGeofenceSite('geofence-field', NaN), TypeError);
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
  const hazards = resolveHazards(site.manifestRules, site.polygons, SOMPO_AGRI_EQUIPMENT.harvester);
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

test('parada na faixa elevada: sem perigo, depois dentro do declive, depois atenção e elevada da água; para', () => {
  const run = bands('parada-na-faixa');
  assert.equal(run[0], 'nenhum', 'começa sem perigo no alcance');
  assert.ok(run.includes('hazard:dentro'));
  assert.ok(run.includes('hazard:borda'));
  assert.ok(run.includes('nenhum'), 'há um trecho sem perigo no alcance');
  assert.ok(run.includes('water:atencao'));
  assert.equal(run.at(-1), 'water:elevada', 'termina parada na faixa elevada');
  assert.ok(!run.includes('water:critica'));
  const order = ['nenhum', 'hazard:dentro', 'water:atencao', 'water:elevada'].map(key => run.indexOf(key));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'a história acontece nessa ordem');
  const last = samples('parada-na-faixa').at(-1);
  assert.equal(getSompoAgriFrame(SCENARIO, 24_000, 'parada-na-faixa').speedKph, 0);
  assert.equal(last.geofence.machine, null, 'inclinação de 2° não entra em faixa de máquina');
});

test('segue até a faixa crítica: mesma corrida, deriva para o córrego e termina em crítica', () => {
  const run = bands('segue-ate-critica');
  assert.ok(run.includes('water:elevada'));
  assert.equal(run.at(-1), 'water:critica');
  const last = samples('segue-ate-critica').at(-1);
  assert.ok(last.geofence.nearest.distanceM < 5 && last.geofence.nearest.distanceM > 0);
  assert.match(describeGeofence(last.geofence), /^Proximidade crítica · Córrego sintético a \d+ m à (direita|frente|esquerda)/);
});

test('declive além do limite: só este desfecho cruza o limite da colheitadeira (15°), dentro do declive, e segue', () => {
  const run = samples('declive-alem-do-limite');
  const machine = run.map(frame => frame.geofence.machine);
  assert.ok(machine.some(hit => hit?.bandId === 'proximo'));
  const over = run.filter(frame => frame.geofence.machine?.bandId === 'acima');
  assert.ok(over.length > 0, 'cruza o limite');
  for (const frame of over) assert.equal(frame.geofence.nearest.bandId, 'dentro', 'o cruzamento acontece dentro do declive mapeado');
  assert.equal(over[0].geofence.machine.limitDeg, SOMPO_AGRI_EQUIPMENT.harvester.profile.max_roll_deg);
  assert.match(describeMachineLimit(over[0].geofence.machine), /^No limite ou acima · inclinação 1[5-9]° · limite 15°$/);
  const last = run.at(-1);
  assert.equal(last.geofence.machine, null, 'depois de estabilizar, a inclinação sai das faixas de máquina');
  assert.equal(last.geofence.nearest.hazardLabel, 'Córrego sintético', 'a passada continua até a água, como nos outros desfechos');
  for (const outcome of ['parada-na-faixa', 'segue-ate-critica']) assert.ok(samples(outcome).every(frame => frame.geofence.machine === null), `${outcome} nunca entra em faixa de máquina`);
  // Percursos com o mesmo comprimento: a origem por desfecho não desloca a fazenda em relação ao início.
  const starts = ['parada-na-faixa', 'segue-ate-critica', 'declive-alem-do-limite'].map(outcome => snapshotAt(outcome, 0).position.x);
  assert.ok(Math.max(...starts) - Math.min(...starts) < 3, `inícios: ${starts.map(x => x.toFixed(1)).join(', ')}`);
  for (const outcome of ['parada-na-faixa', 'segue-ate-critica', 'declive-alem-do-limite']) assert.equal(snapshotAt(outcome, 0).geofence.nearest, null, `${outcome} começa sem perigo no alcance`);
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
