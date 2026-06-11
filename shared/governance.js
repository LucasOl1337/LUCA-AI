import { DEFAULT_GOAL_BUDGET } from './goals.js';

const FINAL_EVENT_TYPES = new Set(['mission.completed', 'mission.failed', 'mission.chat_completed', 'mission.archived']);
const DEFAULT_MISSION_LOCK_TIMEOUT_MS = 20 * 60 * 1000;

export const DEFAULT_GOVERNANCE_POLICY = {
  runtime: 'cloudflare-worker',
  provider: 'glm-5.1',
  liveMissionConcurrency: 'single_active_mission',
  irreversibleActions: 'blocked_without_operator',
  shellAccess: false,
  filesystemWriteAccess: false,
  requiredPreflightEndpoints: ['/api/health', '/api/state', '/api/events'],
  defaultBudget: DEFAULT_GOAL_BUDGET,
  destructiveGuards: ['rm -rf', 'format', 'shutdown/reboot', 'curl|sh'],
  irreversibleActionList: ['deploy em producao', 'mutacao de runtime publicado', 'missao live concorrente'],
};

function eventTimestampMs(event) {
  const explicit = Number(event?.ts);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const parsed = Date.parse(event?.timestamp || event?.time || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function summarizeMissionConcurrency(events = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : DEFAULT_MISSION_LOCK_TIMEOUT_MS;
  const latestResetTs = events.reduce((latest, event) => (
    event?.type === 'state.reset' ? Math.max(latest, eventTimestampMs(event)) : latest
  ), 0);
  const started = [];
  const completedIds = new Set();
  for (const event of events) {
    const eventTs = eventTimestampMs(event);
    if (event?.type === 'mission.started' && event?.missionId) {
      if (eventTs <= latestResetTs) continue;
      started.push({
        missionId: event.missionId,
        title: String(event?.payload?.title || 'missao'),
        timestamp: event?.timestamp || event?.time || null,
        ts: eventTs,
      });
    }
    if (FINAL_EVENT_TYPES.has(event?.type) && event?.missionId && eventTs > latestResetTs) {
      completedIds.add(event.missionId);
    }
  }
  const unmatchedStarts = started.filter((entry) => !completedIds.has(entry.missionId));
  const activeUnmatched = unmatchedStarts.filter((entry) => !entry.ts || (now - entry.ts) <= timeoutMs);
  const expiredUnmatched = unmatchedStarts.filter((entry) => entry.ts && (now - entry.ts) > timeoutMs);
  return {
    blocked: activeUnmatched.length > 0,
    unmatchedCount: activeUnmatched.length,
    latestUnmatched: activeUnmatched[0] || null,
    expiredCount: expiredUnmatched.length,
    latestExpired: expiredUnmatched[0] || null,
    lockTimeoutMs: timeoutMs,
  };
}

export function buildGovernanceSummary(overrides = {}) {
  const policy = {
    ...DEFAULT_GOVERNANCE_POLICY,
    ...overrides,
    defaultBudget: {
      ...DEFAULT_GOAL_BUDGET,
      ...(overrides.defaultBudget || {}),
    },
    destructiveGuards: Array.isArray(overrides.destructiveGuards)
      ? overrides.destructiveGuards
      : DEFAULT_GOVERNANCE_POLICY.destructiveGuards,
    irreversibleActionList: Array.isArray(overrides.irreversibleActionList)
      ? overrides.irreversibleActionList
      : DEFAULT_GOVERNANCE_POLICY.irreversibleActionList,
  };
  const missionConcurrency = summarizeMissionConcurrency(overrides.events || [], {
    now: overrides.now,
    timeoutMs: overrides.missionLockTimeoutMs,
  });
  const concurrencyLabel = missionConcurrency.blocked
    ? `blocked:${missionConcurrency.unmatchedCount}`
    : 'clear';
  const rules = [
    'Comandos destrutivos e execucao remota por pipe permanecem bloqueados por politica.',
    'Acoes irreversiveis so devem ocorrer depois de checks verdes e sem missao concorrente.',
    missionConcurrency.blocked
      ? 'Feed recente mostra mission.started sem fechamento correspondente; nao iniciar outra missao live.'
      : 'Nenhuma missao concorrente aberta detectada no feed recente.',
    'Segredos nao devem entrar em logs, payloads ou UI publica.',
  ];
  const lines = [
    `Runtime: ${policy.runtime}`,
    `Provider principal: ${policy.provider}`,
    `Concorrencia de missoes: ${concurrencyLabel}`,
    `Acoes irreversiveis: ${policy.irreversibleActionList.join(', ')}`,
    `Shell: ${policy.shellAccess ? 'permitido' : 'indisponivel no runtime cloud'}`,
    `Filesystem write: ${policy.filesystemWriteAccess ? 'permitido' : 'indisponivel no runtime cloud'}`,
    `Preflight obrigatorio: ${policy.requiredPreflightEndpoints.join(', ')}`,
    `Budget padrao: ${policy.defaultBudget.maxIterations} iteracoes / ${policy.defaultBudget.maxSeconds}s / ${policy.defaultBudget.maxToolCalls} tool calls`,
  ];

  return {
    runtime: policy.runtime,
    provider: policy.provider,
    liveMissionConcurrency: policy.liveMissionConcurrency,
    irreversibleActions: policy.irreversibleActions,
    shellAccess: policy.shellAccess,
    filesystemWriteAccess: policy.filesystemWriteAccess,
    requiredPreflightEndpoints: policy.requiredPreflightEndpoints,
    defaultBudget: policy.defaultBudget,
    destructiveGuards: policy.destructiveGuards,
    irreversibleActionList: policy.irreversibleActionList,
    missionConcurrency,
    summaryLines: lines,
    summaryText: lines.join(' | '),
    rules,
    source: 'tars-governance-pattern',
  };
}
