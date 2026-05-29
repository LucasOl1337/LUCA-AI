// Scheduler de missoes recorrentes (portado do Maestro do VideoGen).
// Funcoes puras: operam sobre arrays e devolvem novos arrays, sem efeitos colaterais.

const MAX_SCHEDULED_MISSIONS = 30;
const MAX_MISSION_QUEUE = 80;

export function boundedNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function missionScheduleIsInfinite(value = {}) {
  if (value?.infinite === true) return true;
  const totalRuns = String(value?.totalRuns || '').trim().toLowerCase();
  return ['infinite', 'infinito', 'forever', 'sempre'].includes(totalRuns);
}

export function missionPayloadFromBody(body = {}) {
  const description = String(body.description || body.text || '').trim();
  return {
    title: String(body.title || description.slice(0, 80) || 'Missao LUCA-AI').trim(),
    description,
    success: String(body.success || '').trim(),
  };
}

function intervalFromBody(body = {}, fallbackMs = 60 * 60 * 1000) {
  if (body.intervalMs) return boundedNumber(body.intervalMs, 1000, 30 * 24 * 60 * 60 * 1000, fallbackMs);
  const unitMs = body.intervalUnit === 'hours' ? 60 * 60 * 1000
    : body.intervalUnit === 'days' ? 24 * 60 * 60 * 1000
      : 60 * 1000;
  return boundedNumber(body.intervalValue, 1, 100000, 1) * unitMs;
}

export function buildSchedule(body = {}) {
  const payload = missionPayloadFromBody(body);
  if (!payload.description) throw new Error('scheduled_mission_requires_description');
  const intervalMs = intervalFromBody(body);
  const infinite = missionScheduleIsInfinite(body);
  const totalRuns = infinite ? null : Math.round(boundedNumber(body.totalRuns, 1, 1000, 1));
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  return {
    id: `schedule-${new Date(now).toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(body.scheduleName || payload.title || 'Missao agendada').trim(),
    enabled: true,
    payload,
    intervalMs,
    intervalLabel: body.intervalUnit
      ? `${body.intervalValue || 1} ${body.intervalUnit}`
      : `${Math.round(intervalMs / 60000)} minutes`,
    infinite,
    totalRuns,
    remainingRuns: totalRuns,
    runCount: 0,
    queuedCount: 0,
    createdAt,
    updatedAt: createdAt,
    nextRunAt: new Date(body.startImmediately === true ? now : now + intervalMs).toISOString(),
    lastQueuedAt: null,
    completedAt: null,
  };
}

// Avalia os agendamentos vencidos e devolve novos arrays + itens enfileirados.
export function tickSchedules(scheduledMissions = [], missionQueue = [], { now = Date.now(), activeScheduleId = null } = {}) {
  const schedules = (Array.isArray(scheduledMissions) ? scheduledMissions : []).map((item) => ({ ...item }));
  const queue = Array.isArray(missionQueue) ? [...missionQueue] : [];
  const queuedItems = [];
  let changed = false;

  for (const schedule of schedules) {
    const infinite = missionScheduleIsInfinite(schedule);
    const hasRemainingRuns = infinite || Number(schedule?.remainingRuns || 0) > 0;
    if (!schedule?.enabled || !hasRemainingRuns || !schedule.nextRunAt) continue;
    const dueAt = Date.parse(schedule.nextRunAt);
    if (!Number.isFinite(dueAt) || dueAt > now) continue;

    const alreadyPending = queue.some((item) => item.scheduleId === schedule.id) || activeScheduleId === schedule.id;
    if (alreadyPending) {
      schedule.nextRunAt = new Date(now + Number(schedule.intervalMs || 60000)).toISOString();
      schedule.updatedAt = new Date(now).toISOString();
      changed = true;
      continue;
    }

    const runNumber = (schedule.runCount || 0) + 1;
    const queueItem = {
      id: `queued-${schedule.id}-${runNumber}-${Math.random().toString(36).slice(2, 6)}`,
      scheduleId: schedule.id,
      scheduleTitle: schedule.title,
      runNumber,
      status: 'queued',
      payload: schedule.payload,
      dueAt: schedule.nextRunAt,
      queuedAt: new Date(now).toISOString(),
    };
    queue.push(queueItem);
    queuedItems.push(queueItem);
    schedule.runCount = runNumber;
    schedule.queuedCount = (schedule.queuedCount || 0) + 1;
    schedule.infinite = infinite;
    if (infinite) {
      schedule.totalRuns = null;
      schedule.remainingRuns = null;
    } else {
      schedule.remainingRuns = Math.max(0, Number(schedule.remainingRuns || 0) - 1);
    }
    schedule.lastQueuedAt = queueItem.queuedAt;
    schedule.updatedAt = queueItem.queuedAt;
    if (infinite || schedule.remainingRuns > 0) {
      schedule.nextRunAt = new Date(now + Number(schedule.intervalMs || 60000)).toISOString();
    } else {
      schedule.nextRunAt = null;
      schedule.enabled = false;
      schedule.completedAt = queueItem.queuedAt;
    }
    changed = true;
  }

  return {
    scheduledMissions: schedules.slice(0, MAX_SCHEDULED_MISSIONS),
    missionQueue: queue.slice(-MAX_MISSION_QUEUE),
    queuedItems,
    changed,
  };
}

export { MAX_SCHEDULED_MISSIONS, MAX_MISSION_QUEUE };
