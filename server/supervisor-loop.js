export class SupervisorLoop {
  constructor({ store, bus, agents, heartbeatMs }) {
    this.store = store;
    this.bus = bus;
    this.agents = agents;
    this.heartbeatMs = heartbeatMs;
    this.timer = null;
    this.tick = 0;
    this.lastWatchLogTick = 0;
  }

  isRunning() {
    return Boolean(this.timer);
  }

  async start() {
    if (this.timer) return;
    await this.agents.setStatus('supervisor', 'running');
    await this.agents.write('supervisor', '[loop] heartbeat started');
    this.timer = setInterval(() => {
      this.step().catch((error) => {
        this.bus.emit('error', { scope: 'supervisor.step', message: error.message });
      });
    }, this.heartbeatMs);
    await this.step();
  }

  async pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.agents.setStatus('supervisor', 'paused');
    await this.agents.write('supervisor', '[loop] heartbeat paused');
  }

  async reset() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.tick = 0;
    this.lastWatchLogTick = 0;
    await this.agents.setStatus('supervisor', 'standby');
    await this.agents.write('supervisor', '[reset] environment cleared');
  }

  async step() {
    const mission = await this.store.getActiveMission();
    this.tick += 1;
    const riskTail = await this.store.tailAgentLog('riscos-campo', 8);
    const summary = await this.store.readSummary();
    const plannerAgent = this.agents.get('planejador');
    const riskAgent = this.agents.get('riscos-campo');
    const blocked = riskAgent?.status === 'blocked';

    if (blocked) {
      await this.agents.write('supervisor', '[blocked] riscos-campo blocked; pausing heartbeat');
      await this.pause();
      this.bus.emit('mission.blocked', { reason: 'riscos-campo blocked' });
      return;
    }

    const database = await this.store.databaseSnapshot();
    const nextJob = await this.store.nextQueuedJob();
    const decision = this.decide({ mission, riskTail, summary, database, nextJob, plannerAgent });

    if (decision.actions.length) {
      await this.agents.write('supervisor', `[tick ${String(this.tick).padStart(4, '0')}] ${decision.summary}`);
    }
    await this.applyDecision(decision);
    await this.store.appendDecision(decision);
    if (mission) await this.store.updateSummary(decision.memory_update);
    if (decision.actions.length) {
      await this.store.appendHeartbeat({
        agentId: 'supervisor',
        tick: this.tick,
        state: decision.state,
        note: decision.summary,
      });
    }
    this.bus.emit('supervisor.decision', { decision });
  }

  decide({ mission, riskTail, summary, database, nextJob, plannerAgent }) {
    const risk = this.agents.get('riscos-campo');
    const riskBusy = risk && ['running', 'blocked'].includes(risk.status);
    const plannerBusy = plannerAgent && ['running', 'blocked'].includes(plannerAgent.status);
    const missionLabel = mission?.title ?? database.source.topic;
    const manualEmptyDatabase = database.schemaVersion >= 2
      && (database.layers?.processing?.items ?? []).length === 0
      && (database.layers?.dashboardIntegration?.items ?? []).length === 0
      && (database.jobs ?? []).length === 0;

    if (manualEmptyDatabase) {
      return {
        state: 'manual-database-empty',
        summary: 'manual database empty; waiting for curated layer 2 inputs',
        actions: [],
        memory_update: `${summary}\n\nSupervisor tick ${this.tick}: database manual zerado; aguardando preenchimento curado da camada 2.`.trim(),
        next_heartbeat_ms: this.heartbeatMs,
      };
    }

    if (nextJob && !riskBusy) {
      return {
        state: 'continue',
        summary: `dispatch ${nextJob.id} to riscos-campo`,
        actions: [
          {
            type: 'send_to_executor',
            target: 'riscos-campo',
            jobId: nextJob.id,
            message: `Execute job ${nextJob.id}: ${nextJob.title}. Escopo: ${nextJob.focus}. Contexto: ${missionLabel}`,
          },
        ],
        memory_update: `${summary}\n\nSupervisor tick ${this.tick}: riscos-campo recebeu ${nextJob.id}.`.trim(),
        next_heartbeat_ms: this.heartbeatMs,
      };
    }

    if (!nextJob && !riskBusy && !plannerBusy && (database.autonomousMissions ?? []).length > 0) {
      return {
        state: 'complete',
        summary: 'field-loss prevention case cycle completed',
        actions: [
          {
            type: 'pause_supervisor',
          },
        ],
        memory_update: `${summary}\n\nSupervisor tick ${this.tick}: ciclo do caso de prevencao concluido; supervisor pausado para evitar backlog artificial.`.trim(),
        next_heartbeat_ms: this.heartbeatMs,
      };
    }

    if (!nextJob && !riskBusy && !plannerBusy) {
      return {
        state: 'plan',
        summary: 'request planner missions for field-loss prevention',
        actions: [
          {
            type: 'send_to_executor',
            target: 'planejador',
            message: `Crie missoes reais para prevencao de sinistro no campo. Contexto: ${missionLabel}`,
          },
        ],
        memory_update: `${summary}\n\nSupervisor tick ${this.tick}: planejador recebeu pedido de novas missoes de prevencao.`.trim(),
        next_heartbeat_ms: this.heartbeatMs,
      };
    }

    return {
      state: 'continue',
      summary: `watching database: ${database.metrics.painPoints} riscos, ${database.metrics.veryHigh} muito altos`,
      actions: [],
      memory_update: `${summary}\n\nSupervisor tick ${this.tick}: observando database e riscos de campo.`.trim(),
      next_heartbeat_ms: this.heartbeatMs,
    };
  }

  async applyDecision(decision) {
    for (const action of decision.actions) {
      if (action.type === 'send_to_executor') {
        await this.agents.write('supervisor', `[send] ${action.target} <- ${action.message}`);
        if (action.jobId) {
          await this.store.updateJob(action.jobId, { status: 'running', startedAt: new Date().toISOString() });
        }
        await this.agents.sendToExecutor(action.target, action.message);
      }
      if (action.type === 'pause_supervisor') {
        await this.pause();
      }
    }
  }
}
