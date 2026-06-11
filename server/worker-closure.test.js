import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDeterministicClosureReview, mergeClosureReviews } from '../shared/closure-review.js';
import { buildDeterministicExecutiveDashboard } from '../shared/executive-dashboard.js';
import {
  extractMissionEvidenceTokens,
  extractMissionQuantitativeAnchors,
  missionNeedsSupervisorJudgment,
  textMentionsMissionEvidence,
  textMentionsMissionQuantitativeEvidence,
  evaluateInsuranceEvidenceCoverage,
} from '../shared/mission-intent.js';

const agents = [
  { id: 'planejador', name: 'Planejador', enabled: true },
  { id: 'pesquisador', name: 'Pesquisador', enabled: true },
  { id: 'supervisor', name: 'Supervisor', enabled: true },
];

test('mission evidence tokens focam termos concretos do briefing', () => {
  const mission = { description: 'Analisar telemetria rural da fazenda Aurora com CSV de sinistros por talhao.' };
  const tokens = extractMissionEvidenceTokens(mission);
  assert.ok(tokens.includes('telemetria'));
  assert.ok(tokens.includes('fazenda'));
  assert.ok(tokens.includes('aurora'));
  assert.equal(textMentionsMissionEvidence('Evidencia: telemetria da fazenda Aurora mostra desvio.', mission), true);
  assert.equal(textMentionsMissionEvidence('Analise generica sem citar dados do briefing.', mission), false);
});

test('insurance evidence coverage detecta lacuna financeira em briefing Sompo', () => {
  const mission = {
    description: 'Montar canvas Sompo com telemetria rural, CSV de sinistros por talhao e lacuna de dados financeiros para underwriting.',
  };
  const coverage = evaluateInsuranceEvidenceCoverage(
    'Evidencia: telemetria da fazenda e CSV de sinistros por talhao mostram concentracao operacional, mas o valor financeiro segue pendente como premissa.',
    mission,
  );
  assert.deepEqual(coverage.missing, []);
  assert.equal(coverage.requiresFinancialGap, true);
  assert.equal(coverage.mentionsGap, true);
});

test('mission quantitative anchors reconhece contagens e medidas do briefing Sompo', () => {
  const mission = {
    description: 'Caso Sompo rural com 12 eventos de alagamento, 7 falhas de irrigacao, chuva prevista de 42mm nas proximas 24h e publicacao de top 5 para underwriting.',
  };
  const anchors = extractMissionQuantitativeAnchors(mission);
  assert.ok(anchors.includes('12 eventos'));
  assert.ok(anchors.includes('7 falhas'));
  assert.ok(anchors.includes('42mm'));
  assert.ok(anchors.includes('top 5'));
  assert.equal(textMentionsMissionQuantitativeEvidence('Evidencia: chuva prevista de 42mm e 12 eventos de alagamento no CSV.', mission), true);
  assert.equal(textMentionsMissionQuantitativeEvidence('Evidencia: historico ruim e clima adverso.', mission), false);
});

test('ranking de apolices nao exige julgamento separado do Supervisor', () => {
  assert.equal(missionNeedsSupervisorJudgment({
    description: 'Gerar ranking de apolices criticas por valor segurado e mapa de risco.',
  }), false);
});

test('dashboard build bloqueia quando pesquisador nao ancora em evidencia do briefing', () => {
  const mission = {
    description: 'Montar canvas com telemetria rural da fazenda Aurora e CSV de sinistros por talhao.',
    success: 'Entregar analise executiva aprovada.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Ha sinais de risco e lacunas, mas preciso detalhar melhor.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Priorizar vistoria e coleta complementar.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Recomendo aprofundar antes de aprovar.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
    },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /evidencia concreta do briefing/i.test(gap)));
});

test('dashboard build aprova quando pesquisador cita evidencias reais da missao', () => {
  const mission = {
    description: 'Montar canvas com telemetria rural da fazenda Aurora e CSV de sinistros por talhao.',
    success: 'Entregar analise executiva aprovada.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'A telemetria da fazenda Aurora e o CSV de sinistros por talhao mostram concentracao de eventos em duas frentes.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Priorizar vistoria nos talhoes com maior concentracao de eventos.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Recomendo aprofundar apenas os talhoes com maior frequencia antes de renovar.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
    },
  });
  assert.equal(review.verdict, 'approved');
});

test('dashboard build bloqueia quando pesquisador ignora lacuna financeira do caso Sompo', () => {
  const mission = {
    description: 'Montar canvas Sompo com telemetria rural, CSV de sinistros por talhao e lacuna de dados financeiros para underwriting.',
    success: 'Entregar analise executiva aprovada.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: a telemetria rural da fazenda Aurora e o CSV de sinistros por talhao mostram concentracao de eventos na irrigacao leste. Lacuna critica: falta confirmar a causa exata em campo. Risco principal: recorrencia operacional no mesmo talhao.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Priorizar vistoria e coleta complementar.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Recomendo aprofundar antes de aprovar.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
    },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /lacuna ou premissa financeira/i.test(gap)));
});

test('dashboard build bloqueia quando pesquisador remove os numeros do briefing Sompo', () => {
  const mission = {
    description: 'Caso Sompo rural com 12 eventos de alagamento, 7 falhas de irrigacao, chuva prevista de 42mm e lacuna financeira para underwriting.',
    success: 'Entregar analise executiva aprovada.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram risco alto. Lacuna critica: valor financeiro ainda pendente. Risco principal: alagamento recorrente.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e ajuste preventivo. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com trilha de confirmacao financeira.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
    },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /evidencia quantitativa explicita/i.test(gap)));
});

test('dashboard build bloqueia canvas Sompo sem mustShow, criterio de sucesso e lacuna financeira', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros e valor para seguradora ainda pendente.',
    success: 'Entregar canvas com criterio de sucesso verificavel.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram concentracao no talhao norte. Lacuna critica: valor financeiro ainda pendente. Risco principal: alagamento e falha de irrigacao.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e ajuste preventivo. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com reforco preventivo e trilha de confirmacao financeira.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar dor central, prioridades, impacto ou proxy e criterio de sucesso.',
        findings: [
          { title: 'alagamento no talhao norte', basis: 'evidencia' },
          { title: 'impacto financeiro pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['dor central', 'prioridades', 'impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['reduzir exposicao antes da renovacao'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Riscos priorizados para a fazenda.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'tower', title: 'Ranking', items: [{ label: 'alagamento', value: 12 }] },
          { type: 'note', title: 'Plano', body: 'Vistoriar o talhao norte e revisar irrigacao.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /designerBrief\.mustShow/i.test(gap)));
  assert.ok(review.gaps.some((gap) => /criterio de sucesso/i.test(gap)));
  assert.ok(review.gaps.some((gap) => /lacuna financeira/i.test(gap)));
});

test('dashboard build aprova canvas Sompo com cobertura executiva completa', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros e valor para seguradora ainda pendente.',
    success: 'Entregar canvas com criterio de sucesso verificavel.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram concentracao no talhao norte. Lacuna critica: valor financeiro ainda pendente. Risco principal: alagamento e falha de irrigacao.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e ajuste preventivo. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com reforco preventivo e trilha de confirmacao financeira.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar dor central, prioridades, impacto ou proxy e criterio de sucesso.',
        findings: [
          { title: 'alagamento no talhao norte', basis: 'evidencia' },
          { title: 'impacto financeiro pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['dor central', 'prioridades', 'impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['reduzir exposicao antes da renovacao'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Dor central, prioridades e criterio de sucesso para a renovacao Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhao norte concentra exposicao a alagamento e falha de irrigacao.' },
          { type: 'tower', title: 'Prioridades', items: [{ label: 'alagamento', value: 12 }, { label: 'irrigacao', value: 7 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem e revisar irrigacao. Dono responsavel: operacao de campo com underwriting na validacao.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Valor financeiro pendente; usar proxy operacional ate receber custo e premio.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: reduzir exposicao antes da renovacao com vistoria concluida.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: telemetria e CSV. Premissa/proxy: impacto financeiro ainda pendente.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'approved');
});

test('dashboard build bloqueia canvas Sompo que perde os numeros do briefing', () => {
  const mission = {
    description: 'Caso Sompo rural com 12 eventos de alagamento, 7 falhas de irrigacao, chuva prevista de 42mm e valor para seguradora ainda pendente.',
    success: 'Entregar canvas com criterio de sucesso verificavel.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: 12 eventos de alagamento, 7 falhas de irrigacao e chuva prevista de 42mm. Lacuna critica: valor financeiro ainda pendente. Risco principal: recorrencia imediata no talhao norte.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e ajuste preventivo. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com reforco preventivo e trilha de confirmacao financeira.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar dor central, prioridades, impacto ou proxy e criterio de sucesso.',
        findings: [
          { title: 'alagamento no talhao norte', basis: 'evidencia' },
          { title: 'impacto financeiro pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['dor central', 'prioridades', 'impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['reduzir exposicao antes da renovacao'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Dor central, prioridades e criterio de sucesso para a renovacao Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhao norte concentra exposicao a alagamento e falha de irrigacao.' },
          { type: 'tower', title: 'Prioridades', items: [{ label: 'alagamento recorrente', value: 1 }, { label: 'irrigacao oscilando', value: 2 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem e revisar irrigacao. Dono responsavel: operacao de campo com underwriting na validacao.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Valor financeiro pendente; usar proxy operacional ate receber custo e premio.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: reduzir exposicao antes da renovacao com vistoria concluida.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: telemetria e CSV. Premissa/proxy: impacto financeiro ainda pendente.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /evidencia quantitativa/i.test(gap)));
});

test('dashboard build aceita equivalencias semanticas do mustShow no canvas Sompo', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros e valor para seguradora ainda pendente.',
    success: 'Entregar canvas com criterio de sucesso verificavel.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram concentracao no talhao norte. Lacuna critica: valor financeiro ainda pendente. Risco principal: alagamento e falha de irrigacao.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e ajuste preventivo. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com reforco preventivo e trilha de confirmacao financeira.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar dor central, prioridades, acoes recomendadas e criterio de sucesso.',
        findings: [
          { title: 'alagamento no talhao norte', basis: 'evidencia' },
          { title: 'impacto financeiro pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['dor central', 'prioridades', 'acoes recomendadas', 'criterios de sucesso', 'telemetria', 'csv de sinistros'],
        },
        successCriteria: ['reduzir exposicao antes da renovacao'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Risco principal e criterio de sucesso para renovacao Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Risco principal', body: 'Talhao norte concentra exposicao a alagamento, com telemetria de umidade acima do limite.' },
          { type: 'tower', title: 'Ranking', items: [{ label: 'alagamento', value: 12 }, { label: 'falha de irrigacao', value: 7 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem e revisar irrigacao. Dono responsavel: operacao de campo com underwriting na validacao.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Valor financeiro pendente; usar proxy operacional ate receber custo e premio. Base: CSV de sinistros por talhao.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: reduzir exposicao antes da renovacao com vistoria concluida.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: telemetria e CSV de sinistros. Premissa/proxy: impacto financeiro ainda pendente.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'approved');
});

test('dashboard build bloqueia canvas Sompo com plano preventivo vago e sem dono', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros e valor para seguradora ainda pendente.',
    success: 'Entregar canvas com criterio de sucesso verificavel.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram concentracao no talhao norte. Lacuna critica: valor financeiro ainda pendente. Risco principal: alagamento e falha de irrigacao.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e ajuste preventivo. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com reforco preventivo e trilha de confirmacao financeira.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar dor central, prioridades, impacto ou proxy e criterio de sucesso.',
        findings: [
          { title: 'alagamento no talhao norte', basis: 'evidencia' },
          { title: 'impacto financeiro pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['dor central', 'prioridades', 'impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['reduzir exposicao antes da renovacao'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Dor central, prioridades e criterio de sucesso para a renovacao Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhao norte concentra exposicao a alagamento e falha de irrigacao.' },
          { type: 'tower', title: 'Prioridades', items: [{ label: 'alagamento', value: 12 }, { label: 'irrigacao', value: 7 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Reforcar a prevencao nas frentes mais sensiveis.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Valor financeiro pendente; usar proxy operacional ate receber custo e premio.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: reduzir exposicao antes da renovacao com vistoria concluida.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: telemetria e CSV. Premissa/proxy: impacto financeiro ainda pendente.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /plano preventivo acionavel/i.test(gap)));
});

test('dashboard build bloqueia criterio de sucesso Sompo que afirma perda evitada como fato consumado', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros e valor para seguradora ainda pendente.',
    success: 'Entregar canvas com criterio de sucesso verificavel.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram concentracao no talhao norte. Lacuna critica: valor financeiro ainda pendente. Risco principal: alagamento e falha de irrigacao.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e ajuste preventivo. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com trilha observavel de execucao e confirmacao financeira.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar dor central, prioridades, impacto ou proxy e criterio de sucesso.',
        findings: [
          { title: 'alagamento no talhao norte', basis: 'evidencia' },
          { title: 'impacto financeiro pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['dor central', 'prioridades', 'impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['reduzir exposicao antes da renovacao'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Dor central, prioridades e criterio de sucesso para a renovacao Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhao norte concentra exposicao a alagamento e falha de irrigacao.' },
          { type: 'tower', title: 'Prioridades', items: [{ label: 'alagamento', value: 12 }, { label: 'irrigacao', value: 7 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem e revisar irrigacao. Dono responsavel: operacao de campo com underwriting na validacao.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Valor financeiro pendente; usar proxy operacional ate receber custo e premio.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Comprovacao de que o acionamento preventivo evitou o 13o sinistro de alagamento.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: telemetria e CSV. Premissa/proxy: impacto financeiro ainda pendente.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /fato consumado no criterio de sucesso/i.test(gap)));
});

test('dashboard build bloqueia top 5 Sompo quando ranking traz menos de cinco itens', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros e publicacao de top 5 de risco para underwriting.',
    success: 'Entregar top 5 verificavel com criterio de sucesso.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram concentracao no talhao norte. Lacuna critica: valor financeiro ainda pendente. Risco principal: alagamento e falha de irrigacao.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e ajuste preventivo. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com top 5 defensavel e trilha de confirmacao financeira.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar top 5 de risco, impacto ou proxy e criterio de sucesso.',
        findings: [
          { title: 'alagamento no talhao norte', basis: 'evidencia' },
          { title: 'impacto financeiro pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['top 5', 'impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['publicar top 5 defensavel'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Top riscos para renovacao Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhao norte concentra exposicao a alagamento e falha de irrigacao.' },
          { type: 'tower', title: 'Ranking de risco', items: [{ label: 'alagamento', value: 12 }, { label: 'irrigacao', value: 7 }, { label: 'pragas', value: 5 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem e revisar irrigacao. Dono responsavel: operacao de campo com underwriting na validacao.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Valor financeiro pendente; usar proxy operacional ate receber custo e premio.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: publicar top 5 defensavel e reduzir exposicao antes da renovacao.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /top 5/i.test(gap)));
});

test('dashboard build aprova top 5 Sompo quando ranking traz cinco itens objetivos', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros e publicacao de top 5 de risco para underwriting.',
    success: 'Entregar top 5 verificavel com criterio de sucesso.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram concentracao por talhao, suficiente para montar um top 5 inicial de risco. Lacuna critica: valor financeiro ainda pendente. Risco principal: alagamento recorrente.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e ajuste preventivo. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar com top 5 defensavel, dono claro e trilha de confirmacao financeira.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar top 5 de risco, impacto ou proxy e criterio de sucesso.',
        findings: [
          { title: 'alagamento no talhao norte', basis: 'evidencia' },
          { title: 'impacto financeiro pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['top 5', 'impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['publicar top 5 defensavel'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Top 5 de risco para renovacao Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhoes recorrentes concentram exposicao a alagamento, falha de irrigacao e pragas.' },
          { type: 'tower', title: 'Ranking de risco', items: [
            { label: 'alagamento', value: 12 },
            { label: 'falha de irrigacao', value: 7 },
            { label: 'pragas', value: 5 },
            { label: 'erosao', value: 4 },
            { label: 'atraso de vistoria', value: 3 },
          ] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem, revisar irrigacao e validar talhoes criticos. Dono responsavel: operacao de campo com underwriting na validacao.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Valor financeiro pendente; usar proxy operacional ate receber custo e premio.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: telemetria e CSV de sinistros por talhao. Premissa/proxy: impacto financeiro ainda pendente.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: publicar top 5 defensavel, vistoriar os talhoes criticos e reduzir exposicao antes da renovacao.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'approved');
});

test('dashboard build bloqueia canvas Sompo com ROI especifico sem base financeira no briefing', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros por talhao e lacuna de dados financeiros para underwriting.',
    success: 'Entregar canvas com criterio de sucesso verificavel e lacuna financeira sinalizada.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram concentracao por talhao. Lacuna critica: valor segurado e premio ainda pendentes. Risco principal: alagamento recorrente.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e coleta financeira minima. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com trilha financeira defensavel e leitura executiva sem numero inventado.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar impacto ou proxy, criterio de sucesso e lacuna financeira.',
        findings: [
          { title: 'alagamento recorrente', basis: 'evidencia' },
          { title: 'valor segurado pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['publicar leitura executiva defensavel'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Prioridades para renovacao Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhao norte concentra exposicao a alagamento.' },
          { type: 'tower', title: 'Ranking de risco', items: [{ label: 'alagamento', value: 12 }, { label: 'irrigacao', value: 7 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem. Dono responsavel: operacao de campo com underwriting na validacao.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Valor financeiro pendente, mas o canvas afirma ROI de 18% e economia anual de R$ 1,2 mi para renovacao.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: vistoria concluida e aprovacao registrada pela Sompo.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: telemetria e CSV de sinistros por talhao. Premissa/proxy: valor segurado ainda pendente.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /valor financeiro especifico/i.test(gap)));
});

test('dashboard build aceita proxy financeiro rotulado quando briefing nao traz numero monetario', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros por talhao e lacuna de dados financeiros para underwriting.',
    success: 'Entregar canvas com criterio de sucesso verificavel e lacuna financeira sinalizada.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria da fazenda Aurora e CSV de sinistros mostram concentracao por talhao. Lacuna critica: valor segurado e premio ainda pendentes. Risco principal: alagamento recorrente.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e coleta financeira minima. Dono sugerido: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar com proxy explicitado, dono claro e trilha financeira pendente.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas Sompo deve mostrar impacto ou proxy, criterio de sucesso e lacuna financeira.',
        findings: [
          { title: 'alagamento recorrente', basis: 'evidencia' },
          { title: 'valor segurado pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['publicar leitura executiva defensavel'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Prioridades para renovacao Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhao norte concentra exposicao a alagamento.' },
          { type: 'tower', title: 'Ranking de risco', items: [{ label: 'alagamento', value: 12 }, { label: 'irrigacao', value: 7 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem. Dono responsavel: operacao de campo com underwriting na validacao.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Proxy de cenarios: estimativa operacional em faixa de R$ 1,2 mi de perda potencial, dependente de valor segurado e premio ainda pendentes.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: vistoria concluida e aprovacao registrada pela Sompo.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: telemetria e CSV de sinistros por talhao. Premissa/proxy: valor segurado ainda pendente.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'approved');
});

test('dashboard build permite cifra financeira no canvas quando briefing traz ancoragem monetaria concreta', () => {
  const mission = {
    description: 'Caso Sompo com telemetria, CSV de sinistros por talhao e premio anual de R$ 4.000.000 para renovacao.',
    success: 'Entregar canvas com criterio de sucesso verificavel.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria e CSV já cobrem concentracao de risco no talhao norte. Valor segurado segue em validacao com o financeiro.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoriar drenagem e revisar irrigacao. Dono responsavel: operacao de campo.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovado com metas de retorno e trilha preventiva.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      finalReport: {
        summary: 'Canvas deve trazer dor central, plano de acoes e criterio de sucesso.',
        findings: [
          { title: 'alagamento', basis: 'evidencia' },
        ],
        designerBrief: {
          mustShow: ['dor central', 'impacto ou proxy', 'criterios de sucesso'],
        },
        successCriteria: ['reducao de risco para renovacao'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Dor central, financeiro e plano para renovacao Sompo.',
        status: 'concluido',
        layout: 'mission-control',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhao norte concentra risco e eventos em janela critica.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Premio anual da carteira de 4.000.000 e ROI projetado em 11.2%.' },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem e revisar irrigacao. Dono responsavel: operacao de campo com underwriting.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: publicar plano preventivo com rastreabilidade e aprovacao da renovacao registrada.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'approved');
});

test('dashboard build ancora indicador financeiro sem proxy explícito quando briefing define a base monetaria', () => {
  const mission = {
    description: 'Analise Sompo com premio anual de R$ 2,4 mi; risco por telemetria e CSV de sinistros para renovar carteira.',
    success: 'Entregar canvas com sucesso verificavel.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria rural, CSV de sinistros por talhao e lacuna operacional identificadas.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoriar drenagem e revisar irrigacao.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovado com trilha de risco e financeiro.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      finalReport: {
        summary: 'Canvas com indicador de retorno para fechamento seguro.',
        findings: [{ title: 'telemetria', basis: 'evidencia' }],
        designerBrief: { mustShow: ['dor central', 'impacto ou proxy', 'criterios de sucesso'] },
        successCriteria: ['publicar leitura executiva'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Leitura de risco com numero financeiro derivado do briefing.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Concentracao em risco operacional com sinal de recidiva.' },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: revisar cronograma e vistoriar talhao norte. Dono responsavel: operacao de campo com underwriting.' },
          { type: 'note', title: 'Impacto', body: 'Com base no premio anual, o impacto projetado é de 3,2% de melhoria esperada e o valor financeiro permanece pendente para confirmacao.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: reduzir exposicao antes da renovacao com aprovacao registrada.' },
        ],
      },
    },
  });
  assert.equal(review.verdict, 'approved');
  assert.ok(review.gaps.length === 0);
});

test('dashboard build bloqueia canvas Sompo agro sem entregaveis especificos pedidos na missao', () => {
  const mission = {
    description: 'Analisar risco agro Sompo por microrregiao, validar ZARC, publicar mapa de risco, ranking de apolices por valor segurado, projecao de indenizacoes e cronograma de monitoramento.',
    success: 'Entregar leitura executiva completa para underwriting.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: risco concentrado no corredor sudoeste e lacuna financeira parcial nas apolices. Risco principal: exposicao climatica e conformidade ZARC pendente.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: cruzar ZARC e revisar apolices mais expostas. Dono sugerido: underwriting agricola.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com leitura regional, ZARC e trilha financeira defensavel.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas deve cobrir os entregaveis agro da Sompo.',
        findings: [
          { title: 'zarc pendente', basis: 'premissa' },
          { title: 'apolices expostas', basis: 'evidencia' },
        ],
        designerBrief: {
          mustShow: ['microrregioes prioritarias', 'mapa de risco', 'validacao zarc', 'ranking de apolices', 'projecao de indenizacoes', 'cronograma de monitoramento'],
        },
        successCriteria: ['publicar leitura executiva completa'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Carteira agro sob pressao climatica.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Carteira agro exposta no corredor sudoeste.' },
          { type: 'tower', title: 'Prioridades', items: [{ label: 'corredor sudoeste', value: 5 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: revisar regras de aceite. Dono responsavel: underwriting agricola.' },
          { type: 'note', title: 'Impacto ou proxy', body: 'Faixa de perda ainda depende da base final de apolices.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: underwriting prioriza carteira critica.' },
        ],
      },
    },
  });

  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /designerBrief\.mustShow/i.test(gap)));
  assert.ok(review.gaps.some((gap) => /validacao zarc/i.test(gap)));
  assert.ok(review.gaps.some((gap) => /cronograma de monitoramento/i.test(gap)));
});

test('dashboard build aprova canvas Sompo agro quando entrega ZARC, mapa, apolices e monitoramento', () => {
  const mission = {
    description: 'Analisar risco agro Sompo por microrregiao, validar ZARC, publicar mapa de risco, ranking de apolices por valor segurado, projecao de indenizacoes e cronograma de monitoramento.',
    success: 'Entregar leitura executiva completa para underwriting.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: microrregioes Oeste e Sudoeste concentram o risco. Lacuna critica: projecao final depende do valor segurado consolidado. Risco principal: combinacao de clima e ZARC fora da janela em parte da carteira.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: validar ZARC, priorizar apolices expostas e publicar cronograma semanal. Dono sugerido: underwriting agricola.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar com leitura regional, ranking de apolices, ZARC claro e cronograma de monitoramento.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas deve cobrir os entregaveis agro da Sompo.',
        findings: [
          { title: 'zarc pendente', basis: 'premissa' },
          { title: 'apolices expostas', basis: 'evidencia' },
        ],
        designerBrief: {
          mustShow: ['microrregioes prioritarias', 'mapa de risco', 'validacao zarc', 'ranking de apolices', 'projecao de indenizacoes', 'cronograma de monitoramento'],
        },
        successCriteria: ['publicar leitura executiva completa'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Mapa de risco e carteira critica Sompo.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Microrregioes prioritarias', body: 'Sudoeste PR e Oeste PR concentram a exposicao inicial para underwriting.' },
          { type: 'note', title: 'Mapa de risco', body: 'Mapa de risco regional indica corredor critico no Sudoeste e faixa secundaria no Oeste.' },
          { type: 'note', title: 'Validacao ZARC', body: 'Status: parte da carteira segue fora da janela de plantio; conformidade pendente nas apolices auditadas.' },
          { type: 'tower', title: 'Ranking de apolices', items: [{ label: 'Apolice PR-01', value: 5 }, { label: 'Apolice PR-08', value: 4 }, { label: 'Apolice MS-02', value: 3 }] },
          { type: 'note', title: 'Projecao de indenizacoes', body: 'Proxy: faixa preliminar de perda depende do valor segurado consolidado e sera refinada apos fechamento das apolices.' },
          { type: 'note', title: 'Cronograma de monitoramento', body: 'Janela de acompanhamento em 4 a 8 semanas, com checkpoint semanal e revisao extraordinaria apos novo alerta climatico.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: microrregioes Oeste e Sudoeste com ZARC fora da janela em parte da carteira. Premissa/proxy: projecao de indenizacoes depende do valor segurado consolidado.' },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: cruzar ZARC e revisar carteira critica. Dono responsavel: underwriting agricola com sinistros no suporte.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: mapa, ZARC e ranking de apolices publicados para decisao defensavel do underwriting.' },
        ],
      },
    },
  });

  assert.equal(review.verdict, 'approved');
});

test('dashboard build aprova milho safrinha com fallback, dor central e supervisor em verificacao', () => {
  const mission = {
    description: 'Analise o risco de sinistros climaticos na carteira de apolices de milho safrinha nas regioes Oeste, Sudoeste e Centro-Sul do Parana e sul do Mato Grosso do Sul. O INMET confirmou deficit hidrico com queda de produtividade de ate 59,9% em Francisco Beltrao (PR) e chuvas 50 a 100 mm abaixo da media no trimestre mai-jul/2026. A CONAB aponta queda de 5,4% na produtividade do milho. Identifique microrregioes com maior risco de acionamento de sinistro nas proximas 4 a 8 semanas, estime a sinistralidade esperada, verifique apolices fora da janela do ZARC, gere alertas para corretores e entregue relatorio executivo com mapa de risco, ranking de apolices criticas por valor segurado, projecao de indenizacoes e cronograma de monitoramento.',
    success: 'Entregar leitura executiva completa para underwriting agricola.',
  };
  const chatMessages = [
    { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: queda de produtividade de ate 59,9% em Francisco Beltrao, chuvas 50 a 100 mm abaixo da media e queda CONAB de 5,4% no milho safrinha. Lacuna critica: valor segurado consolidado e datas de plantio por apolice seguem pendentes. Risco principal: alto acionamento de sinistro nas proximas 4 a 8 semanas por quebra de safra.' },
    { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: Oeste, Sudoeste e Centro-Sul PR. Acao imediata: cruzar datas de plantio com ZARC, priorizar carteira critica e notificar corretores. Dono sugerido: underwriting agricola com sinistros.' },
    { agentId: 'supervisor', agentName: 'Supervisor', type: 'verificacao', content: 'Veredito: analise estruturada para publicacao com proxy financeiro. Proxima acao: integrar base de apolices para ranking financeiro exato. Pendencia critica: valor segurado por area impactada.' },
  ];
  const finalReport = {
    summary: 'Carteira de milho safrinha sob deficit hidrico confirmado; valores segurados pendentes exigem proxy.',
    findings: [
      { title: 'Sudoeste PR', detail: 'Queda de produtividade de ate 59,9% e chuva abaixo da media.', basis: 'evidencia' },
      { title: 'Oeste PR', detail: 'Carteira critica para alertas aos corretores.', basis: 'premissa' },
      { title: 'Centro-Sul PR', detail: 'Monitoramento nas proximas 4 a 8 semanas.', basis: 'premissa' },
    ],
    designerBrief: {
      mustShow: ['dor central', 'top 5', 'ativo exposto', 'evidencias agroclimaticas', 'impacto ou proxy', 'lacuna financeira ou proxy', 'microrregioes prioritarias', 'mapa de risco', 'validacao zarc', 'ranking de apolices', 'sinistralidade esperada', 'projecao de indenizacoes', 'cronograma de monitoramento', 'alertas operacionais', 'criterios de sucesso'],
    },
    successCriteria: ['publicar mapa, ZARC, ranking de apolices e alertas para corretores'],
  };
  const dashboard = buildDeterministicExecutiveDashboard({
    mission,
    finalReport,
    snapshot: { contributions: chatMessages },
  });
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages,
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      needsSupervisorJudgment: true,
      dashboard,
      finalReport,
    },
  });

  assert.equal(review.verdict, 'approved');
});

test('closure nao trata mensagem tecnica de contingencia como bloqueio do Supervisor', () => {
  const review = buildDeterministicClosureReview({
    mission: { description: 'escolha a melhor acao para Sompo', success: 'fechar com veredito' },
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: briefing Sompo com sinistros e telemetria. Lacuna critica: valor segurado pendente. Risco principal: decisao sem proxy.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: priorizar carteira critica. Dono sugerido: underwriting.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'verificacao', content: 'Veredito: publicar canvas de contingencia validavel. Proxima acao: usar o ranking e o plano. Pendencia critica: GLM retornou contrato incompleto: faltam 4 metricas executivas.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Canvas executivo gerado por contingencia deterministica. Motivo tecnico tratado: GLM retornou contrato incompleto: faltam os blocos obrigatorios do canvas.' },
    ],
    closureContext: {
      type: 'chat_only',
      proposedStatus: 'completed',
      needsSupervisorJudgment: true,
    },
  });

  assert.equal(review.verdict, 'approved');
});

test('dashboard build aprova fallback Sompo parcial preservando numeros do briefing', () => {
  const mission = {
    title: 'Caso Sompo rural',
    description: 'Caso Sompo Sprint 2 - Fazenda Santa Aurora. CSV de sinistros fornecido no briefing: alagamento 12 eventos, falha de irrigacao 7 eventos, pragas 5 eventos. Telemetria atual: talhao norte com umidade acima do limite operacional; previsao de chuva 42mm nas proximas 24h; sensor de vazao da irrigacao leste oscilando. Gere um canvas executivo para a Sompo com riscos priorizados, premissas explicitas, lacunas de dados, plano preventivo, valor para seguradora e criterio de sucesso.',
    success: 'Canvas executivo Sompo aprovado pelo verificador, com premissas e lacunas sinalizadas.',
  };
  const partialContributions = [
    { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: ordenar carteira/ativo/regiao com maior risco declarado no briefing. Acao imediata: validar evidencias, acionar responsavel e coletar dados pendentes. Dono sugerido: underwriting com apoio de sinistros/operacao.' },
    { agentId: 'designer', agentName: 'Designer', type: 'resultado', content: 'Leitura executiva: apresentar dor, evidencias, ranking, plano preventivo, valor decisorio e criterio de sucesso em blocos curtos. Mensagem-chave: avancar com proxy explicito quando a base ainda estiver incompleta.' },
  ];
  const finalReport = {
    summary: 'Leitura executiva para priorizar sinistros e telemetria rural.',
    findings: [
      { title: 'Telemetria prioritaria', detail: 'Talhao norte com umidade acima do limite operacional.', basis: 'evidencia' },
      { title: 'Lacuna financeira', detail: 'Valor segurado e premio ficam pendentes como proxy.', basis: 'proxy' },
    ],
    designerBrief: {
      mustShow: ['dor central', 'prioridades', 'impacto ou proxy', 'acoes recomendadas', 'criterios de sucesso', 'telemetria', 'csv de sinistros'],
    },
    successCriteria: ['publicar leitura executiva defensavel'],
  };
  const dashboard = buildDeterministicExecutiveDashboard({
    mission,
    finalReport,
    snapshot: { contributions: partialContributions },
  });
  const chatMessages = [
    ...partialContributions,
    { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: `Evidencia: ${mission.description}. Lacuna critica: valor segurado e premio seguem pendentes. Risco principal: decisao sem proxy financeiro explicito.` },
    { agentId: 'supervisor', agentName: 'Supervisor', type: 'verificacao', content: 'Veredito: publicar canvas com proxy explicito e trilha de pendencias. Proxima acao: coletar dados pendentes. Pendencia critica: base financeira incompleta.' },
  ];
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages,
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      dashboard,
      finalReport,
    },
  });

  assert.match(JSON.stringify(dashboard), /12 eventos/);
  assert.match(JSON.stringify(dashboard), /42mm/);
  assert.equal(review.verdict, 'approved');
});

test('dashboard build bloqueia canvas Sompo quando faltam sinistralidade esperada e alertas operacionais pedidos na missao', () => {
  const mission = {
    description: 'Identificar microrregioes de maior risco de acionamento de sinistro, estimar sinistralidade esperada e gerar alertas para corretores da carteira Sompo.',
    success: 'Entregar leitura executiva com monitoramento e orientacao operacional.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: Oeste e Sudoeste concentram o risco. Lacuna critica: valor segurado consolidado pendente. Risco principal: acionamento de sinistro nas proximas semanas.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: priorizar carteira critica. Dono sugerido: underwriting agricola.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com leitura regional e trilha financeira defensavel.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas deve cobrir sinistralidade esperada e alertas operacionais.',
        findings: [
          { title: 'sinistralidade esperada', basis: 'proxy' },
          { title: 'alertas operacionais', basis: 'premissa' },
        ],
        designerBrief: {
          mustShow: ['sinistralidade esperada', 'alertas operacionais'],
        },
        successCriteria: ['publicar leitura executiva completa'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Carteira agro sob pressao climatica.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Carteira exposta a risco regional.' },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: revisar carteira critica. Dono responsavel: underwriting agricola.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: underwriting prioriza a carteira.' },
        ],
      },
    },
  });

  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /sinistralidade esperada/i.test(gap)));
  assert.ok(review.gaps.some((gap) => /alertas operacionais/i.test(gap)));
});

test('dashboard build bloqueia canvas Sompo sem bloco financeiro explicito quando a missao pede valor para seguradora', () => {
  const mission = {
    description: 'Caso Sompo rural com telemetria, CSV de sinistros por talhao e valor para seguradora ainda pendente.',
    success: 'Entregar leitura executiva com impacto financeiro em proxy e criterio de sucesso.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: telemetria e CSV de sinistros mostram concentracao no talhao norte. Lacuna critica: valor segurado e premio ainda pendentes. Risco principal: alagamento recorrente.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: vistoria e coleta financeira minima. Dono sugerido: underwriting agricola.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com trilha financeira defensavel e monitoramento.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas deve cobrir impacto financeiro em proxy e criterio de sucesso.',
        findings: [
          { title: 'alagamento recorrente', basis: 'evidencia' },
          { title: 'valor segurado pendente', basis: 'proxy' },
        ],
        designerBrief: {
          mustShow: ['criterios de sucesso'],
        },
        successCriteria: ['publicar leitura executiva defensavel'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Prioridades de risco para underwriting.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Dor central', body: 'Talhao norte concentra exposicao a alagamento.' },
          { type: 'tower', title: 'Ranking de risco', items: [{ label: 'alagamento', value: 12 }, { label: 'irrigacao', value: 7 }] },
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: vistoriar drenagem. Dono responsavel: underwriting agricola com operacao de campo.' },
          { type: 'note', title: 'Evidencia e premissa', body: 'Evidencia: telemetria e CSV de sinistros. Premissa/proxy: valor segurado e premio ainda pendentes.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: publicar leitura executiva defensavel.' },
        ],
      },
    },
  });

  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /bloco financeiro explicito/i.test(gap)));
});

test('dashboard build bloqueia canvas operacional quando faltam evidencias, fila e gatilhos pedidos na missao', () => {
  const mission = {
    description: 'Montar dashboard operacional com fila por severidade e SLA, consolidar fotos, laudos e documentos do caso e fechar com gatilhos preventivos antes do acionamento de sinistro.',
    success: 'Entregar pacote de evidencias, fila operacional e gatilhos preventivos.',
  };
  const review = buildDeterministicClosureReview({
    mission,
    agents,
    chatMessages: [
      { agentId: 'pesquisador', agentName: 'Pesquisador', type: 'resultado', content: 'Evidencia: fotos, telemetria e laudo preliminar disponiveis. Lacuna critica: anexos finais ainda pendentes. Risco principal: atraso na triagem de casos severos.' },
      { agentId: 'planejador', agentName: 'Planejador', type: 'acao', content: 'Prioridade: alta. Acao imediata: priorizar fila severa. Dono sugerido: operacao de sinistros.' },
      { agentId: 'supervisor', agentName: 'Supervisor', type: 'resultado', content: 'Aprovar apenas com leitura operacional completa.' },
    ],
    closureContext: {
      type: 'dashboard_build',
      proposedStatus: 'completed',
      expectedPerformerIds: ['planejador', 'pesquisador'],
      hasDashboard: true,
      hasFinalReport: true,
      requireResearchEvidence: true,
      finalReport: {
        summary: 'Canvas deve cobrir evidencias, fila e gatilhos.',
        findings: [
          { title: 'fila severa', basis: 'evidencia' },
        ],
        designerBrief: {
          mustShow: ['pacote de evidencias', 'fila operacional', 'gatilhos preventivos'],
        },
        successCriteria: ['publicar leitura executiva completa'],
      },
      dashboard: {
        title: 'Canvas Executivo',
        subtitle: 'Triagem operacional da carteira.',
        status: 'concluido',
        layout: 'ranking',
        blocks: [
          { type: 'note', title: 'Plano preventivo', body: 'Acao concreta: revisar os casos priorizados. Dono responsavel: operacao de sinistros.' },
          { type: 'note', title: 'Criterios de sucesso', body: 'Sucesso: publicar leitura executiva completa.' },
        ],
      },
    },
  });

  assert.equal(review.verdict, 'blocked');
  assert.ok(review.gaps.some((gap) => /pacote de evidencias/i.test(gap)));
  assert.ok(review.gaps.some((gap) => /fila operacional/i.test(gap)));
  assert.ok(review.gaps.some((gap) => /gatilhos preventivos/i.test(gap)));
});

test('mergeClosureReviews preserva bloqueio deterministico mesmo com modelo aprovando', () => {
  const merged = mergeClosureReviews(
    { verdict: 'blocked', reasons: ['faltou evidencia'], gaps: ['gap'], nextSteps: ['next'] },
    { verdict: 'approved', reasons: ['modelo aprovou'], gaps: [], nextSteps: [] },
  );
  assert.equal(merged.verdict, 'blocked');
  assert.ok(merged.reasons.includes('faltou evidencia'));
});
