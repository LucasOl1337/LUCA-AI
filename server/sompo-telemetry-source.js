import { requestJson } from '../shared/request-timeout.js';
import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';

export const SOMPO_TELEMETRY_FIREBASE_URL =
  'https://trator-monitoramento-default-rtdb.firebaseio.com/trator/001/sensores.json';

function snapshotFingerprint(snapshot) {
  return JSON.stringify({
    tractorId: snapshot.tractorId,
    deviceTimestamp: snapshot.deviceTimestamp,
    risks: snapshot.risks,
    readings: snapshot.readings,
  });
}

export function createSompoTelemetrySource({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = 5_000,
  cacheMs = 1_500,
  staleAfterMs = 15_000,
  url = SOMPO_TELEMETRY_FIREBASE_URL,
} = {}) {
  let cached = null;
  let cachedAt = 0;
  let pending = null;
  let lastFingerprint = null;
  let lastChangedAt = 0;
  let changeConfirmed = false;

  async function fetchSnapshot() {
    const raw = await requestJson(url, { fetchImpl, timeoutMs });
    const observedMs = now();
    const observedAt = new Date(observedMs).toISOString();
    const snapshot = normalizeSompoTelemetry(raw, { observedAt });
    const fingerprint = snapshotFingerprint(snapshot);

    if (lastFingerprint === null) {
      lastChangedAt = observedMs;
    } else if (fingerprint !== lastFingerprint) {
      lastChangedAt = observedMs;
      changeConfirmed = true;
    }
    lastFingerprint = fingerprint;

    const unchangedForMs = Math.max(0, observedMs - lastChangedAt);
    const freshness = unchangedForMs >= staleAfterMs
      ? 'stale'
      : changeConfirmed
        ? 'fresh'
        : 'checking';

    return {
      ...snapshot,
      changedAt: new Date(lastChangedAt).toISOString(),
      unchangedForMs,
      freshness,
    };
  }

  return {
    async read() {
      const currentMs = now();
      if (cached && currentMs - cachedAt < cacheMs) return cached;
      if (pending) return pending;

      pending = fetchSnapshot()
        .then((snapshot) => {
          cached = snapshot;
          cachedAt = now();
          return snapshot;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}

export const sompoTelemetrySource = createSompoTelemetrySource();

export function createSompoTelemetryHttpHandler(source = sompoTelemetrySource) {
  return async function sompoTelemetryHttpHandler(_req, res) {
    try {
      const telemetry = await source.read();
      res.json({ ok: true, telemetry });
    } catch {
      res.status(502).json({
        ok: false,
        error: 'sompo_telemetry_unavailable',
        message: 'A telemetria do trator não respondeu. Tente novamente em instantes.',
      });
    }
  };
}
