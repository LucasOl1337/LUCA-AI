import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DROWSINESS_VIDEO_CONSTRAINTS,
  describeCameraStream,
  findPreferredCamera,
  formatCameraQuality,
  openPreferredCamera,
} from '../src/sonolencia/camera.js';

function device(label, deviceId) {
  return { kind: 'videoinput', label, deviceId, groupId: '' };
}

function stream(label, deviceId, settings = {}) {
  const stopped = [];
  const track = {
    label,
    getSettings: () => ({ deviceId, ...settings }),
    stop: () => stopped.push(true),
  };
  return { value: { getVideoTracks: () => [track], getTracks: () => [track] }, stopped };
}

test('câmera de sonolência pede Full HD e prioriza a EMEET virtual', async () => {
  assert.deepEqual(DROWSINESS_VIDEO_CONSTRAINTS.width, { ideal: 1920 });
  assert.deepEqual(DROWSINESS_VIDEO_CONSTRAINTS.height, { ideal: 1080 });
  assert.deepEqual(DROWSINESS_VIDEO_CONSTRAINTS.frameRate, { ideal: 30, max: 30 });
  assert.equal(findPreferredCamera([
    device('EMEET SmartCam S600', 'raw'),
    device('EMEET 1080p60', 'virtual'),
  ]).deviceId, 'virtual');

  const selected = stream('EMEET 1080p60', 'virtual', { width: 1920, height: 1080, frameRate: 30 });
  const calls = [];
  const mediaDevices = {
    enumerateDevices: async () => [device('Outra webcam', 'other'), device('EMEET 1080p60', 'virtual')],
    getUserMedia: async constraints => { calls.push(constraints); return selected.value; },
  };
  assert.equal(await openPreferredCamera(mediaDevices), selected.value);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].video.deviceId, { exact: 'virtual' });
  assert.deepEqual(calls[0].video.width, { ideal: 1920 });
});

test('primeira permissão revela a EMEET e troca a webcam genérica sem vazamento', async () => {
  const initial = stream('Outra webcam', 'other');
  const selected = stream('EMEET 1080p60', 'virtual');
  let allowed = false;
  const calls = [];
  const mediaDevices = {
    enumerateDevices: async () => allowed
      ? [device('Outra webcam', 'other'), device('EMEET 1080p60', 'virtual')]
      : [device('', 'other'), device('', 'virtual')],
    getUserMedia: async constraints => {
      calls.push(constraints);
      allowed = true;
      return calls.length === 1 ? initial.value : selected.value;
    },
  };
  assert.equal(await openPreferredCamera(mediaDevices), selected.value);
  assert.equal(calls.length, 2);
  assert.equal(initial.stopped.length, 1);
  assert.deepEqual(calls[1].video.deviceId, { exact: 'virtual' });
});

test('sem EMEET mantém a melhor webcam disponível e informa o modo negociado', async () => {
  const fallback = stream('Webcam USB', 'usb', { width: 1280, height: 720, frameRate: 30 });
  let allowed = false;
  const mediaDevices = {
    enumerateDevices: async () => allowed ? [device('Webcam USB', 'usb')] : [device('', 'usb')],
    getUserMedia: async () => { allowed = true; return fallback.value; },
  };
  const opened = await openPreferredCamera(mediaDevices);
  assert.equal(opened, fallback.value);
  assert.equal(fallback.stopped.length, 0);
  const quality = describeCameraStream(opened);
  assert.deepEqual(quality, { label: 'Webcam USB', width: 1280, height: 720, frameRate: 30 });
  assert.equal(formatCameraQuality(quality), 'Qualidade ativa: 1280×720 a 30 FPS · Webcam USB.');
});
