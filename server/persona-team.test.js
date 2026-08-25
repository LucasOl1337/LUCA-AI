import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConversationContextFromTranscript,
  buildIndividualJudgePrompt,
  buildIndividualRevisionPrompt,
  buildPersonaTeamPrompt,
  cleanPersonaTeamOutput,
  collectPriorAttachmentIds,
  DEFAULT_MAX_CONVERSATION_CONTEXT_CHARS,
  DEPTH_BUDGETS,
  formatConversationContextForPrompt,
  normalizePersonaTeamRunInput,
  runIndividualResolution,
} from './persona-team.js';
import { normalizePersonaSlug } from '../shared/persona-workflow.js';

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
  assert.equal(normalizePersonaSlug('yume:/planner/'), 'planner');
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
      visual: ['especialista-visual'],
    },
  });

  assert.equal(input.ok, true);
  assert.equal(input.mode, 'workflow');
  assert.equal(input.traceId, 'trace-atual-01');
  assert.deepEqual(input.slugs, ['maestro', 'planejador', 'pesquisador', 'designer', 'qa', 'narrador', 'especialista-visual']);
  assert.deepEqual(
    input.workflow.map((role) => [role.roleId, role.slugs]),
    [
      ['supervisor', ['maestro']],
      ['mission', ['planejador']],
      ['execution', ['pesquisador', 'designer']],
      ['approval', ['qa']],
      ['display', ['narrador']],
      ['visual', ['especialista-visual']],
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
  // visual e opcional — nao entra em missingRoles
  assert.deepEqual(input.missingRoles.sort(), ['approval', 'display', 'mission']);
});

test('normalizePersonaTeamRunInput aceita workflow sem especialista visual', () => {
  const input = normalizePersonaTeamRunInput({
    mission: 'Rodar sem pack visual',
    workflow: {
      supervisor: 'maestro',
      mission: ['planejador'],
      execution: ['pesquisador'],
      approval: ['qa'],
      display: ['narrador'],
      visual: [],
    },
  });

  assert.equal(input.ok, true);
  assert.equal(input.mode, 'workflow');
  assert.deepEqual(input.slugs, ['maestro', 'planejador', 'pesquisador', 'qa', 'narrador']);
  const visual = input.workflow.find((role) => role.roleId === 'visual');
  assert.ok(visual);
  assert.deepEqual(visual.slugs, []);
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
  assert.equal(input.depth, 1);
});

test('normalizePersonaTeamRunInput aceita especialista visual opcional no modo individual', () => {
  const withVisual = normalizePersonaTeamRunInput({
    mission: 'Comparar propostas',
    mode: 'individual',
    slugs: ['aurora'],
    judgeSlug: 'maestro',
    visualSlug: 'yume:especialista-visual',
  });
  assert.equal(withVisual.ok, true);
  assert.equal(withVisual.visualSlug, 'especialista-visual');

  const withoutVisual = normalizePersonaTeamRunInput({
    mission: 'Comparar propostas',
    mode: 'individual',
    slugs: ['aurora'],
    judgeSlug: 'maestro',
  });
  assert.equal(withoutVisual.ok, true);
  assert.equal(withoutVisual.visualSlug, undefined);

  // Modo equipe ignora visualSlug — a etapa visual vem do workflow.
  const team = normalizePersonaTeamRunInput({
    mission: 'Missao',
    slugs: ['aurora', 'maestro'],
    visualSlug: 'especialista-visual',
  });
  assert.equal(team.visualSlug, undefined);
});

test('normalizePersonaTeamRunInput aceita somente profundidades 1, 2 e 3', () => {
  const base = {
    mission: 'Comparar propostas',
    mode: 'individual',
    slugs: ['aurora'],
    judgeSlug: 'maestro',
  };

  assert.equal(normalizePersonaTeamRunInput({ ...base, depth: 2 }).depth, 2);
  assert.equal(normalizePersonaTeamRunInput({ ...base, depth: 3 }).depth, 3);
  for (const depth of [0, 4, 2.5, '2', null, undefined]) {
    assert.equal(normalizePersonaTeamRunInput({ ...base, depth }).depth, 1);
  }
  assert.deepEqual(DEPTH_BUDGETS, {
    1: { participant: 1100, judge: 1600 },
    2: { participant: 3000, judge: 4000 },
    3: { participant: 20000, judge: 20000 },
  });
});

test('normalizePersonaTeamRunInput classifies domain and honors override', () => {
  const base = {
    mission: 'Sinistro de granizo Sompo com franquia',
    mode: 'individual',
    slugs: ['aurora'],
    judgeSlug: 'maestro',
  };
  const auto = normalizePersonaTeamRunInput(base);
  assert.equal(auto.domain, 'insurance');
  assert.equal(auto.domainSource, 'auto');

  const overridden = normalizePersonaTeamRunInput({ ...base, domain: 'code', domainOverride: true });
  assert.equal(overridden.domain, 'code');
  assert.equal(overridden.domainSource, 'override');
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

test('buildConversationContextFromTranscript keeps prior operator + final and excludes current operator', () => {
  const transcript = [
    { id: 'op_old', role: 'operator', content: 'Caso SOMPO com milho safrinha' },
    { id: 'r1', role: 'persona', name: 'Aurora', stage: 'Execucao', content: 'rascunho intermediario' },
    { id: 'final_old', role: 'persona', name: 'Narrador', stage: 'Exibicao final', content: 'Veredito: priorizar talhoes secos' },
    { id: 'op_current', role: 'operator', content: 'E a franquia?' },
  ];

  const ctx = buildConversationContextFromTranscript(transcript, {
    excludeOperatorId: 'op_current',
  });
  assert.match(ctx, /Caso SOMPO/);
  assert.match(ctx, /Veredito: priorizar/);
  assert.doesNotMatch(ctx, /E a franquia/);
  assert.doesNotMatch(ctx, /rascunho intermediario/);
  assert.match(ctx, /\[Operador\]/);
  assert.match(ctx, /\[Exibicao final\]/);
});

test('buildConversationContextFromTranscript anonymizes persona labels when requested', () => {
  const ctx = buildConversationContextFromTranscript([
    { id: 'op1', role: 'operator', content: 'Missao A' },
    { id: 'judge_1', role: 'persona', name: 'Maestro', stage: 'Juiz', phase: 'judge', content: 'Decisao X' },
  ], { anonymizePersonas: true });

  assert.match(ctx, /\[Entrega anterior da bancada\]/);
  assert.doesNotMatch(ctx, /Maestro/);
  assert.doesNotMatch(ctx, /\[Juiz\]/);
});

test('buildConversationContextFromTranscript drops oldest turns under char budget', () => {
  const transcript = [
    { id: 'op1', role: 'operator', content: `AAA-${'a'.repeat(800)}` },
    { id: 'final_1', role: 'persona', stage: 'Exibicao final', content: `BBB-${'b'.repeat(800)}` },
    { id: 'op2', role: 'operator', content: `CCC-${'c'.repeat(800)}` },
    { id: 'final_2', role: 'persona', stage: 'Exibicao final', content: `DDD-${'d'.repeat(800)}` },
  ];
  const ctx = buildConversationContextFromTranscript(transcript, { maxChars: 900, maxEntryChars: 500 });
  assert.ok(ctx.length <= 900);
  assert.match(ctx, /DDD-/);
  assert.doesNotMatch(ctx, /AAA-/);
});

test('collectPriorAttachmentIds prefers current ids then prior operator attachments', () => {
  const transcript = [
    {
      id: 'op1',
      role: 'operator',
      content: 'caso',
      attachments: [{ id: 'att_old_1' }, { id: 'att_old_2' }],
    },
    { id: 'op_now', role: 'operator', content: 'follow', attachments: [{ id: 'att_new' }] },
  ];
  assert.deepEqual(
    collectPriorAttachmentIds(transcript, {
      excludeOperatorId: 'op_now',
      preferIds: ['att_new'],
      maxIds: 4,
    }),
    ['att_new', 'att_old_1', 'att_old_2'],
  );
  assert.deepEqual(
    collectPriorAttachmentIds(transcript, {
      excludeOperatorId: 'op_now',
      preferIds: [],
      maxIds: 1,
    }),
    ['att_old_1'],
  );
});

test('formatConversationContextForPrompt labels history as bancada-generated', () => {
  const block = formatConversationContextForPrompt('[Operador] pergunta anterior');
  assert.match(block, /Contexto de turnos anteriores/i);
  assert.match(block, /nao e sua resposta anterior/i);
  assert.match(block, /pergunta anterior/);
  assert.equal(formatConversationContextForPrompt('  '), '');
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

test('buildPersonaTeamPrompt injects conversationContext on follow-up', () => {
  const prompt = buildPersonaTeamPrompt({
    mission: 'E a franquia?',
    personaName: 'Maestro',
    personaSlug: 'maestro',
    systemPrompt: 'Coordena.',
    teamNames: ['Maestro'],
    conversationContext: '[Operador] Caso SOMPO milho\n\n[Exibicao final] Priorizar talhoes',
  });
  assert.match(prompt.user, /E a franquia/);
  assert.match(prompt.user, /Contexto de turnos anteriores/i);
  assert.match(prompt.user, /Caso SOMPO milho/);
  assert.match(prompt.user, /Priorizar talhoes/);
  // Constant is part of the contract: keep follow-up budget intentional.
  assert.equal(DEFAULT_MAX_CONVERSATION_CONTEXT_CHARS, 3000);
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

test('buildPersonaTeamPrompt da etapa visual exige JSON de artefatos', () => {
  const prompt = buildPersonaTeamPrompt({
    mission: 'Mapear risco da safrinha',
    personaName: 'Especialista Visual',
    personaSlug: 'especialista-visual',
    teamNames: ['Relator', 'Especialista Visual'],
    workflowRole: {
      roleId: 'visual',
      roleLabel: 'Especialista visual',
      instruction: 'Produza graficos e imagens.',
    },
    accumulatedContext: 'Exibicao final: priorizar Oeste do PR.',
  });

  assert.match(prompt.system, /Papel nesta rodada: Especialista visual/i);
  assert.match(prompt.user, /SOMENTE JSON valido/i);
  assert.match(prompt.user, /imageEngine/i);
  assert.match(prompt.user, /charts/i);
  assert.match(prompt.user, /infographic|explained-chart/i);
  assert.match(prompt.user, /texto vis[ií]vel.*pt-BR/i);
  assert.doesNotMatch(prompt.user, /prompts? (?:de imagem )?em ingl[eê]s|English infographic/i);
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

test('buildIndividualRevisionPrompt pede replica objetiva sem expor identidades alheias', () => {
  const prompt = buildIndividualRevisionPrompt({
    mission: 'Escolher a melhor estrategia',
    personaName: 'Aurora',
    personaSlug: 'aurora',
    systemPrompt: 'Voce questiona premissas.',
    runtimeModel: 'cx/gpt-5.6-sol-high',
    originalReply: { ok: true, content: 'Minha proposta original.' },
    contributions: [
      { label: 'Contribuicao B', ok: true, content: 'Evidencia contraria.' },
    ],
  });

  assert.match(prompt.system, /Voce recebera contribuicoes anonimas/i);
  assert.match(prompt.system, /Nao presuma autoridade por estilo/i);
  assert.match(prompt.user, /Minha proposta original/);
  assert.match(prompt.user, /Contribuicao B/);
  assert.match(prompt.user, /o que mantem, o que muda/i);
  assert.doesNotMatch(prompt.user, /maestro|grok/i);
});

test('buildIndividualJudgePrompt and revision inject conversationContext', () => {
  const judge = buildIndividualJudgePrompt({
    mission: 'E a franquia?',
    judgeName: 'Maestro',
    judgeSlug: 'maestro',
    systemPrompt: 'Julga.',
    replies: [{ ok: true, name: 'Aurora', slug: 'aurora', content: 'proposta' }],
    conversationContext: '[Operador] Caso SOMPO\n\n[Entrega anterior da bancada] veredito previo',
  });
  assert.match(judge.user, /Contexto de turnos anteriores/i);
  assert.match(judge.user, /Caso SOMPO/);

  const revision = buildIndividualRevisionPrompt({
    mission: 'E a franquia?',
    personaName: 'Aurora',
    personaSlug: 'aurora',
    originalReply: { ok: true, content: 'primeira' },
    contributions: [],
    conversationContext: '[Operador] Caso SOMPO',
  });
  assert.match(revision.user, /Contexto de turnos anteriores/i);
  assert.match(revision.user, /Caso SOMPO/);
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
  assert.equal(result.blindReplies, undefined);
});

test('runIndividualResolution inicia participantes em paralelo e publica quem termina primeiro', async () => {
  let releaseFast;
  let releaseSlow;
  const fast = new Promise((resolve) => { releaseFast = resolve; });
  const slow = new Promise((resolve) => { releaseSlow = resolve; });
  const started = [];
  const progress = [];
  const run = runIndividualResolution({
    participantSlugs: ['fast', 'slow'],
    judgeSlug: 'judge',
    runParticipant: ({ slug }) => {
      started.push(slug);
      return slug === 'fast' ? fast : slow;
    },
    runJudge: async ({ replies }) => ({ ok: true, slug: 'judge', content: String(replies.length) }),
    onReply: ({ reply, phase }) => progress.push(`${phase}:${reply.slug}`),
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ['fast', 'slow'], 'ambos iniciam antes de qualquer resposta concluir');
  releaseFast({ ok: true, slug: 'fast', content: 'pronta' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(progress, ['blind:fast'], 'a resposta pronta aparece sem esperar a irma lenta');
  releaseSlow({ ok: true, slug: 'slow', content: 'pronta depois' });
  await run;
  assert.deepEqual(progress, ['blind:fast', 'blind:slow', 'judge:judge']);
});

test('runIndividualResolution no nivel 2 anonimiza replicas e entrega revisoes ao juiz', async () => {
  const revisions = [];
  const originalBySlug = {
    aurora: { ok: true, slug: 'aurora', name: 'Aurora', model: 'cx/gpt-5.6-sol-high', content: 'Resposta da Aurora.' },
    maestro: { ok: true, slug: 'maestro', name: 'Maestro', model: 'gcli/grok-4.5', content: 'Eu, Maestro, prefiro o motor gcli/grok-4.5.' },
    qa: { ok: true, slug: 'qa', name: 'QA', model: 'cx/gpt-5.5-xhigh', content: 'Resposta de QA.' },
  };
  const result = await runIndividualResolution({
    depth: 2,
    participantSlugs: ['aurora', 'maestro', 'qa'],
    judgeSlug: 'juiz',
    runParticipant: async ({ slug }) => originalBySlug[slug],
    runRevision: async (input) => {
      revisions.push(input);
      return { ...input.originalReply, content: `Revisao de ${input.slug}` };
    },
    runJudge: async ({ replies }) => {
      assert.deepEqual(replies.map((reply) => reply.content), [
        'Revisao de aurora',
        'Revisao de maestro',
        'Revisao de qa',
      ]);
      return { ok: true, slug: 'juiz', content: 'Veredito' };
    },
  });

  assert.deepEqual(revisions.map(({ slug, contributions }) => ({
    slug,
    labels: contributions.map((item) => item.label),
  })), [
    { slug: 'aurora', labels: ['Contribuicao B', 'Contribuicao C'] },
    { slug: 'maestro', labels: ['Contribuicao A', 'Contribuicao C'] },
    { slug: 'qa', labels: ['Contribuicao A', 'Contribuicao B'] },
  ]);
  for (const revision of revisions) {
    const serialized = JSON.stringify(revision.contributions).toLowerCase();
    for (const otherSlug of Object.keys(originalBySlug).filter((slug) => slug !== revision.slug)) {
      const other = originalBySlug[otherSlug];
      assert.equal(serialized.includes(other.slug.toLowerCase()), false);
      assert.equal(serialized.includes(other.name.toLowerCase()), false);
      assert.equal(serialized.includes(other.model.toLowerCase()), false);
    }
  }
  assert.deepEqual(result.blindReplies, Object.values(originalBySlug));
  assert.deepEqual(result.replies.map((reply) => reply.content), [
    'Revisao de aurora',
    'Revisao de maestro',
    'Revisao de qa',
  ]);
});

test('runIndividualResolution no nivel 3 usa consenso round-robin e entrega o quadro ao juiz', async () => {
  const turns = [];
  const judgeInputs = [];
  const result = await runIndividualResolution({
    depth: 3,
    participantSlugs: ['aurora', 'maestro'],
    judgeSlug: 'juiz',
    runParticipant: async ({ slug }) => ({
      ok: true,
      slug,
      name: slug,
      content: `cega de ${slug}`,
    }),
    runRevision: async () => {
      throw new Error('depth 3 must not call runRevision');
    },
    runConsensusTurn: async (input) => {
      turns.push(input);
      return {
        ok: true,
        slug: input.slug,
        content: 'voto: converge\nposicao: vistoria no talhao norte',
      };
    },
    runJudge: async (input) => {
      judgeInputs.push(input);
      return { ok: true, slug: 'juiz', content: 'Veredito' };
    },
  });

  assert.equal(turns.length, 2);
  assert.equal(result.consensus.outcome, 'consensus');
  assert.equal(result.consensus.cycleCount, 1);
  assert.equal(judgeInputs[0].consensus.outcome, 'consensus');
  assert.deepEqual(result.replies.map((reply) => reply.phase), ['consensus', 'consensus']);
  assert.match(result.blindReplies[0].content, /cega de aurora/);
});

test('cleanPersonaTeamOutput remove tags de chat herdadas do runtime antigo', () => {
  assert.equal(cleanPersonaTeamOutput('[chat:resultado] Plano pronto.'), 'Plano pronto.');
  assert.equal(cleanPersonaTeamOutput(''), 'Sem resposta textual da persona.');
});
