import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGoalInput, publicGoal, summarizeGoals } from '../shared/goals.js';

test('normalizeGoalInput aplica defaults e budgets do pattern TARS', () => {
  const goal = normalizeGoalInput({
    title: 'Auditar deploy cloud',
    priority: 2,
    maxIterations: 9,
    maxSeconds: 180,
  }, {
    id: 'goal-1',
    now: '2026-06-10T21:30:00.000Z',
    origin: 'ui',
  });

  assert.deepEqual(publicGoal(goal), {
    id: 'goal-1',
    title: 'Auditar deploy cloud',
    description: '',
    definitionOfDone: '',
    status: 'pending',
    origin: 'ui',
    parentId: null,
    depth: 0,
    priority: 2,
    maxIterations: 9,
    maxSeconds: 180,
    maxToolCalls: 40,
    iterations: 0,
    toolCalls: 0,
    tokensUsed: 0,
    traceId: 'goal-1',
    createdAt: '2026-06-10T21:30:00.000Z',
    updatedAt: '2026-06-10T21:30:00.000Z',
    startedAt: null,
    finishedAt: null,
    error: null,
  });
});

test('summarizeGoals resume contagens abertas e por status', () => {
  const summary = summarizeGoals([
    { id: 'g1', status: 'pending', createdAt: '2026-06-10T21:00:00.000Z' },
    { id: 'g2', status: 'running', createdAt: '2026-06-10T21:10:00.000Z' },
    { id: 'g3', status: 'done', createdAt: '2026-06-10T21:20:00.000Z' },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.openCount, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.running, 1);
  assert.equal(summary.byStatus.done, 1);
  assert.equal(summary.latestCreatedAt, '2026-06-10T21:20:00.000Z');
});
