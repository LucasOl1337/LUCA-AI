/** One logical clock for rendering and synthetic telemetry. Recording uses real time. */
export function createSompoPlayback() {
  let epoch = NaN, at = 0, elapsed = 0, rate = 1, playing = true;
  function read(now: number, startedAt: number) {
    if (epoch !== startedAt) { epoch = startedAt; at = startedAt; elapsed = 0; }
    return Math.max(0, elapsed + (playing ? (now - at) * rate : 0));
  }
  return {
    read,
    setPlaying(value: boolean, now: number, startedAt: number) { elapsed = read(now, startedAt); at = now; playing = value; },
    setRate(value: number, now: number, startedAt: number) { elapsed = read(now, startedAt); at = now; rate = Math.min(2, Math.max(.25, value)); },
    seek(value: number, now: number, startedAt: number) { epoch = startedAt; elapsed = Math.max(0, value); at = now; },
  };
}
