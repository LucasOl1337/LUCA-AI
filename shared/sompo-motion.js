/** Continuous kinematics shared by both renderers. Units: seconds, metres, radians.
 * Sampling or seeking the same time always returns the same wheel/rotor phase.
 */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const valueAt = (frame, channel) => channel === 'wheelSpeedKph' ? frame.wheelSpeedKph ?? frame.speedKph : frame[channel] ?? 0;
export function integrateSompoMotion(frames, elapsedMs, channel = 'wheelSpeedKph', signed = true) {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  let integral = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i], duration = b.atMs - a.atMs;
    if (duration <= 0 || elapsed <= a.atMs) continue;
    const p = clamp((elapsed - a.atMs) / duration, 0, 1);
    const direction = signed ? a.direction ?? 1 : 1;
    const v0 = valueAt(a, channel), v1 = valueAt(b, channel);
    integral += duration / 1000 * direction * (v0 * p + (v1 - v0) * (p ** 3 - p ** 4 / 2));
    if (elapsed <= b.atMs) return integral;
  }
  const last = frames.at(-1);
  return integral + Math.max(0, elapsed - last.atMs) / 1000 * valueAt(last, channel) * (signed ? last.direction ?? 1 : 1);
}

export function sompoSteeringAngle(speedKph, direction, yawRate, wheelbase, rearSteer = false) {
  const speed = speedKph / 3.6 * direction;
  if (Math.abs(speed) < 0.12 || yawRate === 0) return 0;
  return clamp(Math.atan(yawRate * Math.PI / 180 * wheelbase / speed) * (rearSteer ? -1 : 1), -0.48, 0.48);
}

/** Integrate the authored heading, rather than sliding a turned machine along X.
 * A 60 Hz Simpson table is built once; partial cells are integrated at sample time.
 * Independent of display FPS. Explicit lateral offsets remain optional skid motion.
 */
export function createSompoMotionPath(sample, totalMs) {
  const step = 1000 / 60;
  const count = Math.ceil(totalMs / step);
  const xs = new Float64Array(count + 1), zs = new Float64Array(count + 1);
  function velocity(t) {
    const f = sample(t), speed = f.speedKph / 3.6 * f.direction, yaw = f.yaw * Math.PI / 180;
    return [speed * Math.cos(yaw), -speed * Math.sin(yaw)];
  }
  function segment(a, b) {
    const v0 = velocity(a), vm = velocity((a + b) / 2), v1 = velocity(b);
    const dt = (b - a) / 6000;
    return [dt * (v0[0] + 4 * vm[0] + v1[0]), dt * (v0[1] + 4 * vm[1] + v1[1])];
  }
  for (let i = 1; i <= count; i++) {
    const [x, z] = segment((i - 1) * step, Math.min(totalMs, i * step));
    xs[i] = xs[i - 1] + x; zs[i] = zs[i - 1] + z;
  }
  return {
    sample(elapsedMs, target) {
      const t = clamp(elapsedMs, 0, totalMs), index = Math.min(count, Math.floor(t / step));
      const [x, z] = segment(Math.min(index * step, totalMs), t);
      const tail = Math.max(0, elapsedMs - totalMs) / 1000, v = velocity(totalMs);
      target.x = xs[index] + x + tail * v[0]; target.z = zs[index] + z + tail * v[1];
      return target;
    },
  };
}
