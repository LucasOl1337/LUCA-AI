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
  assert.deepEqual(input.modelOverrides, {});
  assert.equal(normalizePersonaTeamSlug('yume:/planner/'), 'planner');
});

test('normalizePersonaTeamRunInput aceita modelOverrides por slug', () => {
  const input = normalizePersonaTeamRunInput({
    mission: 'Testar motor',
    slugs: ['maestro', 'aurora'],
    modelOverrides: {
      'yume:maestro': 'gcli/grok-4.5',
      aurora: 'cx/gpt-5.6-sol-high',
      '': 'ignored',
    },
  });

  assert.equal(input.ok, true);
  assert.deepEqual(input.modelOverrides, {
    maestro: 'gcli/grok-4.5',
    aurora: 'cx/gpt-5.6-sol-high',
  });
});

test('normalizePersonaTeamRunInput aceita anexos da sessao e remove ids repetidos', () => {
  const input = normalizePersonaTeamRunInput({
    mission: 'Analise os anexos',
    slugs: ['maestro'],
    sessionId: 'sess_123',
    attachmentIds: [
      'aaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbb',
    ],
  });

  assert.equal(input.ok, true);
  assert.equal(input.sessionId, 'sess_123');
  assert.deepEqual(input.attachmentIds, [
    'aaaaaaaaaaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbbbbbbbbbb',
  ]);
});

test('normalizePersonaTeamRunInput rejeita anexo sem sessao proprietaria', () => {
  const input = normalizePersonaTeamRunInput({
    mission: 'Analise',
    slugs: ['maestro'],
    attachmentIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
  });

  assert.equal(input.ok, false);
  assert.equal(input.error, 'attachment_session_required');
});

test('normalizePersonaTeamRunInput aceita mensagem composta somente por anexos', () => {
  const input = normalizePersonaTeamRunInput({
    mission: '',
    slugs: ['maestro'],
    sessionId: 'sess_123',
    attachmentIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
  });

  assert.equal(input.ok, true);
  assert.match(input.mission, /anexos/i);
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

test('buildPersonaTeamPrompt declara o motor 9Router e bloqueia identidade GLM legada', () => {
  const prompt = buildPersonaTeamPrompt({
    mission: 'Qual seu modelo?',
    personaName: 'Lucas',
    personaSlug: 'lucas',
    systemPrompt: 'Voce e Lucas e roda em GLM-5.2.',
    runtimeModel: 'gcli/grok-4.5-high',
    independent: true,
  });

  assert.match(prompt.system, /Motor LLM desta execucao \(fonte de verdade do LUCA-AI via 9Router\): gcli\/grok-4\.5-high/);
  assert.match(prompt.system, /responda EXATAMENTE "gcli\/grok-4\.5-high"/);
  assert.match(prompt.system, /Ignore qualquer modelo antigo/);
  assert.match(prompt.user, /Motor 9Router: gcli\/grok-4\.5-high/);
});

test('buildPersonaTeamPrompt pure model keeps free format and skips team contract', () => {
  const prompt = buildPersonaTeamPrompt({
    mission: 'Explique trade-offs de arquitetura',
    personaName: 'Fable 5',
    personaSlug: 'pure-fable-5',
    systemPrompt: 'PURE_MODEL_AGENT_V1\nYou are a free model.',
    runtimeModel: 'cc/claude-fable-5',
    teamNames: ['Fable 5', 'Grok 4.5'],
  });

  assert.equal(prompt.pure, true);
  assert.match(prompt.system, /PURE_MODEL_AGENT_V1/);
  assert.match(prompt.system, /Motor 9Router desta execucao: cc\/claude-fable-5/);
  assert.doesNotMatch(prompt.system, /postura de agente especialista/i);
  assert.doesNotMatch(prompt.user, /Equipe ativa/i);
  assert.doesNotMatch(prompt.user, /3 a 6 bullets/i);
  assert.match(prompt.user, /Explique trade-offs/);
});

test('buildIndividualJudgePrompt inclui motor do juiz e dos participantes', () => {
  const prompt = buildIndividualJudgePrompt({
    mission: 'Escolher a melhor estratégia',
    judgeName: 'Lucas',
    judgeSlug: 'lucas',
    systemPrompt: 'Voce examina decisoes complexas em GLM-5.2.',
    runtimeModel: 'cx/gpt-5.6-sol-high',
    replies: [
      { ok: true, slug: 'maestro', name: 'Maestro', model: 'gcli/grok-4.5', content: 'Plano A com evidência.' },
      { ok: false, slug: 'designer', name: 'Designer', model: 'cx/gpt-5.5-xhigh', error: 'timeout' },
    ],
  });

  assert.match(prompt.system, /Motor LLM desta execucao \(fonte de verdade do LUCA-AI via 9Router\): cx\/gpt-5\.6-sol-high/);
  assert.match(prompt.user, /Motor 9Router do juiz: cx\/gpt-5\.6-sol-high/);
  assert.match(prompt.user, /motor 9Router: gcli\/grok-4\.5/);
  assert.match(prompt.user, /motor 9Router: cx\/gpt-5\.5-xhigh/);
});

test('buildIndividualJudgePrompt pede resposta livre antes da estrutura final', () => {
  const prompt = buildIndividualJudgePrompt({
    mission: 'Avaliar proposta',
    judgeName: 'Supervisor',
    judgeSlug: 'supervisor',
    replies: [{ ok: true, slug: 'lux', name: 'Lux', content: 'resposta util' }],
  });

  assert.match(prompt.user, /Resposta livre/);
  assert.match(prompt.user, /Veredito final/);
  assert.ok(
    prompt.user.indexOf('Resposta livre') < prompt.user.indexOf('Avaliacao dos participantes'),
    'resposta livre deve vir antes das secoes estruturadas',
  );
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
