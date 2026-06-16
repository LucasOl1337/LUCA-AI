const DEFAULT_MAX_TEAM_SIZE = 10;
const DEFAULT_MAX_MISSION_CHARS = 6000;
const DEFAULT_MAX_EXECUTION_SLUGS = 4;

export const PERSONA_WORKFLOW_ROLES = [
  {
    id: 'supervisor',
    label: 'Supervisor',
    maxSlugs: 1,
    instruction: 'Defina o enquadramento da bancada: objetivo real, limites, criterio de sucesso e risco principal.',
  },
  {
    id: 'mission',
    label: 'Decisor da missao',
    maxSlugs: 1,
    instruction: 'Converta o enquadramento em uma missao executavel, com prioridade, escopo e dependencias.',
  },
  {
    id: 'execution',
    label: 'Execucao',
    maxSlugs: DEFAULT_MAX_EXECUTION_SLUGS,
    instruction: 'Execute a parte pratica da missao. Entregue achados, decisoes tecnicas e proximas acoes verificaveis.',
  },
  {
    id: 'approval',
    label: 'Aprovacao',
    maxSlugs: 2,
    instruction: 'Revise o resultado dos executores. Aprove, bloqueie ou aprove com condicoes, citando lacunas criticas.',
  },
  {
    id: 'display',
    label: 'Exibicao final',
    maxSlugs: 1,
    instruction: 'Transforme o resultado aprovado em uma exibicao final clara para o operador: resumo, decisoes, riscos e proximas acoes.',
  },
];

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
  const maxMissionChars = Number.isInteger(options.maxMissionChars) ? options.maxMissionChars : DEFAULT_MAX_MISSION_CHARS;
  const mission = String(body?.mission || body?.description || '').trim().slice(0, maxMissionChars);
  const traceId = normalizeTraceId(body?.traceId);
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
    if (baseSlugs.length >= maxTeamSize) break;
  }
  const workflow = normalizePersonaTeamWorkflow(body, baseSlugs);
  const explicitWorkflow = hasExplicitWorkflow(body);
  const slugs = workflow.length
    ? flattenPersonaTeamWorkflowSlugs(workflow, maxTeamSize)
    : baseSlugs;

  if (!mission) {
    return { ok: false, error: 'mission_required', mission: '', slugs: [] };
  }
  if (!slugs.length) {
    return { ok: false, error: 'team_required', mission, slugs: [] };
  }
  if (explicitWorkflow) {
    const missingRoles = workflow
      .filter((role) => !role.slugs.length)
      .map((role) => role.roleId);
    if (missingRoles.length) {
      return { ok: false, error: 'workflow_role_required', mission, slugs, workflow, missingRoles };
    }
  }

  return { ok: true, mission, slugs, workflow, mode: workflow.length ? 'workflow' : 'parallel', traceId };
}

export function buildPersonaTeamPrompt({
  mission,
  personaName,
  personaSlug,
  systemPrompt,
  teamNames = [],
  workflowRole = null,
  accumulatedContext = '',
}) {
  const name = String(personaName || personaSlug || 'Persona Yume').trim();
  const slug = String(personaSlug || '').trim();
  const basePrompt = String(systemPrompt || '').trim() || `Voce e a persona ${name}.`;
  const teammates = teamNames.filter(Boolean).join(', ') || name;
  const role = workflowRole?.roleId ? ROLE_BY_ID.get(workflowRole.roleId) : null;
  const roleLabel = workflowRole?.roleLabel || role?.label || '';
  const roleInstruction = workflowRole?.instruction || role?.instruction || '';
  const context = String(accumulatedContext || '').trim();
  const workflowSystem = roleLabel
    ? `\nPapel nesta rodada: ${roleLabel}.\nContrato do papel: ${roleInstruction}`
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
    : 'Entregue uma contribuicao objetiva em 3 a 6 bullets. Inclua uma decisao, uma acao imediata e um risco/observacao quando fizer sentido.';

  return {
    name,
    system: `${basePrompt}

---
Voce esta trabalhando dentro do modulo LUCA-AI, uma bancada isolada de personas do Yume.
Nao publique no chat global, nao acione agentes fixos do Operacional e nao assuma que existe uma missao ativa fora desta tela.
Responda em pt-BR, com postura de agente especialista e foco em acao concreta.${workflowSystem}`,
    user: `Missao desta bancada:
${mission}

Equipe ativa: ${teammates}
Sua persona: ${name}${slug ? ` (${slug})` : ''}
${workflowUser}

${outputContract}`,
  };
}

export function cleanPersonaTeamOutput(value) {
  const text = String(value || '').trim();
  if (!text) return 'Sem resposta textual da persona.';
  return text.replace(/^\s*\[chat:[^\]]+\]\s*/gim, '').trim() || 'Sem resposta textual da persona.';
}
