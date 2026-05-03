import fs from 'node:fs/promises';
import path from 'node:path';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'mission';
}

export class MissionStore {
  constructor({ lucaDir }) {
    this.lucaDir = lucaDir;
    this.rootDir = path.dirname(lucaDir);
    this.missionsDir = path.join(lucaDir, 'missions');
    this.agentsDir = path.join(lucaDir, 'agents');
    this.databaseFile = path.join(this.rootDir, 'data', 'research-dashboard.json');
    this.databaseStateFile = path.join(lucaDir, 'database-state.json');
    this.heartbeatFile = path.join(lucaDir, 'heartbeat.jsonl');
    this.activeMissionId = null;
    this.databaseMutation = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.missionsDir, { recursive: true });
    await fs.mkdir(this.agentsDir, { recursive: true });
    await this.ensureAgentMemory('supervisor', 'Supervisor memory starts empty.');
    await this.ensureAgentMemory('riscos-campo', 'Riscos de campo memory starts empty.');
    await this.ensureDatabaseState();
  }

  async ensureAgentMemory(agentId, initialText) {
    const file = path.join(this.agentsDir, `${agentId}.md`);
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, `${initialText}\n`, 'utf8');
    }
  }

  async createMission(mission) {
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${slugify(mission.title)}`;
    const dir = this.getMissionDir(id);
    const savedMission = {
      id,
      title: mission.title.trim(),
      description: mission.description ?? '',
      context: mission.context ?? '',
      success: mission.success ?? '',
      constraints: mission.constraints ?? '',
      status: 'active',
      createdAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
    };

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'mission.json'), JSON.stringify(savedMission, null, 2), 'utf8');
    await fs.writeFile(path.join(dir, 'summary.md'), `# ${savedMission.title}\n\nNo summary yet.\n`, 'utf8');
    await fs.writeFile(path.join(dir, 'events.jsonl'), '', 'utf8');
    await fs.writeFile(path.join(dir, 'decisions.jsonl'), '', 'utf8');
    this.activeMissionId = id;
    return savedMission;
  }

  getMissionDir(id = this.activeMissionId) {
    return path.join(this.missionsDir, id ?? 'no-active-mission');
  }

  async getActiveMission() {
    if (!this.activeMissionId) return null;
    const file = path.join(this.getMissionDir(), 'mission.json');
    return JSON.parse(await fs.readFile(file, 'utf8'));
  }

  clearActiveMission() {
    this.activeMissionId = null;
  }

  async clearAllAgentLogs() {
    const agentIds = ['supervisor', 'riscos-campo'];
    for (const agentId of agentIds) {
      const logFile = path.join(this.agentsDir, `${agentId}.log`);
      try {
        await fs.writeFile(logFile, '', 'utf8');
      } catch {
        // ignore if file doesn't exist
      }
    }
  }

  async appendEvent(event) {
    if (!this.activeMissionId) return;
    await fs.appendFile(
      path.join(this.getMissionDir(), 'events.jsonl'),
      `${JSON.stringify(event)}\n`,
      'utf8',
    );
  }

  async appendDecision(decision) {
    if (!this.activeMissionId) return;
    await fs.appendFile(
      path.join(this.getMissionDir(), 'decisions.jsonl'),
      `${JSON.stringify({ time: new Date().toISOString(), ...decision })}\n`,
      'utf8',
    );
  }

  async appendAgentLog(agentId, line) {
    if (!this.activeMissionId) return;
    await fs.appendFile(path.join(this.getMissionDir(), `${agentId}.log`), `${line}\n`, 'utf8');
  }

  async tailAgentLog(agentId, limit = 40) {
    if (!this.activeMissionId) return [];
    try {
      const text = await fs.readFile(path.join(this.getMissionDir(), `${agentId}.log`), 'utf8');
      return text.trim().split('\n').filter(Boolean).slice(-limit);
    } catch {
      return [];
    }
  }

  async readSummary() {
    if (!this.activeMissionId) return '';
    try {
      return await fs.readFile(path.join(this.getMissionDir(), 'summary.md'), 'utf8');
    } catch {
      return '';
    }
  }

  async updateSummary(text) {
    if (!this.activeMissionId) return;
    await fs.writeFile(path.join(this.getMissionDir(), 'summary.md'), `${text.trim()}\n`, 'utf8');
  }

  async readResearchDatabase() {
    return JSON.parse(await fs.readFile(this.databaseFile, 'utf8'));
  }

  async ensureDatabaseState() {
    const database = await this.readResearchDatabase();
    try {
      await fs.access(this.databaseStateFile);
    } catch (error) {
      await fs.writeFile(
        this.databaseStateFile,
        JSON.stringify({
          updatedAt: new Date().toISOString(),
          cycle: 0,
          jobs: database.jobs,
          autonomousMissions: [],
          contributions: [],
          simulations: [],
          reports: [],
          truthSources: [],
          methods: [],
          procedures: [],
          lastCompletedJobId: null,
        }, null, 2),
        'utf8',
      );
      return;
    }

    let current = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        current = JSON.parse(await fs.readFile(this.databaseStateFile, 'utf8'));
        break;
      } catch {
        await sleep(25);
      }
    }
    if (!current) throw new Error('database state unreadable');

    const migrated = {
      cycle: current.cycle ?? 0,
      jobs: current.jobs ?? database.jobs,
      autonomousMissions: current.autonomousMissions ?? [],
      contributions: current.contributions ?? [],
      simulations: current.simulations ?? [],
      reports: current.reports ?? [],
      truthSources: current.truthSources ?? [],
      methods: current.methods ?? [],
      procedures: current.procedures ?? [],
      lastCompletedJobId: current.lastCompletedJobId ?? null,
      updatedAt: current.updatedAt ?? new Date().toISOString(),
    };
    const needsMigration = ['cycle', 'jobs', 'autonomousMissions', 'contributions', 'simulations', 'reports', 'truthSources', 'methods', 'procedures', 'lastCompletedJobId']
      .some((key) => current[key] === undefined);
    if (needsMigration) await this.writeDatabaseState(migrated);
  }

  async readDatabaseState() {
    await this.ensureDatabaseState();
    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const text = await fs.readFile(this.databaseStateFile, 'utf8');
        if (!text.trim()) throw new Error('empty database state');
        return JSON.parse(text);
      } catch (error) {
        lastError = error;
        await sleep(25);
      }
    }
    throw lastError;
  }

  async writeDatabaseState(state) {
    await fs.writeFile(
      this.databaseStateFile,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  }

  async databaseSnapshot() {
    const database = await this.readResearchDatabase();
    await this.ensureContinuousBacklog();
    const nextState = await this.readDatabaseState();
    const stateById = new Map((nextState.jobs ?? []).map((job) => [job.id, job]));
    const liveJobs = (nextState.jobs ?? database.jobs).map((job) => ({ ...job, ...(stateById.get(job.id) ?? {}) }));
    const state = await this.readDatabaseState();
    return {
      ...database,
      metrics: {
        ...database.metrics,
        activeJobs: liveJobs.filter((job) => job.status === 'queued' || job.status === 'running').length,
        completedJobs: liveJobs.filter((job) => job.status === 'done').length,
        autonomousMissions: (state.autonomousMissions ?? []).length,
        contributions: (state.contributions ?? []).length,
        simulations: (state.simulations ?? []).length,
        reports: (state.reports ?? []).length,
        truthSources: (state.truthSources ?? []).length,
        methods: (state.methods ?? []).length,
        procedures: (state.procedures ?? []).length,
      },
      jobs: liveJobs,
      autonomousMissions: state.autonomousMissions ?? [],
      contributions: state.contributions ?? [],
      simulations: state.simulations ?? [],
      reports: state.reports ?? [],
      truthSources: state.truthSources ?? [],
      methods: state.methods ?? [],
      procedures: state.procedures ?? [],
      heartbeat: await this.tailHeartbeat(),
    };
  }

  async nextQueuedJob() {
    await this.ensureContinuousBacklog();
    const state = await this.readDatabaseState();
    return (state.jobs ?? []).find((job) => job.status === 'queued' || job.status === 'watching') ?? null;
  }

  async updateJob(jobId, patch) {
    return this.mutateDatabaseState(async (state) => {
      const jobs = (state.jobs ?? []).map((job) => (job.id === jobId ? { ...job, ...patch } : job));
      return { ...state, jobs, lastCompletedJobId: patch.status === 'done' ? jobId : state.lastCompletedJobId };
    });
  }

  async completeJob(jobId, result) {
    return this.mutateDatabaseState(async (state) => {
      const job = (state.jobs ?? []).find((item) => item.id === jobId);
      const jobs = (state.jobs ?? []).map((item) => (
        item.id === jobId
          ? { ...item, status: 'done', lastRunAt: new Date().toISOString(), lastSignal: result.summary }
          : item
      ));
      const missionId = job?.missionId ?? null;
      const autonomousMissions = (state.autonomousMissions ?? []).map((mission) => {
        if (mission.id !== missionId) return mission;
        const missionJobs = jobs.filter((item) => item.missionId === missionId);
        const done = missionJobs.length > 0 && missionJobs.every((item) => item.status === 'done');
        return {
          ...mission,
          status: done ? 'done' : 'running',
          completedAt: done ? new Date().toISOString() : mission.completedAt,
        };
      });

      return {
        ...state,
        jobs,
        autonomousMissions,
        contributions: result.contribution ? [result.contribution, ...(state.contributions ?? [])].slice(0, 40) : (state.contributions ?? []),
        simulations: result.simulation ? [result.simulation, ...(state.simulations ?? [])].slice(0, 24) : (state.simulations ?? []),
        reports: result.report ? [result.report, ...(state.reports ?? [])].slice(0, 24) : (state.reports ?? []),
        truthSources: result.truthSource ? [result.truthSource, ...(state.truthSources ?? [])].slice(0, 40) : (state.truthSources ?? []),
        methods: result.method ? [result.method, ...(state.methods ?? [])].slice(0, 40) : (state.methods ?? []),
        procedures: result.procedure ? [result.procedure, ...(state.procedures ?? [])].slice(0, 40) : (state.procedures ?? []),
        lastCompletedJobId: jobId,
      };
    });
  }

  async ensureContinuousBacklog() {
    let createdMission = null;
    await this.mutateDatabaseState(async (state) => {
      const hasOpenJob = (state.jobs ?? []).some((job) => job.status === 'queued' || job.status === 'watching' || job.status === 'running');
      if (hasOpenJob) return state;

      const database = await this.readResearchDatabase();
      const cycle = (state.cycle ?? 0) + 1;
      const topRisk = database.painPoints[(cycle - 1) % database.painPoints.length];
      const secondaryRisk = database.painPoints[cycle % database.painPoints.length];
      const missionId = `auto-${String(cycle).padStart(4, '0')}-${topRisk.id}`;
      createdMission = {
        id: missionId,
        title: `prevenir ${topRisk.name.toLowerCase()}`,
        status: 'queued',
        createdAt: new Date().toISOString(),
        scope: topRisk.impact,
        success: 'gerar contribuicao, simulacao e relatorio acionavel para prevencao de risco Sompo',
      };
      const jobs = [
        {
          id: `${missionId}-intel`,
          missionId,
          title: `conteudo util: ${topRisk.name}`,
          type: 'intelligence',
          cadence: 'heartbeat',
          owner: 'riscos-campo',
          status: 'queued',
          focus: topRisk.agentAction,
          riskId: topRisk.id,
        },
        {
          id: `${missionId}-sim`,
          missionId,
          title: `simulacao real: ${topRisk.name}`,
          type: 'simulation',
          cadence: 'heartbeat',
          owner: 'riscos-campo',
          status: 'queued',
          focus: `simular ${topRisk.signal} e otimizar resposta operacional`,
          riskId: topRisk.id,
        },
        {
          id: `${missionId}-report`,
          missionId,
          title: `relatorio preventivo: ${topRisk.name}`,
          type: 'report',
          cadence: 'heartbeat',
          owner: 'riscos-campo',
          status: 'queued',
          focus: `consolidar ${topRisk.name} com dependencia cruzada: ${secondaryRisk.name}`,
          riskId: topRisk.id,
        },
        {
          id: `${missionId}-source`,
          missionId,
          title: `fonte da verdade: ${topRisk.name}`,
          type: 'source',
          cadence: 'heartbeat',
          owner: 'riscos-campo',
          status: 'queued',
          focus: `definir indicadores, evidencias e campos mestres para ${topRisk.name}`,
          riskId: topRisk.id,
        },
        {
          id: `${missionId}-method`,
          missionId,
          title: `metodo de lucro e qualidade: ${topRisk.name}`,
          type: 'method',
          cadence: 'heartbeat',
          owner: 'riscos-campo',
          status: 'queued',
          focus: `otimizar margem tecnica, TAT e qualidade de servico em ${topRisk.name}`,
          riskId: topRisk.id,
        },
        {
          id: `${missionId}-procedure`,
          missionId,
          title: `procedimento operacional: ${topRisk.name}`,
          type: 'procedure',
          cadence: 'heartbeat',
          owner: 'riscos-campo',
          status: 'queued',
          focus: `criar rotina executavel para equipe/corretor/produtor em ${topRisk.name}`,
          riskId: topRisk.id,
        },
      ];

      return {
        ...state,
        cycle,
        jobs: [...(state.jobs ?? []), ...jobs].slice(-60),
        autonomousMissions: [createdMission, ...(state.autonomousMissions ?? [])].slice(0, 30),
      };
    });
    if (createdMission) {
      await this.appendHeartbeat({
        agentId: 'supervisor',
        status: 'mission.setup',
        missionId: createdMission.id,
        note: createdMission.title,
      });
    }
  }

  async mutateDatabaseState(mutator) {
    const run = this.databaseMutation.then(async () => {
      const state = await this.readDatabaseState();
      const nextState = await mutator(state);
      await this.writeDatabaseState(nextState);
      return nextState;
    });
    this.databaseMutation = run.catch(() => {});
    return run;
  }

  async appendHeartbeat(entry) {
    const event = {
      time: new Date().toISOString(),
      ...entry,
    };
    await fs.appendFile(this.heartbeatFile, `${JSON.stringify(event)}\n`, 'utf8');
  }

  async tailHeartbeat(limit = 20) {
    try {
      const text = await fs.readFile(this.heartbeatFile, 'utf8');
      return text.trim().split('\n').filter(Boolean).slice(-limit).map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }
}
