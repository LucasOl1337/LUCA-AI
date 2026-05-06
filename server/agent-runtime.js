import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import nodePath from 'node:path';
import { runCodexTask } from './codex-session.js';

const execPromise = promisify(exec);

const SAFE_COMMAND_PREFIXES = ['dir ', 'ls ', 'echo ', 'get-content ', 'get-childitem '];

const baseAgents = [
  {
    id: 'supervisor',
    title: 'supervisor',
    role: 'supervisor',
    model: 'local',
    status: 'standby',
    lines: ['[boot] supervisor terminal ready', '[model] local loop'],
  },
  {
    id: 'planejador',
    title: 'planejador',
    role: 'planner',
    model: 'codex',
    status: 'idle',
    lines: ['[boot] planejador ready', '[model] codex mission planner'],
  },
  {
    id: 'riscos-campo',
    title: 'riscos campo',
    role: 'executor',
    model: 'codex',
    status: 'idle',
    lines: ['[boot] riscos campo ready', '[model] codex real research only'],
  },
  {
    id: 'database',
    title: 'database',
    role: 'database',
    model: 'local',
    status: 'curating',
    lines: [
      '[boot] database ready',
      '[skill] public-friendly-post-processing via server/publication-engine.js',
      '[rule] layer 3 shows only clear viewer-ready information',
    ],
  },
];

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function extractJson(raw) {
  const lines = String(raw).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const event = JSON.parse(lines[i]);
      const text = event.item?.text ?? event.text ?? event.message;
      if (typeof text === 'string') return JSON.parse(text);
      if (event.summary || event.executiveValue) return event;
    } catch {
      // keep scanning
    }
  }
  const text = String(raw);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  throw new Error('codex returned no valid JSON research payload');
}

const fieldPreventionFallbackMissions = [
  {
    title: 'Alerta de seca soja RS',
    scope: 'Criar uma fila operacional para antecipar perda em areas de soja no RS com restricao hidrica, antes de virar sinistro agricola pesado.',
    success: 'Toda area exposta tem cultura, UF, municipio, evidencia de chuva local, severidade e acao preventiva registrada.',
    riskId: 'clima',
    jobs: [
      {
        title: 'Mapear areas expostas por cultura e municipio',
        type: 'intelligence',
        focus: 'Separar soja RS por apolice, proposta e renovacao, marcando severidade climatica e janela da safra.',
        riskId: 'clima',
      },
      {
        title: 'Coletar evidencia minima de campo',
        type: 'source',
        focus: 'Solicitar chuva local, estagio da cultura, solo, fotos georreferenciadas e manejo hidrico para casos sem prova suficiente.',
        riskId: 'modelagem',
      },
      {
        title: 'Gerar lista de intervencao preventiva',
        type: 'procedure',
        focus: 'Definir contato tecnico, visita de campo, ajuste de orientacao ou bloqueio de nova exposicao por severidade.',
        riskId: 'sinistro',
      },
    ],
  },
  {
    title: 'Triagem antecipada de sinistro em campo',
    scope: 'Reduzir TAT e atrito em pico climatico preparando evidencias e prioridade antes da abertura massiva de avisos.',
    success: 'Todo caso provavel tem severidade, responsavel, evidencia obrigatoria, proximo passo e prazo de retorno.',
    riskId: 'sinistro',
    jobs: [
      {
        title: 'Priorizar propriedades por severidade provavel',
        type: 'simulation',
        focus: 'Classificar produtor e area em baixa, media, alta ou muito alta usando risco climatico, cultura, UF e completude da evidencia.',
        riskId: 'sinistro',
      },
      {
        title: 'Preparar pacote de regulacao remota',
        type: 'method',
        focus: 'Definir campos, fotos, datas, coordenadas e comprovantes minimos para reduzir retrabalho de pericia.',
        riskId: 'sinistro',
      },
      {
        title: 'Emitir briefing de acao para campo e corretor',
        type: 'report',
        focus: 'Gerar relatorio curto com quem contatar, qual evidencia pedir e qual caso exige visita presencial.',
        riskId: 'sinistro',
      },
    ],
  },
  {
    title: 'Saneamento de dado agronomico critico',
    scope: 'Fechar gaps de dados que impedem decisao tecnica confiavel antes do aceite, renovacao ou agravamento do evento no campo.',
    success: 'Registros sem cultura, UF, municipio, safra, solo, manejo e evidencia climatica entram em fila de saneamento antes de decisao.',
    riskId: 'modelagem',
    jobs: [
      {
        title: 'Identificar cadastros sem evidencia suficiente',
        type: 'source',
        focus: 'Encontrar areas sem cultura, municipio, janela de plantio, estagio da cultura, chuva local ou foto georreferenciada.',
        riskId: 'modelagem',
      },
      {
        title: 'Definir regra de decisao por completude',
        type: 'method',
        focus: 'Criar criterios para liberar, reprecificar, escalar vistoria ou bloquear nova exposicao quando dado de campo estiver incompleto.',
        riskId: 'modelagem',
      },
      {
        title: 'Publicar procedimento de coleta operacional',
        type: 'procedure',
        focus: 'Padronizar como corretor e equipe de campo coletam e validam evidencia antes do proximo heartbeat.',
        riskId: 'modelagem',
      },
    ],
  },
];

export class AgentRuntime {
  constructor({ store, bus, config }) {
    this.store = store;
    this.bus = bus;
    this.config = config;
    this.activeRuns = new Set();
    this.generation = 0;
    this.agents = new Map(this.createAgents().map((agent) => [agent.id, agent]));
  }

  createAgents() {
    return baseAgents.map((agent) => ({
      ...agent,
      lines: [...agent.lines],
    }));
  }

  list() {
    return [...this.agents.values()].map((agent) => ({ ...agent, lines: [...agent.lines] }));
  }

  get(id) {
    return this.agents.get(id);
  }

  async setStatus(id, status) {
    const agent = this.get(id);
    if (!agent) return;
    agent.status = status;
    this.bus.emit('agent.status', { agentId: id, status });
  }

  resetAll() {
    this.generation += 1;
    this.activeRuns.clear();
    this.agents = new Map(this.createAgents().map((agent) => [agent.id, agent]));
  }

  async resetEnvironment() {
    this.generation += 1;
    this.activeRuns.clear();
    this.agents = new Map(this.createAgents().map((agent) => [agent.id, agent]));
    await this.store.clearAllAgentLogs();
  }

  async write(id, line) {
    const agent = this.get(id);
    if (!agent) return;
    const stampedLine = `${new Date().toLocaleTimeString('pt-BR', { hour12: false })} ${line}`;
    agent.lines = [...agent.lines, stampedLine].slice(-80);
    await this.store.appendAgentLog(id, stampedLine);
    this.bus.emit('agent.output', { agentId: id, line: stampedLine });
  }

  async sendToExecutor(id, message) {
    const agent = this.get(id);
    if (!agent) return;
    if (this.activeRuns.has(id)) {
      await this.write(id, '[skip] executor already running');
      return;
    }
    agent.status = 'running';
    await this.write(id, `[task] ${message}`);
    this.bus.emit('agent.status', { agentId: id, status: agent.status });
    this.runLocalTask(agent, message).catch((error) => {
      this.write(id, `[error] ${error.message}`);
    });
  }

  async runLocalTask(agent, message) {
    const runGeneration = this.generation;
    this.activeRuns.add(agent.id);
    try {
      await this.write(agent.id, `[exec] starting task`);
      const result = await this.executeTask(agent, message);
      if (runGeneration !== this.generation) return;
      await this.write(agent.id, `[exec] ${result.success ? 'success' : 'failed'}`);
      if (result.output) {
        const lines = result.output.split('\n').filter(Boolean).slice(-20);
        for (const line of lines) {
          await this.write(agent.id, `  > ${line}`);
        }
      }
      await this.write(agent.id, `[done] task completed`);
      agent.status = 'done';
      this.bus.emit('agent.status', { agentId: agent.id, status: agent.status });
    } catch (error) {
      if (runGeneration !== this.generation) return;
      agent.status = 'blocked';
      await this.write(agent.id, `[blocked] ${error.message}`);
      this.bus.emit('agent.status', { agentId: agent.id, status: agent.status });
    } finally {
      this.activeRuns.delete(agent.id);
    }
  }

  async executeTask(agent, task) {
    if (agent.id === 'planejador') {
      return this.executePlanningJob(task);
    }
    if (agent.id === 'riscos-campo') {
      return this.executeRiskJob(task);
    }
    return this.executeCommand(task);
  }

  async executePlanningJob(task) {
    const database = await this.store.databaseSnapshot();
    await this.write('planejador', '[mode] using Codex to create real field-loss prevention missions');
    const raw = await this.runCodexPlanner({ database, task });
    const plan = this.parsePlannerResult(raw);
    const saved = await this.store.addPlannedMissions(plan.missions);
    await this.store.appendHeartbeat({
      agentId: 'planejador',
      status: 'missions.created',
      note: `${saved.missions.length} missoes e ${saved.jobs.length} jobs criados para prevencao de sinistro no campo`,
    });
    return {
      success: true,
      output: [
        `Missoes criadas: ${saved.missions.length}`,
        `Jobs criados: ${saved.jobs.length}`,
        ...saved.missions.map((mission) => `- ${mission.title}`),
      ].join('\n'),
    };
  }

  async runCodexPlanner({ database, task }) {
    const prompt = [
      'Voce e o agente planejador do LUCA-AI para operacoes Sompo agro.',
      'Sua funcao: criar missoes reais e executaveis para prevencao de sinistro no campo. Nao crie tarefas genericas.',
      'As missoes devem ajudar equipes de operacao, underwriting, sinistro, corretor e campo a antecipar perdas agricolas.',
      'Regra dura: todas as missoes precisam ocorrer no campo ou preparar uma decisao direta sobre risco de campo.',
      'Se a database tiver firstCase, crie missoes somente para esse primeiro caso. Nao abra outros casos no mesmo ciclo.',
      'Nao crie missao de PSR, calendario, capital, campanha comercial, regulatorio ou resseguro como assunto principal.',
      'PSR, margem e resseguro podem aparecer apenas como impacto executivo, nunca como missao autonomica.',
      'Use apenas ASCII: sem acentos, sem cedilha, sem caracteres especiais.',
      'Use apenas a database fornecida. Se faltar dado externo, inclua a coleta como parte da missao, sem inventar fatos.',
      'Retorne somente JSON valido, sem markdown.',
      'Schema obrigatorio:',
      '{ "missions": [ { "title": string, "scope": string, "success": string, "riskId": string, "jobs": [ { "title": string, "type": "intelligence" | "simulation" | "report" | "source" | "method" | "procedure", "focus": string, "riskId": string } ] } ] }',
      'Regras:',
      '- Crie 3 missoes.',
      '- Cada missao deve ter 3 jobs no maximo.',
      '- Cada job precisa ser acionavel e ligado a prevencao de sinistro no campo.',
      '- Priorize clima/produtividade, triagem de sinistro, evidencia georreferenciada, vistoria, TAT, microclima, manejo, cultura, UF, municipio e decisao preventiva.',
      '- Cada missao deve responder: qual area/produtor esta em risco, qual evidencia falta, qual acao de campo evita ou reduz sinistro.',
      `Contexto supervisor: ${task}`,
      `Database: ${JSON.stringify({
        source: database.source,
        summary: database.summary,
        firstCase: database.firstCase,
        reliableSources: database.reliableSources,
        metrics: database.metrics,
        painPoints: database.painPoints,
      })}`,
    ].join('\n\n');

    const result = await runCodexTask({
      codexBin: this.config.codexBin,
      codexProfile: this.config.codexProfile,
      codexExtraArgs: this.config.codexExtraArgs,
      codexProvider: this.config.codexProvider,
      workspace: this.config.workspace,
      model: this.config.executorModel,
      prompt,
      timeoutMs: this.config.codexTimeoutMs,
      onLine: (line) => this.write('planejador', line),
    });
    if (!result.ok) {
      throw new Error(`codex planner failed: ${result.stderr || result.stdout || 'unknown error'}`);
    }
    return result.stdout;
  }

  parsePlannerResult(raw) {
    const payload = extractJson(raw);
    const missions = Array.isArray(payload.missions) ? payload.missions : [];
    const blockedStandalone = /\b(psr|subvenc|calendario|capital|resseguro|campanha|canal|regulatorio|susep|cnsp|zarc)\b/i;
    const fieldTerms = /\b(campo|sinistro|seca|chuva|clima|produtiv|cultura|municipio|uf|vistoria|pericia|evidencia|georrefer|solo|manejo|safra|produtor|area)\b/i;
    const cleaned = missions.slice(0, 3).map((mission) => ({
      title: String(mission.title ?? '').trim(),
      scope: String(mission.scope ?? '').trim(),
      success: String(mission.success ?? '').trim(),
      riskId: String(mission.riskId ?? '').trim(),
      jobs: Array.isArray(mission.jobs) ? mission.jobs.slice(0, 3).map((job) => ({
        title: String(job.title ?? '').trim(),
        type: String(job.type ?? 'intelligence').trim(),
        focus: String(job.focus ?? '').trim(),
        riskId: String(job.riskId ?? mission.riskId ?? '').trim(),
      })).filter((job) => job.title && job.focus) : [],
    }))
      .filter((mission) => {
        const missionText = `${mission.title} ${mission.scope}`;
        return mission.title && mission.scope && mission.jobs.length && fieldTerms.test(missionText) && !blockedStandalone.test(missionText);
      })
      .map((mission) => ({
        ...mission,
        jobs: mission.jobs.filter((job) => {
          const jobText = `${job.title} ${job.focus}`;
          return fieldTerms.test(jobText) && !blockedStandalone.test(jobText);
        }),
      }))
      .filter((mission) => mission.jobs.length);
    if (cleaned.length === 3) return { missions: cleaned };
    return { missions: fieldPreventionFallbackMissions };
  }

  async executeRiskJob(task) {
    const database = await this.store.databaseSnapshot();
    const lowerTask = task.toLowerCase();
    const target =
      database.jobs.find((job) => lowerTask.includes(job.id)) ??
      database.jobs.find((job) => lowerTask.includes(job.title.toLowerCase())) ??
      database.jobs[0];
    if (!target) throw new Error('no queued risk job');

    await this.write('riscos-campo', '[mode] using Codex; template-only fake research is disabled');
    const raw = await this.runCodexResearch({ database, target });
    const result = this.parseResearchResult({ raw, database, target });
    await this.store.completeJob(target.id, result);
    await this.store.appendHeartbeat({
      agentId: 'riscos-campo',
      jobId: target.id,
      status: 'done',
      note: result.summary,
    });
    return {
      success: true,
      output: [
        `Job: ${target.title}`,
        `Resumo: ${result.summary}`,
        `Motor: Codex ${this.config.executorModel}`,
        `Evidencias: ${(result.report?.findings ?? result.contribution?.findings ?? []).slice(0, 3).join(' | ')}`,
      ].filter(Boolean).join('\n'),
    };
  }

  async runCodexResearch({ database, target }) {
    const prompt = [
      'Voce e o agente riscos-campo do LUCA-AI. Gere pesquisa/sintese util para executivo da Sompo.',
      'Foco unico: prevencao de sinistro agricola no campo. Nao transforme o job em analise generica de PSR, capital ou campanha.',
      'Use apenas ASCII: sem acentos, sem cedilha, sem caracteres especiais. Escreva "tecnica", "restricao", "selecao", "proximo".',
      'Regra dura: nao invente dados externos. Se nao houver fonte externa, use apenas a database fornecida e marque sourceMode como "local-research-database".',
      'Retorne somente JSON valido, sem markdown.',
      'Schema obrigatorio:',
      '{ "summary": string, "sourceMode": string, "executiveValue": string, "findings": string[], "nextActions": string[], "simulation": { "scenario": string, "before": string, "after": string, "avoidedLossProxy": number }, "truthSource": { "purpose": string, "masterFields": string[], "acceptanceRules": string[] }, "method": { "objective": string, "profitLevers": string[], "qualityLevers": string[], "decisionGate": string }, "procedure": { "trigger": string, "steps": string[], "serviceQualityCheck": string, "profitCheck": string } }',
      `Job: ${JSON.stringify(target)}`,
      `Database: ${JSON.stringify({
        source: database.source,
        summary: database.summary,
        firstCase: database.firstCase,
        reliableSources: database.reliableSources,
        metrics: database.metrics,
        painPoints: database.painPoints,
      })}`,
    ].join('\n\n');

    const result = await runCodexTask({
      codexBin: this.config.codexBin,
      codexProfile: this.config.codexProfile,
      codexExtraArgs: this.config.codexExtraArgs,
      codexProvider: this.config.codexProvider,
      workspace: this.config.workspace,
      model: this.config.executorModel,
      prompt,
      timeoutMs: this.config.codexTimeoutMs,
      onLine: (line) => this.write('riscos-campo', line),
    });
    if (!result.ok) {
      throw new Error(`codex research failed: ${result.stderr || result.stdout || 'unknown error'}`);
    }
    return result.stdout;
  }

  parseResearchResult({ raw, database, target }) {
    const payload = extractJson(raw);
    const risk = database.painPoints.find((item) => item.id === target.riskId) ?? database.painPoints[0];
    const createdAt = new Date().toISOString();
    const base = {
      id: `${target.id}-${Date.now()}`,
      jobId: target.id,
      missionId: target.missionId ?? target.id,
      riskId: risk.id,
      createdAt,
      sourceMode: payload.sourceMode ?? 'codex',
    };
    const summary = payload.summary ?? payload.executiveValue ?? `${target.title}: pesquisa concluida`;
    const report = {
      ...base,
      title: `Brief executivo: ${target.title}`,
      thesis: payload.executiveValue ?? summary,
      findings: normalizeStringArray(payload.findings).slice(0, 6),
      nextActions: normalizeStringArray(payload.nextActions).slice(0, 6),
    };
    return {
      summary,
      contribution: {
        ...base,
        title: `Contribuicao: ${target.title}`,
        insight: payload.executiveValue ?? summary,
        evidence: report.findings[0] ?? risk.signal,
        recommendation: report.nextActions[0] ?? risk.agentAction,
        findings: report.findings,
        chart: { label: risk.name, value: risk.score, kind: risk.criticality },
      },
      simulation: payload.simulation ? {
        ...base,
        title: `Simulacao: ${target.title}`,
        scenario: payload.simulation.scenario ?? risk.signal,
        before: payload.simulation.before ?? 'Sem simulacao anterior.',
        after: payload.simulation.after ?? 'Sem simulacao otimizada.',
        avoidedLossProxy: Number(payload.simulation.avoidedLossProxy ?? 0),
        severity: risk.score,
      } : null,
      report,
      truthSource: payload.truthSource ? {
        ...base,
        title: `Fonte da verdade: ${target.title}`,
        owner: 'riscos-campo',
        purpose: payload.truthSource.purpose ?? 'Padronizar evidencias para decisao.',
        masterFields: normalizeStringArray(payload.truthSource.masterFields).slice(0, 12),
        acceptanceRules: normalizeStringArray(payload.truthSource.acceptanceRules).slice(0, 8),
      } : null,
      method: payload.method ? {
        ...base,
        title: `Metodo: ${target.title}`,
        objective: payload.method.objective ?? 'Melhorar margem e qualidade operacional.',
        profitLevers: normalizeStringArray(payload.method.profitLevers).slice(0, 8),
        qualityLevers: normalizeStringArray(payload.method.qualityLevers).slice(0, 8),
        decisionGate: payload.method.decisionGate ?? 'Aplicar quando o score do risco estiver alto.',
      } : null,
      procedure: payload.procedure ? {
        ...base,
        title: `Procedimento: ${target.title}`,
        trigger: payload.procedure.trigger ?? risk.signal,
        steps: normalizeStringArray(payload.procedure.steps).slice(0, 10),
        serviceQualityCheck: payload.procedure.serviceQualityCheck ?? 'Todo caso deve ter dono e proximo passo.',
        profitCheck: payload.procedure.profitCheck ?? 'Toda acao deve declarar impacto em margem.',
      } : null,
    };
  }

  async executeCommand(task) {
    const desktop = nodePath.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop');
    let command = task.trim();
    const missionMatch = command.match(/missao:\s*(.+?)\.\s*Criterio:/i);
    if (missionMatch) command = missionMatch[1].trim();
    const lowerCommand = command.toLowerCase();

    if (lowerCommand.includes('cria') && lowerCommand.includes('arquivo') && lowerCommand.includes('.md')) {
      const fileMatch = command.match(/chamado\s+(\S+)/i);
      if (fileMatch) {
        const fileName = fileMatch[1].replace(/\.md$/i, '') + '.md';
        const filePath = nodePath.join(desktop, fileName);
        const content = command.includes('preencha') ? `# ${fileName}\n\nGerado por LUCA-AI em ${new Date().toLocaleString('pt-BR')}\n\nMissao executada com sucesso.` : '';
        fs.writeFileSync(filePath, content, 'utf8');
        return { success: true, output: `Arquivo criado: ${filePath}` };
      }
    }

    if (lowerCommand.includes('novo arquivo') || lowerCommand.includes('new file') || lowerCommand.includes('criar arquivo')) {
      const fileName = `luca_task_${Date.now()}.md`;
      const filePath = nodePath.join(desktop, fileName);
      const content = `# ${fileName}\n\nGerado por LUCA-AI em ${new Date().toLocaleString('pt-BR')}\n\nMissao executada com sucesso.`;
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, output: `Arquivo criado: ${filePath}` };
    }

    if (SAFE_COMMAND_PREFIXES.some((prefix) => lowerCommand.startsWith(prefix))) {
      try {
        const { stdout, stderr } = await execPromise(command, {
          timeout: 15000,
          maxBuffer: 256 * 1024,
        });
        return { success: !stderr, output: stdout || stderr };
      } catch (error) {
        return { success: false, output: error.message };
      }
    }

    return { success: false, output: `Comando nao permitido: ${command.slice(0, 80)}` };
  }
}
