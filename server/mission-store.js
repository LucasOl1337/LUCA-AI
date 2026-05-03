import fs from 'node:fs/promises';
import path from 'node:path';

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
    try {
      await fs.access(this.databaseStateFile);
    } catch {
      const database = await this.readResearchDatabase();
      await fs.writeFile(
        this.databaseStateFile,
        JSON.stringify({
          updatedAt: new Date().toISOString(),
          jobs: database.jobs,
          lastCompletedJobId: null,
        }, null, 2),
        'utf8',
      );
    }
  }

  async readDatabaseState() {
    await this.ensureDatabaseState();
    return JSON.parse(await fs.readFile(this.databaseStateFile, 'utf8'));
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
    const state = await this.readDatabaseState();
    const stateById = new Map((state.jobs ?? []).map((job) => [job.id, job]));
    return {
      ...database,
      jobs: database.jobs.map((job) => ({ ...job, ...(stateById.get(job.id) ?? {}) })),
      heartbeat: await this.tailHeartbeat(),
    };
  }

  async nextQueuedJob() {
    const state = await this.readDatabaseState();
    return (state.jobs ?? []).find((job) => job.status === 'queued' || job.status === 'watching') ?? null;
  }

  async updateJob(jobId, patch) {
    const state = await this.readDatabaseState();
    const jobs = (state.jobs ?? []).map((job) => (job.id === jobId ? { ...job, ...patch } : job));
    await this.writeDatabaseState({ ...state, jobs, lastCompletedJobId: patch.status === 'done' ? jobId : state.lastCompletedJobId });
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
