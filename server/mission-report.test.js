import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMissionReport } from './mission-report.js';

test('buildMissionReport consolida findings, evidencias e trilha operacional', () => {
  const report = buildMissionReport({
    mission: {
      title: 'Auditoria Sompo rural',
      description: 'Cruzar telemetria e CSV',
      success: 'Entregar veredito operacional',
    },
    dashboard: { subtitle: 'Risco concentrado no corredor sudoeste.' },
    run: { status: 'completed' },
    finalReport: {
      summary: 'Resumo executivo pronto.',
      findings: [
        { title: 'Corredor sudoeste', detail: 'Maior exposicao inicial.', basis: 'evidencia', importance: 'alta' },
      ],
    },
    chatMessages: [
      { agentName: 'Pesquisador', content: 'Evidencia: telemetria e CSV convergem.\nPremissa: valor segurado ainda pendente.' },
    ],
    governance: { missionConcurrency: { blocked: false } },
    heartbeatMonitor: { status: 'online', updatedAt: '2026-06-10T22:00:00.000Z' },
    flows: [
      {
        traceId: 'trace-1',
        source: 'supervisor',
        stepCount: 3,
        totalMs: 5000,
        steps: [{ type: 'mission.activated' }, { type: 'agent.output', source: 'researcher' }],
      },
    ],
  });

  assert.match(report.markdown, /## Findings priorizados/);
  assert.match(report.markdown, /Corredor sudoeste/);
  assert.match(report.markdown, /## Evidencias e premissas/);
  assert.match(report.markdown, /telemetria e CSV convergem/);
  assert.match(report.markdown, /## Runtime e governanca/);
  assert.match(report.markdown, /heartbeat: online/);
  assert.match(report.markdown, /## Trilha operacional/);
  assert.deepEqual(report.source, ['tars-agent-evidence-pattern', 'tars-event-flow-pattern']);
});
