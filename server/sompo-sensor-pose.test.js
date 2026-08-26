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
  assert.ok(Math.abs(pose.rotationZ - (20 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(pose.rotationX - (5 * Math.PI / 180)) < 1e-12);
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
  assert.ok(Math.abs(swapped.rotationZ - (5 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(swapped.rotationX - (20 * Math.PI / 180)) < 1e-12);
});

test('ruido de guinada nao acumula e repouso recentra uma guinada existente', () => {
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
  const recentered = sensorReadingToPose({ yawRate: 0, currentHeading: 0.5, deltaSeconds: 2 }).rotationY;
  assert.ok(recentered > 0 && recentered < 0.05);
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
