import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDecisionPackage } from './decision-package.js';

const runningJob = {
  runId: 'run-1', traceId: 'trace-1', status: 'running',
  startedAt: '2026-08-08T10:00:00.000Z', completedAt: null, result: null, error: null,
};

test('DecisionPackage running não inventa contribuições ou veredito', () => {
  const packet = buildDecisionPackage(runningJob, { objective: 'Escolher arquitetura' });
  assert.equal(packet.schema, 'luca.decision-package.v1');
  assert.equal(packet.deliberationId, 'run-1');
  assert.equal(packet.status, 'running');
  assert.equal(packet.objective, 'Escolher arquitetura');
  assert.equal(packet.verdict, null);
  assert.deepEqual(packet.contributions, []);
  assert.deepEqual(packet.engine, { mode: null, team: [] });
  assert.equal(packet.error, null);
});

test('DecisionPackage individual usa juiz e mantém contribuições separadas', () => {
  const packet = buildDecisionPackage({
    ...runningJob,
    status: 'complete',
    completedAt: '2026-08-08T10:00:05.000Z',
    result: {
      mode: 'individual', durationMs: 5_000,
      team: [{ slug: 'arquiteto', name: 'Arquiteto', model: 'model-a', cached: true, stale: false }],
      replies: [{ ok: true, slug: 'arquiteto', name: 'Arquiteto', model: 'model-a', content: 'Opção A.' }],
      judge: { ok: true, slug: 'juiz', name: 'Juiz', model: 'model-b', content: 'Escolha A.' },
    },
  }, { objective: 'Escolher' });
  assert.equal(packet.verdict.summary, 'Escolha A.');
  assert.equal(packet.contributions[0].content, 'Opção A.');
  assert.equal(packet.contributions[0].role, 'participant');
});

test('DecisionPackage usa finalDisplay no workflow e não cria consenso no parallel', () => {
  const workflow = buildDecisionPackage({
    ...runningJob, status: 'complete',
    result: {
      mode: 'workflow', team: [], durationMs: 10,
      replies: [{ ok: true, slug: 'p', name: 'P', model: 'm', content: 'Evidência.', workflowRoleLabel: 'Execução' }],
      finalDisplay: { slug: 'n', name: 'N', model: 'm', content: 'Decisão final.' },
    },
  }, { objective: 'Decidir' });
  assert.equal(workflow.verdict.summary, 'Decisão final.');
  assert.equal(workflow.contributions[0].role, 'Execução');

  const parallel = buildDecisionPackage({
    ...runningJob, status: 'complete',
    result: { mode: 'parallel', team: [], durationMs: 10, replies: [{ ok: true, slug: 'a', content: 'Opinião.' }] },
  }, { objective: 'Opinar' });
  assert.equal(parallel.verdict, null);
  assert.equal(parallel.contributions.length, 1);
});

test('DecisionPackage preserva falha pública', () => {
  const packet = buildDecisionPackage({
    ...runningJob, status: 'failed', completedAt: '2026-08-08T10:00:01.000Z',
    error: { code: 'persona_not_found', message: 'Persona ausente' },
  }, { objective: 'Decidir' });
  assert.deepEqual(packet.error, { code: 'persona_not_found', message: 'Persona ausente' });
  assert.equal(packet.verdict, null);
});
