import assert from 'node:assert/strict';
import test from 'node:test';
import { labVehiclePose } from '../shared/lab-vehicle-pose.js';

test('ESP32 sem GPS ainda mostra o caminhão no palco, com IMU crua', () => {
  const pose = labVehiclePose({
    recordingGap: false,
    position: null,
    hasGps: false,
    sample: {
      heading_deg: null,
      pitch_deg: null,
      roll_deg: null,
      imu_pitch_raw: 4.2,
      imu_roll_raw: -1.5,
    },
  });
  assert.equal(pose.visible, true);
  assert.equal(pose.studio, true);
  assert.equal(pose.hasGps, false);
  assert.equal(pose.x, 0);
  assert.equal(pose.z, 0);
  assert.equal(pose.pitchDeg, 4.2);
  assert.equal(pose.rollDeg, -1.5);
  assert.equal(pose.headingDeg, 90);
});

test('lacuna de registro não inventa pose', () => {
  const pose = labVehiclePose({
    recordingGap: true,
    position: null,
    sample: { imu_pitch_raw: 1, imu_roll_raw: 1 },
  });
  assert.equal(pose.visible, false);
});

test('GNSS com atitude geográfica usa a posição registrada', () => {
  const pose = labVehiclePose({
    recordingGap: false,
    position: { x: 12, z: -8 },
    sample: { heading_deg: 45, pitch_deg: 2, roll_deg: -3, imu_pitch_raw: 90, imu_roll_raw: 0 },
  });
  assert.equal(pose.visible, true);
  assert.equal(pose.studio, false);
  assert.equal(pose.x, 12);
  assert.equal(pose.z, -8);
  assert.equal(pose.headingDeg, 45);
  assert.equal(pose.pitchDeg, 2);
  assert.equal(pose.rollDeg, -3);
});
