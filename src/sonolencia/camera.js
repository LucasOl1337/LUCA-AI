export const DROWSINESS_VIDEO_CONSTRAINTS = Object.freeze({
  width: Object.freeze({ ideal: 1920 }),
  height: Object.freeze({ ideal: 1080 }),
  aspectRatio: Object.freeze({ ideal: 16 / 9 }),
  frameRate: Object.freeze({ ideal: 30, max: 30 }),
  resizeMode: Object.freeze({ ideal: 'none' }),
});

function cameraPriority(device) {
  if (device?.kind !== 'videoinput') return -1;
  const label = String(device.label || '').toLowerCase();
  if (label.includes('emeet 1080p60')) return 300;
  if (label.includes('emeet smartcam s600')) return 250;
  if (label.includes('emeet')) return 200;
  return 0;
}

export function findPreferredCamera(devices) {
  return [...(devices || [])]
    .filter(device => cameraPriority(device) > 0)
    .sort((left, right) => cameraPriority(right) - cameraPriority(left))[0] || null;
}

function constraintsFor(deviceId) {
  return {
    ...DROWSINESS_VIDEO_CONSTRAINTS,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

async function listDevices(mediaDevices) {
  if (typeof mediaDevices.enumerateDevices !== 'function') return [];
  try { return await mediaDevices.enumerateDevices(); }
  catch { return []; }
}

function stopStream(stream) {
  stream?.getTracks?.().forEach(track => track.stop());
}

export async function openPreferredCamera(mediaDevices) {
  const visibleDevices = await listDevices(mediaDevices);
  const visibleEmeet = findPreferredCamera(visibleDevices);
  if (visibleEmeet) {
    return mediaDevices.getUserMedia({ audio: false, video: constraintsFor(visibleEmeet.deviceId) });
  }

  // The browser hides device labels before the first permission grant. Open a
  // high-quality stream once, then switch only if permission reveals an EMEET.
  const initial = await mediaDevices.getUserMedia({ audio: false, video: constraintsFor() });
  const revealedEmeet = findPreferredCamera(await listDevices(mediaDevices));
  if (!revealedEmeet) return initial;

  const currentTrack = initial.getVideoTracks?.()[0];
  const currentDeviceId = currentTrack?.getSettings?.().deviceId;
  if (currentDeviceId === revealedEmeet.deviceId || /emeet/i.test(currentTrack?.label || '')) return initial;

  try {
    const preferred = await mediaDevices.getUserMedia({ audio: false, video: constraintsFor(revealedEmeet.deviceId) });
    stopStream(initial);
    return preferred;
  } catch {
    return initial;
  }
}

export function describeCameraStream(stream) {
  const track = stream?.getVideoTracks?.()[0];
  const settings = track?.getSettings?.() || {};
  return {
    label: String(track?.label || 'Webcam'),
    width: Number.isFinite(settings.width) ? Math.round(settings.width) : 0,
    height: Number.isFinite(settings.height) ? Math.round(settings.height) : 0,
    frameRate: Number.isFinite(settings.frameRate) ? Math.round(settings.frameRate) : 0,
  };
}

export function formatCameraQuality(quality) {
  const dimensions = quality.width && quality.height ? `${quality.width}×${quality.height}` : 'resolução automática';
  const fps = quality.frameRate ? ` a ${quality.frameRate} FPS` : '';
  return `Qualidade ativa: ${dimensions}${fps} · ${quality.label}.`;
}
