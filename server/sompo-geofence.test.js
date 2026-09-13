import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateGeofence, closestPointOnPolygon, forwardVector, describeGeofence, describeMachineLimit } from '../shared/sompo-geofence.js';

const rect = (id, role, x0, x1, z0, z1, extra = {}) => ({ id, role, rings: [[{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 }]], ...extra });
const field = rect('talhao', 'allowed_area', -100, 100, -50, 50);
const water = rect('corrego', 'water', 40, 120, 20, 40);              // à direita (+z) e à frente (+x) de quem anda para leste em z = 0
const rules = { hazards: [{ role: 'water', label: 'Córrego', bands_m: [{ id: 'critica', label: 'Proximidade crítica', max_m: 5 }, { id: 'elevada', label: 'Proximidade elevada', max_m: 15 }, { id: 'atencao', label: 'Atenção', max_m: 35 }] }] };

test('closestPointOnPolygon: borda mais próxima, interior = o próprio ponto', () => {
  assert.deepEqual(closestPointOnPolygon({ x: 60, z: 0 }, water), { x: 60, z: 20, distance: 20 });
  assert.deepEqual(closestPointOnPolygon({ x: 60, z: 30 }, water), { x: 60, z: 30, distance: 0 });
  assert.ok(Math.abs(closestPointOnPolygon({ x: 0, z: 0 }, water).distance - Math.hypot(40, 20)) < 1e-9);
});

test('forwardVector segue heading_deg do laboratório: 90 = +x, 0 = -z (norte)', () => {
  const east = forwardVector(90); assert.ok(Math.abs(east.x - 1) < 1e-9 && Math.abs(east.z) < 1e-9);
  const north = forwardVector(0); assert.ok(Math.abs(north.x) < 1e-9 && Math.abs(north.z + 1) < 1e-9);
});

test('radar: faixa, distância, lado e tempo até o perigo; nada fora do alcance', () => {
  const far = evaluateGeofence({ x: -80, z: 0, headingDeg: 90, speedKph: 10 }, rules, [field, water]);
  assert.equal(far.nearest, null); assert.equal(far.insideAllowed, true);
  const beside = evaluateGeofence({ x: 60, z: 0, headingDeg: 90, speedKph: 10 }, rules, [field, water]);
  assert.equal(beside.nearest.bandId, 'atencao'); assert.equal(beside.nearest.distanceM, 20);
  assert.ok(beside.nearest.bearingDeg > 80 && beside.nearest.bearingDeg < 100, 'água à direita de quem vai para leste');
  assert.equal(beside.nearest.timeToHazardS, null, 'andando paralelo não se aproxima');
  const toward = evaluateGeofence({ x: 60, z: 0, headingDeg: 180, speedKph: 7.2 }, rules, [field, water]); // 2 m/s para o sul (+z)
  assert.ok(Math.abs(toward.nearest.bearingDeg) < 1e-6, 'à frente');
  assert.equal(toward.nearest.timeToHazardS, 10);
  const inside = evaluateGeofence({ x: 60, z: 30, headingDeg: 90, speedKph: 3 }, rules, [field, water]);
  assert.equal(inside.nearest.bandId, 'critica'); assert.equal(inside.nearest.distanceM, 0); assert.equal(inside.nearest.bearingDeg, null);
});

test('sem heading: faixa e distância continuam, lado e tempo ficam nulos; fora da área permitida é dito', () => {
  const result = evaluateGeofence({ x: 60, z: 0 }, rules, [field, water]);
  assert.equal(result.nearest.bearingDeg, null); assert.equal(result.nearest.timeToHazardS, null);
  const outside = evaluateGeofence({ x: 200, z: 0, headingDeg: 90, speedKph: 5 }, rules, [field, water]);
  assert.equal(outside.insideAllowed, false);
  assert.equal(describeGeofence(outside), 'Fora da área permitida');
  assert.match(describeGeofence(evaluateGeofence({ x: 60, z: 0, headingDeg: 180, speedKph: 7.2 }, rules, [field, water])), /^Atenção · Córrego a 20 m à frente · ≈ 10 s de aproximação$/);
  assert.equal(describeGeofence(evaluateGeofence({ x: 60, z: 30, headingDeg: 90, speedKph: 3 }, rules, [field, water])), 'Proximidade crítica · Córrego', 'dentro do perigo não diz "a 0 m"');
  const outsideNear = evaluateGeofence({ x: 110, z: 30, headingDeg: 90, speedKph: 3 }, rules, [field, water]); // fora do talhão (x > 100) e dentro da água
  assert.equal(outsideNear.insideAllowed, false);
  assert.match(describeGeofence(outsideNear), /^Fora da área permitida · Proximidade crítica · Córrego$/, 'sair da cerca não some quando há perigo perto');
  for (const text of [describeGeofence(result), describeGeofence(outside)]) assert.doesNotMatch(text, /seguro|risco|acidente/i);
});

test('limite da máquina: margem em graus até max_roll_deg do perfil, fora de nearest; sem sinal, sem faixa', () => {
  const withMachine = { hazards: [...rules.hazards, { role: 'machine', metric: 'roll_deg', label: 'Limite de inclinação da máquina',
    bands_m: [{ id: 'acima', label: 'Acima do limite', max_m: 0 }, { id: 'proximo', label: 'Próximo do limite', max_m: 5 }] }] };
  const tractor = { profile: { max_roll_deg: 25 } };
  const flat = evaluateGeofence({ x: 60, z: 0, headingDeg: 90, rollDeg: 10 }, withMachine, [field, water], tractor);
  assert.equal(flat.machine, null, 'margem de 15° fica fora das faixas');
  assert.equal(flat.nearest.hazardLabel, 'Córrego', 'radar espacial intacto');
  const near = evaluateGeofence({ x: 60, z: 0, rollDeg: -22 }, withMachine, [field, water], tractor);
  assert.equal(near.machine.bandId, 'proximo');
  assert.equal(near.machine.marginDeg, 3);
  assert.equal(near.machine.valueDeg, 22);
  assert.equal(near.all.length, 1, 'faixa de máquina não entra em all');
  const over = evaluateGeofence({ x: 60, z: 0, rollDeg: 34 }, withMachine, [field, water], tractor);
  assert.equal(over.machine.bandId, 'acima');
  assert.equal(over.machine.marginDeg, 0);
  assert.equal(describeMachineLimit(over.machine), 'Acima do limite · inclinação 34° · limite 25°');
  assert.equal(evaluateGeofence({ x: 60, z: 0 }, withMachine, [field, water], tractor).machine, null, 'sem rollDeg');
  const noProfile = evaluateGeofence({ x: 60, z: 0, rollDeg: 34 }, withMachine, [field, water]);
  assert.equal(noProfile.machine, null);
  assert.equal(noProfile.warnings.length, 1, 'perfil ausente vira aviso, não faixa');
  assert.doesNotMatch(describeMachineLimit(near.machine), /seguro|risco|acidente/i);
});

const radarAt = (z, elapsedMs, extra = {}) => evaluateGeofence({ x: 60, z, headingDeg: 90, elapsedMs, ...extra }, rules, [field, water]);

test('tendência sem previous fica nula e preserva o tempo pelo rumo', () => {
  const hit = radarAt(0, 250, { speedKph: 7.2, headingDeg: 180 }).nearest;
  assert.equal(hit.closingSpeedMs, null);
  assert.equal(hit.trend, null);
  assert.equal(hit.timeToNextBandS, null);
  assert.equal(hit.timeToHazardEdgeS, null);
  assert.equal(hit.timeToHazardS, 10);
});

test('tendência geométrica: aproximação, afastamento, estabilidade e parada', () => {
  const approaching = radarAt(0, 250, { previous: { x: 60, z: -0.5, elapsedMs: 0 } }).nearest;
  assert.equal(approaching.closingSpeedMs, 2);
  assert.equal(approaching.trend, 'aproximando');
  assert.equal(approaching.timeToHazardEdgeS, 10);
  assert.equal(approaching.timeToNextBandS, 2.5);

  const receding = radarAt(0, 250, { previous: { x: 60, z: 0.5, elapsedMs: 0 } }).nearest;
  assert.equal(receding.trend, 'afastando');
  assert.equal(receding.timeToNextBandS, null);
  assert.equal(receding.timeToHazardEdgeS, null);

  const stable = radarAt(0, 250, { previous: { x: 60, z: -0.01, elapsedMs: 0 } }).nearest;
  assert.equal(stable.trend, 'estavel');
  assert.equal(stable.timeToNextBandS, null);
  assert.equal(stable.timeToHazardEdgeS, null);
  const stopped = radarAt(0, 250, { previous: { x: 60, z: 0, elapsedMs: 0 }, speedKph: 0 }).nearest;
  assert.equal(stopped.closingSpeedMs, 0);
  assert.equal(stopped.trend, 'estavel');
  assert.equal(stopped.timeToHazardEdgeS, null);
});

test('tendência usa a geometria em ré, de lado e dentro do polígono', () => {
  const reverse = evaluateGeofence({ x: 60, z: 0, headingDeg: 0, elapsedMs: 250, previous: { x: 60, z: -0.5, elapsedMs: 0 } }, rules, [field, water]).nearest;
  assert.equal(reverse.trend, 'aproximando');
  assert.equal(reverse.timeToHazardS, null);
  assert.equal(reverse.timeToHazardEdgeS, 10);

  const sideways = radarAt(0, 250, { previous: { x: 60, z: -0.5, elapsedMs: 0 } }).nearest;
  assert.equal(sideways.timeToHazardS, null);
  assert.equal(sideways.timeToHazardEdgeS, 10);

  const inside = evaluateGeofence({ x: 60, z: 30, elapsedMs: 250, previous: { x: 60, z: 29, elapsedMs: 0 } }, rules, [field, water]).nearest;
  assert.equal(inside.distanceM, 0);
  assert.equal(inside.timeToHazardEdgeS, null);
});

test('faixa mais interna, dt inválido e texto de tendência', () => {
  const inner = evaluateGeofence({ x: 60, z: 16, elapsedMs: 250, previous: { x: 60, z: 15.5, elapsedMs: 0 } }, rules, [field, water]).nearest;
  assert.equal(inner.bandId, 'critica');
  assert.equal(inner.timeToNextBandS, null);
  assert.match(describeGeofence(radarAt(0, 250, { previous: { x: 60, z: -0.5, elapsedMs: 0 } })), /aproximando · ≈ 3 s até a faixa proximidade elevada/);
  assert.match(describeGeofence(radarAt(0, 250, { previous: { x: 60, z: 0.5, elapsedMs: 0 } })), /afastando/);
  assert.doesNotMatch(describeGeofence(radarAt(0, 250, { previous: { x: 60, z: -0.01, elapsedMs: 0 } })), /aproximando|afastando/);

  const invalid = radarAt(0, 1000, { previous: { x: 60, z: -0.5, elapsedMs: 0 } }).nearest;
  assert.equal(invalid.closingSpeedMs, null);
  assert.equal(invalid.trend, null);
  assert.equal(invalid.timeToNextBandS, null);
  assert.equal(invalid.timeToHazardEdgeS, null);
  for (const text of [describeGeofence(inner), describeGeofence(invalid)]) assert.doesNotMatch(text, /seguro|risco|tombar|acidente|negligência/i);
});
