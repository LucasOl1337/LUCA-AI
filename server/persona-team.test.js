import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIndividualJudgePrompt,
  buildPersonaTeamPrompt,
  cleanPersonaTeamOutput,
  normalizePersonaTeamRunInput,
  normalizePersonaTeamSlug,
  runIndividualResolution,
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

test('normalizePersonaTeamRunInput aceita resolucao individual com ate cinco participantes e juiz livre', () => {
  const input = normalizePersonaTeamRunInput({
    mission: 'Comparar cinco propostas',
    mode: 'individual',
    slugs: ['aurora', 'maestro', 'designer', 'qa', 'pesquisador', 'excedente'],
    judgeSlug: 'aurora',
  });

  assert.equal(input.ok, true);
  assert.equal(input.mode, 'individual');
  assert.deepEqual(input.slugs, ['aurora', 'maestro', 'designer', 'qa', 'pesquisador']);
  assert.equal(input.judgeSlug, 'aurora');
  assert.deepEqual(input.workflow, []);
});

test('normalizePersonaTeamRunInput exige juiz na resolucao individual', () => {
  const input = normalizePersonaTeamRunInput({
    mission: 'Escolher uma resposta',
    mode: 'individual',
    slugs: ['aurora'],
  });

  assert.equal(input.ok, false);
  assert.equal(input.error, 'judge_required');
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

test('buildPersonaTeamPrompt remove identidade dos demais participantes no contexto individual', () => {
  const prompt = buildPersonaTeamPrompt({
    mission: 'Resolver sem influencia externa',
    personaName: 'Aurora',
    personaSlug: 'aurora',
    teamNames: ['Aurora', 'Maestro'],
    independent: true,
  });

  assert.match(prompt.system, /contexto limpo e individual/i);
  assert.doesNotMatch(prompt.user, /Equipe ativa/i);
  assert.doesNotMatch(prompt.user, /Maestro/i);
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

test('buildIndividualJudgePrompt entrega todas as respostas e exige veredito critico', () => {
  const prompt = buildIndividualJudgePrompt({
    mission: 'Escolher a melhor estratégia',
    judgeName: 'Aurora',
    judgeSlug: 'aurora',
    systemPrompt: 'Voce examina decisoes complexas.',
    replies: [
      { ok: true, slug: 'maestro', name: 'Maestro', content: 'Plano A com evidência.' },
      { ok: false, slug: 'designer', name: 'Designer', error: 'timeout' },
    ],
  });

  assert.match(prompt.system, /juiz independente/i);
  assert.match(prompt.user, /Maestro \(maestro\): Plano A com evidência\./i);
  assert.match(prompt.user, /Designer \(designer\): FALHA: timeout/i);
  assert.match(prompt.user, /falso, nao sustentado ou incompleto/i);
  assert.match(prompt.user, /Veredito final/i);
});

test('runIndividualResolution isola participantes e chama o juiz depois de reunir todas as respostas', async () => {
  const participantInputs = [];
  const result = await runIndividualResolution({
    participantSlugs: ['aurora', 'maestro'],
    judgeSlug: 'aurora',
    runParticipant: async (input) => {
      participantInputs.push(input);
      return { ok: true, slug: input.slug, name: input.slug, content: `resposta de ${input.slug}` };
    },
    runJudge: async ({ slug, replies }) => {
      assert.equal(participantInputs.length, 2);
      assert.equal(slug, 'aurora');
      assert.deepEqual(replies.map((reply) => reply.slug), ['aurora', 'maestro']);
      return { ok: true, slug, name: 'Aurora', content: 'veredito consolidado' };
    },
  });

  assert.deepEqual(participantInputs, [{ slug: 'aurora' }, { slug: 'maestro' }]);
  assert.equal(result.replies.length, 2);
  assert.equal(result.judge.content, 'veredito consolidado');
});

test('cleanPersonaTeamOutput remove tags de chat herdadas do runtime antigo', () => {
  assert.equal(cleanPersonaTeamOutput('[chat:resultado] Plano pronto.'), 'Plano pronto.');
  assert.equal(cleanPersonaTeamOutput(''), 'Sem resposta textual da persona.');
});
