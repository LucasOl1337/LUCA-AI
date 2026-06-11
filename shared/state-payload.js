import { buildGovernanceSummary } from './governance.js';
import { normalizePublicMissionState } from './public-state.js';
import { formatBrazilTime } from './time.js';

function compactMission(mission) {
  if (!mission || typeof mission !== 'object') return null;
  return {
    id: mission.id,
    title: mission.title,
    description: mission.description,
    success: mission.success,
    activatedAt: mission.activatedAt,
    completedAt: mission.completedAt,
  };
}

function compactRun(run) {
  if (!run || typeof run !== 'object') return null;
  return {
    id: run.id,
    status: run.status,
    completedAt: run.completedAt,
  };
}

export function compactArchivedMission(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  return {
    id: entry.id,
    reason: entry.reason,
    status: entry.status,
    archivedAt: entry.archivedAt,
    completedAt: entry.completedAt,
    mission: compactMission(entry.mission),
    run: compactRun(entry.run),
  };
}

function normalizeChatTimestamp(message) {
  if (!message || typeof message !== 'object') return message;
  const timestampSource = message.createdAt || message.timestamp;
  if (!timestampSource || Number.isNaN(Date.parse(timestampSource))) return message;
  return {
    ...message,
    timestamp: formatBrazilTime(timestampSource),
  };
}

function formatLegacyUtcTimeAsBrazil(timestamp) {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(String(timestamp || ''));
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  const date = new Date(Date.UTC(2026, 5, 11, Number(hours), Number(minutes), Number(seconds)));
  return formatBrazilTime(date);
}

function stateUsesCloudRuntime(state) {
  return state?.heartbeatMonitor?.service === 'luca-ai-cloud'
    || state?.database?.source?.name === 'GLM 5.1 runtime';
}

function normalizeChatMessage(message, { convertLegacyUtcTime = false } = {}) {
  const normalized = normalizeChatTimestamp(message);
  if (!convertLegacyUtcTime || normalized !== message) return normalized;
  const legacyTime = formatLegacyUtcTimeAsBrazil(message?.timestamp);
  return legacyTime ? { ...message, timestamp: legacyTime } : message;
}

export function serializePublicState(state) {
  if (!state || typeof state !== 'object') return state;
  const convertLegacyUtcTime = stateUsesCloudRuntime(state);
  return normalizePublicMissionState({
    ...state,
    globalChatMessages: Array.isArray(state.globalChatMessages)
      ? state.globalChatMessages.map((message) => normalizeChatMessage(message, { convertLegacyUtcTime }))
      : [],
    missionHistory: Array.isArray(state.missionHistory)
      ? state.missionHistory.map(compactArchivedMission)
      : [],
  });
}

export function buildPublicStateSnapshot(state, { heartbeatMonitor = null, events = [], now, missionLockTimeoutMs } = {}) {
  if (!state || typeof state !== 'object') return state;
  const governance = buildGovernanceSummary({
    ...(state.governance && typeof state.governance === 'object' ? state.governance : {}),
    events,
    now,
    missionLockTimeoutMs,
  });
  const nextHeartbeatMonitor = heartbeatMonitor
    ? {
        ...heartbeatMonitor,
        governance,
      }
    : state.heartbeatMonitor
      ? {
          ...state.heartbeatMonitor,
          governance,
        }
      : null;

  return serializePublicState({
    ...state,
    governance,
    heartbeatMonitor: nextHeartbeatMonitor,
  });
}
