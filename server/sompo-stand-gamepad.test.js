import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { getSompoAgriOutcomes, getSompoAgriEpisodePlan } from '../shared/sompo-agri-brief.js';

async function load(path) {
  const result = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

const { readStandPad, EMPTY_PAD_STATE } = await load('../src/components/sompo/gamepadMapping.ts');
const { stepLook, nudgeLook } = await load('../src/components/sompo/firstPersonLook.ts');
const { STAND_SCENARIOS, standScenarioFor } = await load('../src/components/sompo/standScenarios.ts');

/** DualSense em repouso, mapping standard: 17 botões, 4 eixos. */
function pad({ axes = [0, 0, 0, 0], pressed = [], values = {}, mapping = 'standard' } = {}) {
  return {
    mapping,
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: pressed.includes(index) || (values[index] ?? 0) > 0.5,
      value: values[index] ?? (pressed.includes(index) ? 1 : 0),
    })),
  };
}

test('analógico direito: dentro da zona morta não olha; no fim de curso olha no máximo', () => {
  assert.deepEqual(readStandPad(pad({ axes: [0, 0, 0.05, -0.1] })).look, { yaw: 0, pitch: 0 });
  const full = readStandPad(pad({ axes: [0, 0, 1, -1] })).look;
  assert.equal(full.yaw, -1); // direita no analógico = olhar para a direita (yaw negativo)
  assert.equal(full.pitch, 1); // analógico para cima = olhar para cima
});

test('zona morta reescala: 0,56 no eixo vira 0,5 de comando', () => {
  assert.ok(Math.abs(readStandPad(pad({ axes: [0.56, 0, 0, 0] })).drive.steer - 0.5) < 1e-9);
});

test('✕ segurado por dois quadros gera um único toggle de cabine', () => {
  const first = readStandPad(pad({ pressed: [0] }), EMPTY_PAD_STATE);
  assert.deepEqual(first.actions, ['toggle-cabin']);
  const second = readStandPad(pad({ pressed: [0] }), first.next);
  assert.deepEqual(second.actions, []);
  const released = readStandPad(pad(), second.next);
  assert.deepEqual(readStandPad(pad({ pressed: [0] }), released.next).actions, ['toggle-cabin']);
});

test('□, △ e ○ disparam os cenários a, b e c; Options reinicia', () => {
  assert.deepEqual(readStandPad(pad({ pressed: [2] })).actions, ['scenario:a']);
  assert.deepEqual(readStandPad(pad({ pressed: [3] })).actions, ['scenario:b']);
  assert.deepEqual(readStandPad(pad({ pressed: [1] })).actions, ['scenario:c']);
  assert.deepEqual(readStandPad(pad({ pressed: [9] })).actions, ['restart']);
});

test('R2 e L2 são progressivos', () => {
  const drive = readStandPad(pad({ values: { 7: 0.4, 6: 0.75 } })).drive;
  assert.equal(drive.throttle, 0.4);
  assert.equal(drive.brake, 0.75);
  assert.equal(readStandPad(pad({ values: { 7: 0.02 } })).drive.throttle, 0);
});

test('controle sem mapping standard não gera comando', () => {
  const reading = readStandPad(pad({ mapping: '', pressed: [0, 2], axes: [1, 1, 1, 1] }));
  assert.deepEqual(reading.actions, []);
  assert.deepEqual(reading.look, { yaw: 0, pitch: 0 });
  assert.equal(readStandPad(null).actions.length, 0);
});

test('olhar fica limitado a ±100° de yaw e ±35° de pitch', () => {
  let state = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 100; i += 1) state = stepLook(state, { yaw: 1, pitch: -1 }, 0.05);
  assert.deepEqual(state, { yaw: 100, pitch: -35 });
  assert.deepEqual(nudgeLook({ yaw: -90, pitch: 30 }, -40, 20), { yaw: -100, pitch: 35 });
});

test('analógico solto volta ao centro em ~0,6 s; mouse não recentra', () => {
  let state = { yaw: 80, pitch: 20 };
  for (let i = 0; i < 40; i += 1) state = stepLook(state, { yaw: 0, pitch: 0 }, 1 / 60, { recenter: true });
  assert.ok(Math.abs(state.yaw) < 80 * 0.02, `yaw ${state.yaw}`);
  assert.deepEqual(stepLook({ yaw: 80, pitch: 20 }, { yaw: 0, pitch: 0 }, 1 / 60), { yaw: 80, pitch: 20 });
});

test('os três cenários do stand apontam para case + desfecho do MAX com plano de episódio', () => {
  assert.deepEqual(STAND_SCENARIOS.map((item) => item.id), ['stand-obstaculo-a-tempo', 'stand-inclinacao', 'stand-reacao-atrasada']);
  for (const scenario of STAND_SCENARIOS) {
    assert.ok(getSompoAgriOutcomes(scenario.caseId).some((item) => item.id === scenario.desfechoId), scenario.id);
    const plan = getSompoAgriEpisodePlan(scenario.caseId, scenario.desfechoId);
    assert.ok(plan, scenario.id);
    assert.equal(plan.outcomeId, scenario.desfechoId);
    assert.ok(scenario.pergunta.endsWith('?'));
  }
  assert.equal(standScenarioFor('scenario:c').id, 'stand-reacao-atrasada');
  assert.equal(standScenarioFor('toggle-cabin'), null);
});

const { createFreeDriveState, stepFreeDrive, freeDriveReadings, FREE_DRIVE } = await load('../src/components/sompo/firstPersonDrive.ts');
const drive = (state, input, seconds, obstacles = []) => {
  for (let t = 0; t < seconds; t += 1 / 60) state = stepFreeDrive(state, input, 1 / 60, obstacles);
  return state;
};

test('condução livre: R2 cheio chega ao teto de 12 km/h e não passa', () => {
  const state = drive(createFreeDriveState(0), { steer: 0, throttle: 1, brake: 0 }, 9);
  assert.ok(Math.abs(state.speed * 3.6 - FREE_DRIVE.maxForwardKph) < 1e-6);
  assert.ok(state.x > 15 && Math.abs(state.z) < 1e-9);
  // Na borda do talhão (±45 m) a máquina para em vez de sair do campo.
  const edge = drive(createFreeDriveState(40), { steer: 0, throttle: 1, brake: 0 }, 9);
  assert.equal(edge.x, FREE_DRIVE.fieldHalfM);
  assert.equal(edge.speed, 0);
});

test('condução livre: R2 pela metade acelera menos; sem pedal a máquina para sozinha', () => {
  const half = drive(createFreeDriveState(0), { steer: 0, throttle: 0.5, brake: 0 }, 2);
  const full = drive(createFreeDriveState(0), { steer: 0, throttle: 1, brake: 0 }, 2);
  assert.ok(half.speed > 0 && half.speed < full.speed);
  assert.equal(drive(full, { steer: 0, throttle: 0, brake: 0 }, 10).speed, 0);
});

test('condução livre: L2 freia mais rápido que soltar, e parado com L2 engata ré lenta', () => {
  const moving = drive(createFreeDriveState(0), { steer: 0, throttle: 1, brake: 0 }, 6);
  const braked = drive(moving, { steer: 0, throttle: 0, brake: 1 }, 1);
  const coasted = drive(moving, { steer: 0, throttle: 0, brake: 0 }, 1);
  assert.ok(braked.speed < coasted.speed);
  const reverse = drive(createFreeDriveState(0), { steer: 0, throttle: 0, brake: 1 }, 6);
  assert.ok(reverse.speed < 0 && reverse.speed * 3.6 >= -FREE_DRIVE.maxReverseKph - 1e-9);
  assert.equal(freeDriveReadings(reverse, []).reverse, true);
});

test('condução livre: analógico para a direita vira para a direita (+Z)', () => {
  const state = drive(createFreeDriveState(0), { steer: 1, throttle: 1, brake: 0 }, 3);
  assert.ok(state.z > 0.5, `z ${state.z}`);
  assert.ok(state.heading < 0);
  const still = drive(createFreeDriveState(0), { steer: 1, throttle: 0, brake: 0 }, 2);
  assert.equal(still.heading, 0); // parado, esterçar não gira a máquina
});

test('condução livre: alerta a 150 cm e parada no fardo sem atravessar', () => {
  const bale = [{ x: 10, z: 0, radius: 0.72 }];
  let state = createFreeDriveState(0);
  let alerted = null;
  for (let i = 0; i < 60 * 20 && !state.contact; i += 1) {
    state = stepFreeDrive(state, { steer: 0, throttle: 1, brake: 0 }, 1 / 60, bale);
    const reading = freeDriveReadings(state, bale);
    if (reading.collision && alerted === null) alerted = reading.distanceCm;
  }
  assert.ok(alerted !== null && alerted <= 150 && alerted > 140, `alerta em ${alerted}`);
  assert.equal(state.contact, true);
  assert.equal(state.speed, 0);
  assert.ok(Math.abs(state.x + FREE_DRIVE.sensorAheadM - (10 - 0.72)) < 1e-6);
  assert.equal(freeDriveReadings(state, bale).distanceCm, 2);
  assert.equal(freeDriveReadings(state, bale).contact, true);
});

test('condução livre: fardo fora da linha de frente não dá eco', () => {
  const reading = freeDriveReadings(createFreeDriveState(0), [{ x: 4, z: 3, radius: 0.72 }]);
  assert.equal(reading.distanceCm, FREE_DRIVE.echoLimitCm);
  assert.equal(reading.collision, false);
});
