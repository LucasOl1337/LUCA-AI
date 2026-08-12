const DEFAULT_MAX_TEAM_SIZE = 10;

export const PERSONA_WORKFLOW_ROLES = Object.freeze([
  Object.freeze({
    id: 'supervisor',
    label: 'Supervisor',
    maxSlugs: 1,
    optional: false,
    instruction: 'Defina o enquadramento da bancada: objetivo real, limites, criterio de sucesso e risco principal.',
  }),
  Object.freeze({
    id: 'mission',
    label: 'Decisor da missao',
    maxSlugs: 1,
    optional: false,
    instruction: 'Converta o enquadramento em uma missao executavel, com prioridade, escopo e dependencias.',
  }),
  Object.freeze({
    id: 'execution',
    label: 'Execucao',
    maxSlugs: 4,
    optional: false,
    instruction: 'Execute a parte pratica da missao. Entregue achados, decisoes tecnicas e proximas acoes verificaveis.',
  }),
  Object.freeze({
    id: 'approval',
    label: 'Aprovacao',
    maxSlugs: 2,
    optional: false,
    instruction: 'Revise o resultado dos executores. Aprove, bloqueie ou aprove com condicoes, citando lacunas criticas.',
  }),
  Object.freeze({
    id: 'display',
    label: 'Exibicao final',
    maxSlugs: 1,
    optional: false,
    instruction: 'Transforme o resultado aprovado em uma exibicao final clara para o operador: resumo, decisoes, riscos e proximas acoes.',
  }),
  Object.freeze({
    id: 'visual',
    label: 'Especialista visual',
    maxSlugs: 1,
    optional: true,
    instruction: 'Com base no resultado aprovado e na entrega final, selecione o conteudo mais relevante e produza um plano de artefatos: graficos com dados precisos, relatorio executivo e prompts de infograficos/explained charts (nao stills cinematograficos). Nao invente metricas sem base no contexto.',
  }),
]);

export const PERSONA_WORKFLOW_ROLE_IDS = Object.freeze(
  PERSONA_WORKFLOW_ROLES.map((role) => role.id),
);

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
]);

export function normalizePersonaSlug(value) {
  const raw = String(value || '').trim();
  const slug = raw.startsWith('yume:') ? raw.slice('yume:'.length) : raw;
  return slug.replace(/^\/+|\/+$/g, '');
}

function normalizeRoleId(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ROLE_ALIASES.get(raw) || '';
}

function normalizeSlugList(value, maxSlugs = Number.POSITIVE_INFINITY) {
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
    const slug = normalizePersonaSlug(item);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
    if (slugs.length >= maxSlugs) break;
  }
  return slugs;
}

function emptyAssignments() {
  return Object.fromEntries(PERSONA_WORKFLOW_ROLE_IDS.map((roleId) => [roleId, []]));
}

function flattenAssignments(assignments, maxTeamSize) {
  const seen = new Set();
  const slugs = [];
  for (const role of PERSONA_WORKFLOW_ROLES) {
    for (const slug of assignments[role.id] || []) {
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      slugs.push(slug);
      if (slugs.length >= maxTeamSize) return slugs;
    }
  }
  return slugs;
}

/**
 * Resolve qualquer forma aceita de configuracao para um contrato canonico.
 * Esta e a interface compartilhada por browser, Express e persistencia de templates.
 */
export function resolvePersonaWorkflow(value, {
  fallbackSlugs = [],
  maxTeamSize = DEFAULT_MAX_TEAM_SIZE,
} = {}) {
  const configured = Boolean(value);
  const assignments = emptyAssignments();

  if (Array.isArray(value)) {
    for (const entry of value) {
      const roleId = normalizeRoleId(entry?.roleId || entry?.id || entry?.role);
      const role = ROLE_BY_ID.get(roleId);
      if (!role) continue;
      assignments[roleId] = normalizeSlugList(entry, role.maxSlugs);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, rawSlugs] of Object.entries(value)) {
      const roleId = normalizeRoleId(key);
      const role = ROLE_BY_ID.get(roleId);
      if (!role) continue;
      assignments[roleId] = normalizeSlugList(rawSlugs, role.maxSlugs);
    }
  }

  const normalizedFallback = normalizeSlugList(fallbackSlugs, maxTeamSize);
  const hasAnyAssignment = PERSONA_WORKFLOW_ROLE_IDS.some((roleId) => assignments[roleId].length > 0);
  if (configured && !hasAnyAssignment && normalizedFallback.length) {
    const first = normalizedFallback[0];
    const second = normalizedFallback[1] || first;
    const last = normalizedFallback[normalizedFallback.length - 1] || first;
    assignments.supervisor = [first];
    assignments.mission = [second];
    assignments.execution = normalizedFallback.slice(0, ROLE_BY_ID.get('execution').maxSlugs);
    assignments.approval = [first];
    assignments.display = [last];
  }

  const missingRoleIds = PERSONA_WORKFLOW_ROLES
    .filter((role) => !role.optional && assignments[role.id].length === 0)
    .map((role) => role.id);
  const workflow = configured
    ? PERSONA_WORKFLOW_ROLES.map((role) => ({
        roleId: role.id,
        roleLabel: role.label,
        instruction: role.instruction,
        slugs: assignments[role.id],
      }))
    : [];

  return {
    configured,
    assignments,
    workflow,
    slugs: configured
      ? flattenAssignments(assignments, maxTeamSize)
      : normalizedFallback,
    missingRoleIds,
    ready: missingRoleIds.length === 0,
  };
}

export function getPersonaWorkflowRole(value) {
  return ROLE_BY_ID.get(normalizeRoleId(value)) || null;
}

export function samePersonaWorkflow(left, right) {
  const leftAssignments = resolvePersonaWorkflow(left).assignments;
  const rightAssignments = resolvePersonaWorkflow(right).assignments;
  return PERSONA_WORKFLOW_ROLE_IDS.every((roleId) => {
    const leftSlugs = leftAssignments[roleId];
    const rightSlugs = rightAssignments[roleId];
    return leftSlugs.length === rightSlugs.length
      && leftSlugs.every((slug, index) => slug === rightSlugs[index]);
  });
}
