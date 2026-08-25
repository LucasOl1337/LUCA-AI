import {
  getPersonaWorkflowRole,
  normalizePersonaSlug,
  resolvePersonaWorkflow,
} from '../shared/persona-workflow.js';
import { resolveMissionDomain } from '../shared/mission-triage.js';
import { runConsensusRounds, formatNegotiationBoard } from './persona-consensus.js';

const DEFAULT_MAX_TEAM_SIZE = 10;
const DEFAULT_MAX_MISSION_CHARS = 6000;
const DEFAULT_MAX_INDIVIDUAL_PARTICIPANTS = 5;
const DEFAULT_MAX_ATTACHMENTS = 4;
/** Compact prior-turn context injected into persona prompts on follow-up. */
export const DEFAULT_MAX_CONVERSATION_CONTEXT_CHARS = 3000;
const DEFAULT_MAX_CONTEXT_ENTRY_CHARS = 1200;

export const DEPTH_BUDGETS = Object.freeze({
  1: Object.freeze({ participant: 1100, judge: 1600 }),
  2: Object.freeze({ participant: 3000, judge: 4000 }),
  3: Object.freeze({ participant: 20000, judge: 20000 }),
});

function normalizeModelOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const overrides = {};
  for (const [rawKey, rawModel] of Object.entries(value)) {
    const slug = normalizePersonaSlug(rawKey);
    const model = String(rawModel || '').trim();
    if (!slug || !model) continue;
    overrides[slug] = model;
  }
  return overrides;
}

function normalizeTraceId(value) {
  const raw = String(value || '').trim();
  if (raw) return raw.replace(/[^\w:.-]+/g, '-').slice(0, 120);
  return `luca-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
  const domainOverride = body?.domainOverride === true || body?.domainOverride === 'true';
  const resolvedDomain = resolveMissionDomain(missionText, {
    domain: body?.domain,
    domainOverride,
  });
  const judgeSlug = individualMode
    ? normalizePersonaSlug(body?.judgeSlug || body?.judge || body?.judgePersona)
    : '';
  // Etapa visual opcional no modo individual: roda depois do juiz quando preenchida.
  const visualSlug = individualMode
    ? normalizePersonaSlug(body?.visualSlug || body?.visual)
    : '';
  const participantLimit = individualMode ? maxIndividualParticipants : maxTeamSize;
  const sourceSlugs = Array.isArray(body?.slugs)
    ? body.slugs
    : Array.isArray(body?.teamSlugs)
      ? body.teamSlugs
      : [];
  const baseSlugs = resolvePersonaWorkflow(null, {
    fallbackSlugs: sourceSlugs,
    maxTeamSize: participantLimit,
  }).slugs;
  const workflowSource = body?.workflow || body?.roles || body?.assignments || null;
  const workflowConfig = individualMode
    ? null
    : resolvePersonaWorkflow(workflowSource, { fallbackSlugs: baseSlugs, maxTeamSize });
  const workflow = workflowConfig?.workflow || [];
  const slugs = workflowConfig?.configured ? workflowConfig.slugs : baseSlugs;

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
  if (workflowConfig?.configured) {
    const missingRoles = workflowConfig.missingRoleIds;
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
    domain: resolvedDomain.domain,
    domainSource: resolvedDomain.domainSource,
    judgeSlug: individualMode ? judgeSlug : undefined,
    visualSlug: individualMode ? (visualSlug || undefined) : undefined,
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

function clipContextText(value, maxChars) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function isOperatorTranscriptEntry(entry) {
  return String(entry?.role || '').trim() === 'operator';
}

function isFinalishTranscriptEntry(entry) {
  if (!entry || isOperatorTranscriptEntry(entry)) return false;
  if (String(entry.phase || '').trim().toLowerCase() === 'judge') return true;
  const stage = String(entry.stage || '').trim().toLowerCase();
  if (stage.includes('juiz') || stage.includes('exibi') || stage.includes('display')) return true;
  const id = String(entry.id || '').trim().toLowerCase();
  return id.startsWith('judge_') || id.startsWith('final_');
}

/**
 * Compact prior turns from the session transcript for follow-up runs.
 * Keeps operator questions + last finals/verdicts; drops oldest first under maxChars.
 * Excludes the operator bubble of the in-flight run (already the mission field).
 */
export function buildConversationContextFromTranscript(transcript = [], options = {}) {
  const maxChars = Number.isInteger(options.maxChars) && options.maxChars > 0
    ? options.maxChars
    : DEFAULT_MAX_CONVERSATION_CONTEXT_CHARS;
  const maxEntryChars = Number.isInteger(options.maxEntryChars) && options.maxEntryChars > 0
    ? options.maxEntryChars
    : DEFAULT_MAX_CONTEXT_ENTRY_CHARS;
  const excludeOperatorId = String(options.excludeOperatorId || '').trim();
  const anonymizePersonas = Boolean(options.anonymizePersonas);

  const lines = [];
  for (const entry of Array.isArray(transcript) ? transcript : []) {
    const content = clipContextText(entry?.content, maxEntryChars);
    if (!content) continue;
    if (isOperatorTranscriptEntry(entry)) {
      if (excludeOperatorId && String(entry.id || '').trim() === excludeOperatorId) continue;
      lines.push(`[Operador] ${content}`);
      continue;
    }
    if (!isFinalishTranscriptEntry(entry)) continue;
    if (anonymizePersonas) {
      lines.push(`[Entrega anterior da bancada] ${content}`);
    } else {
      const label = String(entry.stage || entry.name || 'Persona').trim() || 'Persona';
      lines.push(`[${label}] ${content}`);
    }
  }

  if (!lines.length) return '';

  // Prefer recent turns: drop oldest first until under budget.
  let selected = lines.slice();
  let text = selected.join('\n\n');
  while (selected.length > 1 && text.length > maxChars) {
    selected = selected.slice(1);
    text = selected.join('\n\n');
  }
  if (text.length > maxChars) {
    text = `${text.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return text.trim();
}

export function formatConversationContextForPrompt(rawContext) {
  const text = String(rawContext || '').trim();
  if (!text) return '';
  return `Contexto de turnos anteriores desta conversa (gerado pela bancada — nao e sua resposta anterior):\n${text}`;
}

/**
 * Prefer current-run attachment ids, then fill with prior operator attachments (same session disk).
 */
export function collectPriorAttachmentIds(transcript = [], options = {}) {
  const maxIds = Number.isInteger(options.maxIds) && options.maxIds > 0
    ? options.maxIds
    : DEFAULT_MAX_ATTACHMENTS;
  const excludeOperatorId = String(options.excludeOperatorId || '').trim();
  const preferIds = Array.isArray(options.preferIds) ? options.preferIds : [];
  const prior = [];

  for (const entry of Array.isArray(transcript) ? transcript : []) {
    if (!isOperatorTranscriptEntry(entry)) continue;
    if (excludeOperatorId && String(entry.id || '').trim() === excludeOperatorId) continue;
    for (const attachment of Array.isArray(entry.attachments) ? entry.attachments : []) {
      const id = String(attachment?.id || '').trim();
      if (id) prior.push(id);
    }
  }

  const seen = new Set();
  const out = [];
  for (const value of [...preferIds, ...prior]) {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= maxIds) break;
  }
  return out;
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
  conversationContext = '',
}) {
  const name = String(personaName || personaSlug || 'Persona Yume').trim();
  const slug = String(personaSlug || '').trim();
  const basePrompt = String(systemPrompt || '').trim() || `Voce e a persona ${name}.`;
  const model = String(runtimeModel || '').trim();
  const pure = isPureModelAgent({ personaSlug: slug, systemPrompt: basePrompt });
  const modelBlock = modelTruthBlock(model, { pure });
  const historyBlock = formatConversationContextForPrompt(conversationContext);

  // Pure model agents: keep the Yume system almost raw. Only add motor truth + mission.
  if (pure) {
    const role = workflowRole?.roleId ? getPersonaWorkflowRole(workflowRole.roleId) : null;
    const roleLabel = workflowRole?.roleLabel || role?.label || '';
    const roleInstruction = workflowRole?.instruction || role?.instruction || '';
    const context = String(accumulatedContext || '').trim();
    const visualJsonHint = role?.id === 'visual'
      ? 'Responda SOMENTE com JSON valido contendo summary, report, charts (ate 3, pie|tower|line), images (ate 2 prompts em pt-BR de infografico/explained-chart) e imageEngine (gpt-image|grok-imagine). Todos os campos legiveis e todo texto visivel solicitado nas imagens devem permanecer em pt-BR.'
      : '';
    const extraUser = [
      historyBlock,
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
    ? 'Nesta etapa o formato de saida e JSON de artefatos visuais (sem markdown fora do JSON). Escreva summary, report, titulos, rotulos, legendas, chamadas e prompts de imagem em pt-BR; todo texto visivel da arte deve estar em pt-BR.'
    : 'Responda com liberdade de formato. Sem personagem fixo alem do que o system acima definir.'}`,
      user: extraUser
        ? `${String(mission || '').trim()}\n\n${extraUser}`
        : String(mission || '').trim(),
    };
  }

  const teammates = teamNames.filter(Boolean).join(', ') || name;
  const role = workflowRole?.roleId ? getPersonaWorkflowRole(workflowRole.roleId) : null;
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
        ? `Voce e a etapa final de artefatos da bancada. Com base no contexto acumulado (especialmente Aprovacao, Exibicao final ou veredito do juiz), produza SOMENTE JSON valido — sem markdown fora do JSON — neste formato:
{
  "summary": "1-2 frases em pt-BR sobre o que sera visualizado",
  "report": {
    "title": "titulo do relatorio",
    "markdown": "relatorio em markdown (pt-BR): explique o que cada grafico/imagem mostra e por que importa; 2-4 bullets acionaveis"
  },
  "charts": [
    {
      "id": "c1",
      "title": "titulo",
      "type": "pie|tower|line",
      "items": [{ "label": "nome", "value": 1 }],
      "rationale": "por que este grafico"
    }
  ],
  "images": [
    {
      "id": "i1",
      "title": "titulo do infografico",
      "prompt": "Prompt em pt-BR para infografico/grafico explicado: titulo legivel, rotulos/eixos claros, valores corretos do contexto, 1-3 chamadas, legenda embutida, alto contraste, tipografia limpa, sem UI de produto inventada e sem texto ilegivel. Todo texto visivel deve estar em pt-BR",
      "aspect_ratio": "16:9",
      "style": "infographic"
    }
  ],
  "imageEngine": "gpt-image"
}
Regras:
- Ate 3 charts SVG (ate 8 itens cada) para numeros precisos; 1 report; ate 2 images de infografico/explained-chart via image gen.
- Preferir images[].style "infographic" ou "explained-chart" (nao still cinematografico generico).
- Use "line" para evolucao/sequencia temporal, "tower" para ranking/comparacao e "pie" para composicao percentual.
- So use numeros/labels sustentados pelo contexto; se faltar dado, omita o chart/imagem ou use ranking qualitativo com valores relativos honestos.
- Todos os campos legiveis do JSON devem estar em pt-BR: summary, report, titulos, rotulos, rationale e prompts.
- Prompts de imagem em pt-BR, fieis aos achados: grafico/infografico bem explicado, tipografia legivel, contraste alto. Exija que todo texto visivel da arte (titulo, rotulos, eixos, legendas, chamadas e notas) permaneça em pt-BR e nao seja traduzido para ingles.
- imageEngine preferir "gpt-image" (caminho Maestro/9Router); "grok-imagine" so como alternativa.
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
${historyBlock ? `\n  ${historyBlock.replace(/\n/g, '\n  ')}\n` : ''}
  ${independent ? '' : `Equipe ativa: ${teammates}\n`}
  Sua persona: ${name}${slug ? ` (${slug})` : ''}
  ${model ? `Motor 9Router: ${model}` : ''}
  ${workflowUser}

  ${outputContract}`,
    };
  }

function formatConsensusBoardForJudge(board) {
  return formatNegotiationBoard(board);
}

export function buildIndividualJudgePrompt({
  mission,
  judgeName,
  judgeSlug,
  systemPrompt,
  runtimeModel = '',
  replies = [],
  originalReplies = [],
  conversationContext = '',
  consensus = null,
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
  const consensusOutcome = String(consensus?.outcome || '').trim();
  const consensusAppendix = consensusOutcome
    ? `\n\nResultado do consenso: ${consensusOutcome === 'consensus' ? 'CONSENSO' : 'DISSENSO'} apos ${consensus.cycleCount || '?'} ciclo(s) (teto 5).
Quadro de negociacao:
${formatConsensusBoardForJudge(consensus.board)}
${consensusOutcome === 'consensus'
    ? 'Nao reabra pontos ja acordados. Redija o veredito a partir do quadro.'
    : 'Registre o dissenso explicitamente no veredito e decida mesmo assim.'}`
    : '';
  const ledgerRequest = `
Ao final, emita exatamente este bloco (listas curtas, separadas por ponto-e-virgula):
DIARIO DA MISSAO
decisoes:
evidencias:
pendencias:
divergencias:`;
  const historyBlock = formatConversationContextForPrompt(conversationContext);
  const historyAppendix = historyBlock ? `\n\n${historyBlock}` : '';

  if (pure) {
    return {
      name,
      pure: true,
      system: `${basePrompt}

---
${modelBlock}
Voce avalia contribuicoes de outros agentes. Seja direto, livre de formato e sem personagem fixo.`,
      user: `Missao:
${mission}${historyAppendix}

Contribuicoes:
${contributions || 'Nenhuma contribuicao utilizavel.'}${originalsAppendix}${consensusAppendix}

Entregue seu julgamento final com liberdade de forma.${ledgerRequest}`,
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
${historyBlock ? `\n  ${historyBlock.replace(/\n/g, '\n  ')}\n` : ''}
  Persona juiza: ${name}${slug ? ` (${slug})` : ''}
  ${model ? `Motor 9Router do juiz: ${model}` : ''}

  Contribuicoes individuais:
  ${contributions || 'Nenhuma contribuicao utilizavel foi recebida.'}${originalsAppendix}${consensusAppendix}

  Produza obrigatoriamente estas partes, nesta ordem:
  0. Resposta livre — comece com sua leitura espontanea da missao e das contribuicoes, no formato que preferir (paragrafos, raciocinio aberto, observacoes soltas). Use este espaco para pensar em voz alta como juiz, sem obrigacao de estrutura.
  Depois da resposta livre, entregue a estrutura final obrigatoria:
  1. Avaliacao dos participantes — diga o que foi util em cada resposta.
  2. Alertas de qualidade — identifique, por participante, qualquer trecho falso, nao sustentado ou incompleto. Se nao houver, diga explicitamente.
  3. Complementacao — combine o que for compativel e corrija as lacunas relevantes.
  4. Veredito final — apresente a melhor decisao final, sua justificativa e proximas acoes.${ledgerRequest}`,
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
  conversationContext = '',
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
  const historyBlock = formatConversationContextForPrompt(conversationContext);
  const historyAppendix = historyBlock ? `\n\n${historyBlock}` : '';

  return {
    name,
    system: `${basePrompt}

---
${modelTruthBlock(model, { pure: isPureModelAgent({ personaSlug: slug, systemPrompt: basePrompt }) })}
Voce recebera contribuicoes anonimas de outros participantes sobre a mesma missao. Revise sua resposta: mantenha o que sustenta, corrija o que os outros refutaram com evidencia melhor, aponte erros alheios objetivamente. Nao presuma autoridade por estilo — avalie evidencia.
Nao tente identificar os autores das contribuicoes. Responda em pt-BR.`,
    user: `Missao original:
${mission}${historyAppendix}

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
  runConsensusTurn,
  runJudge,
}) {
  const blindReplies = await Promise.all(
    participantSlugs.map((slug) => runParticipant({ slug })),
  );
  if (depth < 2 || (typeof runRevision !== 'function' && typeof runConsensusTurn !== 'function')) {
    const judge = await runJudge({ slug: judgeSlug, replies: blindReplies });
    return { replies: blindReplies, judge };
  }

  if (depth >= 3 && typeof runConsensusTurn === 'function') {
    const consensus = await runConsensusRounds({
      participantSlugs,
      blindReplies,
      runTurn: runConsensusTurn,
    });
    const judge = await runJudge({
      slug: judgeSlug,
      replies: consensus.replies,
      originalReplies: blindReplies,
      consensus,
    });
    return { replies: consensus.replies, blindReplies, judge, consensus };
  }

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
