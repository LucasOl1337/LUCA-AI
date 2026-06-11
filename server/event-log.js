import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const stateDir = path.resolve(process.cwd(), '.luca');
const eventLogPath = path.join(stateDir, 'runtime-events.jsonl');

function ensureStateDir() {
  fs.mkdirSync(stateDir, { recursive: true });
}

function normalizePayload(payload) {
  if (payload === undefined) return {};
  if (payload === null) return null;
  if (typeof payload === 'string') return { text: payload };
  return payload;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ value: String(value) });
  }
}

function normalizeListedEvent(entry = {}) {
  if (!entry || typeof entry !== 'object') return entry;
  const timestamp = entry.timestamp || entry.time || null;
  const ts = Number.isFinite(Number(entry.ts))
    ? Number(entry.ts)
    : (timestamp && Number.isFinite(Date.parse(timestamp)) ? Date.parse(timestamp) : Date.now());
  return {
    ...entry,
    ts,
    time: entry.time || timestamp,
    timestamp,
  };
}

function readLinesFromEnd(filePath, visitLine) {
  const fd = fs.openSync(filePath, 'r');
  const chunkSize = 64 * 1024;

  try {
    const { size } = fs.fstatSync(fd);
    let position = size;
    let remainder = '';

    while (position > 0) {
      const bytesToRead = Math.min(chunkSize, position);
      position -= bytesToRead;

      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, position);

      const combined = buffer.toString('utf8') + remainder;
      const lines = combined.split(/\r?\n/);
      remainder = lines.shift() ?? '';

      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index]?.trim();
        if (!line) continue;
        if (visitLine(line) === true) return;
      }
    }

    const finalLine = remainder.trim();
    if (finalLine) visitLine(finalLine);
  } finally {
    fs.closeSync(fd);
  }
}

function normalizeEventMetadata(event = {}) {
  const missionId = event?.missionId ? String(event.missionId) : null;
  const goalId = event?.goalId ? String(event.goalId) : null;
  const traceId = event?.traceId ? String(event.traceId) : null;
  const source = event?.source ? String(event.source) : null;
  return { missionId, goalId, traceId, source };
}

function normalizeImplicitPayload(event = {}) {
  if (!event || typeof event !== 'object') return {};
  const payload = { ...event };
  delete payload.id;
  delete payload.type;
  delete payload.time;
  delete payload.ts;
  delete payload.payload;
  delete payload.source;
  delete payload.missionId;
  delete payload.goalId;
  delete payload.traceId;
  return payload;
}

export function appendEvent(event = {}) {
  const type = String(event?.type ?? '').trim();
  if (!type) throw new Error('event_type_required');
  const createdAt = event?.time ?? new Date().toISOString();
  const metadata = normalizeEventMetadata(event);
  const entry = {
    id: event.id ?? `evt_${randomUUID()}`,
    type,
    time: createdAt,
    ts: Number.isFinite(Date.parse(createdAt)) ? Date.parse(createdAt) : Date.now(),
    source: metadata.source,
    missionId: metadata.missionId,
    goalId: metadata.goalId,
    traceId: metadata.traceId,
    payload: normalizePayload(event.payload ?? normalizeImplicitPayload(event)),
  };
  ensureStateDir();
  fs.appendFileSync(eventLogPath, `${safeJsonStringify(entry)}\n`, 'utf8');
  return entry;
}

export function listEvents({ limit = 100, type = '', missionId = '', goalId = '', traceId = '' } = {}) {
  const cappedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const wantedType = String(type ?? '').trim();
  const wantedMissionId = String(missionId ?? '').trim();
  const wantedGoalId = String(goalId ?? '').trim();
  const wantedTraceId = String(traceId ?? '').trim();
  if (!fs.existsSync(eventLogPath)) return [];
  const events = [];
  readLinesFromEnd(eventLogPath, (line) => {
    const parsed = safeJsonParse(line);
    if (!parsed || typeof parsed !== 'object') return false;
    if (wantedType && parsed.type !== wantedType) return false;
    if (wantedMissionId && parsed.missionId !== wantedMissionId) return false;
    if (wantedGoalId && parsed.goalId !== wantedGoalId) return false;
    if (wantedTraceId && parsed.traceId !== wantedTraceId) return false;
    events.push(normalizeListedEvent(parsed));
    return events.length >= cappedLimit;
  });
  return events;
}

export function eventSummary({ limit = 500, type = '', missionId = '', goalId = '', traceId = '' } = {}) {
  const events = listEvents({ limit, type, missionId, goalId, traceId });
  const byType = new Map();
  const bySource = new Map();
  for (const event of events) {
    byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
    const source = event?.source || 'unknown';
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
  }
  return {
    total: events.length,
    latest: events[0] ?? null,
    oldest: events.at(-1) ?? null,
    filters: {
      type: String(type ?? '').trim() || null,
      missionId: String(missionId ?? '').trim() || null,
      goalId: String(goalId ?? '').trim() || null,
      traceId: String(traceId ?? '').trim() || null,
      sampledLimit: Math.max(1, Math.min(500, Number(limit) || 500)),
    },
    byType: Array.from(byType.entries()).map(([eventType, total]) => ({ type: eventType, total })),
    bySource: Array.from(bySource.entries()).map(([source, total]) => ({ source, total })),
  };
}

export function eventFlows({ limit = 40, type = '', missionId = '', goalId = '', traceId = '' } = {}) {
  const cappedLimit = Math.max(1, Math.min(200, Number(limit) || 40));
  const events = listEvents({
    limit: Math.max(cappedLimit * 8, 200),
    type,
    missionId,
    goalId,
    traceId,
  }).slice().reverse();
  const flows = [];
  let current = null;
  const WINDOW_MS = 20_000;

  function finalizeFlow(flow, index) {
    const steps = flow.steps;
    const tsStart = steps[0]?.ts ?? null;
    const tsEnd = steps.at(-1)?.ts ?? null;
    const totalMs = typeof tsStart === 'number' && typeof tsEnd === 'number'
      ? Math.max(0, tsEnd - tsStart)
      : 0;
    const types = Array.from(new Set(steps.map((step) => step.type).filter(Boolean)));
    return {
      id: flow.traceId || `win-${tsStart}-${index}`,
      traceId: flow.traceId,
      missionId: flow.missionId,
      goalId: flow.goalId,
      source: flow.source,
      tsStart,
      tsEnd,
      totalMs,
      stepCount: steps.length,
      inferred: flow.inferred,
      summary: `${steps.length} evento(s): ${types.join(' -> ') || 'sequencia operacional'}`,
      steps,
    };
  }

  for (const event of events) {
    const step = {
      id: event.id,
      ts: event.ts,
      time: event.time,
      type: event.type,
      source: event.source || 'unknown',
      missionId: event.missionId,
      goalId: event.goalId,
      traceId: event.traceId,
      label: `${event.type}${event.source ? ` · ${event.source}` : ''}`,
      payload: event.payload,
    };
    const eventTraceId = event.traceId || null;
    if (!current) {
      current = {
        traceId: eventTraceId,
        missionId: event.missionId || null,
        goalId: event.goalId || null,
        source: event.source || 'unknown',
        steps: [step],
        lastTs: event.ts,
        inferred: !eventTraceId,
      };
      continue;
    }
    const sameTrace = Boolean(eventTraceId) && eventTraceId === current.traceId;
    const inWindow = !eventTraceId && !current.traceId && (event.ts - current.lastTs) <= WINDOW_MS;
    if (sameTrace || inWindow) {
      current.steps.push(step);
      current.lastTs = event.ts;
      if (!current.missionId && event.missionId) current.missionId = event.missionId;
      if (!current.goalId && event.goalId) current.goalId = event.goalId;
      continue;
    }
    flows.push(current);
    current = {
      traceId: eventTraceId,
      missionId: event.missionId || null,
      goalId: event.goalId || null,
      source: event.source || 'unknown',
      steps: [step],
      lastTs: event.ts,
      inferred: !eventTraceId,
    };
  }
  if (current) flows.push(current);

  return {
    flows: flows.slice(-cappedLimit).reverse().map((flow, index) => finalizeFlow(flow, index)),
    generatedAt: new Date().toISOString(),
    filters: {
      type: String(type ?? '').trim() || null,
      missionId: String(missionId ?? '').trim() || null,
      goalId: String(goalId ?? '').trim() || null,
      traceId: String(traceId ?? '').trim() || null,
      sampledLimit: cappedLimit,
    },
  };
}
