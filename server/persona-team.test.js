import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPersonaTeamPrompt,
  cleanPersonaTeamOutput,
  normalizePersonaTeamRunInput,
  normalizePersonaTeamSlug,
} from './persona-team.js';

test('normalizePersonaTeamRunInput exige missao e equipe de personas', () => {
  assert.deepEqual(normalizePersonaTeamRunInput({ mission: '', slugs: ['maestro'] }), {
    ok: false,
    error: 'mission_required',
    mission: '',
    slugs: [],
  });

  assert.deepEqual(normalizePersonaTeamRunInput({ mission: 'Planejar sprint', slugs: [] }), {
    ok: false,
    error: 'team_required',
    mission: 'Planejar sprint',
    slugs: [],
  });
});

test('normalizePersonaTeamRunInput normaliza yume prefix, remove duplicatas e limita equipe', () => {
  const input = normalizePersonaTeamRunInput(
    {
      mission: '  Montar plano operacional  ',
      slugs: ['yume:maestro', 'maestro', ' designer ', '', 'pesquisador', 'extra'],
    },
    { maxTeamSize: 3 },
  );

  assert.equal(input.ok, true);
  assert.equal(input.mission, 'Montar plano operacional');
  assert.deepEqual(input.slugs, ['maestro', 'designer', 'pesquisador']);
  assert.equal(input.mode, 'parallel');
  assert.equal(normalizePersonaTeamSlug('yume:/planner/'), 'planner');
});

test('normalizePersonaTeamRunInput aceita workflow fixo por papel', () => {
  const input = normalizePersonaTeamRunInput({
    mission: 'Definir plano de ataque',
    traceId: 'trace atual 01',
    workflow: {
      supervisor: 'maestro',
      mission: ['planejador'],
      execution: ['pesquisador', 'designer', 'pesquisador'],
      approval: ['qa'],
      display: ['narrador'],
    },
  });

  assert.equal(input.ok, true);
  assert.equal(input.mode, 'workflow');
  assert.equal(input.traceId, 'trace-atual-01');
  assert.deepEqual(input.slugs, ['maestro', 'planejador', 'pesquisador', 'designer', 'qa', 'narrador']);
  assert.deepEqual(
    input.workflow.map((role) => [role.roleId, role.slugs]),
    [
      ['supervisor', ['maestro']],
      ['mission', ['planejador']],
      ['execution', ['pesquisador', 'designer']],
      ['approval', ['qa']],
      ['display', ['narrador']],
    ],
  );
});

test('normalizePersonaTeamRunInput bloqueia workflow explicito incompleto', () => {
  const input = normalizePersonaTeamRunInput({
    mission: 'Auditar proposta',
    workflow: {
      supervisor: 'maestro',
      execution: ['pesquisador'],
    },
  });

  assert.equal(input.ok, false);
  assert.equal(input.error, 'workflow_role_required');
  assert.deepEqual(input.missingRoles.sort(), ['approval', 'display', 'mission']);
});

test('buildPersonaTeamPrompt isola a bancada do Operacional global', () => {
  const prompt = buildPersonaTeamPrompt({
    mission: 'Auditar leads',
    personaName: 'Maestro',
    personaSlug: 'maestro',
    systemPrompt: 'Voce coordena especialistas.',
    teamNames: ['Maestro', 'Designer'],
  });

  assert.match(prompt.system, /Nao publique no chat global/i);
  assert.match(prompt.system, /nao acione agentes fixos do Operacional/i);
  assert.match(prompt.user, /Equipe ativa: Maestro, Designer/i);
  assert.match(prompt.user, /Auditar leads/i);
});

test('buildPersonaTeamPrompt inclui papel e contexto do workflow', () => {
  const prompt = buildPersonaTeamPrompt({
    mission: 'Preparar briefing',
    personaName: 'Designer',
    personaSlug: 'designer',
    teamNames: ['Maestro', 'Designer'],
    workflowRole: {
      roleId: 'display',
      roleLabel: 'Exibicao final',
      instruction: 'Organize o resultado para leitura executiva.',
    },
    accumulatedContext: 'Supervisor: priorizar risco operacional.',
  });

  assert.match(prompt.system, /Papel nesta rodada: Exibicao final/i);
  assert.match(prompt.user, /Supervisor: priorizar risco operacional/i);
  assert.match(prompt.user, /Resumo, Decisao, Evidencias, Riscos, Proximas acoes/i);
});

test('cleanPersonaTeamOutput remove tags de chat herdadas do runtime antigo', () => {
  assert.equal(cleanPersonaTeamOutput('[chat:resultado] Plano pronto.'), 'Plano pronto.');
  assert.equal(cleanPersonaTeamOutput(''), 'Sem resposta textual da persona.');
});
