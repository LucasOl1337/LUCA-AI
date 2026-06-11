import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyMissionIntent,
  missionRequestsAgentConversation,
  missionRequestsChatOnlyAction,
  missionRequestsAllAgents,
  missionNeedsSupervisorJudgment,
  parseAgentConversationDurationMs,
} from './intent.js';
import {
  parseClosureReviewOutput,
  buildDeterministicClosureReview,
  mergeClosureReviews,
  expectedChatPerformers,
} from './closure.js';
import {
  buildSchedule,
  tickSchedules,
  missionScheduleIsInfinite,
} from './scheduler.js';
import { AGENTS, CLOSURE_PERFORMER_AGENT_IDS, MAX_CLOSURE_ATTEMPTS } from './config.js';

const enabledRoster = [
  { id: 'planejador', name: 'Planejador', enabled: true },
  { id: 'pesquisador', name: 'Pesquisador', enabled: true },
  { id: 'supervisor', name: 'Supervisor', enabled: true },
];

test('config inclui maestro e performers de encerramento', () => {
  assert.ok(AGENTS.some((agent) => agent.id === 'maestro'));
  assert.ok(CLOSURE_PERFORMER_AGENT_IDS.has('planejador'));
  assert.ok(CLOSURE_PERFORMER_AGENT_IDS.has('pesquisador'));
  assert.equal(MAX_CLOSURE_ATTEMPTS, 5);
});

test('classifyMissionIntent: conversa entre agentes', () => {
  const mission = { description: 'supervisor e pesquisador devem conversar por 1 minuto sobre estrategia' };
  assert.equal(missionRequestsAgentConversation(mission), true);
  assert.equal(classifyMissionIntent(mission), 'agent_conversation');
});

test('classifyMissionIntent: chat-only', () => {
  const mission = { description: 'peca para os agentes mandarem oi no chat global' };
  assert.equal(missionRequestsChatOnlyAction(mission), true);
  assert.equal(classifyMissionIntent(mission), 'chat_only');
});

test('classifyMissionIntent: dashboard_build por padrao', () => {
  const mission = { description: 'analise os sinistros e gere um dashboard executivo com graficos' };
  assert.equal(classifyMissionIntent(mission), 'dashboard_build');
});

test('missionRequestsAllAgents e julgamento', () => {
  assert.equal(missionRequestsAllAgents({ description: 'todos os agentes devem contar uma piada' }), true);
  assert.equal(missionNeedsSupervisorJudgment({ description: 'escolha a melhor piada', success: 'eleger vencedor' }), true);
  assert.equal(missionNeedsSupervisorJudgment({ description: 'gerar ranking de apolices por valor segurado' }), false);
  assert.equal(missionNeedsSupervisorJudgment({ description: 'apenas conversem' }), false);
});

test('parseAgentConversationDurationMs', () => {
  assert.equal(parseAgentConversationDurationMs({ description: 'conversem por 2 minutos' }), 120000);
  assert.equal(parseAgentConversationDurationMs({ description: 'conversem por 30 segundos' }), 30000);
  assert.equal(parseAgentConversationDurationMs({ description: 'sem tempo definido' }), 60000);
});

test('parseClosureReviewOutput extrai veredito e lacunas', () => {
  const parsed = parseClosureReviewOutput(`blah\n[closure:verdict] blocked\n[closure:reason] faltou contribuicao\n[closure:gap] pesquisador ausente\n[closure:next] acionar pesquisador`);
  assert.equal(parsed.verdict, 'blocked');
  assert.deepEqual(parsed.reasons, ['faltou contribuicao']);
  assert.deepEqual(parsed.gaps, ['pesquisador ausente']);
  assert.deepEqual(parsed.nextSteps, ['acionar pesquisador']);
});

test('expectedChatPerformers respeita all-agents vs habilitados', () => {
  const all = expectedChatPerformers({ description: 'todos os agentes' }, enabledRoster).map((a) => a.id);
  assert.deepEqual(all.sort(), ['pesquisador', 'planejador']);
  const roster = [{ id: 'planejador', name: 'Planejador', enabled: false }, { id: 'pesquisador', name: 'Pesquisador', enabled: true }];
  const some = expectedChatPerformers({ description: 'fale no chat' }, roster).map((a) => a.id);
  assert.deepEqual(some, ['pesquisador']);
});

test('buildDeterministicClosureReview bloqueia quando performer nao contribuiu', () => {
  const review = buildDeterministicClosureReview({
    mission: { description: 'todos os agentes devem contribuir', success: '' },
    chatMessages: [{ agentId: 'planejador', type: 'resultado', content: 'minha ideia' }],
    agents: enabledRoster,
    closureContext: { type: 'chat_only', proposedStatus: 'completed' },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /Pesquisador/i.test(gap)));
});

test('buildDeterministicClosureReview aprova quando todos contribuiram', () => {
  const review = buildDeterministicClosureReview({
    mission: { description: 'todos os agentes devem contribuir', success: '' },
    chatMessages: [
      { agentId: 'planejador', type: 'resultado', content: 'ideia A' },
      { agentId: 'pesquisador', type: 'resultado', content: 'ideia B' },
    ],
    agents: enabledRoster,
    closureContext: { type: 'chat_only', proposedStatus: 'completed' },
  });
  assert.equal(review.verdict, 'approved');
  assert.deepEqual(review.gaps, []);
});

test('buildDeterministicClosureReview exige veredito do supervisor em missao de julgamento', () => {
  const base = {
    mission: { description: 'todos os agentes contam piada', success: 'escolha a melhor piada e eleja o vencedor' },
    agents: enabledRoster,
    closureContext: { type: 'chat_only', proposedStatus: 'completed' },
  };
  const blocked = buildDeterministicClosureReview({
    ...base,
    chatMessages: [
      { agentId: 'planejador', type: 'resultado', content: 'piada 1' },
      { agentId: 'pesquisador', type: 'resultado', content: 'piada 2' },
    ],
  });
  assert.equal(blocked.verdict, 'blocked');

  const approved = buildDeterministicClosureReview({
    ...base,
    chatMessages: [
      { agentId: 'planejador', type: 'resultado', content: 'piada 1' },
      { agentId: 'pesquisador', type: 'resultado', content: 'piada 2' },
      { agentId: 'supervisor', type: 'decisao', content: 'A piada do planejador venceu, foi a melhor.' },
    ],
  });
  assert.equal(approved.verdict, 'approved');
});

test('buildDeterministicClosureReview aceita veredito rotulado do supervisor em caso Sompo', () => {
  const review = buildDeterministicClosureReview({
    mission: { description: 'pesquisador, planejador e supervisor devem decidir a primeira acao', success: 'fechar com veredito, proxima acao e pendencia critica' },
    agents: enabledRoster,
    chatMessages: [
      { agentId: 'planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria. Dono sugerido: underwriting.' },
      { agentId: 'pesquisador', type: 'resultado', content: 'Evidencia: telemetria e CSV. Lacuna critica: sem dado financeiro. Risco principal: subprecificacao.' },
      { agentId: 'supervisor', type: 'decisao', content: 'Veredito: Avancar com analise tecnica e segurar emissao. Proxima acao: cobrar dados financeiros. Pendencia critica: importancia segurada.' },
    ],
    closureContext: { type: 'chat_only', proposedStatus: 'completed' },
  });
  assert.equal(review.verdict, 'approved');
});

test('mergeClosureReviews aplica precedencia correta', () => {
  const detBlocked = { verdict: 'blocked', reasons: ['det'], gaps: ['g1'], nextSteps: ['n1'] };
  const detApproved = { verdict: 'approved', reasons: ['det ok'], gaps: [], nextSteps: [] };
  assert.equal(mergeClosureReviews(detBlocked, { verdict: 'approved', reasons: [], gaps: [], nextSteps: [] }).verdict, 'blocked');
  assert.equal(mergeClosureReviews(detApproved, { verdict: 'blocked', reasons: ['m'], gaps: ['g'], nextSteps: ['n'] }).verdict, 'blocked');
  assert.equal(mergeClosureReviews(detApproved, { verdict: 'approved', reasons: [], gaps: [], nextSteps: [] }).verdict, 'approved');
  assert.equal(mergeClosureReviews(detApproved, null).verdict, 'approved');
});

test('scheduler: buildSchedule exige descricao', () => {
  assert.throws(() => buildSchedule({}), /scheduled_mission_requires_description/);
  const schedule = buildSchedule({ description: 'rodar analise diaria', intervalValue: 1, intervalUnit: 'days', totalRuns: 3, startImmediately: true });
  assert.equal(schedule.enabled, true);
  assert.equal(schedule.remainingRuns, 3);
  assert.equal(schedule.infinite, false);
});

test('scheduler: tickSchedules enfileira missao vencida e decrementa runs', () => {
  const schedule = buildSchedule({ description: 'rodar agora', intervalValue: 1, intervalUnit: 'minutes', totalRuns: 2, startImmediately: true });
  const result = tickSchedules([schedule], [], { now: Date.now() + 1000 });
  assert.equal(result.changed, true);
  assert.equal(result.queuedItems.length, 1);
  assert.equal(result.missionQueue.length, 1);
  assert.equal(result.scheduledMissions[0].remainingRuns, 1);
  assert.equal(result.scheduledMissions[0].enabled, true);
});

test('scheduler: ultima run finaliza o agendamento', () => {
  const schedule = buildSchedule({ description: 'rodar uma vez', intervalValue: 1, intervalUnit: 'minutes', totalRuns: 1, startImmediately: true });
  const result = tickSchedules([schedule], [], { now: Date.now() + 1000 });
  assert.equal(result.scheduledMissions[0].enabled, false);
  assert.ok(result.scheduledMissions[0].completedAt);
});

test('scheduler: agendamento infinito permanece ativo', () => {
  const schedule = buildSchedule({ description: 'rodar sempre', intervalValue: 1, intervalUnit: 'minutes', totalRuns: 'infinite', startImmediately: true });
  assert.equal(missionScheduleIsInfinite(schedule), true);
  const result = tickSchedules([schedule], [], { now: Date.now() + 1000 });
  assert.equal(result.scheduledMissions[0].enabled, true);
  assert.equal(result.scheduledMissions[0].remainingRuns, null);
  assert.ok(result.scheduledMissions[0].nextRunAt);
});

test('scheduler: nao duplica agendamento ja na fila', () => {
  const schedule = buildSchedule({ description: 'rodar', intervalValue: 1, intervalUnit: 'minutes', totalRuns: 5, startImmediately: true });
  const first = tickSchedules([schedule], [], { now: Date.now() + 1000 });
  const second = tickSchedules(first.scheduledMissions, first.missionQueue, { now: Date.now() + 2000, activeScheduleId: schedule.id });
  assert.equal(second.missionQueue.length, 1);
});
