import test from 'node:test';
import assert from 'node:assert/strict';

import { executiveDashboardContractIssues } from '../shared/dashboard-contract.js';
import { buildDeterministicExecutiveDashboard } from '../shared/executive-dashboard.js';

test('contrato executivo aceita fallback Sompo com blocos semanticos e metricas', () => {
  const dashboard = buildDeterministicExecutiveDashboard({
    mission: {
      title: 'Risco climatico Sompo milho safrinha',
      description: 'Identificar microrregioes de maior risco de acionamento de sinistro, estimar sinistralidade esperada, validar ZARC, gerar alertas para corretores, mapa de risco, ranking de apolices por valor segurado e cronograma de monitoramento.',
      success: 'Entregar relatorio executivo para underwriting agricola.',
    },
    finalReport: {
      summary: 'Carteira agro precisa de decisao por regiao, apolice e proxy financeiro.',
      findings: [
        { title: 'Sudoeste PR', detail: 'Risco de acionamento de sinistro em faixa alta.', basis: 'evidencia' },
        { title: 'Oeste PR', detail: 'Carteira critica para comunicados de corretor.', basis: 'premissa' },
      ],
      designerBrief: {
        mustShow: ['microrregioes prioritarias', 'sinistralidade esperada', 'ranking de apolices', 'alertas operacionais', 'cronograma de monitoramento'],
      },
      successCriteria: ['publicar leitura executiva com proxy financeiro explicitado'],
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: Sudoeste PR e Oeste PR concentram sinais climaticos. Lacuna critica: valor segurado consolidado pendente. Risco principal: acionamento de sinistro.' },
        { agentId: 'planejador', content: 'Prioridade: alta. Acao imediata: validar ZARC e alertar corretores. Dono sugerido: underwriting agricola.' },
      ],
    },
  });

  assert.equal(executiveDashboardContractIssues(dashboard).length, 0);
});

test('contrato executivo continua bloqueando dashboard vazio', () => {
  const issues = executiveDashboardContractIssues({ title: 'Canvas vazio', blocks: [] });

  assert.ok(issues.includes('faltam 4 metricas executivas'));
  assert.ok(issues.includes('faltam os 5 blocos obrigatorios do canvas'));
  assert.ok(issues.includes('falta bloco: Valor para seguradora'));
});
