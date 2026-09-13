import assert from 'node:assert/strict';
import test from 'node:test';
import { SOMPO_AGRI_EQUIPMENT, SOMPO_AGRI_SCENARIOS, getSompoAgriFrame } from '../shared/sompo-agri-scenarios.js';
import { createSompoAgriSimulationSnapshot, getSompoAgriGeofenceEpisodes } from '../shared/sompo-agri-brief.js';
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

test('bandeira de proximidade: acende na faixa crítica e no limite da máquina, eleva status; atenção/elevada não acendem', () => {
  const critical = samples('segue-ate-critica').at(-1);
  assert.equal(critical.geofence.nearest.bandId, 'critica');
  assert.equal(critical.risks.proximity, true);
  assert.equal(critical.status, 'alert');
  const stopped = samples('parada-na-faixa').at(-1);
  assert.equal(stopped.geofence.nearest.bandId, 'elevada');
  assert.equal(stopped.risks.proximity, false);
  assert.equal(stopped.status, 'normal');
  const over = samples('declive-alem-do-limite').filter(frame => frame.geofence.machine?.bandId === 'acima');
  assert.ok(over.length > 0 && over.every(frame => frame.risks.proximity === true && frame.status === 'alert'));
  // Declive é contexto (alertable: false): dentro dele, nivelada, a máquina não acende alerta; só o limite dela acende.
  const inside = samples('parada-na-faixa').filter(frame => frame.geofence.nearest?.bandId === 'dentro');
  assert.ok(inside.length > 0 && inside.every(frame => frame.risks.proximity === false && frame.geofence.nearest.alertable === false), 'dentro do declive nivelada não acende');
  const insideOver = samples('declive-alem-do-limite').filter(frame => frame.geofence.nearest?.bandId === 'dentro');
  assert.ok(insideOver.some(frame => frame.risks.proximity) && insideOver.some(frame => !frame.risks.proximity), 'no mesmo declive, acende só enquanto a máquina passa do limite');
  assert.ok(critical.geofence.nearest.alertable && critical.geofence.nearest.innermost, 'água é alertável e crítica é a faixa mais interna');
  // A bandeira olha todos os perigos, não só o mais próximo.
  const site = getSompoGeofenceSite('geofence-field', 47);
  const stacked = evaluateGeofence({ x: 0, z: 0, headingDeg: 0, speedKph: 5, rollDeg: 0 }, site.manifestRules, [
    ...site.polygons.filter(polygon => polygon.role === 'allowed_area'),
    { id: 'declive-teste', role: 'hazard', category: 'slope', rings: [[{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }, { x: -10, z: -10 }]] },
    { id: 'agua-teste', role: 'water', rings: [[{ x: 3, z: -1 }, { x: 4, z: -1 }, { x: 4, z: 1 }, { x: 3, z: 1 }, { x: 3, z: -1 }]] },
  ], SOMPO_AGRI_EQUIPMENT.harvester);
  assert.equal(stacked.nearest.hazardKey.split(':')[0], 'hazard', 'o declive (0 m) é o mais próximo');
  assert.ok(stacked.all.some(hit => hit.alertable && hit.innermost && hit.hazardKey.startsWith('water')), 'a água a 3 m em faixa crítica está em all');
  assert.ok(stacked.alert?.hazardKey.startsWith('water'), 'alert aponta a água, não o declive mais próximo');
  assert.match(describeGeofence(stacked), /^Proximidade crítica · /, 'o texto descreve o perigo que acende a bandeira');
});

test('episódios da corrida inteira: mesmo motor do laboratório, coerentes com o radar instante a instante', () => {
  const total = SOMPO_AGRI_SCENARIOS[SCENARIO].totalMs;
  for (const outcome of ['parada-na-faixa', 'segue-ate-critica', 'declive-alem-do-limite']) {
    const episodes = getSompoAgriGeofenceEpisodes(SCENARIO, outcome);
    assert.ok(episodes.length >= 4, `${outcome} tem episódios de mapa`);
    assert.ok(Object.isFrozen(episodes) && episodes.every(Object.isFrozen) && episodes === getSompoAgriGeofenceEpisodes(SCENARIO, outcome), 'lista e episódios congelados, cacheados');
    for (let i = 1; i < episodes.length; i += 1) assert.ok(episodes[i].startMs >= episodes[i - 1].startMs, 'ordenados por início');
    for (const episode of episodes) {
      assert.ok(episode.startMs >= 0 && (episode.endMs === null || episode.endMs <= total));
      assert.equal(episode.gapMs, 0, 'roteiro não tem lacuna de posição');
      assert.equal(episode.quality, episode.endMs === null ? 'aberto-no-fim' : 'observado');
    }
    // Em cada instante amostrado, a faixa do perigo mais próximo no radar tem um episódio aberto com a mesma faixa.
    for (const frame of samples(outcome)) {
      const near = frame.geofence.nearest;
      const at = frame.deviceTimestamp ?? frame.elapsedMs;
      if (!near) continue;
      assert.ok(episodes.some(e => e.hazardKey === near.hazardKey && e.bandId === near.bandId && e.startMs <= at && (e.endMs === null || at < e.endMs)), `${outcome} @${at}: ${near.hazardKey}/${near.bandId}`);
    }
  }
  const machine = getSompoAgriGeofenceEpisodes(SCENARIO, 'declive-alem-do-limite').filter(e => e.hazardKey.startsWith('machine:'));
  assert.deepEqual(machine.map(e => e.bandId), ['proximo', 'acima', 'proximo'], 'sobe até o limite e volta');
  assert.equal(machine[1].minDistanceM, 0, 'no limite ou acima: margem mínima zero');
  for (const outcome of ['parada-na-faixa', 'segue-ate-critica']) assert.equal(getSompoAgriGeofenceEpisodes(SCENARIO, outcome).filter(e => e.hazardKey.startsWith('machine:')).length, 0);
  const water = getSompoAgriGeofenceEpisodes(SCENARIO, 'segue-ate-critica').filter(e => e.hazardLabel === 'Córrego sintético');
  assert.equal(water.at(-1).bandId, 'critica');
  assert.equal(water.at(-1).quality, 'aberto-no-fim', 'a máquina para dentro da faixa crítica');
  assert.deepEqual([...getSompoAgriGeofenceEpisodes('agri-harvest-dust')], [], 'cenário sem talhão não tem episódios');
  assert.throws(() => getSompoAgriGeofenceEpisodes(SCENARIO, 'parada-na-faixa', 0), RangeError);
});

test('tendência de aproximação: independe do rumo, cobre a aproximação inteira e nunca usa termos proibidos', () => {
  for (const outcome of ['parada-na-faixa', 'segue-ate-critica', 'declive-alem-do-limite']) {
    const run = samples(outcome);
    assert.equal(run[0].geofence.nearest, null);
    for (const frame of run) for (const hit of frame.geofence.all) {
      if (frame.deviceTimestamp === 0) { assert.equal(hit.trend, null, 'primeira amostra sem anterior'); continue; }
      if (hit.distanceM === 0) { assert.equal(hit.trend, null, 'dentro do polígono não há tendência'); continue; }
      assert.ok(['aproximando', 'afastando', 'estavel'].includes(hit.trend), `${outcome} @${frame.deviceTimestamp} ${hit.hazardKey}: ${hit.trend}`);
      if (hit.timeToHazardEdgeS !== null) assert.ok(hit.closingSpeedMs > 0 && hit.distanceM > 0 && Math.abs(hit.timeToHazardEdgeS - hit.distanceM / hit.closingSpeedMs) < 1e-9);
      if (hit.timeToNextBandS !== null) assert.ok(!hit.innermost && hit.closingSpeedMs > 0);
      assert.doesNotMatch(describeGeofence(frame.geofence), /seguro|risco|tombar|acidente|neglig/i);
    }
  }
  // "Segue até a crítica": o córrego fica a 30–60° do rumo depois de 19 s (o cone de ±20° perde o tempo de aproximação),
  // mas a distância continua caindo até a faixa crítica: a tendência tem de dizer "aproximando" o tempo todo.
  const chase = samples('segue-ate-critica').filter(frame => frame.deviceTimestamp >= 17_500 && frame.deviceTimestamp <= 23_500);
  assert.ok(chase.length >= 20);
  for (const frame of chase) {
    const water = frame.geofence.all.find(hit => hit.hazardKey.startsWith('water'));
    assert.equal(water?.trend, 'aproximando', `@${frame.deviceTimestamp}`);
    assert.ok(water.timeToHazardEdgeS > 0 && water.timeToHazardEdgeS < 30, `@${frame.deviceTimestamp}: ${water.timeToHazardEdgeS}`);
  }
  assert.ok(chase.some(frame => frame.geofence.nearest.timeToHazardS === null && frame.geofence.nearest.trend === 'aproximando'), 'fora do cone de ±20° a tendência continua');
  assert.match(describeGeofence(chase[0].geofence), /aproximando · ≈ \d+ s até a (faixa|borda)/);
  // Parada na faixa elevada: aproximando até parar; parada, estável.
  const stop = samples('parada-na-faixa');
  assert.equal(stop.at(-1).geofence.nearest.trend, 'estavel');
  assert.ok(stop.filter(frame => frame.deviceTimestamp >= 19_000 && frame.deviceTimestamp <= 21_500).every(frame => frame.geofence.nearest.trend === 'aproximando'));
  // Dentro do polígono não há tendência; nas transições de faixa o texto não diz "≈ 0 s".
  for (const outcome of ['parada-na-faixa', 'segue-ate-critica', 'declive-alem-do-limite']) for (const frame of samples(outcome)) {
    for (const hit of frame.geofence.all) if (hit.distanceM === 0) assert.equal(hit.trend, null);
    assert.doesNotMatch(describeGeofence(frame.geofence), /≈ 0 s/);
  }
});
