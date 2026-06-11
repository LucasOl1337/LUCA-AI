import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const stateDir = path.join(repoRoot, '.luca');
const logPath = path.join(stateDir, 'runtime-events.jsonl');

test('event log appende e lista eventos mais recentes primeiro', async () => {
  fs.mkdirSync(stateDir, { recursive: true });
  const original = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : null;
  fs.writeFileSync(logPath, '', 'utf8');

  try {
    const { appendEvent, listEvents } = await import('./event-log.js');
    appendEvent({ type: 'mission.activated', missionId: 'm1', traceId: 'trace-m1', time: '2026-06-10T18:00:00.000Z' });
    appendEvent({ type: 'agent.output', agentId: 'designer', time: '2026-06-10T18:01:00.000Z' });

    const events = listEvents({ limit: 10 });
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'agent.output');
    assert.equal(events[1].type, 'mission.activated');
    assert.equal(events[0].payload.agentId, 'designer');
    assert.equal(events[0].timestamp, '2026-06-10T18:01:00.000Z');
    assert.equal(events[0].time, '2026-06-10T18:01:00.000Z');
    assert.equal(events[1].missionId, 'm1');
    assert.equal(events[1].traceId, 'trace-m1');
    assert.deepEqual(events[1].payload, {});
  } finally {
    if (original === null) fs.rmSync(logPath, { force: true });
    else fs.writeFileSync(logPath, original, 'utf8');
  }
});

test('event log normaliza timestamp legado ao listar eventos', async () => {
  fs.mkdirSync(stateDir, { recursive: true });
  const original = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : null;
  fs.writeFileSync(
    logPath,
    `${JSON.stringify({
      id: 'evt_legacy',
      type: 'mission.started',
      timestamp: '2026-06-10T18:03:00.000Z',
      missionId: 'mission-legacy',
      payload: { title: 'Legacy mission' },
    })}\n`,
    'utf8',
  );

  try {
    const { listEvents } = await import('./event-log.js');
    const events = listEvents({ limit: 5 });
    assert.equal(events.length, 1);
    assert.equal(events[0].timestamp, '2026-06-10T18:03:00.000Z');
    assert.equal(events[0].time, '2026-06-10T18:03:00.000Z');
    assert.equal(events[0].ts, Date.parse('2026-06-10T18:03:00.000Z'));
  } finally {
    if (original === null) fs.rmSync(logPath, { force: true });
    else fs.writeFileSync(logPath, original, 'utf8');
  }
});

test('event log filtra por tipo e respeita limite', async () => {
  fs.mkdirSync(stateDir, { recursive: true });
  const original = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : null;
  fs.writeFileSync(logPath, '', 'utf8');

  try {
    const { appendEvent, listEvents } = await import('./event-log.js');
    appendEvent({ type: 'chat.message', message: 'a', time: '2026-06-10T18:00:00.000Z' });
    appendEvent({ type: 'chat.message', message: 'b', time: '2026-06-10T18:01:00.000Z' });
    appendEvent({ type: 'agent.status', status: 'running', time: '2026-06-10T18:02:00.000Z' });

    const filtered = listEvents({ type: 'chat.message', limit: 1 });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].type, 'chat.message');
    assert.equal(filtered[0].payload.message, 'b');
  } finally {
    if (original === null) fs.rmSync(logPath, { force: true });
    else fs.writeFileSync(logPath, original, 'utf8');
  }
});

test('event log filtra por missionId, goalId e traceId', async () => {
  fs.mkdirSync(stateDir, { recursive: true });
  const original = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : null;
  fs.writeFileSync(logPath, '', 'utf8');

  try {
    const { appendEvent, listEvents } = await import('./event-log.js');
    appendEvent({ type: 'goal.created', goalId: 'goal-1', traceId: 'trace-goal-1', payload: { title: 'Goal A' }, time: '2026-06-10T18:00:00.000Z' });
    appendEvent({ type: 'goal.updated', goalId: 'goal-2', traceId: 'trace-goal-2', payload: { title: 'Goal B' }, time: '2026-06-10T18:01:00.000Z' });
    appendEvent({ type: 'mission.started', missionId: 'mission-1', traceId: 'mission-1', payload: { title: 'Mission' }, time: '2026-06-10T18:02:00.000Z' });

    const byGoal = listEvents({ goalId: 'goal-1', limit: 5 });
    const byTrace = listEvents({ traceId: 'mission-1', limit: 5 });

    assert.equal(byGoal.length, 1);
    assert.equal(byGoal[0].goalId, 'goal-1');
    assert.equal(byGoal[0].traceId, 'trace-goal-1');
    assert.equal(byGoal[0].payload.title, 'Goal A');
    assert.equal(byTrace.length, 1);
    assert.equal(byTrace[0].missionId, 'mission-1');
    assert.equal(byTrace[0].traceId, 'mission-1');
  } finally {
    if (original === null) fs.rmSync(logPath, { force: true });
    else fs.writeFileSync(logPath, original, 'utf8');
  }
});

test('event summary consolida type/source e respeita filtros', async () => {
  fs.mkdirSync(stateDir, { recursive: true });
  const original = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : null;
  fs.writeFileSync(logPath, '', 'utf8');

  try {
    const { appendEvent, eventSummary } = await import('./event-log.js');
    appendEvent({ type: 'goal.created', goalId: 'goal-1', traceId: 'trace-goal-1', source: 'ui', time: '2026-06-10T18:00:00.000Z' });
    appendEvent({ type: 'goal.updated', goalId: 'goal-1', traceId: 'trace-goal-1', source: 'goals', time: '2026-06-10T18:01:00.000Z' });
    appendEvent({ type: 'mission.started', missionId: 'mission-1', traceId: 'trace-mission-1', source: 'supervisor', time: '2026-06-10T18:02:00.000Z' });

    const scoped = eventSummary({ goalId: 'goal-1', limit: 20 });

    assert.equal(scoped.total, 2);
    assert.equal(scoped.latest?.type, 'goal.updated');
    assert.equal(scoped.oldest?.type, 'goal.created');
    assert.equal(scoped.filters.goalId, 'goal-1');
    assert.deepEqual(scoped.byType, [
      { type: 'goal.updated', total: 1 },
      { type: 'goal.created', total: 1 },
    ]);
    assert.deepEqual(scoped.bySource, [
      { source: 'goals', total: 1 },
      { source: 'ui', total: 1 },
    ]);
  } finally {
    if (original === null) fs.rmSync(logPath, { force: true });
    else fs.writeFileSync(logPath, original, 'utf8');
  }
});

test('event flows agrupa eventos por traceId e preserva contexto operacional', async () => {
  fs.mkdirSync(stateDir, { recursive: true });
  const original = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : null;
  fs.writeFileSync(logPath, '', 'utf8');

  try {
    const { appendEvent, eventFlows } = await import('./event-log.js');
    appendEvent({ type: 'mission.started', missionId: 'mission-1', traceId: 'trace-1', source: 'supervisor', time: '2026-06-10T18:00:00.000Z' });
    appendEvent({ type: 'agent.output', missionId: 'mission-1', traceId: 'trace-1', source: 'researcher', payload: { note: 'evidencia' }, time: '2026-06-10T18:00:02.000Z' });
    appendEvent({ type: 'mission.completed', missionId: 'mission-1', traceId: 'trace-1', source: 'verifier', time: '2026-06-10T18:00:05.000Z' });
    appendEvent({ type: 'goal.created', goalId: 'goal-2', traceId: 'trace-2', source: 'goals', time: '2026-06-10T18:01:00.000Z' });

    const report = eventFlows({ limit: 10 });

    assert.equal(report.flows.length, 2);
    assert.equal(report.flows[0].traceId, 'trace-2');
    assert.equal(report.flows[1].traceId, 'trace-1');
    assert.equal(report.flows[1].stepCount, 3);
    assert.equal(report.flows[1].missionId, 'mission-1');
    assert.equal(report.flows[1].steps[1].payload.note, 'evidencia');
    assert.match(report.flows[1].summary, /mission\.started/);
  } finally {
    if (original === null) fs.rmSync(logPath, { force: true });
    else fs.writeFileSync(logPath, original, 'utf8');
  }
});

test('event flows infere janelas quando eventos nao possuem traceId', async () => {
  fs.mkdirSync(stateDir, { recursive: true });
  const original = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : null;
  fs.writeFileSync(logPath, '', 'utf8');

  try {
    const { appendEvent, eventFlows } = await import('./event-log.js');
    appendEvent({ type: 'heartbeat.tick', source: 'heartbeat', time: '2026-06-10T18:00:00.000Z' });
    appendEvent({ type: 'heartbeat.tick', source: 'heartbeat', time: '2026-06-10T18:00:10.000Z' });
    appendEvent({ type: 'heartbeat.pause', source: 'heartbeat', time: '2026-06-10T18:00:31.000Z' });

    const report = eventFlows({ limit: 10, type: 'heartbeat.tick' });

    assert.equal(report.flows.length, 1);
    assert.equal(report.flows[0].inferred, true);
    assert.equal(report.flows[0].stepCount, 2);
    assert.equal(report.flows[0].traceId, null);
  } finally {
    if (original === null) fs.rmSync(logPath, { force: true });
    else fs.writeFileSync(logPath, original, 'utf8');
  }
});

test('event log recupera eventos recentes sem depender de arquivo pequeno', async () => {
  fs.mkdirSync(stateDir, { recursive: true });
  const original = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : null;
  fs.writeFileSync(logPath, '', 'utf8');

  try {
    const { appendEvent, listEvents } = await import('./event-log.js');
    for (let index = 0; index < 1200; index += 1) {
      appendEvent({
        type: index % 3 === 0 ? 'heartbeat.tick' : 'agent.output',
        missionId: `mission-${Math.floor(index / 100)}`,
        payload: { index, note: 'x'.repeat(120) },
        time: new Date(Date.UTC(2026, 5, 10, 18, 0, index)).toISOString(),
      });
    }

    const recent = listEvents({ type: 'heartbeat.tick', limit: 3 });
    assert.equal(recent.length, 3);
    assert.deepEqual(recent.map((event) => event.payload.index), [1197, 1194, 1191]);
  } finally {
    if (original === null) fs.rmSync(logPath, { force: true });
    else fs.writeFileSync(logPath, original, 'utf8');
  }
});
