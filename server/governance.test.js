import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGovernanceSummary, DEFAULT_GOVERNANCE_POLICY } from '../shared/governance.js';

test('buildGovernanceSummary expõe politica cloud compativel com LUCA', () => {
  const summary = buildGovernanceSummary();

  assert.equal(summary.runtime, DEFAULT_GOVERNANCE_POLICY.runtime);
  assert.equal(summary.liveMissionConcurrency, 'single_active_mission');
  assert.equal(summary.irreversibleActions, 'blocked_without_operator');
  assert.equal(summary.shellAccess, false);
  assert.equal(summary.filesystemWriteAccess, false);
  assert.deepEqual(summary.requiredPreflightEndpoints, ['/api/health', '/api/state', '/api/events']);
  assert.equal(summary.defaultBudget.maxIterations, 12);
  assert.ok(summary.summaryLines.some((line) => /Budget padrao/i.test(line)));
});

test('buildGovernanceSummary aceita override do provider e preserva budget', () => {
  const summary = buildGovernanceSummary({ provider: 'glm-6', defaultBudget: { maxSeconds: 120 } });

  assert.equal(summary.provider, 'glm-6');
  assert.equal(summary.defaultBudget.maxIterations, 12);
  assert.equal(summary.defaultBudget.maxSeconds, 120);
  assert.equal(summary.defaultBudget.maxToolCalls, 40);
});

test('buildGovernanceSummary bloqueia apenas missoes abertas e recentes', () => {
  const summary = buildGovernanceSummary({
    now: Date.parse('2026-06-10T22:05:00.000Z'),
    missionLockTimeoutMs: 20 * 60 * 1000,
    events: [
      {
        type: 'mission.started',
        missionId: 'mission-live',
        timestamp: '2026-06-10T21:56:44.352Z',
        payload: { title: 'Sompo top 5 underwriting' },
      },
    ],
  });

  assert.equal(summary.missionConcurrency.blocked, true);
  assert.equal(summary.missionConcurrency.unmatchedCount, 1);
  assert.equal(summary.missionConcurrency.latestUnmatched.title, 'Sompo top 5 underwriting');
});

test('buildGovernanceSummary nao bloqueia starts expirados ou anteriores ao reset', () => {
  const summary = buildGovernanceSummary({
    now: Date.parse('2026-06-10T22:30:00.000Z'),
    missionLockTimeoutMs: 20 * 60 * 1000,
    events: [
      {
        type: 'mission.started',
        missionId: 'mission-stale',
        timestamp: '2026-06-10T21:56:44.352Z',
        payload: { title: 'Sompo top 5 underwriting' },
      },
      {
        type: 'state.reset',
        timestamp: '2026-06-10T22:20:00.000Z',
        payload: {},
      },
    ],
  });

  assert.equal(summary.missionConcurrency.blocked, false);
  assert.equal(summary.missionConcurrency.unmatchedCount, 0);
});

test('buildGovernanceSummary aceita eventos legados com campo time', () => {
  const summary = buildGovernanceSummary({
    now: Date.parse('2026-06-10T22:05:00.000Z'),
    missionLockTimeoutMs: 20 * 60 * 1000,
    events: [
      {
        type: 'mission.started',
        missionId: 'mission-legacy',
        time: '2026-06-10T21:56:44.352Z',
        payload: { title: 'Missao legada' },
      },
    ],
  });

  assert.equal(summary.missionConcurrency.blocked, true);
  assert.equal(summary.missionConcurrency.latestUnmatched?.timestamp, '2026-06-10T21:56:44.352Z');
});

test('buildGovernanceSummary trata mission.archived como fechamento operacional', () => {
  const summary = buildGovernanceSummary({
    now: Date.parse('2026-06-10T22:05:00.000Z'),
    missionLockTimeoutMs: 20 * 60 * 1000,
    events: [
      {
        type: 'mission.started',
        missionId: 'mission-replaced',
        timestamp: '2026-06-10T21:56:44.352Z',
        payload: { title: 'Missao substituida' },
      },
      {
        type: 'mission.archived',
        missionId: 'mission-replaced',
        timestamp: '2026-06-10T21:57:10.000Z',
        payload: { reason: 'new_mission_started' },
      },
    ],
  });

  assert.equal(summary.missionConcurrency.blocked, false);
  assert.equal(summary.missionConcurrency.unmatchedCount, 0);
});
