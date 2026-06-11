const SETTLED_RUN_STATUSES = new Set(['completed', 'chat_completed', 'needs_revision', 'failed', 'cancelled']);

export function runIsSettled(status) {
  return SETTLED_RUN_STATUSES.has(String(status || ''));
}

export function normalizePublicMissionState(state) {
  if (!state || typeof state !== 'object') return state;
  if (!runIsSettled(state?.activeRun?.status)) return state;
  return {
    ...state,
    activeMission: null,
  };
}
