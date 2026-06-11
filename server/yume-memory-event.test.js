import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYumeMemoryEvent } from './yume-memory-event.js';

test('buildYumeMemoryEvent gera payload compativel com contrato MemoryEventIn do Yume', () => {
  const event = buildYumeMemoryEvent({
    mission: {
      id: 'mission-123',
      title: 'Auditoria Sompo rural',
      description: 'Cruzar telemetria e CSV de sinistros.',
      success: 'Entregar veredito operacional com evidencias.',
      activatedAt: '2026-06-10T18:00:00.000Z',
    },
    report: {
      title: 'Auditoria Sompo rural',
      summary: 'Risco concentrado no corredor sudoeste.',
      findings: [
        { title: 'Corredor sudoeste', detail: 'Maior exposicao inicial.', basis: 'evidencia', importance: 'alta' },
      ],
      evidenceTrail: ['- Pesquisador: Evidencia: telemetria e CSV convergem.'],
      runtimeLines: ['- concorrencia: livre'],
    },
    flows: [
      { steps: [{ type: 'mission.activated' }, { type: 'agent.output' }, { type: 'mission.completed' }] },
    ],
    archivedAt: '2026-06-10T18:05:00.000Z',
    status: 'completed',
  });

  assert.equal(event.source, 'luca.mission.report');
  assert.equal(event.source_event_id, 'mission-123');
  assert.equal(event.contact_key, 'luca:mission:mission-123');
  assert.equal(event.commit_short_term, true);
  assert.equal(event.messages.length, 2);
  assert.equal(event.messages[0].role, 'user');
  assert.match(event.messages[0].content, /Cruzar telemetria/);
  assert.equal(event.messages[1].role, 'assistant');
  assert.match(event.messages[1].content, /mission\.activated -> agent\.output -> mission\.completed/);
  assert.ok(event.extracted_memories.length >= 3);
  assert.ok(event.extracted_memories.every((item) => item.kind === 'individual_long_term'));
  assert.ok(event.extracted_memories.every((item) => item.contact_key === event.contact_key));
  assert.equal(event.metadata.source_pattern, 'yume-hybrid-memory-contract');
});

test('buildYumeMemoryEvent remove duplicatas e mantem memoria longa sem transcript bruto', () => {
  const event = buildYumeMemoryEvent({
    mission: { id: 'mission dup', title: 'Missao duplicada' },
    report: {
      summary: 'Resumo curto.',
      findings: [
        { title: 'Mesmo ponto', detail: 'Detalhe A' },
        { title: 'Mesmo ponto', detail: 'Detalhe A' },
      ],
      evidenceTrail: ['Evidencia A', 'Evidencia A'],
      markdown: '# Nao deve virar transcript bruto completo',
    },
  });

  assert.equal(event.source_event_id, 'mission-dup');
  assert.equal(event.extracted_memories.filter((item) => /Mesmo ponto/.test(item.content)).length, 1);
  assert.equal(event.extracted_memories.filter((item) => /Evidencia A/.test(item.content)).length, 1);
  assert.ok(event.messages[1].content.length < 2200);
});
