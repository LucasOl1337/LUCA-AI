import express from 'express';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import {
  PORT,
  AGENTS,
  AGENT_ALIASES,
  ROUTER_MODEL,
  MAESTRO_MODEL,
  MAX_CLOSURE_ATTEMPTS,
  CONVERSATION_PARTNER_AGENT_ID,
} from './config.js';
import { call9Router, check9RouterHealth } from './router-client.js';
import {
  addHeartbeat,
  addGlobalChatMessage,
  appendLine,
  appendHeartbeatLog,
  archiveActiveMission,
  clearAgentContexts,
  completeRun,
  createAgentTask,
  createRun,
  getState,
  incrementSupervisorTick,
  markAgentChatSeen,
  persist,
  resetMissionScope,
  setAgentConfig,
  setAgentStatus,
  setMission,
  setMissionQueue,
  setRunBriefing,
  setScheduledMissions,
  setSupervisorFinalReport,
  setSupervisorMode,
  setTemporaryDashboard,
  startNewMissionScope,
  updateAgentTask,
  upsertDashboardItem,
  getPersonaAgents,
  addPersonaAgent,
  updatePersonaAgent,
  removePersonaAgent,
} from './state.js';
import {
  listYumePersonas,
  fetchYumePersonaSystemPrompt,
  getYumePersonaVersion,
} from './kamui-client.js';
import {
  normalizeMissionContext,
  mergeMissionContext,
  summarizeContextForPrompt,
  hasContext,
  normalizeSignal,
  summarizeSignalsForPrompt,
  formatSignalLine,
} from './problem-context.js';
import {
  classifyMissionIntent,
  missionRequestsAgentConversation,
  missionRequestsAllAgents,
  missionNeedsSupervisorJudgment,
  parseAgentConversationDurationMs,
  primaryMissionText,
} from './intent.js';
import {
  parseClosureReviewOutput,
  buildDeterministicClosureReview,
  mergeClosureReviews,
  expectedChatPerformers,
} from './closure.js';
import { buildSchedule, missionScheduleIsInfinite, tickSchedules } from './scheduler.js';

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: '1mb' }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

let supervisorTimer = null;
let heartbeatProcess = null;
const heartbeatReportPath = path.resolve(process.cwd(), 'heartbeat-report.json');
const distPath = path.resolve(process.cwd(), 'dist');
const indexPath = path.join(distPath, 'index.html');
const v2DesignPath = path.resolve(process.cwd(), 'public', 'v2-design');
const v2IndexPath = path.join(v2DesignPath, 'index.html');
const repoIgnoreDirs = new Set(['.git', 'node_modules', 'dist', '.luca']);
const DELIVERY_PRINCIPLE = `Principio global LUCA-AI: trabalhe com o que existe e entregue o melhor resultado possivel. Falta de dados nao e motivo para travar, recusar ou ficar excessivamente criterioso. Quando algo estiver ausente, declare uma premissa razoavel, marque como estimativa/proxy quando necessario e siga pelo caminho mais util para cumprir a missao. Priorize decisao, solucao e output final satisfatorio.`;

function stopSupervisorTimer() {
  if (supervisorTimer) {
    clearInterval(supervisorTimer);
    supervisorTimer = null;
  }
}

function readTextFile(relativePath, maxChars = 5000) {
  try {
    const fullPath = path.resolve(process.cwd(), relativePath);
    if (!fullPath.startsWith(process.cwd())) return null;
    return fs.readFileSync(fullPath, 'utf8').slice(0, maxChars);
  } catch {
    return null;
  }
}

function listRepoTree(dir = process.cwd(), prefix = '', depth = 0, limit = { count: 0 }) {
  if (depth > 3 || limit.count > 140) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !repoIgnoreDirs.has(entry.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
  const lines = [];
  for (const entry of entries) {
    if (limit.count > 140) break;
    limit.count += 1;
    const marker = entry.isDirectory() ? '/' : '';
    lines.push(`${prefix}${entry.name}${marker}`);
    if (entry.isDirectory()) lines.push(...listRepoTree(path.join(dir, entry.name), `${prefix}  `, depth + 1, limit));
  }
  return lines;
}

function repoContextForPrompt() {
  const files = ['package.json', 'server/config.js', 'server/index.js', 'server/state.js', 'src/main.jsx', 'src/styles.css'];
  const fileSummaries = files.map((file) => {
    const content = readTextFile(file, 3500);
    return content ? `--- ${file}\n${content}` : `--- ${file}\nindisponivel`;
  }).join('\n\n');
  return `Raiz da repo: ${process.cwd()}\n\nArvore resumida:\n${listRepoTree().join('\n')}\n\nArquivos principais:\n${fileSummaries}`;
}

function startHeartbeatMonitor() {
  if (heartbeatProcess) return;
  const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
  const pythonArgs = process.platform === 'win32'
    ? ['-3', 'heartbeat_monitor.py', heartbeatReportPath]
    : ['heartbeat_monitor.py', heartbeatReportPath];
  heartbeatProcess = spawn(pythonCmd, pythonArgs, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  heartbeatProcess.stdout.on('data', (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    for (const line of lines) appendHeartbeatLog(line);
    emitState();
  });
  heartbeatProcess.stderr.on('data', (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    for (const line of lines) appendHeartbeatLog(`[stderr] ${line}`);
    emitState();
  });
  heartbeatProcess.on('exit', () => {
    appendHeartbeatLog('[heartbeat] stopped');
    heartbeatProcess = null;
    emitState();
  });
}

function stopHeartbeatMonitor() {
  if (!heartbeatProcess) return;
  appendHeartbeatLog('[heartbeat] stopping');
  heartbeatProcess.kill('SIGTERM');
  heartbeatProcess = null;
}

function readHeartbeatReport() {
  try {
    const raw = fs.readFileSync(heartbeatReportPath, 'utf8');
    const parsed = JSON.parse(raw);
    const updatedMs = parsed.updatedAt ? Date.parse(parsed.updatedAt) : 0;
    const isFresh = Number.isFinite(updatedMs) && (Date.now() - updatedMs) < 12000;
    return {
      ...parsed,
      status: isFresh ? 'online' : 'paused',
    };
  } catch {
    return {
      service: 'heartbeat-monitor',
      status: heartbeatProcess ? 'online' : 'paused',
      updatedAt: null,
      intervalSeconds: 5,
      summary: 'monitor ainda nao iniciou ou sem arquivo de estado',
    };
  }
}

function resolveAgentId(agentId) {
  return AGENT_ALIASES[agentId] ?? agentId;
}

function agentRuntime(agentId) {
  const configured = getState().agents.find((agent) => agent.id === agentId);
  const fallbackModel = AGENTS.find((agent) => agent.id === agentId)?.model ?? ROUTER_MODEL;
  return {
    enabled: configured ? configured.enabled !== false : true,
    model: configured?.model || fallbackModel,
  };
}

function resolveAgentModel(agent) {
  return agentRuntime(agent.id).model || agent.model || ROUTER_MODEL;
}

// Bloco de contexto do problema + sinais de tempo real, injetado nos prompts
// para o sistema interpretar e resolver com base em dados reais.
function missionContextBlock(mission) {
  const parts = [];
  const ctx = mission?.context ? summarizeContextForPrompt(mission.context) : '';
  if (ctx) parts.push(`Contexto estruturado do problema (use para interpretar e resolver; nao invente dados):\n${ctx}`);
  const sig = summarizeSignalsForPrompt(mission?.realtimeFeed || []);
  if (sig) parts.push(sig);
  return parts.join('\n\n');
}

function emitEvent(event) {
  const payload = JSON.stringify({ kind: 'event', event });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

function emitState() {
  const payload = JSON.stringify({ kind: 'state', state: { ...getState(), heartbeatMonitor: readHeartbeatReport() } });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

function agentDisplayName(agentId) {
  const builtin = AGENTS.find((agent) => agent.id === agentId)?.name;
  if (builtin) return builtin;
  const persona = getPersonaAgents().find((p) => p.id === agentId || p.slug === agentId);
  if (persona) return persona.name || persona.slug;
  return agentId;
}

function appendAgentHeartbeatEvent(agentId, phase, detail = '') {
  const label = phase === 'start' ? 'iniciou' : phase === 'done' ? 'terminou' : 'falhou';
  const suffix = detail ? ` (${detail})` : '';
  appendHeartbeatLog(`[agent:${phase}] ${label} ${agentDisplayName(agentId).toLowerCase()}${suffix}`);
}

function normalizeChatType(type) {
  const value = String(type ?? 'info').toLowerCase().trim();
  if (['info', 'resultado', 'decisao', 'pergunta', 'alerta', 'acao', 'sistema'].includes(value)) return value;
  if (value === 'result') return 'resultado';
  if (value === 'decision') return 'decisao';
  if (value === 'question') return 'pergunta';
  if (value === 'warning') return 'alerta';
  if (value === 'action') return 'acao';
  return 'info';
}

function publishChatMessage({ agentId, type = 'info', content }) {
  const message = addGlobalChatMessage({
    agentId,
    agentName: agentDisplayName(agentId),
    type: normalizeChatType(type),
    content,
  });
  if (!message) return null;
  emitEvent({ type: 'chat.message', message, time: new Date().toISOString() });
  return message;
}

function extractChatMessages(agentId, output) {
  const messages = [];
  const lines = String(output ?? '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*\[chat:(info|resultado|decisao|pergunta|alerta|acao|sistema)\]\s*(.+)$/i);
    if (match) messages.push({ agentId, type: match[1], content: match[2] });
  }
  return messages;
}

function missionRequiresChatMessage(mission) {
  const text = `${mission?.description ?? ''}\n${mission?.success ?? ''}`.toLowerCase();
  return /\b(chat|mensagem|mensagens)\b/.test(text);
}

function missionRequiresRepoContext(mission) {
  const text = `${mission?.title ?? ''}\n${mission?.description ?? ''}\n${mission?.success ?? ''}`.toLowerCase();
  return /\b(repo|repository|repositorio|reposit[oó]rio|c[oó]digo|frontend|backend|arquitetura)\b/.test(text);
}

function missionInstruction(mission) {
  return String(mission?.directionPrompt ?? '').trim();
}

function fallbackChatMessage(agentId, output) {
  const content = String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\[chat:[^\]]+\]\s*/i, '').trim())
    .find(Boolean);
  if (!content) return null;
  return { agentId, type: 'info', content };
}

function summarizeFirstLine(output) {
  return String(output ?? '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
}

function missionReadyForAgents(mission) {
  return Boolean(String(mission?.directionPrompt ?? '').trim());
}

function workerAgents() {
  return AGENTS.filter((agent) => agent.role === 'planner' || agent.role === 'researcher' || agent.role === 'designer');
}

function contributorAgents() {
  return AGENTS.filter((agent) => agent.role === 'planner' || agent.role === 'researcher');
}

function designerAgent() {
  return AGENTS.find((agent) => agent.role === 'designer');
}

function taskInstructionForAgent(agent) {
  if (agent.role === 'planner') {
    return `Atue como arquiteto da solucao. Leia o briefing e transforme a dor em um plano pratico de otimizacao.
Entregue no Chat Global uma contribuicao curta com: problema priorizado, caminho escolhido, abordagem de dashboard, metricas essenciais, acoes recomendadas, ordem de execucao e criterios de sucesso.
Se faltar contexto, escolha a premissa mais razoavel e avance. Nao transforme lacunas em bloqueio. Nao repita a descricao da dor; produza decisao operacional.`;
  }
  if (agent.role === 'researcher') {
    return `Atue como validador pragmatico de evidencias e realismo. Leia o briefing, use o que estiver disponivel e complete lacunas com premissas claras quando isso ajudar a cumprir a missao.
Entregue no Chat Global uma contribuicao curta com: evidencias aproveitaveis, premissas adotadas, proxies quando necessarios, riscos principais e como tornar a solucao defensavel para uma equipe executiva.
Nao pare na falta de informacao. Nao invente fato como se fosse evidencia; quando precisar inferir, rotule como premissa/proxy e entregue resultado.`;
  }
  if (agent.role === 'designer') {
    return `Crie um canvas executivo para a area principal esquerda, baseado apenas na missao, briefing e contribuicoes uteis do chat.
O canvas deve convencer uma equipe executiva de que o sistema entendeu a dor e gerou uma solucao pratica: dor central, riscos ou oportunidades priorizadas, metricas, graficos recomendados, acoes e criterios de sucesso.
Adapte linguagem, metricas e graficos ao segmento descrito na missao; nao fixe termos de um caso especifico.
Se os insumos forem simples ou incompletos, use premissas claras e gere mesmo assim um canvas final util com listas, ranking, topicos ou graficos simples.
Nao mostre funcionamento interno, agentes, run, chat, logs ou status operacional.`;
  }
  return `Leia o briefing, o chat recente e contribua para cumprir os criterios da missao. Publique uma contribuicao util no Chat Global.`;
}

function recentChatContext(limit = 12) {
  const messages = getState().globalChatMessages ?? [];
  return messages.slice(-limit).map((message) => `[${message.timestamp}] ${message.agentName} (${message.type}): ${message.content}`).join('\n') || 'sem mensagens no chat.';
}

function unreadChatContext(agentId) {
  const state = getState();
  const messages = state.globalChatMessages ?? [];
  const lastSeenId = state.activeRun?.agents?.[agentId]?.lastSeenChatMessageId;
  const lastSeenIndex = lastSeenId ? messages.findIndex((message) => message.id === lastSeenId) : -1;
  const unread = messages.slice(lastSeenIndex + 1).filter((message) => message.agentId !== agentId);
  return unread.map((message) => `[${message.timestamp}] ${message.agentName} (${message.type}): ${message.content}`).join('\n') || 'sem mensagens novas.';
}

function latestChatMessageId() {
  const messages = getState().globalChatMessages ?? [];
  return messages.at(-1)?.id ?? null;
}

function scopedAgentId(agentId) {
  const runId = getState().activeRun?.id;
  return runId ? `${agentId}:${runId}` : agentId;
}

function incompleteTasksFor(agentId) {
  return (getState().activeRun?.tasks ?? []).filter((task) => task.agentId === agentId && task.status !== 'completed' && task.status !== 'error');
}

function completedTasksFor(agentId) {
  return (getState().activeRun?.tasks ?? []).filter((task) => task.agentId === agentId && task.status === 'completed');
}

function hasRunningWorker() {
  return workerAgents().some((agent) => ['running', 'queued'].includes(getState().activeRun?.agents?.[agent.id]?.status));
}

function hasCompletedTask(agentId) {
  return completedTasksFor(agentId).length > 0;
}

function repoAnalysisSatisfied() {
  const text = (getState().globalChatMessages ?? []).map((message) => message.content).join('\n').toLowerCase();
  const hasStrength = /ponto forte|pontos fortes|forte:|fortes:/i.test(text);
  const hasWeakness = /ponto fraco|pontos fracos|fraco:|fracos:/i.test(text);
  const hasEvidence = /server\/|src\/|package\.json|index\.js|state\.js|main\.jsx|styles\.css/i.test(text);
  const blocked = /n[aã]o vejo a [aá]rvore|n[aã]o tenho acesso|liberar `?tree|sem acesso (?:ao|a|à) (?:repo|reposit[oó]rio|[aá]rvore)/i.test(text);
  return hasStrength && hasWeakness && hasEvidence && !blocked;
}

function missionCompletionSatisfied(mission) {
  if (missionRequiresRepoContext(mission)) return repoAnalysisSatisfied();
  return true;
}

function extractJsonObject(output) {
  const text = String(output ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRouterUnavailable(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /9router_unreachable|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout/i.test(message);
}

function isOperationalDashboard(dashboard) {
  const { sourceAgentId, updatedAt, ...publicDashboard } = dashboard ?? {};
  const text = JSON.stringify(publicDashboard).toLowerCase();
  return /\b(run|agentes?|supervisor|planejador|pesquisador|designer|fila|erro|fetch failed|dashboard temporario|9router|heartbeat|tarefas? conclu[ií]das?)\b/.test(text);
}

function designerDataSnapshot(mission) {
  const state = getState();
  return {
    mission: {
      title: mission?.title ?? '',
      description: mission?.description ?? '',
      success: mission?.success ?? '',
      activatedAt: mission?.activatedAt ?? null,
    },
    results: (state.globalChatMessages ?? [])
      .filter((message) => message.agentId !== 'supervisor' && ['info', 'resultado'].includes(message.type))
      .slice(-5)
      .map((message) => ({
      agentId: message.agentId,
      type: message.type,
      content: String(message.content ?? '').slice(0, 900),
      timestamp: message.timestamp,
    })),
    supervisorFinalReport: state.activeRun?.finalReport ?? null,
  };
}

function supervisorFinalReportSnapshot(mission) {
  const state = getState();
  return {
    mission: {
      title: mission?.title ?? '',
      description: mission?.description ?? '',
      success: mission?.success ?? '',
    },
    briefing: state.activeRun?.briefing ?? missionInstruction(mission),
    contributions: (state.globalChatMessages ?? [])
      .filter((message) => message.agentId !== 'supervisor' && message.agentId !== 'designer')
      .slice(-12)
      .map((message) => ({
        agentId: message.agentId,
        type: message.type,
        content: String(message.content ?? '').slice(0, 1200),
        timestamp: message.timestamp,
      })),
  };
}

function compactText(value, maxChars = 4000) {
  return String(value ?? '')
    .replace(/\r?\n{3,}/g, '\n\n')
    .slice(0, maxChars);
}

function fallbackSupervisorFinalReport(mission, reason = 'fallback local') {
  const snapshot = supervisorFinalReportSnapshot(mission);
  const contributions = snapshot.contributions ?? [];
  const usefulItems = contributions
    .map((message) => String(message.content ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-5);
  const missionText = [mission?.description, mission?.success, snapshot.briefing].filter(Boolean).join(' ');
  const lower = missionText.toLowerCase();
  const inferredFocus = lower.includes('sinistro') || lower.includes('financeiro') || lower.includes('preven')
    ? 'otimizar prevencao de sinistros com foco financeiro'
    : 'organizar a decisao principal da missao em um canvas executivo';
  const findings = usefulItems.length
    ? usefulItems.map((item, index) => ({
      title: `Prioridade ${index + 1}`,
      importance: index < 2 ? 'alta' : 'media',
      basis: 'premissa',
      detail: item.slice(0, 260),
    }))
    : [
      {
        title: 'Foco executivo',
        importance: 'alta',
        basis: 'premissa',
        detail: inferredFocus,
      },
      {
        title: 'Proxima decisao',
        importance: 'media',
        basis: 'premissa',
        detail: 'Priorizar causas, impacto estimado, acoes preventivas e metrica de acompanhamento.',
      },
    ];
  return {
    summary: `Consolidacao local: ${inferredFocus}.`,
    findings,
    designerBrief: {
      mustShow: ['dor central', 'prioridades', 'impacto ou proxy', 'acoes recomendadas', 'criterios de sucesso'],
      recommendedBlocks: ['metric', 'tower', 'topics', 'note'],
      chartGuidance: 'Use ranking simples para priorizar acoes e topicos curtos para criterios de sucesso.',
      avoid: ['detalhes operacionais', 'logs', 'agentes', 'modelo', 'erros tecnicos'],
    },
    successCriteria: missionBulletItems(mission?.success).length
      ? missionBulletItems(mission?.success)
      : ['canvas publicado', 'prioridades claras', 'acoes praticas definidas'],
    sourceAgentId: 'supervisor',
    fallback: true,
    fallbackReason: reason,
  };
}

function fallbackDesignerDashboard(mission) {
  const report = getState().activeRun?.finalReport ?? fallbackSupervisorFinalReport(mission);
  const findings = Array.isArray(report.findings) ? report.findings.slice(0, 5) : [];
  const towerItems = findings.map((finding, index) => ({
    label: String(finding.title ?? `Prioridade ${index + 1}`).slice(0, 28),
    value: Math.max(1, 5 - index),
  }));
  return {
    title: 'Canvas Executivo',
    subtitle: report.summary ?? mission?.description ?? 'Sintese da missao atual para decisao.',
    status: 'concluido',
    layout: 'result-board',
    blocks: [
      {
        type: 'metric',
        title: 'Foco',
        value: 'prevenção',
        body: 'Priorizar perdas evitaveis e acoes de maior impacto pratico.',
      },
      {
        type: 'tower',
        title: 'Prioridades',
        items: towerItems.length ? towerItems : [
          { label: 'Mapear causas', value: 5 },
          { label: 'Quantificar impacto', value: 4 },
          { label: 'Atacar recorrencia', value: 3 },
        ],
      },
      {
        type: 'topics',
        title: 'Acoes recomendadas',
        items: ['segmentar sinistros', 'comparar frequencia', 'priorizar severidade', 'monitorar economia'],
      },
      {
        type: 'note',
        title: 'Critério de sucesso',
        body: (report.successCriteria ?? []).join('; ') || mission?.success || 'Canvas revisavel publicado.',
      },
    ],
    fallback: true,
  };
}

async function buildSupervisorFinalReport(mission) {
  const model = ROUTER_MODEL;
  const snapshot = supervisorFinalReportSnapshot(mission);
  const prompt = `Missao global ativa
Descricao: ${mission?.description ?? 'Sem descricao'}
Criterios de conclusao: ${mission?.success ?? 'Sem criterios de conclusao'}

${DELIVERY_PRINCIPLE}

Dados para consolidacao:
${JSON.stringify(snapshot, null, 2)}

Sua tarefa como supervisor:
Consolide o relatorio final que sera entregue ao Designer para assumir o canvas central da missao. O relatorio deve separar o que e importante para entendimento humano do trabalho feito.

Inclua obrigatoriamente:
1. Sintese executiva em uma frase.
2. Findings principais, priorizados.
3. Top 5 itens quando a missao pedir top 5.
4. Evidencia, premissa ou proxy usado em cada finding quando aplicavel.
5. Recomendacoes de visualizacao para o Designer: blocos, graficos, rankings, metricas e textos que devem aparecer.
6. Itens que nao devem aparecer no canvas: detalhes de agentes, status operacional, logs, fila, modelo ou chat.
7. Criterios de sucesso que o canvas final precisa cobrir.

Responda somente com JSON valido neste formato:
{
  "summary": "frase executiva",
  "findings": [
    { "title": "finding", "importance": "alta|media|baixa", "basis": "evidencia|premissa|proxy", "detail": "explicacao curta" }
  ],
  "designerBrief": {
    "mustShow": ["item"],
    "recommendedBlocks": ["tower", "topics", "metric", "note"],
    "chartGuidance": "orientacao curta",
    "avoid": ["item"]
  },
  "successCriteria": ["criterio"]
}`;
  const system = 'Voce e o supervisor do LUCA-AI. Sua funcao e consolidar findings finais para o Designer montar um canvas executivo. Responda apenas JSON valido, sem expor funcionamento interno.';

  setAgentStatus('supervisor', 'running');
  appendLine('supervisor', `[orquestrador:${model}] consolidando relatorio final`);
  const output = await call9Router({ system, user: prompt, agentId: scopedAgentId('supervisor'), model, maxTokens: 900 });
  appendLine('supervisor', output);
  const parsed = extractJsonObject(output);
  if (!parsed) throw new Error('supervisor_final_report_invalid_json');
  const report = {
    ...parsed,
    sourceAgentId: 'supervisor',
    raw: output,
  };
  setSupervisorFinalReport(report);
  publishChatMessage({
    agentId: 'supervisor',
    type: 'resultado',
    content: `Relatorio final consolidado: ${parsed.summary ?? 'findings priorizados para o canvas.'}`,
  });
  addHeartbeat('supervisor', 'ready', 'relatorio final consolidado');
  setAgentStatus('supervisor', 'ready');
  return report;
}

async function runMissionTransformer(agent, mission) {
  const contextBlock = missionContextBlock(mission);
  const prompt = `Missao escrita pelo usuario\nTitulo: ${mission?.title ?? 'Sem titulo'}\nDescricao: ${mission?.description ?? 'Sem descricao'}\nCriterios de conclusao informados: ${mission?.success ?? 'Sem criterios de conclusao'}\n\n${DELIVERY_PRINCIPLE}\n\n${contextBlock ? contextBlock + '\n\n' : ''}Transforme a missao bruta em um briefing estruturado para agentes que precisam resolver uma dor de negocio e gerar um dashboard executivo.\n\nInclua obrigatoriamente:\n1. Objetivo final escolhido em uma frase.\n2. Dor, oportunidade ou pedido central, com cliente/segmento quando houver.\n3. Tipo de problema: operacional, financeiro, risco, comercial, produto, conteudo ou outro.\n4. Eventos, causas, riscos, impactos ou itens citados explicitamente.\n5. Premissas razoaveis adotadas para preencher lacunas sem travar a missao.\n6. Objetivo de otimizacao: o que precisa melhorar ou ser entregue na pratica.\n7. Dados pos-processados esperados: pain, client, riskTypes, financialImpact, evidence, dashboardMetrics, recommendedCharts, actions, successCriteria.\n8. Papeis dos agentes com foco em entrega: Supervisor dirige, Planejador escolhe caminho, Pesquisador valida e completa com premissas, Designer sintetiza visualmente.\n9. Criterios de sucesso verificaveis para aprovar a entrega.\n\nNao execute a missao final, mas escolha o melhor caminho operacional. Nao fique procurando condicao perfeita. Se houver ambiguidade, resolva com uma premissa clara e avance.`;
  const system = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Sua funcao e transformar uma missao bruta em briefing operacional pragmatico. Escolha o melhor caminho possivel, use premissas quando faltar informacao e oriente os agentes a entregar resultado final satisfatorio. Responda em pt-BR, objetivo, estruturado e acionavel.`;

  try {
    const transformerModel = resolveAgentModel(agent);
    setAgentStatus(agent.id, 'running');
    appendLine(agent.id, `[9router:${transformerModel}] executando...`);
    appendAgentHeartbeatEvent(agent.id, 'start', transformerModel);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'running', time: new Date().toISOString() });

    const output = await call9Router({ system, user: prompt, agentId: scopedAgentId(agent.id), model: transformerModel });
    appendLine(agent.id, output);
    mission.directionPrompt = output;
    setMission(mission);
    setRunBriefing(output);
    setAgentStatus(agent.id, 'ready');
    addHeartbeat(agent.id, 'ready', 'missao transformada com gpt-5.5');
    appendAgentHeartbeatEvent(agent.id, 'done', 'missao transformada');

    const summary = summarizeFirstLine(output);
    publishChatMessage({
      agentId: agent.id,
      type: 'resultado',
      content: summary || 'Direcionamento operacional gerado. Supervisor, planejador e pesquisador ja podem executar a missao.',
    });

    upsertDashboardItem({
      id: `${agent.id}-${Date.now()}`,
      label: `${agent.id} - direcionamento`,
      type: 'dashboard-panel',
      status: 'ready',
      publicView: {
        plainSummary: output.slice(0, 600),
        whyItMatters: 'Direcionamento inicial produzido para orientar os outros agentes.',
        clearInformation: [
          `agente: ${agent.id}`,
          `modelo: ${agent.model}`,
        ],
        viewerQuestions: ['Os criterios estao verificaveis?', 'Qual etapa deve iniciar agora?'],
      },
    });

    emitEvent({ type: 'agent.output', agentId: agent.id, text: output, time: new Date().toISOString() });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLine(agent.id, `erro: ${message}`);
    setAgentStatus(agent.id, 'error');
    addHeartbeat(agent.id, 'error', message);
    appendAgentHeartbeatEvent(agent.id, 'fail', message);
    publishChatMessage({
      agentId: agent.id,
      type: 'alerta',
      content: `Falhei ao transformar a missao: ${message}`,
    });
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'error', time: new Date().toISOString() });
    return '';
  }
}

async function runAgent(agent, mission, task = null) {
  const runtime = agentRuntime(agent.id);
  if (!runtime.enabled) {
    appendLine(agent.id, 'Agente zerado. LLM nao chamado.');
    if (task) updateAgentTask(task.id, { status: 'completed', completedAt: new Date().toISOString(), skipped: true });
    setAgentStatus(agent.id, 'disabled');
    publishChatMessage({ agentId: agent.id, type: 'info', content: `${agentDisplayName(agent.id)} esta desativado; execucao pulada.` });
    return { ok: false, disabled: true };
  }
  if (agent.role === 'mission-transformer') return runMissionTransformer(agent, mission);
  if (agent.role === 'designer') return runDesignerAgent(agent, mission, task);
  const chatRequired = missionRequiresChatMessage(mission);
  const contextBlock = missionContextBlock(mission);
  const directionPrompt = missionInstruction(mission);
  const taskInstruction = task?.instruction ? `\nTarefa atribuida pelo supervisor:\n${task.instruction}\n` : '';
  const chatContext = `\nChat Global recente:\n${recentChatContext()}\n\nMensagens novas para voce:\n${unreadChatContext(agent.id)}\n`;
  const repoContext = missionRequiresRepoContext(mission) ? `\nFerramenta RepoContext disponivel. Use estas evidencias observaveis da repo; cite arquivos quando fizer achados:\n${repoContextForPrompt()}\n` : '';
  const prompt = `Missao global ativa\nDescricao: ${mission?.description ?? 'Sem descricao'}\nCriterios de conclusao: ${mission?.success ?? 'Sem criterios de conclusao'}\n\n${DELIVERY_PRINCIPLE}\n${directionPrompt ? `\nDirecionamento transformado pelo agente transformador-missao:\n${directionPrompt}\n` : ''}${taskInstruction}${chatContext}${repoContext}${contextBlock ? `\n${contextBlock}\n` : ''}\nFerramenta disponivel: Chat Global.\nPara publicar no chat visivel aos agentes, escreva uma linha exatamente neste formato:\n[chat:tipo] mensagem\nTipos permitidos: info, resultado, decisao, pergunta, alerta.\nUse o chat apenas para informacoes uteis a outros agentes. Nao use para status trivial.\n${chatRequired ? '\nEsta missao exige mensagem no chat. Inclua obrigatoriamente uma linha [chat:info] com a mensagem solicitada.\n' : ''}\nQualidade obrigatoria da contribuicao:\n1. Entregue uma contribuicao final util, mesmo com informacao incompleta.\n2. Se faltar dado, declare premissa/proxy e siga. Nao use lacuna como conclusao principal.\n3. Escolha uma direcao, priorize e recomende a proxima acao.\n4. Produza material que ajude o Designer a montar um dashboard executivo: itens, ranking, metricas, acoes ou criterios de sucesso.\n5. Nao repita informacoes que ja estao no chat; entregue contribuicao nova.\nSe a tarefa pede analise da repo, publique pontos fortes e fracos com evidencia de arquivo/diretorio. Nao diga que nao tem acesso a arvore se RepoContext foi fornecido. Trabalhe apenas dentro desse escopo. Use os criterios de conclusao e o direcionamento transformado para decidir se sua resposta esta suficiente.`;
  const system = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Responda em pt-BR, objetivo, pragmatico e orientado a entrega. Trabalhe com o que tem, use premissas claras quando faltar dado e entregue resultado acionavel. Quando precisar compartilhar algo no Chat Global, use uma linha [chat:tipo] mensagem.`;
  const model = runtime.model;

  try {
    if (task) updateAgentTask(task.id, { status: 'running', startedAt: new Date().toISOString() });
    setAgentStatus(agent.id, 'running');
    appendLine(agent.id, `[9router:${model}] executando...`);
    appendAgentHeartbeatEvent(agent.id, 'start', model);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'running', time: new Date().toISOString() });

    const output = await call9Router({ system, user: prompt, agentId: scopedAgentId(agent.id), model });
    appendLine(agent.id, output);
    const chatMessages = extractChatMessages(agent.id, output);
    if (!chatMessages.length) {
      const fallback = fallbackChatMessage(agent.id, output);
      if (fallback) chatMessages.push(fallback);
    }
    for (const chatMessage of chatMessages) publishChatMessage(chatMessage);
    setAgentStatus(agent.id, 'ready');
    if (task) updateAgentTask(task.id, { status: 'completed', completedAt: new Date().toISOString() });
    markAgentChatSeen(agent.id, latestChatMessageId());
    addHeartbeat(agent.id, 'ready', 'resposta recebida do 9router');
    appendAgentHeartbeatEvent(agent.id, 'done', 'resposta recebida');

    upsertDashboardItem({
      id: `${agent.id}-${Date.now()}`,
      label: `${agent.id} - sintese`,
      type: 'dashboard-panel',
      status: 'ready',
      publicView: {
        plainSummary: output.slice(0, 600),
        whyItMatters: 'Resultado produzido pelo agente conectado ao 9router.',
        clearInformation: [
          `agente: ${agent.id}`,
          `modelo: ${model}`,
        ],
        viewerQuestions: ['O que executar agora?', 'Qual o risco principal?'],
      },
    });

    emitEvent({ type: 'agent.output', agentId: agent.id, text: output, time: new Date().toISOString() });
    return { ok: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLine(agent.id, `erro: ${message}`);
    setAgentStatus(agent.id, 'error');
    if (task) updateAgentTask(task.id, { status: 'error', error: message, completedAt: new Date().toISOString() });
    addHeartbeat(agent.id, 'error', message);
    appendAgentHeartbeatEvent(agent.id, 'fail', message);
    publishChatMessage({
      agentId: agent.id,
      type: 'alerta',
      content: `Erro ao executar a missao: ${message}`,
    });
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'error', time: new Date().toISOString() });
    return { ok: false, error: message, routerDown: isRouterUnavailable(error) };
  }
}

async function runDesignerAgent(agent, mission, task = null) {
  const directionPrompt = missionInstruction(mission);
  const dataSnapshot = designerDataSnapshot(mission);
  const contextBlock = missionContextBlock(mission);
  const repoContext = missionRequiresRepoContext(mission) ? `\nEvidencias da repo, se forem relevantes:\n${compactText(repoContextForPrompt(), 2500)}\n` : '';
  const prompt = `Missao global ativa\nDescricao: ${mission?.description ?? 'Sem descricao'}\nCriterios de conclusao: ${mission?.success ?? 'Sem criterios de conclusao'}\n\nBriefing operacional:\n${directionPrompt || 'sem briefing'}\n\nDados estruturados da run:\n${JSON.stringify(dataSnapshot, null, 2)}\n${repoContext}\n\nTarefa do designer:\nVoce recebeu um canvas temporario vazio na area principal esquerda. Preencha com resultados uteis da RUN atual, de forma limpa, minimalista e facil de ler. O objetivo nao e decorar: e transformar progresso, agentes, riscos, achados e proximas decisoes em uma visualizacao sintetica.\n\nLogica de design obrigatoria:\n1. Se houver contagens ou proporcoes claras, prefira grafico simples: pie para distribuicao, tower para comparacao/ranking.\n2. Se a run tiver muitos achados textuais, prefira topics com topicos curtos e modernos.\n3. Se envolver varios agentes, mostre status por agente e progresso da run.\n4. Se houver risco/ambiguidades, inclua um bloco de alerta curto.\n5. Se houver sequencia temporal, use timeline.\n6. Se a missao for simples, use 2 a 4 blocos e muito espaco vazio.\n7. Nao invente dados: derive contagens apenas dos dados estruturados, briefing, chat e RepoContext quando fornecido.\n\nComponentes permitidos em blocks:\n- metric: valor curto com label\n- status: estado de agente ou run\n- list: lista curta\n- timeline: eventos recentes\n- note: texto curto\n- alert: risco ou pendencia\n- progress: progresso textual tipo 2/4\n- pie: grafico de pizza simples; items devem ser objetos { "label": "nome", "value": numero }\n- tower: grafico de barras horizontais/torre; items devem ser objetos { "label": "nome", "value": numero }\n- topics: lista visual de topicos curtos; items devem ser strings de 2 a 5 palavras\n\nResponda somente com JSON valido neste formato:\n{\n  "title": "titulo curto",\n  "subtitle": "frase de contexto",\n  "status": "rascunho|ativo|concluido|alerta",\n  "layout": "empty|minimal|status-board|timeline|mission-control|insight-board",\n  "blocks": [\n    { "type": "metric|status|list|timeline|note|alert|progress|pie|tower|topics", "title": "titulo", "value": "valor opcional", "body": "texto opcional", "items": ["item 1"] }\n  ]\n}\n\nUse no maximo 6 blocos. Se usar pie ou tower, mantenha ate 5 itens. Se a missao for simples, use 2 ou 3 blocos. Nao inclua markdown fora do JSON.`;
  const system = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Sua funcao e desenhar canvas temporarios claros, minimalistas e acionaveis para a missao ativa. Priorize resultados uteis da run, visualizacoes simples e topicos modernos. Voce escolhe o layout conforme a natureza da missao e responde em JSON valido.`;
  const resultOnlySystem = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Sua funcao e desenhar canvas temporarios de resultados para a missao atual. Nunca inclua detalhes operacionais, agentes, progresso, eventos ou status internos. Responda em JSON valido.`;
  const resultOnlyPrompt = `Missao global ativa
Descricao: ${mission?.description ?? 'Sem descricao'}
Criterios de conclusao: ${mission?.success ?? 'Sem criterios de conclusao'}

${DELIVERY_PRINCIPLE}

Briefing da missao atual:
${compactText(directionPrompt || 'sem briefing', 3500)}

Resultados textuais disponiveis da missao atual:
${JSON.stringify(dataSnapshot, null, 2)}
${repoContext}
${contextBlock ? `\n${contextBlock}\n` : ''}
Tarefa do designer:
Use o supervisorFinalReport como fonte principal quando ele existir. Preencha o canvas com uma visualizacao executiva de RESULTADOS e SOLUCOES da missao atual. Mostre conteudo util para uma equipe executiva, nao o funcionamento interno do sistema.
Mesmo que a missao seja simples ou os insumos estejam incompletos, gere um canvas final util usando o melhor caminho possivel. Nao deixe o canvas vazio por falta de dados. Use premissas claras e componentes simples quando necessario.

O canvas deve responder em ate 30 segundos:
1. Qual e a dor central.
2. Quais riscos, causas ou oportunidades devem ser priorizados.
3. Qual impacto financeiro, operacional ou proxy sustenta a prioridade.
4. Quais graficos/metricas ajudam a decidir.
5. Quais acoes praticas devem ser tomadas primeiro.
6. Como medir sucesso.

Regras obrigatorias:
1. Nao mostre agentes, status de agentes, progresso da run, eventos, fila, erros tecnicos, ticks, chamadas ou tarefas.
2. Nao mencione supervisor, planejador, pesquisador, designer, transformador, heartbeat, run, chat ou 9router no canvas.
3. Nao use memoria, tema ou fatos de missoes anteriores. Use somente a missao atual e os resultados fornecidos acima.
4. Se a missao pedir top 5, entregue exatamente 5 itens de resultado.
5. O conteudo deve ser sobre o assunto pedido, a decisao executiva e a solucao pratica, nao sobre o processo.
6. Ignore qualquer informacao operacional nos dados.
7. Para dores de negocio, prefira um canvas com: metrica/proxy principal, ranking de prioridades, matriz ou comparacao, plano de acoes e criterios de sucesso.
8. Separe evidencia de inferencia quando houver risco de parecer dado inventado.
9. Nao use termos fixos de um setor especifico se eles nao aparecerem na missao atual.
10. Se o pedido for simples, entregue diretamente o resultado pedido com ranking/lista/topicos e pelo menos um bloco visual tower ou topics.
11. Se o supervisorFinalReport trouxer designerBrief.mustShow, esses itens devem aparecer no canvas final.

Componentes permitidos em blocks:
- metric: valor curto com label relacionado ao resultado
- list: lista de resultados finais
- note: explicacao curta sobre o tema
- pie: grafico de distribuicao do conteudo final; items devem ser objetos { "label": "nome", "value": numero }
- tower: ranking/comparacao de resultados; items devem ser objetos { "label": "nome", "value": numero }
- topics: topicos curtos de resultado; items devem ser strings de 2 a 5 palavras

Componentes proibidos: status, timeline, progress, alert para riscos operacionais.

Responda somente com JSON valido neste formato:
{
  "title": "titulo curto",
  "subtitle": "frase de contexto executivo",
  "status": "rascunho|ativo|concluido|alerta",
  "layout": "empty|minimal|result-board|topics|ranking",
  "blocks": [
    { "type": "list|note|metric|pie|tower|topics", "title": "titulo", "body": "texto opcional", "value": "valor opcional", "items": [] }
  ]
}`;
  const model = resolveAgentModel(agent);

  try {
    if (task) updateAgentTask(task.id, { status: 'running', startedAt: new Date().toISOString() });
    setAgentStatus(agent.id, 'running');
    appendLine(agent.id, `[9router:${model}] executando...`);
    appendAgentHeartbeatEvent(agent.id, 'start', model);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'running', time: new Date().toISOString() });

    const health = await check9RouterHealth();
    if (!health.ok) {
      throw new Error(`9router indisponivel em ${health.url}${health.error ? `: ${health.error}` : health.status ? `: HTTP ${health.status}` : ''}`);
    }

    const output = await call9Router({ system: resultOnlySystem, user: resultOnlyPrompt, agentId: scopedAgentId(agent.id), model, maxTokens: 900 });
    appendLine(agent.id, output);
    const parsedDashboard = extractJsonObject(output);
    if (!parsedDashboard) {
      throw new Error('designer_quality_invalid_json: modelo nao retornou JSON valido para o canvas executivo');
    }
    if (isOperationalDashboard(parsedDashboard)) {
      throw new Error('designer_quality_operational_content: modelo tentou expor processo interno no canvas executivo');
    }
    const dashboard = parsedDashboard;
    setTemporaryDashboard({ ...dashboard, sourceAgentId: agent.id });
    publishChatMessage({
      agentId: agent.id,
      type: 'resultado',
      content: `Canvas atualizado: ${dashboard.title ?? 'sem titulo'}`,
    });
    setAgentStatus(agent.id, 'ready');
    if (task) updateAgentTask(task.id, { status: 'completed', completedAt: new Date().toISOString() });
    markAgentChatSeen(agent.id, latestChatMessageId());
    addHeartbeat(agent.id, 'ready', 'canvas atualizado');
    appendAgentHeartbeatEvent(agent.id, 'done', 'canvas atualizado');
    emitEvent({ type: 'agent.output', agentId: agent.id, text: output, time: new Date().toISOString() });
    return { ok: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const routerDown = isRouterUnavailable(error);
    if (routerDown) {
      const dashboard = fallbackDesignerDashboard(mission);
      setTemporaryDashboard({ ...dashboard, sourceAgentId: agent.id });
      publishChatMessage({ agentId: agent.id, type: 'resultado', content: `Canvas atualizado com fallback local: ${dashboard.title}` });
      setAgentStatus(agent.id, 'ready');
      if (task) updateAgentTask(task.id, { status: 'completed', completedAt: new Date().toISOString() });
      markAgentChatSeen(agent.id, latestChatMessageId());
      addHeartbeat(agent.id, 'ready', 'canvas fallback atualizado');
      appendAgentHeartbeatEvent(agent.id, 'done', 'canvas fallback atualizado');
      emitEvent({ type: 'agent.output', agentId: agent.id, text: JSON.stringify(dashboard), time: new Date().toISOString() });
      return { ok: true, output: JSON.stringify(dashboard), fallback: true };
    }
    appendLine(agent.id, `erro: ${message}`);
    publishChatMessage({ agentId: agent.id, type: 'alerta', content: `Canvas executivo nao foi gerado: ${message}` });
    setAgentStatus(agent.id, 'error');
    if (task) updateAgentTask(task.id, { status: 'error', error: message, completedAt: new Date().toISOString() });
    markAgentChatSeen(agent.id, latestChatMessageId());
    addHeartbeat(agent.id, 'error', message);
    appendAgentHeartbeatEvent(agent.id, 'fail', message);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'error', time: new Date().toISOString() });
    return { ok: false, error: message, routerDown };
  }
}

async function runCycle() {
  const mission = getState().activeMission;
  if (!mission) {
    addHeartbeat('supervisor', 'idle', 'sem missao ativa');
    await processScheduledMissions();
    emitState();
    return;
  }

  const intent = classifyMissionIntent(mission);
  if (intent === 'agent_conversation') {
    await runAgentConversationMission(mission);
    return;
  }
  if (intent === 'chat_only') {
    await runChatOnlyMission(mission);
    return;
  }

  // dashboard_build (fluxo padrao): transformer -> contributors -> designer -> canvas.
  const transformer = AGENTS.find((agent) => agent.role === 'mission-transformer');
  if (transformer && !missionReadyForAgents(mission)) {
    await runMissionTransformer(transformer, mission);
    emitState();
  }
  const currentMission = getState().activeMission;
  if (!missionReadyForAgents(currentMission)) return;

  await supervisorTick(currentMission);
}

async function supervisorTick(mission) {
  const run = getState().activeRun;
  if (!run || run.status !== 'running') return;
  if (hasRunningWorker()) {
    addHeartbeat('supervisor', 'observing', 'aguardando agente em execucao');
    emitState();
    return;
  }

  const tick = incrementSupervisorTick();
  setAgentStatus('supervisor', 'running');
  appendLine('supervisor', `[orquestrador] observando chat tick ${tick}`);
  markAgentChatSeen('supervisor', latestChatMessageId());

  const contributors = contributorAgents();
  const designer = designerAgent();
  const nextWorker = contributors.find((agent) => !run.tasks.some((task) => task.agentId === agent.id));
  if (nextWorker) {
    const instruction = taskInstructionForAgent(nextWorker);
    const task = createAgentTask(nextWorker.id, instruction);
    publishChatMessage({
      agentId: 'supervisor',
      type: 'decisao',
      content: `Chamando ${agentDisplayName(nextWorker.id)} para contribuir na missao.`,
    });
    setAgentStatus('supervisor', 'ready');
    emitState();
    const result = await runAgent(nextWorker, mission, task);
    if (result?.ok === false) {
      const reason = result.routerDown
        ? 'o 9router local nao respondeu dentro do limite. Verifique se o roteador/modelo esta ativo e retome o supervisor depois.'
        : `o agente ${agentDisplayName(nextWorker.id)} falhou ou produziu saida invalida: ${result.error ?? 'erro desconhecido'}`;
      publishChatMessage({
        agentId: 'supervisor',
        type: 'alerta',
        content: `Pausando a missao: ${reason}`,
      });
      setSupervisorMode('standby');
      if (supervisorTimer) {
        clearInterval(supervisorTimer);
        supervisorTimer = null;
      }
      addHeartbeat('supervisor', 'paused', result.routerDown ? '9router indisponivel' : 'falha de qualidade do agente');
    }
    emitState();
    return;
  }

  const allContributorsCompleted = contributors.every((agent) => hasCompletedTask(agent.id));
  if (allContributorsCompleted) {
    if (!missionCompletionSatisfied(mission)) {
      publishChatMessage({
        agentId: 'supervisor',
        type: 'alerta',
        content: 'Ainda nao posso concluir: faltam pontos fortes/fracos com evidencias observaveis da repo. Vou solicitar nova contribuicao do pesquisador.',
      });
      const task = createAgentTask('pesquisador', 'Complemente a analise da repo usando o RepoContext fornecido. Publique pontos fortes e pontos fracos com evidencias de arquivos/diretorios concretos.');
      const researcher = AGENTS.find((agent) => agent.id === 'pesquisador');
      if (researcher) await runAgent(researcher, mission, task);
      emitState();
      return;
    }

    if (!getState().activeRun?.finalReport) {
      try {
        publishChatMessage({
          agentId: 'supervisor',
          type: 'decisao',
          content: 'Consolidando relatorio final para o Designer montar o canvas da missao.',
        });
        await buildSupervisorFinalReport(mission);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isRouterUnavailable(error)) {
          publishChatMessage({
            agentId: 'supervisor',
            type: 'alerta',
            content: `Pausando a missao: relatorio final do supervisor nao foi gerado (${message}).`,
          });
          setSupervisorMode('standby');
          stopSupervisorTimer();
          setAgentStatus('supervisor', 'error');
          addHeartbeat('supervisor', 'error', message);
          emitState();
          return;
        }
        const fallbackReport = fallbackSupervisorFinalReport(mission, message);
        setSupervisorFinalReport(fallbackReport);
        publishChatMessage({
          agentId: 'supervisor',
          type: 'resultado',
          content: `Relatorio final consolidado com fallback local: ${fallbackReport.summary}`,
        });
        setAgentStatus('supervisor', 'ready');
        addHeartbeat('supervisor', 'ready', 'relatorio fallback consolidado');
        emitState();
        return;
      }
      emitState();
      return;
    }

    if (designer && !hasCompletedTask(designer.id)) {
      const task = createAgentTask(designer.id, taskInstructionForAgent(designer));
      publishChatMessage({
        agentId: 'supervisor',
        type: 'decisao',
        content: 'Entregando o relatorio final ao Designer para assumir o canvas central.',
      });
      setAgentStatus('supervisor', 'ready');
      emitState();
      const result = await runAgent(designer, mission, task);
      if (result?.ok === false) {
        const reason = result.routerDown
          ? 'o 9router local nao respondeu dentro do limite. Verifique se o roteador/modelo esta ativo e retome o supervisor depois.'
          : `o Designer falhou ao gerar o canvas final: ${result.error ?? 'erro desconhecido'}`;
        publishChatMessage({ agentId: 'supervisor', type: 'alerta', content: `Pausando a missao: ${reason}` });
        setSupervisorMode('standby');
        stopSupervisorTimer();
        addHeartbeat('supervisor', 'paused', result.routerDown ? '9router indisponivel' : 'designer falhou');
      }
      emitState();
      return;
    }

    await attemptMissionClosure({
      type: 'dashboard_build',
      proposedStatus: 'completed',
      reason: 'relatorio final do supervisor entregue e canvas final publicado pelo designer',
      finalize: () => {
        publishChatMessage({
          agentId: 'supervisor',
          type: 'resultado',
          content: `Concluido: relatorio final consolidado, Designer publicou o canvas e criterios foram revisados: ${mission.success || 'sem criterios explicitos'}`,
        });
        completeRun('relatorio final do supervisor entregue e canvas final publicado pelo designer');
        setSupervisorMode('standby');
        stopSupervisorTimer();
        setAgentStatus('supervisor', 'ready');
        addHeartbeat('supervisor', 'ready', 'missao concluida pelo orquestrador');
      },
    });
    emitState();
    return;
  }

  setAgentStatus('supervisor', 'ready');
  addHeartbeat('supervisor', 'observing', 'sem acao nova');
}

function startSupervisorTimer() {
  if (supervisorTimer) return;
  supervisorTimer = setInterval(() => { runCycle().catch(() => {}); }, 8000);
}

// ---------------------------------------------------------------------------
// Gate de encerramento (Maestro): revisao deterministica + auditoria LLM.
// ---------------------------------------------------------------------------

function chatMessagesSinceMissionStart(mission = getState().activeMission) {
  const startedMs = Date.parse(mission?.activatedAt || mission?.agentConversation?.startedAt || '');
  return (getState().globalChatMessages || []).filter((message) => {
    if (!Number.isFinite(startedMs)) return true;
    const ts = Date.parse(message.createdAt || '');
    return !Number.isFinite(ts) || ts >= startedMs - 2000;
  });
}

async function runMaestroClosureReview(mission, closureContext) {
  const runtime = agentRuntime('maestro');
  if (!runtime.enabled) return null;
  const chatMessages = chatMessagesSinceMissionStart(mission);
  const system = `Voce e o Maestro do LUCA-AI. Voce NAO executa a missao; apenas audita se ela pode ser encerrada com seguranca.
Compare o pedido principal, o criterio de sucesso, as contribuicoes reais no chat e as evidencias.
Responda SOMENTE com linhas estruturadas:
[closure:verdict] approved|blocked|retry
[closure:reason] <motivo curto>
[closure:gap] <lacuna encontrada, se houver>
[closure:next] <proximo passo sugerido, se houver>
Use blocked quando criterios nao foram cumpridos; retry quando falta uma rodada recuperavel; approved somente com evidencia clara.`;
  const user = `Pedido principal: ${primaryMissionText(mission) || mission?.title || 'sem descricao'}
Criterio de sucesso: ${mission?.success || 'sem criterio explicito'}

Encerramento proposto:
${JSON.stringify(closureContext, null, 2)}

Chat da missao:
${chatMessages.map((m) => `[${m.agentName}/${m.type}] ${m.content}`).join('\n') || 'sem mensagens'}`;
  try {
    setAgentStatus('maestro', 'running');
    const output = await call9Router({ system, user, agentId: scopedAgentId('maestro'), model: runtime.model, maxTokens: 500 });
    appendLine('maestro', output);
    setAgentStatus('maestro', 'ready');
    const parsed = parseClosureReviewOutput(output);
    return parsed.verdict ? parsed : null;
  } catch (error) {
    setAgentStatus('maestro', 'ready');
    appendLine('maestro', `erro: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function reviewMissionClosure(closureContext = {}) {
  const mission = getState().activeMission;
  if (closureContext.proposedStatus !== 'completed') {
    return { verdict: 'approved', reasons: [`Encerramento como ${closureContext.proposedStatus} liberado sem auditoria.`], gaps: [], nextSteps: [], sources: ['deterministic'] };
  }
  const chatMessages = chatMessagesSinceMissionStart(mission);
  const agents = getState().agents;
  const requiresRepo = missionRequiresRepoContext(mission);
  const deterministic = buildDeterministicClosureReview({
    mission,
    chatMessages,
    agents,
    closureContext: {
      ...closureContext,
      requiresAllAgents: missionRequestsAllAgents(mission),
      needsSupervisorJudgment: missionNeedsSupervisorJudgment(mission),
      expectedPerformerIds: expectedChatPerformers(mission, agents).map((a) => a.id),
      repoAnalysisSatisfied: requiresRepo ? repoAnalysisSatisfied() : undefined,
      hasDashboard: Boolean(getState().temporaryDashboard),
    },
  });
  const maestro = await runMaestroClosureReview(mission, closureContext);
  return mergeClosureReviews(deterministic, maestro);
}

async function attemptMissionClosure({ type = 'archive', proposedStatus = 'completed', reason = '', evidence = [], finalize, skipClosureReview = false } = {}) {
  const mission = getState().activeMission;
  if (!mission) return { approved: false, reason: 'no_mission' };
  if (skipClosureReview) {
    if (typeof finalize === 'function') await finalize();
    else archiveActiveMission({ status: proposedStatus, reason, evidence });
    return { approved: true, skipped: true };
  }
  mission.closureAttempts = Number(mission.closureAttempts || 0) + 1;
  persist();
  if (mission.closureAttempts > MAX_CLOSURE_ATTEMPTS) {
    publishChatMessage({ agentId: 'maestro', type: 'alerta', content: `Encerramento forcado apos ${MAX_CLOSURE_ATTEMPTS} tentativas de auditoria.` });
    if (typeof finalize === 'function') await finalize();
    else archiveActiveMission({ status: proposedStatus, reason: `${reason} (forcado apos ${MAX_CLOSURE_ATTEMPTS} tentativas)`, evidence });
    return { approved: true, forced: true };
  }
  const closureContext = { type, proposedStatus, reason, evidence, attempt: mission.closureAttempts };
  const review = await reviewMissionClosure(closureContext);
  mission.lastClosureReview = { ...review, reviewedAt: new Date().toISOString(), attempt: mission.closureAttempts };
  persist();
  if (review.verdict === 'approved') {
    publishChatMessage({ agentId: 'maestro', type: 'resultado', content: `Encerramento aprovado: ${review.reasons.join(' ') || 'criterios atendidos.'}` });
    if (typeof finalize === 'function') await finalize();
    else archiveActiveMission({ status: proposedStatus, reason, evidence });
    return { approved: true, review };
  }
  publishChatMessage({ agentId: 'maestro', type: 'alerta', content: `Encerramento bloqueado (${review.verdict}): ${review.gaps.join(' . ') || review.reasons.join(' ')}` });
  if (review.nextSteps?.length) {
    publishChatMessage({ agentId: 'maestro', type: 'acao', content: `Proximos passos: ${review.nextSteps.join(' . ')}` });
  }
  setSupervisorMode('standby');
  stopSupervisorTimer();
  setAgentStatus('supervisor', 'ready');
  return { approved: false, review };
}

// ---------------------------------------------------------------------------
// Runner de chat leve (conversa entre agentes e chat-only).
// ---------------------------------------------------------------------------

async function runAgentChat(agentId, { mode = 'chat_only', reason = '', chatContext = null } = {}) {
  const def = AGENTS.find((agent) => agent.id === agentId);
  if (!def) return { ok: false, error: 'agent_not_found' };
  const runtime = agentRuntime(agentId);
  if (!runtime.enabled) {
    publishChatMessage({ agentId, type: 'info', content: `${agentDisplayName(agentId)} esta desativado; nao participou.` });
    return { ok: false, disabled: true };
  }
  const mission = getState().activeMission;
  const context = chatContext || recentChatContext(12);
  const system = `Voce e o agente ${def.name} (${def.role}) do projeto LUCA-AI. Responda em pt-BR, curto e concreto. ${mode === 'conversation'
    ? 'Voce esta numa conversa entre agentes: traga ideias concretas e reaja ao que o outro agente disse.'
    : 'Cumpra exatamente o pedido do usuario no chat global; nao invente pipeline, dashboard ou canvas.'} Para publicar no chat use uma linha [chat:tipo] mensagem (tipos: info, resultado, decisao, pergunta, alerta, acao).`;
  const user = `Missao ativa
Descricao: ${mission?.description ?? ''}
Criterios de conclusao: ${mission?.success ?? ''}

Chat recente:
${context}

Motivo desta rodada: ${reason || 'contribua de forma util'}

Responda como ${def.name}, em 1 a 4 linhas. Use [chat:tipo] para o que deve aparecer no chat global.`;
  try {
    setAgentStatus(agentId, 'running');
    appendLine(agentId, `[9router:${runtime.model}] ${mode}...`);
    appendAgentHeartbeatEvent(agentId, 'start', runtime.model);
    const output = await call9Router({ system, user, agentId: scopedAgentId(agentId), model: runtime.model, maxTokens: 600 });
    appendLine(agentId, output);
    const messages = extractChatMessages(agentId, output);
    if (!messages.length) {
      const fallback = fallbackChatMessage(agentId, output);
      if (fallback) messages.push(fallback);
    }
    for (const message of messages) publishChatMessage(message);
    setAgentStatus(agentId, 'ready');
    markAgentChatSeen(agentId, latestChatMessageId());
    addHeartbeat(agentId, 'ready', `contribuicao ${mode}`);
    appendAgentHeartbeatEvent(agentId, 'done', mode);
    emitEvent({ type: 'agent.output', agentId, text: output, time: new Date().toISOString() });
    return { ok: true, output };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appendLine(agentId, `erro: ${msg}`);
    setAgentStatus(agentId, 'error');
    addHeartbeat(agentId, 'error', msg);
    publishChatMessage({ agentId, type: 'alerta', content: `Erro ao contribuir no chat: ${msg}` });
    return { ok: false, error: msg, routerDown: isRouterUnavailable(error) };
  }
}

// ---------------------------------------------------------------------------
// Persona-agents do Yume (consumidos via Kamui, SOMENTE LEITURA).
// O LUCA-AI le a persona + system-prompt do Yume e os usa como agente
// especialista. Nunca escreve no Yume.
// ---------------------------------------------------------------------------

async function resolvePersonaSystemPrompt(slug) {
  const persona = getPersonaAgents().find((p) => p.slug === slug);
  try {
    const versionInfo = await getYumePersonaVersion(slug);
    const currentVersion = versionInfo?.version ?? null;
    if (persona?.cachedSystemPrompt && persona.cachedVersion === currentVersion) {
      return { systemPrompt: persona.cachedSystemPrompt, model: persona.model, version: currentVersion, cached: true };
    }
    const data = await fetchYumePersonaSystemPrompt(slug);
    const systemPrompt = data?.system_prompt || '';
    const model = data?.model || '';
    updatePersonaAgent(slug, {
      cachedSystemPrompt: systemPrompt,
      cachedVersion: currentVersion,
      cachedAt: new Date().toISOString(),
      name: data?.name || persona?.name,
      model: persona?.model || model,
      lastError: null,
    });
    return { systemPrompt, model, version: currentVersion, cached: false };
  } catch (error) {
    if (persona?.cachedSystemPrompt) {
      updatePersonaAgent(slug, { lastError: error?.message || String(error) });
      return { systemPrompt: persona.cachedSystemPrompt, model: persona.model, version: persona.cachedVersion, cached: true, stale: true };
    }
    throw error;
  }
}

async function runPersonaAgentChat(slug, { mode = 'chat_only', reason = '', chatContext = null } = {}) {
  const persona = getPersonaAgents().find((p) => p.slug === slug);
  if (!persona) return { ok: false, error: 'persona_not_found' };
  const agentId = persona.id;
  if (persona.enabled === false) {
    publishChatMessage({ agentId, type: 'info', content: `${persona.name} (Yume) esta desativado; nao participou.` });
    return { ok: false, disabled: true };
  }
  const mission = getState().activeMission;
  const context = chatContext || recentChatContext(12);
  let resolved;
  try {
    resolved = await resolvePersonaSystemPrompt(slug);
  } catch (error) {
    const msg = error?.message || String(error);
    publishChatMessage({ agentId, type: 'alerta', content: `Nao consegui carregar a persona ${persona.name} do Yume via Kamui: ${msg}` });
    return { ok: false, error: msg };
  }
  const personaPrompt = resolved.systemPrompt || `Voce e a persona ${persona.name}.`;
  const model = persona.model || resolved.model || ROUTER_MODEL;
  const system = `${personaPrompt}

---
Voce esta atuando como agente especialista dentro do LUCA-AI (orquestrador de missoes). Mantenha sua personalidade e expertise da persona acima. ${mode === 'conversation'
    ? 'Voce esta numa conversa entre agentes: reaja ao que foi dito e traga contribuicao concreta.'
    : 'Cumpra o pedido da missao no chat global.'} Para publicar no chat global, escreva uma linha [chat:tipo] mensagem (tipos: info, resultado, decisao, pergunta, alerta, acao).`;
  const user = `Missao ativa
Descricao: ${mission?.description ?? ''}
Criterios de conclusao: ${mission?.success ?? ''}

Chat recente:
${context}

Motivo desta rodada: ${reason || 'contribua como especialista'}

Responda como ${persona.name}, em 1 a 5 linhas. Use [chat:tipo] para o que deve aparecer no chat global.`;
  try {
    appendHeartbeatLog(`[persona] ${persona.name} (yume:${slug}) v${resolved.version ?? '?'}${resolved.stale ? ' cache' : ''} via Kamui`);
    const output = await call9Router({ system, user, agentId: `yume-${slug}`, model, maxTokens: 700 });
    const messages = extractChatMessages(agentId, output);
    if (!messages.length) {
      const fallback = fallbackChatMessage(agentId, output);
      if (fallback) messages.push(fallback);
    }
    for (const message of messages) publishChatMessage(message);
    addHeartbeat('supervisor', 'observing', `persona ${persona.name} contribuiu`);
    return { ok: true, output };
  } catch (error) {
    const msg = error?.message || String(error);
    publishChatMessage({ agentId, type: 'alerta', content: `Erro ao executar a persona ${persona.name}: ${msg}` });
    return { ok: false, error: msg, routerDown: isRouterUnavailable(error) };
  }
}

// ---------------------------------------------------------------------------
// Missao de conversa entre agentes (turnos com evidencia temporal).
// ---------------------------------------------------------------------------

async function runAgentConversationMission(mission) {
  const partnerId = CONVERSATION_PARTNER_AGENT_ID;
  if (!agentRuntime(partnerId).enabled) {
    publishChatMessage({ agentId: 'supervisor', type: 'alerta', content: `Missao de conversa bloqueada: ${agentDisplayName(partnerId)} esta desativado. Ative-o para a conversa acontecer.` });
    addHeartbeat('supervisor', 'paused', 'conversa bloqueada: parceiro desativado');
    archiveActiveMission({ status: 'blocked', reason: `Conversa bloqueada: ${agentDisplayName(partnerId)} desativado.` });
    setSupervisorMode('standby');
    stopSupervisorTimer();
    emitState();
    return;
  }
  const now = Date.now();
  if (!mission.agentConversation) {
    mission.agentConversation = {
      status: 'running',
      startedAt: new Date().toISOString(),
      durationMs: parseAgentConversationDurationMs(mission),
      turns: [],
    };
    persist();
    publishChatMessage({ agentId: 'supervisor', type: 'decisao', content: `Conversa entre Supervisor e ${agentDisplayName(partnerId)} iniciada. Vamos conversar antes de fechar a missao.` });
  }
  const conv = mission.agentConversation;
  const startedMs = Date.parse(conv.startedAt);
  const elapsedMs = Number.isFinite(startedMs) ? now - startedMs : 0;
  const requestedSeconds = Math.round(conv.durationMs / 1000);

  if (elapsedMs >= conv.durationMs) {
    const completedAt = Number.isFinite(startedMs) ? new Date(startedMs + conv.durationMs).toISOString() : new Date().toISOString();
    const closedAt = new Date().toISOString();
    const actualRuntimeSeconds = Math.round(Math.max(0, elapsedMs) / 1000);
    const report = [
      `Conversa Supervisor/${agentDisplayName(partnerId)} concluida. Tempo pedido: ${requestedSeconds}s (startedAt=${conv.startedAt}, completedAt=${completedAt}).`,
      `Runtime real: ${actualRuntimeSeconds}s. Rodadas: ${Math.ceil(conv.turns.length / 2)}.`,
      'Resumo dos turnos:',
      ...conv.turns.slice(-8).map((turn, index) => `${index + 1}. ${turn.agentName}: ${turn.summary}`),
    ].join('\n');
    publishChatMessage({ agentId: 'supervisor', type: 'resultado', content: report });
    const evidence = [{
      type: 'agent_conversation',
      requestedSeconds,
      elapsedSeconds: requestedSeconds,
      actualRuntimeSeconds,
      turns: conv.turns.length,
      startedAt: conv.startedAt,
      completedAt,
      closedAt,
    }];
    await attemptMissionClosure({
      type: 'agent_conversation',
      proposedStatus: 'completed',
      reason: 'Conversa entre agentes concluida.',
      evidence,
      finalize: () => {
        archiveActiveMission({ status: 'completed', reason: 'Conversa entre agentes concluida.', evidence });
        setSupervisorMode('standby');
        stopSupervisorTimer();
        setAgentStatus('supervisor', 'ready');
        addHeartbeat('supervisor', 'ready', 'conversa concluida');
      },
    });
    emitState();
    return;
  }

  const round = Math.floor(conv.turns.length / 2) + 1;
  const supervisorResult = await runAgentChat('supervisor', { mode: 'conversation', reason: `Rodada ${round}: oriente o brainstorm e peca ideias concretas a ${agentDisplayName(partnerId)}.` });
  const partnerResult = await runAgentChat(partnerId, { mode: 'conversation', reason: `Rodada ${round}: traga ideias concretas e reaja ao Supervisor.` });
  const turnCreatedAt = new Date().toISOString();
  conv.turns = [
    ...conv.turns,
    { round, createdAt: turnCreatedAt, agentId: 'supervisor', agentName: agentDisplayName('supervisor'), summary: compactText(supervisorResult?.output || supervisorResult?.error || 'sem saida', 500) },
    { round, createdAt: turnCreatedAt, agentId: partnerId, agentName: agentDisplayName(partnerId), summary: compactText(partnerResult?.output || partnerResult?.error || 'sem saida', 500) },
  ].slice(-24);
  publishChatMessage({ agentId: 'supervisor', type: 'acao', content: `Rodada ${round} registrada. Tempo: ${Math.round(elapsedMs / 1000)}s/${requestedSeconds}s.` });
  persist();
  emitState();
}

// ---------------------------------------------------------------------------
// Missao chat-only (agentes contribuem no chat, sem pipeline/canvas).
// ---------------------------------------------------------------------------

async function runChatOnlyMission(mission) {
  if (!mission.activatedAt) mission.activatedAt = new Date().toISOString();
  if (!mission.chatOnlyStartedAt) {
    mission.chatOnlyStartedAt = new Date().toISOString();
    persist();
    publishChatMessage({ agentId: 'supervisor', type: 'decisao', content: 'Missao interpretada como acao interna de chat. Nenhum canvas/pipeline sera acionado.' });
    let performers = expectedChatPerformers(mission, getState().agents);
    if (missionRequestsAllAgents(mission)) {
      for (const performer of performers) {
        if (agentRuntime(performer.id).enabled === false) {
          setAgentConfig(performer.id, { enabled: true });
          publishChatMessage({ agentId: 'supervisor', type: 'decisao', content: `Ativando ${agentDisplayName(performer.id)} porque a missao pede todos os agentes.` });
        }
      }
      performers = expectedChatPerformers(mission, getState().agents);
    }
    const needsJudgment = missionNeedsSupervisorJudgment(mission);
    for (const performer of performers) {
      await runAgentChat(performer.id, { mode: 'chat_only', reason: 'Cumpra exatamente a missao interna no chat global.' });
    }
    for (const persona of getPersonaAgents().filter((p) => p.enabled !== false)) {
      await runPersonaAgentChat(persona.slug, { mode: 'chat_only', reason: 'Contribua como especialista (persona do Yume) para a missao.' });
    }
    await runAgentChat('supervisor', {
      mode: 'chat_only',
      reason: needsJudgment
        ? 'Avalie as contribuicoes e declare um veredicto claro citando quem venceu ou a melhor opcao.'
        : 'Resuma e feche a rodada de chat.',
    });
  }
  await attemptMissionClosure({
    type: 'chat_only',
    proposedStatus: 'completed',
    reason: 'Acao interna de chat concluida.',
    finalize: () => {
      publishChatMessage({ agentId: 'supervisor', type: 'resultado', content: `Acao de chat concluida: ${mission.success || mission.description || 'pedido atendido no chat.'}` });
      archiveActiveMission({ status: 'completed', reason: 'Acao interna de chat concluida.' });
      setSupervisorMode('standby');
      stopSupervisorTimer();
      setAgentStatus('supervisor', 'ready');
      addHeartbeat('supervisor', 'ready', 'chat concluido');
    },
  });
  emitState();
}

// ---------------------------------------------------------------------------
// Ativacao compartilhada + scheduler de missoes recorrentes.
// ---------------------------------------------------------------------------

async function activateMissionInternal(payload = {}, extra = {}) {
  stopSupervisorTimer();
  const description = String(payload?.description ?? '').trim();
  const success = String(payload?.success ?? '').trim();
  const mission = {
    id: `mission-${Date.now()}`,
    title: String(payload?.title ?? description.slice(0, 80)).trim(),
    description,
    success,
    context: normalizeMissionContext(payload?.context),
    realtimeFeed: [],
    activatedAt: new Date().toISOString(),
    ...(extra.scheduledRun ? { scheduledRun: extra.scheduledRun } : {}),
  };
  startNewMissionScope(mission);
  createRun(mission);
  addHeartbeat('supervisor', 'ready', `missao ativada: ${mission.title || 'sem titulo'}`);
  emitEvent({ type: 'mission.activated', mission, time: mission.activatedAt });
  emitState();
  if (classifyMissionIntent(mission) === 'dashboard_build') {
    const transformer = AGENTS.find((agent) => agent.role === 'mission-transformer');
    if (transformer && agentRuntime(transformer.id).enabled) {
      publishChatMessage({
        agentId: transformer.id,
        type: 'info',
        content: 'Recebi a missao. Vou transformar os criterios em um direcionamento operacional para os agentes.',
      });
      await runMissionTransformer(transformer, mission);
      emitState();
    }
  }
  setSupervisorMode('running');
  startSupervisorTimer();
  await runCycle();
  return mission;
}

async function processScheduledMissions() {
  const state = getState();
  const now = Date.now();
  const activeScheduleId = state.activeMission?.scheduledRun?.scheduleId || null;
  const result = tickSchedules(state.scheduledMissions, state.missionQueue, { now, activeScheduleId });
  if (result.changed) {
    setScheduledMissions(result.scheduledMissions);
    setMissionQueue(result.missionQueue);
    for (const item of result.queuedItems) {
      emitEvent({ type: 'schedule.queued', scheduleId: item.scheduleId, queueItemId: item.id, runNumber: item.runNumber });
    }
  }
  if (!getState().activeMission) {
    const queue = getState().missionQueue || [];
    const next = queue.find((item) => item.status === 'queued');
    if (next) {
      setMissionQueue(queue.filter((item) => item.id !== next.id));
      await activateMissionInternal(next.payload, { scheduledRun: { scheduleId: next.scheduleId, runNumber: next.runNumber } });
    }
  }
}

let schedulerTimer = null;
function startScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => { processScheduledMissions().catch(() => {}); }, 15000);
}

app.get('/api/health', (_req, res) => {
  const state = getState();
  res.json({
    ok: true,
    service: 'luca-ai',
    supervisorMode: state.supervisorMode,
    agents: Array.isArray(state.agents) ? state.agents.length : 0,
    personaAgents: Array.isArray(state.personaAgents) ? state.personaAgents.length : 0,
    activeMission: Boolean(state.activeMission),
    scheduledMissions: Array.isArray(state.scheduledMissions) ? state.scheduledMissions.length : 0,
    kamuiBase: process.env.KAMUI_BASE || 'http://127.0.0.1:1338',
  });
});

app.get('/api/state', (_req, res) => {
  res.json({ ...getState(), heartbeatMonitor: readHeartbeatReport() });
});

app.post('/api/mission/activate', async (req, res) => {
  const mission = await activateMissionInternal({
    title: req.body?.title,
    description: req.body?.description,
    success: req.body?.success,
    context: req.body?.context,
  });
  res.json({ ok: true, mission });
});

app.post('/api/mission/context', (req, res) => {
  const mission = getState().activeMission;
  if (!mission) {
    res.status(409).json({ ok: false, error: 'no_mission' });
    return;
  }
  mission.context = mergeMissionContext(mission.context, req.body?.context ?? req.body);
  persist();
  publishChatMessage({
    agentId: 'maestro',
    type: 'info',
    content: 'Contexto do problema atualizado (dados historicos/tempo-real/previsiveis/causas/falhas). Os agentes vao usar na proxima rodada.',
  });
  emitEvent({ type: 'mission.context', context: mission.context });
  emitState();
  res.json({ ok: true, context: mission.context });
});

app.post('/api/mission/signal', (req, res) => {
  const mission = getState().activeMission;
  if (!mission) {
    res.status(409).json({ ok: false, error: 'no_mission' });
    return;
  }
  const signal = normalizeSignal(req.body ?? {});
  mission.realtimeFeed = [...(Array.isArray(mission.realtimeFeed) ? mission.realtimeFeed : []), signal].slice(-50);
  persist();
  publishChatMessage({
    agentId: 'supervisor',
    type: signal.severity === 'critical' ? 'alerta' : 'info',
    content: `Sinal em tempo real recebido — ${formatSignalLine(signal)}. Vou considerar na orquestracao.`,
    meta: { signal },
  });
  emitEvent({ type: 'mission.signal', signal });
  emitState();
  res.json({ ok: true, signal });
});

app.post('/api/agent/config', (req, res) => {
  const rawId = String(req.body?.agentId ?? '').trim();
  const patch = {};
  if (typeof req.body?.enabled === 'boolean') patch.enabled = req.body.enabled;
  if (typeof req.body?.model === 'string') patch.model = req.body.model;

  // persona-agent do Yume (id "yume:<slug>" ou o proprio slug importado)
  const personaSlug = rawId.startsWith('yume:')
    ? rawId.slice('yume:'.length)
    : (getPersonaAgents().some((p) => p.slug === rawId) ? rawId : null);
  if (personaSlug) {
    const persona = updatePersonaAgent(personaSlug, patch);
    if (!persona) {
      res.status(404).json({ ok: false, error: 'persona_not_found' });
      return;
    }
    emitEvent({ type: 'agent.config', agentId: persona.id, enabled: persona.enabled, model: persona.model });
    emitState();
    res.json({ ok: true, agent: persona });
    return;
  }

  const agentId = resolveAgentId(rawId);
  if (!AGENTS.some((agent) => agent.id === agentId)) {
    res.status(404).json({ ok: false, error: 'agent_not_found' });
    return;
  }
  const agent = setAgentConfig(agentId, patch);
  emitEvent({ type: 'agent.config', agentId, enabled: agent?.enabled, model: agent?.model });
  emitState();
  res.json({ ok: true, agent });
});

app.get('/api/personas/available', async (_req, res) => {
  try {
    const personas = await listYumePersonas();
    const imported = new Set(getPersonaAgents().map((p) => p.slug));
    res.json({
      ok: true,
      personas: personas.map((p) => ({
        slug: p.slug,
        name: p.name,
        model: p.model,
        description: p.description,
        avatar_url: p.avatar_url,
        version: p.version,
        imported: imported.has(p.slug),
      })),
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: error?.message || String(error), source: 'kamui' });
  }
});

app.post('/api/agent/persona/add', async (req, res) => {
  const slug = String(req.body?.slug ?? '').trim();
  if (!slug) {
    res.status(400).json({ ok: false, error: 'slug_required' });
    return;
  }
  try {
    const promptData = await fetchYumePersonaSystemPrompt(slug);
    const versionInfo = await getYumePersonaVersion(slug);
    const record = addPersonaAgent({
      slug,
      name: promptData?.name || slug,
      model: promptData?.model || '',
      enabled: true,
      cachedSystemPrompt: promptData?.system_prompt || '',
      cachedVersion: versionInfo?.version ?? null,
      cachedAt: new Date().toISOString(),
    });
    publishChatMessage({ agentId: 'maestro', type: 'info', content: `Persona "${record.name}" importada do Yume como agente especialista (read-only).` });
    emitEvent({ type: 'persona.added', slug, agentId: record.id });
    emitState();
    res.json({ ok: true, agent: record });
  } catch (error) {
    res.status(502).json({ ok: false, error: error?.message || String(error), source: 'kamui' });
  }
});

app.post('/api/agent/persona/remove', (req, res) => {
  const slug = String(req.body?.slug ?? '').trim();
  const removed = removePersonaAgent(slug);
  emitEvent({ type: 'persona.removed', slug });
  emitState();
  res.json({ ok: true, removed });
});

app.post('/api/mission/complete', async (req, res) => {
  const mission = getState().activeMission;
  if (!mission) {
    res.status(409).json({ ok: false, error: 'no_mission' });
    return;
  }
  const result = await attemptMissionClosure({
    type: classifyMissionIntent(mission),
    proposedStatus: 'completed',
    reason: 'Encerramento manual solicitado pela interface.',
    skipClosureReview: req.body?.force === true,
    finalize: () => {
      completeRun('encerramento manual aprovado');
      setSupervisorMode('standby');
      stopSupervisorTimer();
      setAgentStatus('supervisor', 'ready');
      addHeartbeat('supervisor', 'ready', 'missao concluida manualmente');
    },
  });
  emitState();
  res.json({ ok: true, approved: result.approved, review: result.review ?? null });
});

app.post('/api/mission/schedule', async (req, res) => {
  try {
    const schedule = buildSchedule(req.body || {});
    setScheduledMissions([schedule, ...getState().scheduledMissions]);
    emitEvent({ type: 'schedule.created', scheduleId: schedule.id, nextRunAt: schedule.nextRunAt });
    await processScheduledMissions();
    emitState();
    res.json({ ok: true, schedule });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/schedule/cancel', (req, res) => {
  const id = String(req.body?.scheduleId ?? '').trim();
  const list = getState().scheduledMissions.map((item) => item.id === id
    ? { ...item, enabled: false, completedAt: item.completedAt ?? new Date().toISOString(), pausedAt: null, pauseReason: null, updatedAt: new Date().toISOString() }
    : item);
  setScheduledMissions(list);
  setMissionQueue((getState().missionQueue || []).filter((item) => item.scheduleId !== id));
  emitEvent({ type: 'schedule.canceled', scheduleId: id });
  emitState();
  res.json({ ok: true });
});

app.post('/api/schedule/pause', (req, res) => {
  const id = String(req.body?.scheduleId ?? '').trim();
  const list = getState().scheduledMissions.map((item) => item.id === id
    ? { ...item, enabled: false, pausedAt: new Date().toISOString(), pauseReason: String(req.body?.reason ?? 'pausada pelo operador'), updatedAt: new Date().toISOString() }
    : item);
  setScheduledMissions(list);
  setMissionQueue((getState().missionQueue || []).filter((item) => item.scheduleId !== id));
  emitEvent({ type: 'schedule.paused', scheduleId: id });
  emitState();
  res.json({ ok: true });
});

app.post('/api/schedule/resume', (req, res) => {
  const id = String(req.body?.scheduleId ?? '').trim();
  const list = getState().scheduledMissions.map((item) => {
    if (item.id !== id) return item;
    const infinite = missionScheduleIsInfinite(item);
    const hasRemaining = infinite || Number(item.remainingRuns || 0) > 0;
    if (!hasRemaining) return item;
    return {
      ...item,
      enabled: true,
      infinite,
      pausedAt: null,
      pauseReason: null,
      completedAt: null,
      updatedAt: new Date().toISOString(),
      nextRunAt: item.nextRunAt || new Date(Date.now() + Number(item.intervalMs || 60000)).toISOString(),
    };
  });
  setScheduledMissions(list);
  emitEvent({ type: 'schedule.resumed', scheduleId: id });
  emitState();
  res.json({ ok: true });
});

app.post('/api/tools/global-chat/message', (req, res) => {
  const agentId = resolveAgentId(String(req.body?.agentId ?? 'system').trim());
  const message = publishChatMessage({
    agentId,
    type: req.body?.type ?? 'info',
    content: req.body?.content,
  });
  emitState();
  if (!message) {
    res.status(400).json({ ok: false, error: 'empty_message' });
    return;
  }
  res.json({ ok: true, message });
});

app.post('/api/mission/reset', (_req, res) => {
  stopSupervisorTimer();
  resetMissionScope();
  addHeartbeat('supervisor', 'ready', 'missao resetada');
  emitState();
  res.json({ ok: true });
});

app.post('/api/supervisor/start', async (_req, res) => {
  setSupervisorMode('running');
  addHeartbeat('supervisor', 'running', 'supervisor ligado');
  if (!supervisorTimer) {
    supervisorTimer = setInterval(() => {
      runCycle();
    }, 8000);
  }
  await runCycle();
  emitState();
  res.json({ ok: true });
});

app.post('/api/supervisor/pause', (_req, res) => {
  setSupervisorMode('standby');
  addHeartbeat('supervisor', 'paused', 'supervisor pausado');
  if (supervisorTimer) {
    clearInterval(supervisorTimer);
    supervisorTimer = null;
  }
  emitState();
  res.json({ ok: true });
});

app.post('/api/agent/run', async (req, res) => {
  const rawId = String(req.body?.agentId ?? '').trim();

  // persona-agent do Yume: roda como especialista no chat da missao ativa.
  const personaSlug = rawId.startsWith('yume:')
    ? rawId.slice('yume:'.length)
    : (getPersonaAgents().some((p) => p.slug === rawId) ? rawId : null);
  if (personaSlug) {
    if (!getState().activeMission) {
      res.status(409).json({ ok: false, error: 'mission_required' });
      return;
    }
    const result = await runPersonaAgentChat(personaSlug, { mode: 'chat_only', reason: 'Execucao manual de persona especialista solicitada pela interface.' });
    emitState();
    res.json({ ok: result.ok !== false, result });
    return;
  }

  const agentId = resolveAgentId(rawId);
  const agent = AGENTS.find((item) => item.id === agentId);
  if (!agent) {
    res.status(404).json({ ok: false, error: 'agent_not_found' });
    return;
  }
  const mission = getState().activeMission;
  if (!mission) {
    setAgentStatus(agent.id, 'idle');
    appendLine(agent.id, 'idle: nenhuma missao ativa.');
    emitState();
    res.status(409).json({ ok: false, error: 'mission_required' });
    return;
  }
  if (agent.role !== 'mission-transformer' && completedTasksFor(agent.id).length > 0) {
    res.json({ ok: true, skipped: true, reason: 'agent_already_completed_task' });
    return;
  }
  const task = agent.role === 'mission-transformer' ? null : createAgentTask(agent.id, 'Execucao manual solicitada pela interface. Leia o chat e publique contribuicao util para a missao ativa.');
  await runAgent(agent, mission, task);
  emitState();
  res.json({ ok: true });
});

app.post('/api/heartbeat/start', (_req, res) => {
  startHeartbeatMonitor();
  emitState();
  res.json({ ok: true });
});

app.post('/api/heartbeat/pause', (_req, res) => {
  stopHeartbeatMonitor();
  emitState();
  res.json({ ok: true });
});

app.post('/api/agents/clear', (_req, res) => {
  clearAgentContexts();
  appendHeartbeatLog('[heartbeat] terminais e contexto dos agentes limpos');
  emitState();
  res.json({ ok: true });
});

app.use('/icons', express.static(path.resolve(process.cwd(), 'public', 'icons')));

if (fs.existsSync(indexPath)) {
  app.use(express.static(distPath));
  app.get('*splat', (_req, res) => {
    res.sendFile(indexPath);
  });
} else if (fs.existsSync(v2IndexPath)) {
  app.use(express.static(v2DesignPath));
  app.get('*splat', (_req, res) => {
    res.sendFile(v2IndexPath);
  });
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ kind: 'state', state: getState() }));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  startHeartbeatMonitor();
  startScheduler();
  console.log(`LUCA backend em http://127.0.0.1:${PORT}`);
});
