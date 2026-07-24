import { ROUTER_MODEL } from './config.js';
import { appendEvent, listEvents } from './event-log.js';
import {
  fetchYumePersonaSystemPrompt,
  getYumePersonaVersion,
  isKamuiReachable,
  listYumePersonas,
} from './kamui-client.js';
import { normalizeYumePersonasForLuca } from './persona-cards.js';
import {
  buildPersonaTeamPrompt,
  cleanPersonaTeamOutput,
  normalizePersonaTeamRunInput,
  normalizePersonaTeamSlug,
  PERSONA_WORKFLOW_ROLES,
} from './persona-team.js';
import { createPersonaStore } from './persona-store.js';
import { call9Router, check9RouterHealth } from './router-client.js';
import { resolveRouterModel } from './router-models.js';

const defaultKamui = {
  listPersonas: listYumePersonas,
  fetchPrompt: fetchYumePersonaSystemPrompt,
  getVersion: getYumePersonaVersion,
  health: isKamuiReachable,
};

const defaultRouter = {
  call: call9Router,
  health: check9RouterHealth,
};

const defaultEvents = {
  append: appendEvent,
  list: listEvents,
};

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function compactText(value, maxLength = 320) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact;
}

function modelIsUnavailable(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('model_not_found')
    || message.includes('no active credentials')
    || message.includes('unknown model')
    || message.includes('unsupported model');
}

export function createPersonaWorkbench({
  store = createPersonaStore(),
  kamui = defaultKamui,
  router = defaultRouter,
  events = defaultEvents,
} = {}) {
  function trace(traceId, type, payload = {}) {
    if (!traceId) return null;
    try {
      return events.append({ type, traceId, source: 'luca-ai', payload });
    } catch {
      return null;
    }
  }

  async function loadPrompt(slug) {
    const imported = store.list().find((persona) => persona.slug === slug);
    try {
      const data = await kamui.fetchPrompt(slug);
      let version = data?.version ?? null;
      try {
        const versionInfo = await kamui.getVersion(slug);
        version = versionInfo?.version ?? version;
      } catch {
        // A versao e complementar; o prompt atual continua valido.
      }
      return {
        name: data?.name || imported?.name || slug,
        model: data?.model || imported?.model || '',
        systemPrompt: data?.system_prompt || '',
        version,
        cached: false,
        stale: false,
      };
    } catch (error) {
      if (!imported?.cachedSystemPrompt) throw error;
      return {
        name: imported.name || slug,
        model: imported.model || '',
        systemPrompt: imported.cachedSystemPrompt,
        version: imported.cachedVersion ?? null,
        cached: true,
        stale: true,
        warning: errorMessage(error),
      };
    }
  }

  async function runMember({ slug, mission, teamNames, loaded, workflowRole = null, accumulatedContext = '', traceId = null }) {
    const name = loaded.name || slug;
    const preferredModel = resolveRouterModel(loaded.model, ROUTER_MODEL);
    let model = preferredModel;
    const prompt = buildPersonaTeamPrompt({
      mission,
      personaName: name,
      personaSlug: slug,
      systemPrompt: loaded.systemPrompt,
      teamNames,
      workflowRole,
      accumulatedContext,
    });
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const roleLabel = workflowRole?.roleLabel || '';

    trace(traceId, 'luca_ai.llm.requested', {
      slug,
      name: prompt.name,
      model,
      roleId: workflowRole?.roleId || null,
      roleLabel,
      inputSummary: compactText(prompt.user),
    });

    try {
      let output;
      try {
        output = await router.call({
          system: prompt.system,
          user: prompt.user,
          agentId: `luca-ai-team-${slug}`,
          model,
          maxTokens: 900,
        });
      } catch (error) {
        if (model === ROUTER_MODEL || !modelIsUnavailable(error)) throw error;
        trace(traceId, 'luca_ai.llm.model_fallback', {
          slug,
          name: prompt.name,
          roleId: workflowRole?.roleId || null,
          roleLabel,
          unavailableModel: model,
          fallbackModel: ROUTER_MODEL,
          reason: compactText(errorMessage(error), 240),
        });
        model = ROUTER_MODEL;
        output = await router.call({
          system: prompt.system,
          user: prompt.user,
          agentId: `luca-ai-team-${slug}`,
          model,
          maxTokens: 900,
        });
      }
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startedMs;
      const content = cleanPersonaTeamOutput(output);
      trace(traceId, 'luca_ai.llm.completed', {
        slug,
        name: prompt.name,
        model,
        roleId: workflowRole?.roleId || null,
        roleLabel,
        durationMs,
        outputSummary: compactText(content, 420),
      });
      return {
        ok: true,
        slug,
        name: prompt.name,
        model,
        version: loaded.version ?? null,
        cached: Boolean(loaded.cached),
        stale: Boolean(loaded.stale),
        content,
        startedAt,
        completedAt,
        durationMs,
      };
    } catch (error) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startedMs;
      const message = errorMessage(error);
      trace(traceId, 'luca_ai.llm.failed', {
        slug,
        name,
        model,
        roleId: workflowRole?.roleId || null,
        roleLabel,
        durationMs,
        error: compactText(message, 240),
      });
      return {
        ok: false,
        slug,
        name,
        model,
        version: loaded.version ?? null,
        cached: Boolean(loaded.cached),
        stale: Boolean(loaded.stale),
        error: message,
        startedAt,
        completedAt,
        durationMs,
      };
    }
  }

  async function runWorkflow({ mission, workflow, teamNames, loadedBySlug, traceId }) {
    const steps = [];
    const contextSections = [];

    for (const roleConfig of PERSONA_WORKFLOW_ROLES) {
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      const assignment = workflow.find((item) => item.roleId === roleConfig.id);
      const role = assignment || { ...roleConfig, roleId: roleConfig.id, roleLabel: roleConfig.label, slugs: [] };
      trace(traceId, 'luca_ai.workflow.step_started', {
        roleId: role.roleId,
        roleLabel: role.roleLabel || roleConfig.label,
        participants: (role.slugs || []).map((slug) => ({ slug })),
      });

      const accumulatedContext = contextSections.join('\n\n');
      const replies = [];
      for (const slug of role.slugs || []) {
        const entry = loadedBySlug.get(slug);
        if (!entry || entry.error) {
          replies.push({
            ok: false,
            slug,
            name: slug,
            model: '',
            version: null,
            cached: false,
            stale: false,
            error: entry?.error || 'persona_not_loaded',
          });
          continue;
        }
        replies.push(await runMember({
          slug,
          mission,
          teamNames,
          loaded: entry.loaded,
          workflowRole: role,
          accumulatedContext,
          traceId,
        }));
      }

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startedMs;
      const step = {
        id: role.roleId,
        roleId: role.roleId,
        roleLabel: role.roleLabel || roleConfig.label,
        participants: (role.slugs || []).map((slug) => {
          const entry = loadedBySlug.get(slug);
          return { slug, name: entry?.loaded?.name || slug, model: entry?.loaded?.model || '' };
        }),
        replies,
        startedAt,
        completedAt,
        durationMs,
      };
      steps.push(step);
      const stepContext = replies
        .map((reply) => `${reply.name || reply.slug}: ${reply.ok ? reply.content : `FALHA: ${reply.error || 'erro desconhecido'}`}`)
        .join('\n');
      contextSections.push(`## ${step.roleLabel}\n${stepContext || 'Sem resposta nesta etapa.'}`);
      trace(traceId, 'luca_ai.workflow.step_completed', {
        roleId: step.roleId,
        roleLabel: step.roleLabel,
        durationMs,
        okCount: replies.filter((reply) => reply.ok).length,
        errorCount: replies.filter((reply) => !reply.ok).length,
        outputSummary: compactText(stepContext, 520),
      });
    }

    return steps;
  }

  return {
    async health() {
      const [kamuiStatus, routerStatus] = await Promise.allSettled([
        kamui.health(),
        router.health(),
      ]);
      return {
        ok: true,
        service: 'luca-ai-persona-workbench',
        dependencies: {
          kamui: { ok: kamuiStatus.status === 'fulfilled' && kamuiStatus.value === true },
          router: routerStatus.status === 'fulfilled'
            ? routerStatus.value
            : { ok: false, error: errorMessage(routerStatus.reason) },
        },
      };
    },

    async listPersonas() {
      const personas = await kamui.listPersonas();
      return normalizeYumePersonasForLuca(personas, store.list());
    },

    async importPersona(slugValue) {
      const slug = normalizePersonaTeamSlug(slugValue);
      if (!slug) throw new Error('slug_required');
      const promptData = await kamui.fetchPrompt(slug);
      let version = promptData?.version ?? null;
      try {
        const versionInfo = await kamui.getVersion(slug);
        version = versionInfo?.version ?? version;
      } catch {
        // O cache do prompt nao depende do endpoint de versao.
      }
      const record = store.upsert({
        slug,
        name: promptData?.name || slug,
        model: promptData?.model || '',
        enabled: true,
        cachedSystemPrompt: promptData?.system_prompt || '',
        cachedVersion: version,
        cachedAt: new Date().toISOString(),
      });
      try {
        events.append({
          type: 'persona.added',
          source: 'luca-ai',
          payload: { slug },
        });
      } catch {
        // Importing a persona must not depend on telemetry persistence.
      }
      return record;
    },

    removePersona(slugValue) {
      const slug = normalizePersonaTeamSlug(slugValue);
      if (!slug) return false;
      const removed = store.remove(slug);
      if (removed) {
        try {
          events.append({ type: 'persona.removed', source: 'luca-ai', payload: { slug } });
        } catch {
          // Observabilidade nao bloqueia a operacao principal.
        }
      }
      return removed;
    },

    listEvents(query = {}) {
      return events.list(query);
    },

    async run(body = {}) {
      const input = normalizePersonaTeamRunInput(body);
      if (!input.ok) return input;
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      trace(input.traceId, 'luca_ai.workflow.started', {
        mode: input.mode,
        missionSummary: compactText(input.mission, 360),
        teamSize: input.slugs.length,
        workflow: input.workflow,
      });

      const loaded = await Promise.all(input.slugs.map(async (slug) => {
        try {
          return { slug, loaded: await loadPrompt(slug) };
        } catch (error) {
          return { slug, error: errorMessage(error) };
        }
      }));
      const teamNames = loaded.map((entry) => entry.loaded?.name || entry.slug);
      const loadedBySlug = new Map(loaded.map((entry) => [entry.slug, entry]));
      let steps = [];
      let replies = [];

      if (input.mode === 'workflow') {
        steps = await runWorkflow({
          mission: input.mission,
          workflow: input.workflow,
          teamNames,
          loadedBySlug,
          traceId: input.traceId,
        });
        replies = steps.flatMap((step) => step.replies.map((reply) => ({
          ...reply,
          workflowRoleId: step.roleId,
          workflowRoleLabel: step.roleLabel,
        })));
      } else {
        replies = await Promise.all(loaded.map((entry) => entry.error
          ? Promise.resolve({
            ok: false,
            slug: entry.slug,
            name: entry.slug,
            model: '',
            version: null,
            cached: false,
            stale: false,
            error: entry.error,
          })
          : runMember({
            slug: entry.slug,
            mission: input.mission,
            teamNames,
            loaded: entry.loaded,
            traceId: input.traceId,
          })));
      }

      const finalStep = steps.find((step) => step.roleId === 'display') || null;
      const finalReply = finalStep?.replies.find((reply) => reply.ok) || null;
      const durationMs = Date.now() - startedMs;
      trace(input.traceId, 'luca_ai.workflow.completed', {
        mode: input.mode,
        durationMs,
        ok: replies.some((reply) => reply.ok),
        okCount: replies.filter((reply) => reply.ok).length,
        errorCount: replies.filter((reply) => !reply.ok).length,
      });

      return {
        ok: replies.some((reply) => reply.ok),
        traceId: input.traceId,
        mission: input.mission,
        mode: input.mode,
        team: loaded.map((entry) => ({
          slug: entry.slug,
          name: entry.loaded?.name || entry.slug,
          model: entry.loaded?.model || '',
          version: entry.loaded?.version ?? null,
          cached: Boolean(entry.loaded?.cached),
          stale: Boolean(entry.loaded?.stale),
          error: entry.error || null,
        })),
        replies,
        steps,
        finalDisplay: finalReply ? {
          roleId: finalStep.roleId,
          roleLabel: finalStep.roleLabel,
          slug: finalReply.slug,
          name: finalReply.name,
          model: finalReply.model,
          content: finalReply.content,
        } : null,
        startedAt,
        durationMs,
        generatedAt: new Date().toISOString(),
      };
    },
  };
}
