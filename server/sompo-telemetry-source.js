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

function pathSegments(path) {
  return String(path || '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function setAtPath(current, path, value) {
  const segments = pathSegments(path);
  if (segments.length === 0) return value;

  const root = current && typeof current === 'object' && !Array.isArray(current)
    ? structuredClone(current)
    : {};
  let cursor = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const child = cursor[segment];
    cursor[segment] = child && typeof child === 'object' && !Array.isArray(child) ? child : {};
    cursor = cursor[segment];
  }
  const leaf = segments.at(-1);
  if (value === null) delete cursor[leaf];
  else cursor[leaf] = value;
  return root;
}

function applyFirebaseEvent(current, eventName, payload) {
  const path = payload?.path || '/';
  if (eventName === 'put') return setAtPath(current, path, payload?.data ?? null);
  if (eventName !== 'patch') return current;

  const patch = payload?.data;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return setAtPath(current, path, patch ?? null);
  }
  return Object.entries(patch).reduce((next, [key, value]) => {
    const childPath = `${String(path).replace(/\/$/, '')}/${key}`;
    return setAtPath(next, childPath, value);
  }, current);
}

function parseSseBlock(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
    if (line.startsWith('data:')) data.push(line.slice('data:'.length).trimStart());
  }
  if (data.length === 0) return null;
  return { event, data: JSON.parse(data.join('\n')) };
}

function wait(delayMs) {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
  });
}

export function createSompoTelemetrySource({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  initialWaitMs = 5_000,
  reconnectDelayMs = 1_000,
  maxReconnectDelayMs = 15_000,
  staleAfterMs = 15_000,
  url = SOMPO_TELEMETRY_FIREBASE_URL,
} = {}) {
  const subscribers = new Set();
  const firstSnapshotWaiters = new Set();
  let running = false;
  let activeAbortController = null;
  let activeReader = null;
  let reconnectAttempt = 0;
  let rawSnapshot = null;
  let normalizedSnapshot = null;
  let lastFingerprint = null;
  let lastChangedAt = 0;
  let changeConfirmed = false;
  let staleTimer = null;
  let connection = {
    state: 'stopped',
    connectedAt: null,
    lastEventAt: null,
    retryAttempt: 0,
  };

  function materializeSnapshot() {
    if (!normalizedSnapshot) return null;
    const currentMs = now();
    const unchangedForMs = Math.max(0, currentMs - lastChangedAt);
    const freshness = unchangedForMs >= staleAfterMs
      ? 'stale'
      : changeConfirmed
        ? 'fresh'
        : 'checking';
    return {
      ...normalizedSnapshot,
      changedAt: new Date(lastChangedAt).toISOString(),
      unchangedForMs,
      freshness,
      connection: { ...connection },
    };
  }

  function notify() {
    const snapshot = materializeSnapshot();
    if (!snapshot) return;
    for (const listener of subscribers) {
      try {
        listener(snapshot);
      } catch {
        // Um caller com defeito não pode interromper o fluxo do equipamento.
      }
    }
  }

  function setConnection(state, { eventReceived = false } = {}) {
    if (state === 'live' && eventReceived) reconnectAttempt = 0;
    const timestamp = new Date(now()).toISOString();
    connection = {
      state,
      connectedAt: state === 'live' && connection.state !== 'live'
        ? timestamp
        : connection.connectedAt,
      lastEventAt: eventReceived ? timestamp : connection.lastEventAt,
      retryAttempt: reconnectAttempt,
    };
    notify();
  }

  function resolveFirstSnapshot(snapshot) {
    for (const waiter of firstSnapshotWaiters) waiter.resolve(snapshot);
    firstSnapshotWaiters.clear();
  }

  function scheduleStaleNotification() {
    if (staleTimer) clearTimeout(staleTimer);
    const delay = Math.max(0, staleAfterMs - (now() - lastChangedAt));
    staleTimer = setTimeout(() => {
      staleTimer = null;
      notify();
    }, delay + 1);
    staleTimer.unref?.();
  }

  function acceptRawSnapshot() {
    const observedMs = now();
    const observedAt = new Date(observedMs).toISOString();
    const next = normalizeSompoTelemetry(rawSnapshot, { observedAt });
    const fingerprint = snapshotFingerprint(next);
    if (lastFingerprint === null) {
      lastChangedAt = observedMs;
    } else if (fingerprint !== lastFingerprint) {
      lastChangedAt = observedMs;
      changeConfirmed = true;
    }
    lastFingerprint = fingerprint;
    normalizedSnapshot = next;
    setConnection('live', { eventReceived: true });
    const snapshot = materializeSnapshot();
    resolveFirstSnapshot(snapshot);
    scheduleStaleNotification();
  }

  function handleSseEvent({ event, data }) {
    if (event === 'keep-alive') {
      setConnection('live', { eventReceived: true });
      return;
    }
    if (event === 'cancel' || event === 'auth_revoked') {
      throw new Error(`sompo_telemetry_stream_${event}`);
    }
    if (event !== 'put' && event !== 'patch') return;
    rawSnapshot = applyFirebaseEvent(rawSnapshot, event, data);
    acceptRawSnapshot();
  }

  async function consumeStream() {
    activeAbortController = new AbortController();
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: activeAbortController.signal,
    });
    if (!response?.ok || !response.body?.getReader) {
      throw new Error(`sompo_telemetry_stream_http_${response?.status || 502}`);
    }

    activeReader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (running) {
      const { done, value } = await activeReader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        if (block) {
          const parsed = parseSseBlock(block);
          if (parsed) handleSseEvent(parsed);
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
    if (running) throw new Error('sompo_telemetry_stream_closed');
  }

  async function run() {
    while (running) {
      setConnection(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
      try {
        await consumeStream();
      } catch (error) {
        if (!running || error?.name === 'AbortError') break;
      } finally {
        activeReader = null;
        activeAbortController = null;
      }
      if (!running) break;
      reconnectAttempt += 1;
      setConnection('reconnecting');
      const delay = Math.min(
        maxReconnectDelayMs,
        reconnectDelayMs * (2 ** Math.max(0, reconnectAttempt - 1)),
      );
      await wait(delay);
    }
  }

  function start() {
    if (running) return;
    running = true;
    reconnectAttempt = 0;
    void run();
  }

  function stop() {
    if (!running) return;
    running = false;
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = null;
    activeAbortController?.abort();
    void activeReader?.cancel().catch(() => {});
    setConnection('stopped');
    for (const waiter of firstSnapshotWaiters) {
      waiter.reject(new Error('sompo_telemetry_stream_stopped'));
    }
    firstSnapshotWaiters.clear();
  }

  return {
    start,
    stop,

    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('sompo_telemetry_listener_required');
      subscribers.add(listener);
      const snapshot = materializeSnapshot();
      if (snapshot) listener(snapshot);
      return () => subscribers.delete(listener);
    },

    async read() {
      const snapshot = materializeSnapshot();
      if (snapshot) return snapshot;
      if (!running) start();
      return new Promise((resolve, reject) => {
        let timer;
        const waiter = {
          resolve(value) {
            clearTimeout(timer);
            resolve(value);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          },
        };
        timer = setTimeout(() => {
          firstSnapshotWaiters.delete(waiter);
          reject(new Error('sompo_telemetry_initial_timeout'));
        }, initialWaitMs);
        timer.unref?.();
        firstSnapshotWaiters.add(waiter);
      });
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
