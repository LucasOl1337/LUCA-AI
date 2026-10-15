/**
 * Condução livre do Trator MAX: cinemática de bicicleta simples e honesta, sem
 * física de pneu. Puro, em metros/segundos, no plano do talhão.
 * Convenção do palco: rotation.y = heading; frente = (cos h, 0, -sin h); direita = +Z com h = 0.
 */

export interface FreeDriveInput { steer: number; throttle: number; brake: number }
export interface FreeDriveState {
  x: number; z: number; heading: number;
  /** m/s com sinal: negativo é ré. */
  speed: number;
  /** Odômetro com sinal, para girar as rodas. */
  travel: number;
  /** rad/s, para o esterço visual. */
  yawRate: number;
  contact: boolean;
}
export interface FreeDriveObstacle { x: number; z: number; radius: number }

export const FREE_DRIVE = Object.freeze({
  /** Velocidade de trabalho de um trator de campo; os cases do MAX rodam a 6–8 km/h. */
  maxForwardKph: 12,
  maxReverseKph: 4,
  accel: 1.2, // m/s² com R2 no fim de curso
  brake: 3.5, // m/s² com L2 no fim de curso
  drag: 0.5, // m/s² rolando sem pedal
  maxSteerRad: 0.48, // mesmo limite visual do rig (sompoSteeringAngle)
  wheelbase: 2.6625, // SOMPO_AGRI_RIG_LAYOUT['max-tractor']
  /** Emissor do HC-SR04 à frente da origem da máquina, e o alcance em que há eco. */
  sensorAheadM: 2.2461,
  rearOverhangM: 1.9,
  echoLimitCm: 400,
  /** Mesmo limiar dos cases do obstáculo frontal ("Alerta a 150 cm"). */
  alertCm: 150,
  fieldHalfM: 45,
});

export function createFreeDriveState(x: number, z = 0, heading = 0): FreeDriveState {
  return { x, z, heading, speed: 0, travel: 0, yawRate: 0, contact: false };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Distância do emissor até a superfície do obstáculo na linha da frente, ou null fora do alcance/eixo. */
export function sensorDistanceM(state: Pick<FreeDriveState, 'x' | 'z' | 'heading'>, obstacles: readonly FreeDriveObstacle[]) {
  const fx = Math.cos(state.heading), fz = -Math.sin(state.heading);
  const sx = state.x + fx * FREE_DRIVE.sensorAheadM, sz = state.z + fz * FREE_DRIVE.sensorAheadM;
  let best: number | null = null;
  for (const item of obstacles) {
    // Raio frontal contra o círculo do obstáculo (cone estreito: só o eixo).
    const ox = item.x - sx, oz = item.z - sz;
    const along = ox * fx + oz * fz;
    const across2 = ox * ox + oz * oz - along * along;
    const r2 = item.radius * item.radius;
    if (across2 > r2) continue;
    const hit = along - Math.sqrt(r2 - across2);
    if (hit < -item.radius) continue;
    const distance = Math.max(0, hit);
    if (distance * 100 <= FREE_DRIVE.echoLimitCm && (best === null || distance < best)) best = distance;
  }
  return best;
}

/**
 * Um passo de `dt` s. L2 freia; parado e com L2 segurado, engata ré lenta.
 * Ao encostar no obstáculo pela frente, a máquina para ali (sem atravessar).
 */
export function stepFreeDrive(state: FreeDriveState, input: FreeDriveInput, dt: number, obstacles: readonly FreeDriveObstacle[] = []): FreeDriveState {
  const seconds = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  const throttle = clamp(input.throttle, 0, 1), brake = clamp(input.brake, 0, 1), steer = clamp(input.steer, -1, 1);
  const vMax = FREE_DRIVE.maxForwardKph / 3.6, vRev = -FREE_DRIVE.maxReverseKph / 3.6;
  let speed = state.speed;
  if (speed > 0.05 || (throttle > 0 && speed >= -0.05)) {
    speed += (throttle * FREE_DRIVE.accel - brake * FREE_DRIVE.brake - FREE_DRIVE.drag) * seconds;
    speed = clamp(speed, 0, vMax);
  } else if (brake > 0.2 && throttle === 0) {
    speed = Math.max(vRev, speed - brake * FREE_DRIVE.accel * 0.6 * seconds);
  } else {
    speed = Math.min(0, speed + (FREE_DRIVE.drag + throttle * FREE_DRIVE.brake) * seconds);
  }
  const yawRate = -(speed / FREE_DRIVE.wheelbase) * Math.tan(steer * FREE_DRIVE.maxSteerRad);
  const heading = state.heading + yawRate * seconds;
  let step = speed * seconds;
  let contact = false;
  if (step > 0) {
    const gap = sensorDistanceM({ x: state.x, z: state.z, heading }, obstacles);
    if (gap !== null && gap <= step) { step = gap; speed = 0; contact = true; }
  }
  const half = FREE_DRIVE.fieldHalfM;
  const x = clamp(state.x + Math.cos(heading) * step, -half, half);
  const z = clamp(state.z - Math.sin(heading) * step, -half, half);
  if (x !== state.x + Math.cos(heading) * step || z !== state.z - Math.sin(heading) * step) speed = 0;
  return { x, z, heading, speed, travel: state.travel + step, yawRate, contact: contact || (state.contact && speed === 0 && throttle > 0) };
}

/** Telemetria da condução livre, no mesmo formato que o painel lê. Tudo SIMULADO. */
export function freeDriveReadings(state: FreeDriveState, obstacles: readonly FreeDriveObstacle[]) {
  const gap = sensorDistanceM(state, obstacles);
  const distanceCm = gap === null ? FREE_DRIVE.echoLimitCm : Math.max(2, Math.round(gap * 100));
  return {
    speedKph: Math.abs(state.speed) * 3.6,
    reverse: state.speed < -0.01,
    distanceCm,
    collision: distanceCm <= FREE_DRIVE.alertCm,
    contact: state.contact || distanceCm <= 2,
  };
}

export interface FreeDriveScene { from: { x: number; z: number; heading: number }; obstacles: FreeDriveObstacle[] }
export type FreeDrivePose = ReturnType<typeof freeDrivePose>;

function freeDrivePose(state: FreeDriveState, input: FreeDriveInput, obstacles: readonly FreeDriveObstacle[]) {
  const reading = freeDriveReadings(state, obstacles);
  return {
    x: state.x, z: state.z, heading: state.heading, travel: state.travel,
    speedKph: reading.speedKph, direction: (state.speed < 0 ? -1 : 1) as 1 | -1, yawRateDeg: state.yawRate * 180 / Math.PI,
    distanceCm: reading.distanceCm, collision: reading.collision, contact: reading.contact, braking: input.brake > 0.05,
  };
}

/**
 * Liga a cinemática ao palco: com `freeRef` ligado, parte da pose atual do
 * roteiro e passa a integrar o controle; desligado, devolve null e esquece o estado.
 * A última pose fica em `poseRef` para o painel da cabine.
 */
export function createFreeDriveSource(freeRef: { current: boolean }, inputRef: { current: FreeDriveInput }, poseRef: { current: FreeDrivePose | null }) {
  let state: FreeDriveState | null = null;
  return (dt: number, scene: FreeDriveScene) => {
    if (!freeRef.current) { state = null; poseRef.current = null; return null; }
    state ??= createFreeDriveState(scene.from.x, scene.from.z, scene.from.heading);
    state = stepFreeDrive(state, inputRef.current, dt, scene.obstacles);
    poseRef.current = freeDrivePose(state, inputRef.current, scene.obstacles);
    return poseRef.current;
  };
}
