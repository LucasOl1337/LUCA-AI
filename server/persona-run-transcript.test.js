import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  finalEntryFromPersonaRun,
  formatPersonaRunDuration,
  transcriptEntriesFromPersonaRun,
} from '../shared/persona-run-transcript.js';

const lucaPage = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');

test('transcript entries preserve the measured response duration', () => {
  const [entry] = transcriptEntriesFromPersonaRun({
    traceId: 'timing-test',
    generatedAt: '2026-08-25T12:00:03.500Z',
    replies: [{
      ok: true,
      slug: 'analyst',
      name: 'Analyst',
      content: 'Resposta pronta.',
      startedAt: '2026-08-25T12:00:00.000Z',
      completedAt: '2026-08-25T12:00:03.500Z',
      durationMs: 3500,
    }],
  });

  assert.equal(entry.startedAt, '2026-08-25T12:00:00.000Z');
  assert.equal(entry.completedAt, '2026-08-25T12:00:03.500Z');
  assert.equal(entry.timestamp, entry.completedAt);
  assert.equal(entry.durationMs, 3500);
});

test('final workflow entry inherits timing from its source reply', () => {
  const reply = {
    ok: true,
    slug: 'display',
    name: 'Display',
    model: 'model/display',
    content: 'Entrega final.',
    startedAt: '2026-08-25T12:00:05.000Z',
    completedAt: '2026-08-25T12:00:17.400Z',
    durationMs: 12400,
  };
  const entry = finalEntryFromPersonaRun({
    traceId: 'final-timing-test',
    mode: 'workflow',
    generatedAt: '2026-08-25T12:00:18.000Z',
    steps: [{ roleId: 'display', replies: [reply] }],
    finalDisplay: {
      roleId: 'display',
      roleLabel: 'Exibição final',
      slug: reply.slug,
      name: reply.name,
      model: reply.model,
      content: reply.content,
    },
  });

  assert.equal(entry.timestamp, reply.completedAt);
  assert.equal(entry.durationMs, reply.durationMs);
});

test('workflow reply ids stay stable while sibling replies arrive', () => {
  const first = {
    ok: true,
    slug: 'fast',
    name: 'Fast',
    content: 'Resposta rapida.',
  };
  const partial = transcriptEntriesFromPersonaRun({
    traceId: 'progress-id',
    steps: [{ roleId: 'execution', roleLabel: 'Execucao', replies: [first] }],
  });
  const complete = transcriptEntriesFromPersonaRun({
    traceId: 'progress-id',
    steps: [{
      roleId: 'execution',
      roleLabel: 'Execucao',
      replies: [{ ok: true, slug: 'slow', name: 'Slow', content: 'Resposta lenta.' }, first],
    }],
  });

  assert.equal(partial[0].id, complete.find((entry) => entry.slug === 'fast').id);
});

test('duration formatter stays compact and marks legacy messages', () => {
  assert.equal(formatPersonaRunDuration(undefined), '—');
  assert.equal(formatPersonaRunDuration(0), '<0,1 s');
  assert.equal(formatPersonaRunDuration(3500), '3,5 s');
  assert.equal(formatPersonaRunDuration(65_000), '1 min 05 s');
});

test('every chat message surface renders the discreet duration marker', () => {
  assert.match(lucaPage, /function MessageDuration/);
  assert.equal((lucaPage.match(/<MessageDuration entry=\{entry\}/g) || []).length, 3);
  assert.match(lucaPage, /durationMs:\s*0/);
});

test('manual mission format selector is removed from both team modes', () => {
  assert.doesNotMatch(lucaPage, /MISSION_DOMAIN_OPTIONS/);
  assert.doesNotMatch(lucaPage, /data-luca-mission-domain/);
  assert.doesNotMatch(lucaPage, /Formato da missão|Triagem automática|Override manual/);
});
