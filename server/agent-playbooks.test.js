import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAgentPlaybook,
  businessWorkflowHint,
  agentCollaborationContract,
  insuranceAgentMessageIssues,
  insuranceRoleOutputContract,
  missionLooksInsuranceLike,
} from '../shared/agent-playbooks.js';

test('buildAgentPlaybook compoe secoes de persona no estilo TARS', () => {
  const text = buildAgentPlaybook(['supervisor', 'pesquisador']);
  assert.match(text, /# Supervisor executivo do LUCA/i);
  assert.match(text, /## Identidade/);
  assert.match(text, /## Funcao/);
  assert.match(text, /## Regras/);
  assert.match(text, /## Capacidades/);
  assert.match(text, /underwriting|seguradora/i);
});

test('insurance helpers distinguem missao casual de caso Sompo', () => {
  assert.equal(missionLooksInsuranceLike({ description: 'mande um salve no chat' }), false);
  assert.equal(missionLooksInsuranceLike({ description: 'briefing Sompo com telemetria rural e underwriting' }), true);
  assert.equal(businessWorkflowHint({ description: 'mande um salve no chat' }), '');
  assert.match(businessWorkflowHint({ description: 'briefing Sompo com telemetria rural e underwriting' }), /Workflow profissional/);
  assert.match(agentCollaborationContract({ description: 'sinistro rural Sompo' }), /Pesquisador: entregue evidencias/i);
});

test('insurance helpers exigem rotulos por papel em caso Sompo', () => {
  const mission = { description: 'caso Sompo de underwriting rural com telemetria' };
  assert.match(insuranceRoleOutputContract(mission, { mode: 'chat_only' }), /Veredito:/);
  assert.deepEqual(
    insuranceAgentMessageIssues(mission, [
      { agentId: 'pesquisador', content: 'Evidencia: telemetria de bomba. Lacuna critica: sem laudo. Risco principal: pane eletrica.' },
      { agentId: 'planejador', content: 'Prioridade: alta. Acao imediata: vistoria. Dono sugerido: regulacao.' },
      { agentId: 'supervisor', content: 'Veredito: aprofundar. Proxima acao: pedir fotos. Pendencia critica: falta confirmar causa.' },
    ]),
    [],
  );
  assert.ok(
    insuranceAgentMessageIssues(mission, [
      { agentId: 'pesquisador', content: 'Tem sinais de problema, mas faltam dados.' },
    ]).some((issue) => /pesquisador sem rotulos obrigatorios/i.test(issue)),
  );
});
