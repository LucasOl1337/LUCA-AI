import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPublicStateSnapshot, compactArchivedMission, serializePublicState } from '../shared/state-payload.js';

test('compactArchivedMission remove payload pesado de historico', () => {
  const compact = compactArchivedMission({
    id: 'archive-1',
    reason: 'completed',
    archivedAt: '2026-06-10T20:00:00.000Z',
    status: 'completed',
    mission: {
      id: 'mission-1',
      title: 'Caso rural',
      description: 'Analisar telemetria e sinistros.',
      success: 'Entregar veredito.',
      activatedAt: '2026-06-10T19:00:00.000Z',
      completedAt: '2026-06-10T20:00:00.000Z',
    },
    run: {
      id: 'run-1',
      status: 'completed',
      completedAt: '2026-06-10T20:00:00.000Z',
      usage: { total_tokens: 4000 },
    },
    chatMessages: [{ id: 'msg-1', content: 'payload pesado' }],
    agents: [{ id: 'supervisor', lines: ['linha 1', 'linha 2'] }],
    dashboard: { blocks: [{ title: 'Peso' }] },
  });

  assert.deepEqual(compact, {
    id: 'archive-1',
    reason: 'completed',
    status: 'completed',
    archivedAt: '2026-06-10T20:00:00.000Z',
    completedAt: undefined,
    mission: {
      id: 'mission-1',
      title: 'Caso rural',
      description: 'Analisar telemetria e sinistros.',
      success: 'Entregar veredito.',
      activatedAt: '2026-06-10T19:00:00.000Z',
      completedAt: '2026-06-10T20:00:00.000Z',
    },
    run: {
      id: 'run-1',
      status: 'completed',
      completedAt: '2026-06-10T20:00:00.000Z',
    },
  });
});

test('serializePublicState compacta todos os itens do missionHistory', () => {
  const state = serializePublicState({
    missionHistory: [
      {
        id: 'archive-1',
        mission: { title: 'A' },
        run: { status: 'completed' },
        chatMessages: [{ id: 'm1' }],
      },
    ],
    globalChatMessages: [{ id: 'live-1' }],
  });

  assert.equal(state.missionHistory.length, 1);
  assert.deepEqual(state.globalChatMessages, [{ id: 'live-1' }]);
  assert.equal('chatMessages' in state.missionHistory[0], false);
  assert.equal(state.missionHistory[0].mission?.title, 'A');
  assert.equal(state.missionHistory[0].run?.status, 'completed');
});

test('serializePublicState reformata timestamps de chat para horario brasileiro', () => {
  const state = serializePublicState({
    missionHistory: [],
    globalChatMessages: [
      {
        id: 'live-1',
        timestamp: '22:33:16',
        createdAt: '2026-06-11T22:33:16.000Z',
      },
    ],
  });

  assert.equal(state.globalChatMessages[0].timestamp, '19:33:16');
});

test('serializePublicState converte timestamp legado HH:mm:ss do runtime cloud', () => {
  const state = serializePublicState({
    heartbeatMonitor: { service: 'luca-ai-cloud' },
    missionHistory: [],
    globalChatMessages: [
      {
        id: 'live-1',
        timestamp: '22:33:16',
      },
    ],
  });

  assert.equal(state.globalChatMessages[0].timestamp, '19:33:16');
});

test('serializePublicState preserva timestamp legado HH:mm:ss fora do runtime cloud', () => {
  const state = serializePublicState({
    missionHistory: [],
    globalChatMessages: [
      {
        id: 'live-1',
        timestamp: '19:33:16',
      },
    ],
  });

  assert.equal(state.globalChatMessages[0].timestamp, '19:33:16');
});

test('serializePublicState limpa activeMission publica quando o run ja encerrou', () => {
  const state = serializePublicState({
    activeMission: { id: 'mission-1', title: 'Caso encerrado' },
    activeRun: { id: 'run-1', status: 'needs_revision' },
    missionHistory: [],
    globalChatMessages: [],
  });

  assert.equal(state.activeMission, null);
  assert.equal(state.activeRun?.status, 'needs_revision');
});

test('buildPublicStateSnapshot injeta governanca coerente no state e no heartbeat', () => {
  const state = buildPublicStateSnapshot({
    missionHistory: [],
    globalChatMessages: [],
    heartbeatLogs: [],
    agents: [],
  }, {
    heartbeatMonitor: { service: 'luca-ai-cloud', status: 'online' },
    now: Date.parse('2026-06-10T22:05:00.000Z'),
    missionLockTimeoutMs: 20 * 60 * 1000,
    events: [
      {
        type: 'mission.started',
        missionId: 'mission-123',
        timestamp: '2026-06-10T21:56:44.352Z',
        payload: { title: 'Sompo top 5 underwriting' },
      },
    ],
  });

  assert.equal(state.governance?.missionConcurrency?.blocked, true);
  assert.equal(state.governance?.missionConcurrency?.unmatchedCount, 1);
  assert.equal(state.heartbeatMonitor?.governance?.missionConcurrency?.blocked, true);
  assert.equal(state.heartbeatMonitor?.governance?.missionConcurrency?.latestUnmatched?.title, 'Sompo top 5 underwriting');
});
