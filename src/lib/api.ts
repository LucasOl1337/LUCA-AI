import type { LucaState } from './types';
import { buildApiErrorMessage, requestJson } from './requestTimeout';

const apiBase = typeof window !== 'undefined' ? window.location.origin : '';
const STATE_REQUEST_TIMEOUT_MS = 8000;
const ACTION_REQUEST_TIMEOUT_MS = 20000;

export function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export async function fetchState(): Promise<LucaState | null> {
  try {
    return await requestJson(`${apiBase}/api/state`, {
      timeoutMs: STATE_REQUEST_TIMEOUT_MS,
    }) as LucaState;
  } catch {
    return null;
  }
}

export async function apiPost<T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return requestJson(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: ACTION_REQUEST_TIMEOUT_MS,
  });
}

export { buildApiErrorMessage };

// ─── Ações do contrato (server/index.js) ───
export const lucaApi = {
  activateMission: (mission: { title: string; description: string; success: string }) =>
    apiPost('/api/mission/activate', mission),
  resetMission: () => apiPost('/api/mission/reset'),
  startSupervisor: () => apiPost('/api/supervisor/start'),
  pauseSupervisor: () => apiPost('/api/supervisor/pause'),
  runAgent: (agentId: string) => apiPost('/api/agent/run', { agentId }),
  startHeartbeat: () => apiPost('/api/heartbeat/start'),
  pauseHeartbeat: () => apiPost('/api/heartbeat/pause'),
  clearAgents: () => apiPost('/api/agents/clear'),
  sendChatMessage: (content: string) => apiPost('/api/tools/global-chat/message', { content }),
  runHarnessSmoke: () => apiPost('/api/harness/smoke'),
  cancelSchedule: (scheduleId: string) => apiPost('/api/schedule/cancel', { scheduleId }),
  pauseSchedule: (scheduleId: string) => apiPost('/api/schedule/pause', { scheduleId }),
  resumeSchedule: (scheduleId: string) => apiPost('/api/schedule/resume', { scheduleId }),
};
