import type { LucaState } from './types';

const apiBase = typeof window !== 'undefined' ? window.location.origin : '';

export function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export async function fetchState(): Promise<LucaState | null> {
  try {
    const response = await fetch(`${apiBase}/api/state`);
    if (!response.ok) return null;
    return (await response.json()) as LucaState;
  } catch {
    return null;
  }
}

export async function apiPost<T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

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
  cancelSchedule: (id: string) => apiPost('/api/schedule/cancel', { id }),
  pauseSchedule: (id: string) => apiPost('/api/schedule/pause', { id }),
  resumeSchedule: (id: string) => apiPost('/api/schedule/resume', { id }),
};
