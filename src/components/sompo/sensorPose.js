export const SOMPO_EULER_ORDER = 'YZX';
export const SOMPO_YAW_NOISE_FLOOR_DPS = 1.5;

export const DEFAULT_SOMPO_AXIS_CALIBRATION = Object.freeze({
  invertPitch: false,
  invertRoll: false,
  invertYaw: false,
  swapPitchRoll: false,
});

const toRadians = (degrees) => degrees * (Math.PI / 180);

export function sensorReadingToPose(reading, calibration = DEFAULT_SOMPO_AXIS_CALIBRATION) {
  let pitch = Number.isFinite(reading.pitch) ? reading.pitch : 0;
  let roll = Number.isFinite(reading.roll) ? reading.roll : 0;
  const deltaSeconds = Math.max(0, Number.isFinite(reading.deltaSeconds) ? reading.deltaSeconds : 0);
  let heading = Number.isFinite(reading.currentHeading) ? reading.currentHeading : 0;
  if (calibration.swapPitchRoll) [pitch, roll] = [roll, pitch];
  if (calibration.invertPitch) pitch *= -1;
  if (calibration.invertRoll) roll *= -1;

  let yawRate = Number.isFinite(reading.yawRate) ? reading.yawRate : 0;
  yawRate = Math.max(-180, Math.min(180, yawRate));
  if (calibration.invertYaw) yawRate *= -1;
  // Zona morta: abaixo do piso de ruido o rumo NAO se mexe. E o que impede a
  // deriva com o caminhao parado. O rumo tambem nao volta sozinho para zero:
  // um gemeo que desfaz a curva alguns segundos depois de ela acontecer nao
  // acompanha a direcao do caminhao fisico, que e justamente o que se pede
  // dele. A deriva residual de curvas reais se corrige no botao de recentrar.
  if (Math.abs(yawRate) > SOMPO_YAW_NOISE_FLOOR_DPS) {
    heading += toRadians(yawRate) * deltaSeconds;
  }

  return {
    rotationX: toRadians(roll),
    rotationY: heading,
    rotationZ: toRadians(pitch),
    order: SOMPO_EULER_ORDER,
  };
}
