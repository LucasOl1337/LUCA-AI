const DEFAULT_MAX_TEAM_SIZE = 10;
const DEFAULT_MAX_MISSION_CHARS = 6000;
const DEFAULT_MAX_EXECUTION_SLUGS = 4;
const DEFAULT_MAX_INDIVIDUAL_PARTICIPANTS = 5;
const DEFAULT_MAX_ATTACHMENTS = 4;

export const DEPTH_BUDGETS = Object.freeze({
  1: Object.freeze({ participant: 1100, judge: 1600 }),
  2: Object.freeze({ participant: 3000, judge: 4000 }),
  3: Object.freeze({ participant: 20000, judge: 20000 }),
});

function normalizeModelOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const overrides = {};
  for (const [rawKey, rawModel] of Object.entries(value)) {
    const slug = normalizePersonaTeamSlug(rawKey);
    const model = String(rawModel || '').trim();
    if (!slug || !model) continue;
    overrides[slug] = model;
  }
  return overrides;
}

export const PERSONA_WORKFLOW_ROLES = [
  {
    id: 'supervisor',
    label: 'Supervisor',
    maxSlugs: 1,
    optional: false,
    instruction: 'Defina o enquadramento da bancada: objetivo real, limites, criterio de sucesso e risco principal.',
  },
  {
    id: 'mission',
    label: 'Decisor da missao',
    maxSlugs: 1,
    optional: false,
    instruction: 'Converta o enquadramento em uma missao executavel, com prioridade, escopo e dependencias.',
  },
  {
    id: 'execution',
    label: 'Execucao',
    maxSlugs: DEFAULT_MAX_EXECUTION_SLUGS,
    optional: false,
    instruction: 'Execute a parte pratica da missao. Entregue achados, decisoes tecnicas e proximas acoes verificaveis.',
  },
  {
    id: 'approval',
    label: 'Aprovacao',
    maxSlugs: 2,
    optional: false,
    instruction: 'Revise o resultado dos executores. Aprove, bloqueie ou aprove com condicoes, citando lacunas criticas.',
  },
  {
    id: 'display',
    label: 'Exibicao final',
    maxSlugs: 1,
    optional: false,
    instruction: 'Transforme o resultado aprovado em uma exibicao final clara para o operador: resumo, decisoes, riscos e proximas acoes.',
  },
  {
    id: 'visual',
    label: 'Especialista visual',
    maxSlugs: 1,
    // Etapa opcional: vazio = pula artefatos; preenchido = roda o pack visual.
    optional: true,
    instruction: 'Com base no resultado aprovado e na entrega final, selecione o conteudo mais relevante e produza um plano de artefatos: graficos com dados, relatorio executivo e prompts de imagens cinematograficas de exemplo. Nao invente metricas sem base no contexto.',
  },
];

export const REQUIRED_PERSONA_WORKFLOW_ROLES = PERSONA_WORKFLOW_ROLES.filter((role) => !role.optional);

const ROLE_BY_ID = new Map(PERSONA_WORKFLOW_ROLES.map((role) => [role.id, role]));

const ROLE_ALIASES = new Map([
  ['supervisor', 'supervisor'],
  ['coordination', 'supervisor'],
  ['coordenacao', 'supervisor'],
  ['mission', 'mission'],
  ['missao', 'mission'],
  ['mission_decider', 'mission'],
  ['decider', 'mission'],
  ['execution', 'execution'],
  ['execucao', 'execution'],
  ['executor', 'execution'],
  ['executors', 'execution'],
  ['approval', 'approval'],
  ['aprovacao', 'approval'],
  ['approver', 'approval'],
  ['approvers', 'approval'],
  ['display', 'display'],
  ['exibicao', 'display'],
  ['final', 'display'],
  ['final_display', 'display'],
  ['visual', 'visual'],
  ['visuals', 'visual'],
  ['imagem', 'visual'],
  ['imagens', 'visual'],
  ['image', 'visual'],
  ['images', 'visual'],
  ['designer_visual', 'visual'],
  ['especialista_visual', 'visual'],
  ['especialista-visual', 'visual'],
]);

export function normalizePersonaTeamSlug(value) {
  const raw = String(value || '').trim();
  const slug = raw.startsWith('yume:') ? raw.slice('yume:'.length) : raw;
  return slug.replace(/^\/+|\/+$/g, '');
}

function normalizeWorkflowRoleId(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ROLE_ALIASES.get(raw) || '';
}

function normalizeTraceId(value) {
  const raw = String(value || '').trim();
  if (raw) return raw.replace(/[^\w:.-]+/g, '-').slice(0, 120);
  return `luca-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function roleSlugList(value, maxSlugs) {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray(value.slugs)
      ? value.slugs
      : value && typeof value === 'object' && value.slug
        ? [value.slug]
        : value
          ? [value]
          : [];
  const seen = new Set();
  const slugs = [];

  for (const item of values) {
    const slug = normalizePersonaTeamSlug(item);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
    if (slugs.length >= maxSlugs) break;
  }

  return slugs;
}

function hasExplicitWorkflow(body = {}) {
  return Boolean(body?.workflow || body?.roles || body?.assignments);
}

function readWorkflowSource(body = {}) {
  return body?.workflow || body?.roles || body?.assignments || null;
}

function normalizePersonaTeamWorkflow(body = {}, fallbackSlugs = []) {
  const source = readWorkflowSource(body);
  if (!source) return [];

  const byRole = new Map(PERSONA_WORKFLOW_ROLES.map((role) => [role.id, []]));

  if (Array.isArray(source)) {
    for (const entry of source) {
      const roleId = normalizeWorkflowRoleId(entry?.roleId || entry?.id || entry?.role);
      const role = ROLE_BY_ID.get(roleId);
      if (!role) continue;
      byRole.set(roleId, roleSlugList(entry, role.maxSlugs));
    }
  } else if (source && typeof source === 'object') {
    for (const [key, value] of Object.entries(source)) {
      const roleId = normalizeWorkflowRoleId(key);
      const role = ROLE_BY_ID.get(roleId);
      if (!role) continue;
      byRole.set(roleId, roleSlugList(value, role.maxSlugs));
    }
  }

  const hasAnyRole = [...byRole.values()].some((slugs) => slugs.length > 0);
  if (!hasAnyRole && fallbackSlugs.length) {
    const first = fallbackSlugs[0];
    const second = fallbackSlugs[1] || first;
    const last = fallbackSlugs[fallbackSlugs.length - 1] || first;
    byRole.set('supervisor', [first]);
    byRole.set('mission', [second]);
    byRole.set('execution', fallbackSlugs.slice(0, DEFAULT_MAX_EXECUTION_SLUGS));
    byRole.set('approval', [first]);
    byRole.set('display', [last]);
    // visual permanece vazio no fallback — etapa opcional
  }

  return PERSONA_WORKFLOW_ROLES.map((role) => ({
    roleId: role.id,
    roleLabel: role.label,
    instruction: role.instruction,
    slugs: byRole.get(role.id) || [],
  }));
}

function flattenPersonaTeamWorkflowSlugs(workflow = [], maxTeamSize = DEFAULT_MAX_TEAM_SIZE) {
  const seen = new Set();
  const slugs = [];

  for (const role of workflow) {
    for (const slug of role.slugs || []) {
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      slugs.push(slug);
      if (slugs.length >= maxTeamSize) return slugs;
    }
  }

  return slugs;
}

export function normalizePersonaTeamRunInput(body = {}, options = {}) {
  const maxTeamSize = Number.isInteger(options.maxTeamSize) ? options.maxTeamSize : DEFAULT_MAX_TEAM_SIZE;
  const maxIndividualParticipants = Number.isInteger(options.maxIndividualParticipants)
    ? options.maxIndividualParticipants
    : DEFAULT_MAX_INDIVIDUAL_PARTICIPANTS;
  const maxMissionChars = Number.isInteger(options.maxMissionChars) ? options.maxMissionChars : DEFAULT_MAX_MISSION_CHARS;
  const sessionId = String(body?.sessionId || '').trim();
  const attachmentIds = [...new Set(
    (Array.isArray(body?.attachmentIds) ? body.attachmentIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )].slice(0, DEFAULT_MAX_ATTACHMENTS);
  const missionText = String(body?.mission || body?.description || '').trim().slice(0, maxMissionChars);
  const mission = missionText || (attachmentIds.length ? 'Analise os anexos enviados.' : '');
  const traceId = normalizeTraceId(body?.traceId);
  const requestedMode = String(body?.mode || '').trim().toLowerCase();
  const individualMode = requestedMode === 'individual';
  const depth = Number.isInteger(body?.depth) && DEPTH_BUDGETS[body.depth] ? body.depth : 1;
  const judgeSlug = individualMode
    ? normalizePersonaTeamSlug(body?.judgeSlug || body?.judge || body?.judgePersona)
    : '';
  const participantLimit = individualMode ? maxIndividualParticipants : maxTeamSize;
  const sourceSlugs = Array.isArray(body?.slugs)
    ? body.slugs
    : Array.isArray(body?.teamSlugs)
      ? body.teamSlugs
      : [];
  const seen = new Set();
  const baseSlugs = [];

  for (const value of sourceSlugs) {
    const slug = normalizePersonaTeamSlug(value);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    baseSlugs.push(slug);
    if (baseSlugs.length >= participantLimit) break;
  }
  const workflow = individualMode ? [] : normalizePersonaTeamWorkflow(body, baseSlugs);
  const explicitWorkflow = !individualMode && hasExplicitWorkflow(body);
  const slugs = workflow.length
    ? flattenPersonaTeamWorkflowSlugs(workflow, maxTeamSize)
    : baseSlugs;

  if (!missionText && !attachmentIds.length) {
    return { ok: false, error: 'mission_required', mission: '', slugs: [] };
  }
  if (attachmentIds.length && !sessionId) {
    return { ok: false, error: 'attachment_session_required', mission, slugs };
  }
  if (!slugs.length) {
    return { ok: false, error: 'team_required', mission, slugs: [] };
  }
  if (individualMode && !judgeSlug) {
    return { ok: false, error: 'judge_required', mission, slugs, workflow: [] };
  }
  if (explicitWorkflow) {
    const missingRoles = workflow
      .filter((role) => {
        if (role.slugs.length) return false;
        const def = ROLE_BY_ID.get(role.roleId);
        return !def?.optional;
      })
      .map((role) => role.roleId);
    if (missingRoles.length) {
      return { ok: false, error: 'workflow_role_required', mission, slugs, workflow, missingRoles };
    }
  }

  return {
    ok: true,
    mission,
    slugs,
    workflow,
    mode: individualMode ? 'individual' : workflow.length ? 'workflow' : 'parallel',
    depth,
    judgeSlug: individualMode ? judgeSlug : undefined,
    modelOverrides: normalizeModelOverrides(body?.modelOverrides || body?.models),
    sessionId: sessionId || undefined,
    attachmentIds,
    traceId,
  };
}

function redactAnonymousContribution(reply) {
  const secrets = [reply?.model, reply?.name, reply?.slug]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  let content = reply?.ok
    ? cleanPersonaTeamOutput(reply.content)
    : `FALHA: ${String(reply?.error || 'sem resposta').trim()}`;
  for (const secret of secrets) {
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(escaped, 'gi'), '[identidade removida]');
  }
  return { ok: Boolean(reply?.ok), content };
}

/** Marker for Yume "pure model" personas: free agent, minimal orchestration wrap. */
export const PURE_MODEL_AGENT_MARKER = 'PURE_MODEL_AGENT_V1';

export function isPureModelAgent({ personaSlug = '', systemPrompt = '' } = {}) {
  const slug = String(personaSlug || '').trim().toLowerCase();
  const prompt = String(systemPrompt || '');
  if (prompt.includes(PURE_MODEL_AGENT_MARKER)) return true;
  if (slug.startsWith('pure-') || slug.startsWith('model-')) return true;
  return false;
}

function modelTruthBlock(model, { pure = false } = {}) {
  const id = String(model || '').trim();
  if (!id) {
    return pure
      ? 'Motor LLM nao declarado. Nao invente o nome do modelo.'
      : `Motor LLM desta execucao nao foi declarado explicitamente.
- Nao invente nomes de modelo (GLM, gpt, grok, etc.).
- Se perguntarem o modelo e voce nao tiver o ID, diga que o motor e o 9Router do LUCA e que o ID nao foi exposto neste turno.`;
  }
  if (pure) {
    return `Motor 9Router desta execucao: ${id}
- Se perguntarem qual modelo voce usa, responda EXATAMENTE "${id}".
- Nao invente provider, familia ou versao fora desse ID.`;
  }
  return `Motor LLM desta execucao (fonte de verdade do LUCA-AI via 9Router): ${id}
- Persona/slug e identidade operacional, NAO o nome do modelo.
- Se perguntarem qual modelo voce usa, responda EXATAMENTE "${id}".
- Ignore qualquer modelo antigo embutido no prompt da persona (ex.: GLM, glm-*, genericos).
- Nao invente provider, familia ou versao fora desse ID.`;
}

export function buildPersonaTeamPrompt({
  mission,
  personaName,
  personaSlug,
  systemPrompt,
  runtimeModel = '',
  teamNames = [],
  workflowRole = null,
  accumulatedContext = '',
  independent = false,
}) {
  const name = String(personaName || personaSlug || 'Persona Yume').trim();
  const slug = String(personaSlug || '').trim();
  const basePrompt = String(systemPrompt || '').trim() || `Voce e a persona ${name}.`;
  const model = String(runtimeModel || '').trim();
  const pure = isPureModelAgent({ personaSlug: slug, systemPrompt: basePrompt });
  const modelBlock = modelTruthBlock(model, { pure });

  // Pure model agents: keep the Yume system almost raw. Only add motor truth + mission.
  if (pure) {
    const role = workflowRole?.roleId ? ROLE_BY_ID.get(workflowRole.roleId) : null;
    const roleLabel = workflowRole?.roleLabel || role?.label || '';
    const roleInstruction = workflowRole?.instruction || role?.instruction || '';
    const context = String(accumulatedContext || '').trim();
    const visualJsonHint = role?.id === 'visual'
      ? 'Responda SOMENTE com JSON valido contendo summary, report, charts (ate 3, pie|tower), images (ate 2 prompts em ingles) e imageEngine (grok-imagine|gpt-image).'
      : '';
    const extraUser = [
      roleLabel ? `Etapa: ${roleLabel}. ${roleInstruction}` : '',
      visualJsonHint,
      context ? `Contexto acumulado:\n${context}` : '',
    ].filter(Boolean).join('\n\n');
    return {
      name,
      pure: true,
      system: `${basePrompt}

---
${modelBlock}
${role?.id === 'visual'
    ? 'Nesta etapa o formato de saida e JSON de artefatos visuais (sem markdown fora do JSON).'
    : 'Responda com liberdade de formato. Sem personagem fixo alem do que o system acima definir.'}`,
      user: extraUser
        ? `${String(mission || '').trim()}\n\n${extraUser}`
        : String(mission || '').trim(),
    };
  }

  const teammates = teamNames.filter(Boolean).join(', ') || name;
  const role = workflowRole?.roleId ? ROLE_BY_ID.get(workflowRole.roleId) : null;
  const roleLabel = workflowRole?.roleLabel || role?.label || '';
  const roleInstruction = workflowRole?.instruction || role?.instruction || '';
  const context = String(accumulatedContext || '').trim();
  const workflowSystem = roleLabel
    ? `\nPapel nesta rodada: ${roleLabel}.\nContrato do papel: ${roleInstruction}`
    : '';
  const individualSystem = independent
      ? '\nEsta e uma resolucao com contexto limpo e individual. Voce nao recebeu nomes nem respostas dos demais participantes; responda sem presumir consenso ou complementar trabalho alheio.'
      : '';
    const workflowUser = roleLabel
      ? `
  Etapa atual: ${roleLabel}
  Contrato da etapa: ${roleInstruction}
  Contexto acumulado das etapas anteriores:
  ${context || 'Ainda nao ha contexto acumulado; esta e a primeira etapa.'}
  `
      : '';
    const outputContract = role?.id === 'display'
      ? 'Entregue a exibicao final em secoes curtas: Resumo, Decisao, Evidencias, Riscos, Proximas acoes.'
      : role?.id === 'visual'
        ? `Voce e a etapa final de artefatos da bancada. Com base no contexto acumulado (especialmente Aprovacao e Exibicao final), produza SOMENTE JSON valido — sem markdown fora do JSON — neste formato:
{
  "summary": "1-2 frases sobre o que sera visualizado",
  "report": {
    "title": "titulo do relatorio",
    "markdown": "relatorio executivo em markdown (pt-BR), curto e acionavel"
  },
  "charts": [
    {
      "id": "c1",
      "title": "titulo",
      "type": "pie|tower",
      "items": [{ "label": "nome", "value": 1 }],
      "rationale": "por que este grafico"
    }
  ],
  "images": [
    {
      "id": "i1",
      "title": "titulo",
      "prompt": "English cinematic prompt grounded in the findings (no illegible text, photoreal or film still)",
      "aspect_ratio": "16:9",
      "style": "cinematic"
    }
  ],
  "imageEngine": "grok-imagine"
}
Regras:
- Ate 3 charts, 1 report, ate 2 images.
- So use numeros/labels sustentados pelo contexto; se faltar dado, omita o chart ou use ranking qualitativo com valores relativos honestos.
- Prompts de imagem em ingles, cinematograficos, fiéis aos achados (cenas de exemplo, nao screenshots de UI).
- imageEngine pode ser "grok-imagine" ou "gpt-image".
- Nao mencione runtime interno, 9router, agents nem logs.`
        : 'Entregue uma contribuicao objetiva em 3 a 6 bullets. Inclua uma decisao, uma acao imediata e um risco/observacao quando fizer sentido.';

    return {
      name,
      pure: false,
      system: `${basePrompt}

  ---
  Voce esta trabalhando dentro do modulo LUCA-AI, uma bancada isolada de personas do Yume.
  ${modelBlock}
  Nao publique no chat global, nao acione agentes fixos do Operacional e nao assuma que existe uma missao ativa fora desta tela.
  Quando a missao depender de fato externo (URL, site, API), use as ferramentas operacionais do runtime antes de concluir.
  Responda em pt-BR, com postura de agente especialista e foco em acao concreta.${workflowSystem}${individualSystem}`,
      user: `Missao desta bancada:
  ${mission}

  ${independent ? '' : `Equipe ativa: ${teammates}\n`}
  Sua persona: ${name}${slug ? ` (${slug})` : ''}
  ${model ? `Motor 9Router: ${model}` : ''}
  ${workflowUser}

  ${outputContract}`,
    };
  }

export function buildIndividualJudgePrompt({
  mission,
  judgeName,
  judgeSlug,
  systemPrompt,
  runtimeModel = '',
  replies = [],
  originalReplies = [],
}) {
  const name = String(judgeName || judgeSlug || 'Juiz').trim();
  const slug = String(judgeSlug || '').trim();
  const basePrompt = String(systemPrompt || '').trim() || `Voce e a persona ${name}.`;
  const model = String(runtimeModel || '').trim();
  const pure = isPureModelAgent({ personaSlug: slug, systemPrompt: basePrompt });
  const modelBlock = pure
    ? modelTruthBlock(model, { pure: true })
    : (model
      ? `
Motor LLM desta execucao (fonte de verdade do LUCA-AI via 9Router): ${model}
- Voce e a persona "${name}"${slug ? ` (${slug})` : ''}; isso e identidade operacional, nao o modelo.
- Se perguntarem qual modelo voce usa, responda EXATAMENTE "${model}".
- Ignore modelos antigos no prompt da persona (GLM, glm-*, etc.).
- Ao avaliar participantes, nao invente o modelo deles; use apenas o que o runtime declarar ou diga que o ID nao foi informado.`
      : `
Motor LLM desta execucao nao foi declarado explicitamente.
- Nao invente nomes de modelo.
- Se perguntarem o modelo e voce nao tiver o ID, diga que o motor e o 9Router do LUCA e que o ID nao foi exposto neste turno.`);
  const formatReplies = (items) => items.map((reply) => {
    const author = `${reply?.name || reply?.slug || 'Participante'}${reply?.slug ? ` (${reply.slug})` : ''}`;
    const motor = reply?.model ? ` | motor 9Router: ${reply.model}` : '';
    const content = reply?.ok
      ? cleanPersonaTeamOutput(reply.content)
      : `FALHA: ${String(reply?.error || 'sem resposta').trim()}`;
    return `${author}${motor}: ${content}`;
  }).join('\n\n');
  const contributions = formatReplies(replies);
  const originals = formatReplies(originalReplies);
  const originalsAppendix = originals
    ? `\n\nRespostas cegas originais (anexo contextual; priorize as revisoes):\n${originals}`
    : '';

  if (pure) {
    return {
      name,
      pure: true,
      system: `${basePrompt}

---
${modelBlock}
Voce avalia contribuicoes de outros agentes. Seja direto, livre de formato e sem personagem fixo.`,
      user: `Missao:
${mission}

Contribuicoes:
${contributions || 'Nenhuma contribuicao utilizavel.'}${originalsAppendix}

Entregue seu julgamento final com liberdade de forma.`,
    };
  }

  return {
      name,
      pure: false,
      system: `${basePrompt}

  ---
  Voce e o juiz independente de uma resolucao individual no modulo LUCA-AI.
  ${modelBlock}
  Nao produza uma resposta isolada antes de examinar todas as contribuicoes recebidas.
  Avalie evidencias, utilidade, consistencia e cobertura. Nao favoreca uma persona por identidade, inclusive se voce tambem participou da primeira rodada.
  Se a missao original depender de fato externo e as contribuicoes nao tiverem evidencia suficiente, voce tambem pode usar as ferramentas operacionais do runtime.
  Responda em pt-BR.`,
      user: `Missao original:
  ${mission}

  Persona juiza: ${name}${slug ? ` (${slug})` : ''}
  ${model ? `Motor 9Router do juiz: ${model}` : ''}

  Contribuicoes individuais:
  ${contributions || 'Nenhuma contribuicao utilizavel foi recebida.'}${originalsAppendix}

  Produza obrigatoriamente estas partes, nesta ordem:
  0. Resposta livre — comece com sua leitura espontanea da missao e das contribuicoes, no formato que preferir (paragrafos, raciocinio aberto, observacoes soltas). Use este espaco para pensar em voz alta como juiz, sem obrigacao de estrutura.
  Depois da resposta livre, entregue a estrutura final obrigatoria:
  1. Avaliacao dos participantes — diga o que foi util em cada resposta.
  2. Alertas de qualidade — identifique, por participante, qualquer trecho falso, nao sustentado ou incompleto. Se nao houver, diga explicitamente.
  3. Complementacao — combine o que for compativel e corrija as lacunas relevantes.
  4. Veredito final — apresente a melhor decisao final, sua justificativa e proximas acoes.`,
    };
  }

export function buildIndividualRevisionPrompt({
  mission,
  personaName,
  personaSlug,
  systemPrompt,
  runtimeModel = '',
  originalReply,
  contributions = [],
}) {
  const name = String(personaName || personaSlug || 'Participante').trim();
  const slug = String(personaSlug || '').trim();
  const basePrompt = String(systemPrompt || '').trim() || `Voce e a persona ${name}.`;
  const model = String(runtimeModel || '').trim();
  const original = originalReply?.ok
    ? cleanPersonaTeamOutput(originalReply.content)
    : `FALHA: ${String(originalReply?.error || 'sem resposta original').trim()}`;
  const anonymous = contributions.map((contribution) => (
    `${String(contribution?.label || 'Contribuicao anonima')}: ${contribution?.ok
      ? cleanPersonaTeamOutput(contribution.content)
      : `FALHA: ${String(contribution?.error || contribution?.content || 'sem resposta').trim()}`}`
  )).join('\n\n');

  return {
    name,
    system: `${basePrompt}

---
${modelTruthBlock(model, { pure: isPureModelAgent({ personaSlug: slug, systemPrompt: basePrompt }) })}
Voce recebera contribuicoes anonimas de outros participantes sobre a mesma missao. Revise sua resposta: mantenha o que sustenta, corrija o que os outros refutaram com evidencia melhor, aponte erros alheios objetivamente. Nao presuma autoridade por estilo — avalie evidencia.
Nao tente identificar os autores das contribuicoes. Responda em pt-BR.`,
    user: `Missao original:
${mission}

Sua resposta original:
${original}

Contribuicoes anonimas:
${anonymous || 'Nenhuma contribuicao anonima utilizavel foi recebida.'}

Entregue uma revisao objetiva em 3 a 6 bullets: o que mantem, o que muda e onde as outras contribuicoes erraram. Inclua a decisao revisada e a proxima acao.`,
  };
}

export async function runIndividualResolution({
  participantSlugs = [],
  judgeSlug,
  depth = 1,
  runParticipant,
  runRevision,
  runJudge,
}) {
  const blindReplies = await Promise.all(
    participantSlugs.map((slug) => runParticipant({ slug })),
  );
  if (depth < 2 || typeof runRevision !== 'function') {
    const judge = await runJudge({ slug: judgeSlug, replies: blindReplies });
    return { replies: blindReplies, judge };
  }

  // TODO(depth-3): substituir esta replica unica pelo consenso round-robin na proxima onda.
  const replies = await Promise.all(participantSlugs.map((slug, participantIndex) => {
    const contributions = blindReplies.flatMap((reply, replyIndex) => (
      replyIndex === participantIndex
        ? []
        : [{
            label: `Contribuicao ${String.fromCharCode(65 + replyIndex)}`,
            ...redactAnonymousContribution(reply),
          }]
    ));
    return runRevision({
      slug,
      originalReply: blindReplies[participantIndex],
      contributions,
    });
  }));
  const judge = await runJudge({ slug: judgeSlug, replies, originalReplies: blindReplies });
  return { replies, blindReplies, judge };
}

export function cleanPersonaTeamOutput(value) {
  const text = String(value || '').trim();
  if (!text) return 'Sem resposta textual da persona.';
  return text.replace(/^\s*\[chat:[^\]]+\]\s*/gim, '').trim() || 'Sem resposta textual da persona.';
}
