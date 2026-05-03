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
    id: 'riscos-campo',
    title: 'riscos campo',
    role: 'executor',
    model: 'local',
    status: 'idle',
    lines: ['[boot] riscos campo ready', '[role] monitor agro, PSR e sinistro'],
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
    if (agent.id === 'riscos-campo') {
      return this.executeRiskJob(task);
    }
    return this.executeCommand(task);
  }

  async executeRiskJob(task) {
    const database = await this.store.databaseSnapshot();
    const lowerTask = task.toLowerCase();
    const target =
      database.jobs.find((job) => lowerTask.includes(job.id)) ??
      database.jobs.find((job) => lowerTask.includes(job.title.toLowerCase())) ??
      database.jobs[0];
    const topRisks = database.painPoints
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((risk) => `${risk.name}: ${risk.agentAction}`)
      .join('\n');

    if (target) {
      const result = this.buildRiskResult({ database, target });
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
          `Tipo: ${target.type}`,
          `Resumo: ${result.summary}`,
          `Base: ${database.source.name}`,
          'Top riscos acionaveis:',
          topRisks,
        ].filter(Boolean).join('\n'),
      };
    }

    return {
      success: true,
      output: [
        `Job: ${target?.title ?? 'risco agro'}`,
        `Foco: ${target?.focus ?? 'monitoramento geral'}`,
        `Base: ${database.source.name}`,
        'Top riscos acionaveis:',
        topRisks,
      ].filter(Boolean).join('\n'),
    };
  }

  buildRiskResult({ database, target }) {
    const risk = database.painPoints.find((item) => item.id === target.riskId) ?? database.painPoints[0];
    const createdAt = new Date().toISOString();
    const base = {
      id: `${target.id}-${Date.now()}`,
      jobId: target.id,
      missionId: target.missionId,
      riskId: risk.id,
      createdAt,
    };

    if (target.type === 'simulation') {
      const simulatedLoss = Math.round(risk.score * 1.8);
      const optimizedLoss = Math.round(simulatedLoss * 0.58);
      const avoided = simulatedLoss - optimizedLoss;
      return {
        summary: `simulacao ${risk.name}: reduzir perda proxy de ${simulatedLoss} para ${optimizedLoss}`,
        simulation: {
          ...base,
          title: `Simulacao: ${risk.name}`,
          scenario: risk.signal,
          before: `Resposta reativa: vistoria e decisao apos consolidacao do dano; perda proxy ${simulatedLoss}.`,
          optimization: [
            risk.agentAction,
            'Classificar municipio/cultura por score antes da janela critica.',
            'Priorizar fila de vistoria remota antes de deslocar equipe.',
          ],
          after: `Resposta otimizada: alerta, triagem e acao por severidade; perda proxy ${optimizedLoss}.`,
          avoidedLossProxy: avoided,
          severity: risk.score,
        },
      };
    }

    if (target.type === 'report') {
      return {
        summary: `relatorio ${risk.name}: acao preventiva consolidada`,
        report: {
          ...base,
          title: `Relatorio preventivo: ${risk.name}`,
          thesis: risk.impact,
          findings: [
            risk.signal,
            `Criticidade ${risk.criticality} com score ${risk.score}.`,
            `Dependencia operacional: ${target.focus}.`,
          ],
          nextActions: [
            risk.agentAction,
            'Converter sinal em regra de fila no dashboard.',
            'Reavaliar resultado no proximo heartbeat.',
          ],
        },
      };
    }

    return {
      summary: `inteligencia ${risk.name}: ${risk.agentAction}`,
      contribution: {
        ...base,
        title: `Contribuicao: ${risk.name}`,
        insight: risk.impact,
        evidence: risk.signal,
        recommendation: risk.agentAction,
        chart: {
          label: risk.name,
          value: risk.score,
          kind: risk.criticality,
        },
      },
    };
  }

  async executeCommand(task) {
    const { exec } = await import('node:child_process');
    const util = await import('node:util');
    const execPromise = util.promisify(exec);
    const fs = await import('node:fs');
    const path = await import('node:path');

    let command = task.trim();
    const missionMatch = command.match(/missao:\s*(.+?)\.\s*Criterio:/i);
    if (missionMatch) {
      command = missionMatch[1].trim();
    }

    const lowerCommand = command.toLowerCase();
    const desktop = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop');

    if (lowerCommand.includes('cria') && lowerCommand.includes('arquivo') && lowerCommand.includes('.md')) {
      const fileMatch = command.match(/chamado\s+(\S+)/i);
      if (fileMatch) {
        const fileName = fileMatch[1].replace(/\.md$/i, '') + '.md';
        const filePath = path.join(desktop, fileName);
        const content = command.includes('preencha') ? `# ${fileName}\n\nGerado por LUCA-AI em ${new Date().toLocaleString('pt-BR')}\n\nMissao executada com sucesso.` : '';
        fs.writeFileSync(filePath, content, 'utf8');
        return { success: true, output: `Arquivo criado: ${filePath}` };
      }
    }

    if (lowerCommand.includes('novo arquivo') || lowerCommand.includes('new file') || lowerCommand.includes('criar arquivo')) {
      const fileName = `luca_task_${Date.now()}.md`;
      const filePath = path.join(desktop, fileName);
      const content = `# ${fileName}\n\nGerado por LUCA-AI em ${new Date().toLocaleString('pt-BR')}\n\nMissao executada com sucesso.`;
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, output: `Arquivo criado: ${filePath}` };
    }

    if (lowerCommand.startsWith('powershell') || lowerCommand.startsWith('cmd') || lowerCommand.startsWith('node') || lowerCommand.startsWith('dir') || lowerCommand.startsWith('ls') || lowerCommand.startsWith('echo') || lowerCommand.startsWith('new-item') || lowerCommand.startsWith('set-content') || lowerCommand.startsWith('add-content') || lowerCommand.startsWith('get-content') || lowerCommand.startsWith('remove-item') || lowerCommand.startsWith('copy-item') || lowerCommand.startsWith('move-item')) {
      try {
        const { stdout, stderr } = await execPromise(command, {
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          env: { ...process.env, LUCA_TASK: 'true' },
        });
        return { success: !stderr, output: stdout || stderr };
      } catch (error) {
        return { success: false, output: error.message };
      }
    }

    const psCommand = `powershell -NoProfile -Command "${command.replace(/"/g, '`"')}"`;
    try {
      const { stdout, stderr } = await execPromise(psCommand, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, LUCA_TASK: 'true' },
      });
      return { success: !stderr, output: stdout || stderr };
    } catch (error) {
      return { success: false, output: error.message };
    }
  }
}
