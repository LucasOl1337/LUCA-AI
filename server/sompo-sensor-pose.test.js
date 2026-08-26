import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_SOMPO_AXIS_CALIBRATION,
  SOMPO_EULER_ORDER,
  sensorReadingToPose,
} from '../src/components/sompo/sensorPose.js';

const simulatorSource = readFileSync(new URL('../src/components/SompoTruckSimulator.tsx', import.meta.url), 'utf8');

test('identidade aplica arfagem em Z e rolagem em X na ordem YZX', () => {
  const pose = sensorReadingToPose({ pitch: 20, roll: 5, yawRate: 0 });
  assert.equal(pose.order, SOMPO_EULER_ORDER);
  assert.ok(Math.abs(pose.rotationZ - (5 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(pose.rotationX - (20 * Math.PI / 180)) < 1e-12);
});

test('firmware pitch vira rolagem em X e firmware roll vira arfagem em Z', () => {
  const fromFirmwarePitch = sensorReadingToPose({ pitch: 20, yawRate: 0 });
  const fromFirmwareRoll = sensorReadingToPose({ roll: 5, yawRate: 0 });
  assert.ok(Math.abs(fromFirmwarePitch.rotationX - (20 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(fromFirmwarePitch.rotationZ) < 1e-12);
  assert.ok(Math.abs(fromFirmwareRoll.rotationZ - (5 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(fromFirmwareRoll.rotationX) < 1e-12);
});

test('inversao espelha arfagem e troca permuta pitch com roll', () => {
  const inverted = sensorReadingToPose(
    { pitch: 20, roll: 5, yawRate: 0 },
    { ...DEFAULT_SOMPO_AXIS_CALIBRATION, invertPitch: true },
  );
  const swapped = sensorReadingToPose(
    { pitch: 20, roll: 5, yawRate: 0 },
    { ...DEFAULT_SOMPO_AXIS_CALIBRATION, swapPitchRoll: true },
  );
  assert.ok(inverted.rotationZ < 0);
  assert.ok(Math.abs(inverted.rotationZ - (-5 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(swapped.rotationZ - (20 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(swapped.rotationX - (5 * Math.PI / 180)) < 1e-12);
});

test('calibracao persistente usa chave v2 para descartar swap antigo', () => {
  assert.match(simulatorSource, /luca:sompo-axis-calibration:v2/);
  assert.doesNotMatch(simulatorSource, /luca:sompo-axis-calibration:v1/);
});

test('ruido de guinada nao acumula rumo com o caminhao parado', () => {
  let heading = 0;
  for (let index = 0; index < 300; index += 1) {
    heading = sensorReadingToPose({
      pitch: 0,
      roll: 0,
      yawRate: index % 2 === 0 ? 1.2 : -1.1,
      currentHeading: heading,
      deltaSeconds: 0.1,
    }).rotationY;
  }
  assert.equal(heading, 0);
});

test('rumo de uma curva real fica onde parou em vez de voltar sozinho para zero', () => {
  // O gemeo tem que apontar para onde o caminhao fisico aponta. Um
  // recentramento automatico desfazia a curva poucos segundos depois dela
  // acontecer — a tela deixava de acompanhar a direcao, que e o defeito.
  const step = 1 / 60;
  let heading = 0;
  const advance = (yawRate, seconds) => {
    for (let index = 0; index < Math.round(seconds / step); index += 1) {
      heading = sensorReadingToPose({
        pitch: 0, roll: 0, yawRate, currentHeading: heading, deltaSeconds: step,
      }).rotationY;
    }
  };

  advance(45, 2);
  const afterTurn = heading * 180 / Math.PI;
  assert.ok(Math.abs(afterTurn - 90) < 0.5, `curva de 90 graus (${afterTurn})`);

  advance(0, 10);
  const afterRest = heading * 180 / Math.PI;
  assert.ok(Math.abs(afterRest - afterTurn) < 1e-9, `rumo mantido apos 10 s parado (${afterRest})`);
});

test('gemeo Firebase oferece recentrar guinada, que zera o rumo integrado', () => {
  assert.match(simulatorSource, /Recentrar guinada/);
  assert.match(simulatorSource, /recenterHeading\(\)\s*\{\s*liveHeading = 0;/);
  assert.match(simulatorSource, /onRecenterHeading=\{\(\) => sceneApiRef\.current\?\.recenterHeading\(\)\}/);
});

test('gemeo Firebase expoe calibracao persistente, reset e referencia da frente', () => {
  assert.match(simulatorSource, /Calibração de eixos/);
  assert.match(simulatorSource, /Inverter arfagem/);
  assert.match(simulatorSource, /Trocar arfagem ↔ rolagem/);
  assert.match(simulatorSource, /localStorage\.setItem\(SOMPO_AXIS_CALIBRATION_STORAGE_KEY/);
  assert.match(simulatorSource, /Voltar ao padrão/);
  assert.match(simulatorSource, /truckPoseGroup\.rotation\.order = isFirebase \? SOMPO_EULER_ORDER : 'XYZ'/);
  assert.match(simulatorSource, /frente-caminhao-mais-x/);
});
