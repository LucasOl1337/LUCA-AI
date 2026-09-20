// Pose de exibição do equipamento no Laboratório.
// Sem GNSS o caminhão continua visível num palco local; IMU crua oriente a cabine
// sem virar heading geográfico nem inventar trajetória.

const origin = Object.freeze({ x: 0, y: 0, z: 0 });

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function labVehiclePose(frame, { studio = origin } = {}) {
  const sample = frame?.sample || null;
  const recordingGap = Boolean(frame?.recordingGap);
  const position = frame?.position || null;
  const heading = finite(sample?.heading_deg) ? sample.heading_deg : null;
  const geoPitch = finite(sample?.pitch_deg) ? sample.pitch_deg : null;
  const geoRoll = finite(sample?.roll_deg) ? sample.roll_deg : null;
  const imuPitch = finite(sample?.imu_pitch_raw) ? sample.imu_pitch_raw : null;
  const imuRoll = finite(sample?.imu_roll_raw) ? sample.imu_roll_raw : null;
  const pitch = geoPitch ?? imuPitch;
  const roll = geoRoll ?? imuRoll;
  const hasGps = Boolean(position);
  const hasAttitude = heading !== null && geoPitch !== null && geoRoll !== null;
  const hasImu = imuPitch !== null && imuRoll !== null;
  const visible = Boolean(sample) && !recordingGap && (hasGps || hasAttitude || hasImu);
  return {
    visible,
    studio: visible && !hasGps,
    hasGps,
    hasAttitude,
    x: hasGps ? position.x : studio.x,
    y: studio.y,
    z: hasGps ? position.z : studio.z,
    headingDeg: heading ?? 90,
    pitchDeg: pitch ?? 0,
    rollDeg: roll ?? 0,
  };
}
