export const CLOSED_DURATION_MS = 1000;
export const MAX_FRAME_GAP_MS = 500;
export const SENSITIVITY_THRESHOLDS = Object.freeze({ low: 0.5, normal: 0.4, high: 0.3 });
const OPEN_EYE_SCORE = 0.1;
const MAX_AMBIGUOUS_MS = 200;

export function normalizeEyeClosure(score, threshold = SENSITIVITY_THRESHOLDS.normal) {
  if (!Number.isFinite(score) || !Number.isFinite(threshold) || threshold <= OPEN_EYE_SCORE) return 0;
  if (score <= OPEN_EYE_SCORE) return 0;
  if (score >= threshold) return 1;
  return (score - OPEN_EYE_SCORE) / (threshold - OPEN_EYE_SCORE);
}

function classifyClosure(sample, threshold, continuing) {
  const average = (sample.left + sample.right) / 2;
  const weakestEye = Math.min(sample.left, sample.right);
  const averageLimit = continuing ? threshold * 0.8 : threshold;
  const weakestEyeLimit = continuing ? threshold * 0.55 : threshold * 0.6;
  if (average >= averageLimit && weakestEye >= weakestEyeLimit) return 'closed';
  if (continuing && average >= threshold * 0.5 && weakestEye >= threshold * 0.35) return 'ambiguous';
  return 'open';
}

/** Only consecutive, fresh observations of BOTH eyes count as closed time. */
export function createEyeMonitor(threshold = SENSITIVITY_THRESHOLDS.normal) {
  let closedSince = null;
  let lastAt = null;
  let wasClosed = false;
  let ambiguousSince = null;
  return {
    reset() { closedSince = null; lastAt = null; wasClosed = false; ambiguousSince = null; },
    update(sample, at) {
      if (!Number.isFinite(at)) {
        this.reset();
        return { status: 'unknown', closedMs: 0, alarm: false };
      }
      if (lastAt !== null && (at <= lastAt || at - lastAt > MAX_FRAME_GAP_MS)) {
        closedSince = null;
        wasClosed = false;
        ambiguousSince = null;
      }
      lastAt = at;
      const valid = sample && [sample.left, sample.right].every(v => Number.isFinite(v) && v >= 0 && v <= 1);
      if (!valid) {
        closedSince = null;
        wasClosed = false;
        ambiguousSince = null;
        return { status: 'unknown', closedMs: 0, alarm: false };
      }
      const classification = classifyClosure(sample, threshold, wasClosed);
      const alarmWasActive = closedSince !== null && at - closedSince >= CLOSED_DURATION_MS;
      let closed = classification === 'closed';
      if (classification === 'ambiguous' && !alarmWasActive) {
        if (ambiguousSince === null) ambiguousSince = at;
        closed = at - ambiguousSince <= MAX_AMBIGUOUS_MS;
      } else {
        ambiguousSince = null;
      }
      wasClosed = closed;
      if (!closed) closedSince = null;
      else if (closedSince === null) closedSince = at;
      const closedMs = closedSince === null ? 0 : at - closedSince;
      const alarm = closedMs >= CLOSED_DURATION_MS;
      return { status: alarm ? 'alarm' : closed ? 'closed' : 'open', closedMs, alarm };
    },
  };
}
