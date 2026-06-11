import test from 'node:test';
import assert from 'node:assert/strict';

import { runOperationalPreflight } from '../shared/preflight.js';

test('runOperationalPreflight aprova quando endpoints e governança estão verdes', async () => {
  const report = await runOperationalPreflight({
    governance: {
      requiredPreflightEndpoints: ['/api/health', '/api/state', '/api/events'],
      missionConcurrency: { blocked: false, unmatchedCount: 0 },
    },
    state: {
      activeMission: null,
      agents: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
    },
    probeEndpoint: async (path) => {
      if (path === '/api/health') return { ok: true, body: { ok: true, service: 'luca-ai', supervisorMode: 'standby' } };
      if (path === '/api/state') return { ok: true, body: { agents: [{}, {}, {}, {}, {}], activeMission: null } };
      if (path === '/api/events') return { ok: true, body: { ok: true, events: [{ type: 'heartbeat.tick' }] } };
      return { ok: false, error: 'unexpected_path' };
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.readyForLiveMission, true);
  assert.equal(report.checks.length, 6);
  assert.equal(report.checks.some((check) => check.id === 'governance:mission-concurrency' && check.ok), true);
});

test('runOperationalPreflight bloqueia quando há missão concorrente ou endpoint falho', async () => {
  const report = await runOperationalPreflight({
    governance: {
      requiredPreflightEndpoints: ['/api/health', '/api/state', '/api/events'],
      missionConcurrency: { blocked: true, unmatchedCount: 1 },
    },
    state: {
      activeMission: { title: 'Missão viva' },
      agents: [{ id: 'a' }, { id: 'b' }],
    },
    probeEndpoint: async (path) => {
      if (path === '/api/events') return { ok: false, error: 'timeout lendo event store' };
      return { ok: true, body: { ok: true, service: 'luca-ai', agents: [{}, {}], activeMission: { title: 'Missão viva' }, events: [] } };
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.readyForLiveMission, false);
  assert.equal(report.checks.some((check) => check.id === 'endpoint:/api/events' && check.ok === false), true);
  assert.equal(report.checks.some((check) => check.id === 'runtime:active-mission' && check.ok === false), true);
});
