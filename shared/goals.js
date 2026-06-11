export const DEFAULT_GOAL_BUDGET = {
  maxIterations: 12,
  maxSeconds: 300,
  maxToolCalls: 40,
};

export const GOAL_STATUSES = ['pending', 'running', 'verifying', 'done', 'failed', 'cancelled', 'needs_input'];

function clampInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function normalizeGoalInput(input = {}, { now = new Date().toISOString(), id = `goal-${Date.now()}`, origin = 'ui' } = {}) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('title_required');

  return {
    id,
    title,
    description: String(input.description || '').trim(),
    definitionOfDone: String(input.definitionOfDone || input.definition_of_done || '').trim(),
    status: GOAL_STATUSES.includes(input.status) ? input.status : 'pending',
    origin: String(input.origin || origin || 'ui').trim() || 'ui',
    parentId: input.parentId ? String(input.parentId).trim() : null,
    depth: clampInt(input.depth, 0, { min: 0, max: 6 }),
    priority: clampInt(input.priority, 5, { min: 1, max: 9 }),
    maxIterations: clampInt(input.maxIterations, DEFAULT_GOAL_BUDGET.maxIterations, { min: 1, max: 200 }),
    maxSeconds: clampInt(input.maxSeconds, DEFAULT_GOAL_BUDGET.maxSeconds, { min: 10, max: 86400 }),
    maxToolCalls: clampInt(input.maxToolCalls, DEFAULT_GOAL_BUDGET.maxToolCalls, { min: 1, max: 500 }),
    iterations: clampInt(input.iterations, 0, { min: 0, max: 2000 }),
    toolCalls: clampInt(input.toolCalls, 0, { min: 0, max: 5000 }),
    tokensUsed: clampInt(input.tokensUsed, 0, { min: 0, max: Number.MAX_SAFE_INTEGER }),
    result: input.result ?? null,
    verifier: input.verifier ?? null,
    error: input.error ? String(input.error).slice(0, 2000) : null,
    traceId: String(input.traceId || id),
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
    startedAt: input.startedAt ? String(input.startedAt) : null,
    finishedAt: input.finishedAt ? String(input.finishedAt) : null,
  };
}

export function summarizeGoals(goals = []) {
  const byStatus = Object.fromEntries(GOAL_STATUSES.map((status) => [status, 0]));
  let latestCreatedAt = null;
  let openCount = 0;
  for (const goal of goals) {
    const status = GOAL_STATUSES.includes(goal?.status) ? goal.status : 'pending';
    byStatus[status] += 1;
    if (!['done', 'failed', 'cancelled'].includes(status)) openCount += 1;
    if (!latestCreatedAt || String(goal?.createdAt || '') > latestCreatedAt) latestCreatedAt = goal?.createdAt || latestCreatedAt;
  }
  return {
    total: goals.length,
    openCount,
    byStatus,
    latestCreatedAt,
    running: byStatus.running || 0,
    pending: byStatus.pending || 0,
  };
}

export function publicGoal(goal) {
  if (!goal || typeof goal !== 'object') return goal;
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    definitionOfDone: goal.definitionOfDone,
    status: goal.status,
    origin: goal.origin,
    parentId: goal.parentId,
    depth: goal.depth,
    priority: goal.priority,
    maxIterations: goal.maxIterations,
    maxSeconds: goal.maxSeconds,
    maxToolCalls: goal.maxToolCalls,
    iterations: goal.iterations,
    toolCalls: goal.toolCalls,
    tokensUsed: goal.tokensUsed,
    traceId: goal.traceId,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    startedAt: goal.startedAt,
    finishedAt: goal.finishedAt,
    error: goal.error,
  };
}
