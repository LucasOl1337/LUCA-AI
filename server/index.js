import express from 'express';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { PORT, AGENTS, AGENT_ALIASES, ROUTER_MODEL } from './config.js';
import { call9Router, check9RouterHealth } from './router-client.js';
import {
  addHeartbeat,
  addGlobalChatMessage,
  appendLine,
  appendHeartbeatLog,
  clearAgentContexts,
  completeRun,
  createAgentTask,
  createRun,
  getState,
  incrementSupervisorTick,
  markAgentChatSeen,
  resetMissionScope,
  setAgentStatus,
  setMission,
  setRunBriefing,
  setSupervisorFinalReport,
  setSupervisorMode,
  setTemporaryDashboard,
  startNewMissionScope,
  updateAgentTask,
  upsertDashboardItem,
} from './state.js';

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
  return AGENTS.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function appendAgentHeartbeatEvent(agentId, phase, detail = '') {
  const label = phase === 'start' ? 'iniciou' : phase === 'done' ? 'terminou' : 'falhou';
  const suffix = detail ? ` (${detail})` : '';
  appendHeartbeatLog(`[agent:${phase}] ${label} ${agentDisplayName(agentId).toLowerCase()}${suffix}`);
}

function normalizeChatType(type) {
  const value = String(type ?? 'info').toLowerCase().trim();
  if (['info', 'resultado', 'decisao', 'pergunta', 'alerta', 'sistema'].includes(value)) return value;
  if (value === 'result') return 'resultado';
  if (value === 'decision') return 'decisao';
  if (value === 'question') return 'pergunta';
  if (value === 'warning') return 'alerta';
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
    const match = line.match(/^\s*\[chat:(info|resultado|decisao|pergunta|alerta|sistema)\]\s*(.+)$/i);
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
  const prompt = `Missao escrita pelo usuario\nTitulo: ${mission?.title ?? 'Sem titulo'}\nDescricao: ${mission?.description ?? 'Sem descricao'}\nCriterios de conclusao informados: ${mission?.success ?? 'Sem criterios de conclusao'}\n\n${DELIVERY_PRINCIPLE}\n\nTransforme a missao bruta em um briefing estruturado para agentes que precisam resolver uma dor de negocio e gerar um dashboard executivo.\n\nInclua obrigatoriamente:\n1. Objetivo final escolhido em uma frase.\n2. Dor, oportunidade ou pedido central, com cliente/segmento quando houver.\n3. Tipo de problema: operacional, financeiro, risco, comercial, produto, conteudo ou outro.\n4. Eventos, causas, riscos, impactos ou itens citados explicitamente.\n5. Premissas razoaveis adotadas para preencher lacunas sem travar a missao.\n6. Objetivo de otimizacao: o que precisa melhorar ou ser entregue na pratica.\n7. Dados pos-processados esperados: pain, client, riskTypes, financialImpact, evidence, dashboardMetrics, recommendedCharts, actions, successCriteria.\n8. Papeis dos agentes com foco em entrega: Supervisor dirige, Planejador escolhe caminho, Pesquisador valida e completa com premissas, Designer sintetiza visualmente.\n9. Criterios de sucesso verificaveis para aprovar a entrega.\n\nNao execute a missao final, mas escolha o melhor caminho operacional. Nao fique procurando condicao perfeita. Se houver ambiguidade, resolva com uma premissa clara e avance.`;
  const system = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Sua funcao e transformar uma missao bruta em briefing operacional pragmatico. Escolha o melhor caminho possivel, use premissas quando faltar informacao e oriente os agentes a entregar resultado final satisfatorio. Responda em pt-BR, objetivo, estruturado e acionavel.`;

  try {
    setAgentStatus(agent.id, 'running');
    appendLine(agent.id, `[9router:${agent.model}] executando...`);
    appendAgentHeartbeatEvent(agent.id, 'start', agent.model);
    emitEvent({ type: 'agent.status', agentId: agent.id, status: 'running', time: new Date().toISOString() });

    const output = await call9Router({ system, user: prompt, agentId: scopedAgentId(agent.id), model: agent.model });
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
  if (agent.role === 'mission-transformer') return runMissionTransformer(agent, mission);
  if (agent.role === 'designer') return runDesignerAgent(agent, mission, task);
  const chatRequired = missionRequiresChatMessage(mission);
  const directionPrompt = missionInstruction(mission);
  const taskInstruction = task?.instruction ? `\nTarefa atribuida pelo supervisor:\n${task.instruction}\n` : '';
  const chatContext = `\nChat Global recente:\n${recentChatContext()}\n\nMensagens novas para voce:\n${unreadChatContext(agent.id)}\n`;
  const repoContext = missionRequiresRepoContext(mission) ? `\nFerramenta RepoContext disponivel. Use estas evidencias observaveis da repo; cite arquivos quando fizer achados:\n${repoContextForPrompt()}\n` : '';
  const prompt = `Missao global ativa\nDescricao: ${mission?.description ?? 'Sem descricao'}\nCriterios de conclusao: ${mission?.success ?? 'Sem criterios de conclusao'}\n\n${DELIVERY_PRINCIPLE}\n${directionPrompt ? `\nDirecionamento transformado pelo agente transformador-missao:\n${directionPrompt}\n` : ''}${taskInstruction}${chatContext}${repoContext}\nFerramenta disponivel: Chat Global.\nPara publicar no chat visivel aos agentes, escreva uma linha exatamente neste formato:\n[chat:tipo] mensagem\nTipos permitidos: info, resultado, decisao, pergunta, alerta.\nUse o chat apenas para informacoes uteis a outros agentes. Nao use para status trivial.\n${chatRequired ? '\nEsta missao exige mensagem no chat. Inclua obrigatoriamente uma linha [chat:info] com a mensagem solicitada.\n' : ''}\nQualidade obrigatoria da contribuicao:\n1. Entregue uma contribuicao final util, mesmo com informacao incompleta.\n2. Se faltar dado, declare premissa/proxy e siga. Nao use lacuna como conclusao principal.\n3. Escolha uma direcao, priorize e recomende a proxima acao.\n4. Produza material que ajude o Designer a montar um dashboard executivo: itens, ranking, metricas, acoes ou criterios de sucesso.\n5. Nao repita informacoes que ja estao no chat; entregue contribuicao nova.\nSe a tarefa pede analise da repo, publique pontos fortes e fracos com evidencia de arquivo/diretorio. Nao diga que nao tem acesso a arvore se RepoContext foi fornecido. Trabalhe apenas dentro desse escopo. Use os criterios de conclusao e o direcionamento transformado para decidir se sua resposta esta suficiente.`;
  const system = `Voce e o agente ${agent.id} (${agent.role}) do projeto LUCA-AI. Responda em pt-BR, objetivo, pragmatico e orientado a entrega. Trabalhe com o que tem, use premissas claras quando faltar dado e entregue resultado acionavel. Quando precisar compartilhar algo no Chat Global, use uma linha [chat:tipo] mensagem.`;
  const model = agent.model ?? ROUTER_MODEL;

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
  const model = agent.model ?? ROUTER_MODEL;

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
    emitState();
    return;
  }
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

    publishChatMessage({
      agentId: 'supervisor',
      type: 'resultado',
      content: `Concluido: relatorio final consolidado, Designer publicou o canvas e criterios foram revisados: ${mission.success || 'sem criterios explicitos'}`,
    });
    completeRun('relatorio final do supervisor entregue e canvas final publicado pelo designer');
    setSupervisorMode('standby');
    if (supervisorTimer) {
      clearInterval(supervisorTimer);
      supervisorTimer = null;
    }
    setAgentStatus('supervisor', 'ready');
    addHeartbeat('supervisor', 'ready', 'missao concluida pelo orquestrador');
    emitState();
    return;
  }

  setAgentStatus('supervisor', 'ready');
  addHeartbeat('supervisor', 'observing', 'sem acao nova');
}

app.get('/api/state', (_req, res) => {
  res.json({ ...getState(), heartbeatMonitor: readHeartbeatReport() });
});

app.post('/api/mission/activate', async (req, res) => {
  stopSupervisorTimer();
  const description = String(req.body?.description ?? '').trim();
  const success = String(req.body?.success ?? '').trim();
  const mission = {
    title: String(req.body?.title ?? description.slice(0, 80)).trim(),
    description,
    success,
    activatedAt: new Date().toISOString(),
  };
  startNewMissionScope(mission);
  createRun(mission);
  addHeartbeat('supervisor', 'ready', `missao ativada: ${mission.title || 'sem titulo'}`);
  emitEvent({ type: 'mission.activated', mission, time: mission.activatedAt });
  emitState();
  const transformer = AGENTS.find((agent) => agent.role === 'mission-transformer');
  if (transformer) {
    publishChatMessage({
      agentId: transformer.id,
      type: 'info',
      content: 'Recebi a missao. Vou transformar os criterios em um direcionamento operacional para os agentes.',
    });
    await runMissionTransformer(transformer, mission);
    emitState();
  }
  setSupervisorMode('running');
  if (!supervisorTimer) {
    supervisorTimer = setInterval(() => {
      runCycle();
    }, 8000);
  }
  runCycle();
  res.json({ ok: true, mission });
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
  const agentId = resolveAgentId(String(req.body?.agentId ?? '').trim());
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
  console.log(`LUCA backend em http://127.0.0.1:${PORT}`);
});
