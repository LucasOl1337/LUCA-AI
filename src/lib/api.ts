import type { LucaAiPersonaTeamRunResponse, LucaAiWorkflowAssignment, LucaState, PersonaAgentEntry, RuntimeEvent, YumePersonaSummary } from './types';
import { buildApiErrorMessage, requestJson } from './requestTimeout';

const apiBase = typeof window !== 'undefined' ? window.location.origin : '';
const STATE_REQUEST_TIMEOUT_MS = 8000;
const ACTION_REQUEST_TIMEOUT_MS = 20000;

function apiUrl(path: string, base = apiBase): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

export function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export async function fetchState(): Promise<LucaState | null> {
  try {
    return await requestJson(apiUrl('/api/state'), {
      timeoutMs: STATE_REQUEST_TIMEOUT_MS,
    }) as LucaState;
  } catch {
    return null;
  }
}

export async function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
  base = apiBase,
  timeoutMs = ACTION_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return requestJson(apiUrl(path, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs,
  });
}

export async function apiGet<T = unknown>(path: string, timeoutMs = ACTION_REQUEST_TIMEOUT_MS, base = apiBase): Promise<T> {
  return requestJson(apiUrl(path, base), { timeoutMs });
}

function queryString(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const value = query.toString();
  return value ? `?${value}` : '';
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
  listYumePersonas: (base?: string, timeoutMs = ACTION_REQUEST_TIMEOUT_MS) =>
    apiGet<{ ok: boolean; personas: YumePersonaSummary[] }>('/api/personas/available', timeoutMs, base),
  importYumePersona: (slug: string, base?: string) =>
    apiPost<{ ok: boolean; agent: PersonaAgentEntry | null }>('/api/agent/persona/add', { slug }, base),
  removeYumePersona: (slug: string, base?: string) =>
    apiPost<{ ok: boolean; removed: boolean }>('/api/agent/persona/remove', { slug }, base),
  runLucaAiPersonaTeam: (mission: string, slugs: string[], workflow?: LucaAiWorkflowAssignment[], traceId?: string, base?: string) =>
    apiPost<LucaAiPersonaTeamRunResponse>('/api/luca-ai/persona-team/run', { mission, slugs, workflow, traceId }, base, 180000),
  listEvents: (params: { traceId?: string; type?: string; limit?: number } = {}, base?: string) =>
    apiGet<{ ok: boolean; events: RuntimeEvent[] }>(`/api/events${queryString(params)}`, 8000, base),
};
