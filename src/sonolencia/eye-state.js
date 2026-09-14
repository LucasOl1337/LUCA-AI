export const CLOSED_DURATION_MS = 3000;
export const MAX_FRAME_GAP_MS = 500;

/** Only consecutive, fresh observations of BOTH eyes count as closed time. */
export function createEyeMonitor(threshold = 0.55) {
  let closedSince = null;
  let lastAt = null;
  let wasClosed = false;
  return {
    reset() { closedSince = null; lastAt = null; wasClosed = false; },
    update(sample, at) {
      if (!Number.isFinite(at)) {
        this.reset();
        return { status: 'unknown', closedMs: 0, alarm: false };
      }
      if (lastAt !== null && (at <= lastAt || at - lastAt > MAX_FRAME_GAP_MS)) {
        closedSince = null;
        wasClosed = false;
      }
      lastAt = at;
      const valid = sample && [sample.left, sample.right].every(v => Number.isFinite(v) && v >= 0 && v <= 1);
      if (!valid) {
        closedSince = null;
        wasClosed = false;
        return { status: 'unknown', closedMs: 0, alarm: false };
      }
      const limit = wasClosed ? threshold - 0.12 : threshold;
      const closed = sample.left >= limit && sample.right >= limit;
      wasClosed = closed;
      if (!closed) closedSince = null;
      else if (closedSince === null) closedSince = at;
      const closedMs = closedSince === null ? 0 : at - closedSince;
      const alarm = closedMs >= CLOSED_DURATION_MS;
      return { status: alarm ? 'alarm' : closed ? 'closed' : 'open', closedMs, alarm };
    },
  };
}
