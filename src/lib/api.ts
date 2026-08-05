import type {
  LucaAiChatLibraryResponse,
  LucaAiChatSession,
  LucaAiChatSessionShareResponse,
  LucaAiPersonaTeamRunResponse,
  LucaAiWorkflowAssignment,
  LucaState,
  PersonaAgentEntry,
  RouterModelsResponse,
  RuntimeEvent,
  YumePersonaSummary,
} from './types';
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

export async function apiPatch<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
  base = apiBase,
  timeoutMs = ACTION_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return requestJson(apiUrl(path, base), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs,
  });
}

export async function apiDelete<T = unknown>(
  path: string,
  base = apiBase,
  timeoutMs = ACTION_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return requestJson(apiUrl(path, base), {
    method: 'DELETE',
    timeoutMs,
  });
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
  setAgentConfig: (agentId: string, patch: { enabled?: boolean; model?: string }, base?: string) =>
    apiPost<{ ok: boolean; agent: PersonaAgentEntry | Record<string, unknown> }>('/api/agent/config', { agentId, ...patch }, base),
  listRouterModels: (base?: string, timeoutMs = ACTION_REQUEST_TIMEOUT_MS) =>
    apiGet<RouterModelsResponse>('/api/router/models', timeoutMs, base),
  runLucaAiPersonaTeam: (
    mission: string,
    slugs: string[],
    workflow?: LucaAiWorkflowAssignment[],
    traceId?: string,
    base?: string,
    modelOverrides?: Record<string, string>,
  ) =>
    apiPost<LucaAiPersonaTeamRunResponse>(
      '/api/luca-ai/persona-team/run',
      { mission, slugs, workflow, traceId, modelOverrides },
      base,
      180000,
    ),
  runLucaAiIndividualResolution: (
    mission: string,
    slugs: string[],
    judgeSlug: string,
    traceId?: string,
    base?: string,
    modelOverrides?: Record<string, string>,
  ) =>
    apiPost<LucaAiPersonaTeamRunResponse>(
      '/api/luca-ai/persona-team/run',
      { mission, mode: 'individual', slugs, judgeSlug, traceId, modelOverrides },
      base,
      180000,
    ),
  listEvents: (params: { traceId?: string; type?: string; limit?: number } = {}, base?: string) =>
    apiGet<{ ok: boolean; events: RuntimeEvent[] }>(`/api/events${queryString(params)}`, 8000, base),
  getChatLibrary: (base?: string) =>
    apiGet<LucaAiChatLibraryResponse>('/api/luca-ai/chat/library', 8000, base),
  createChatFolder: (name: string, base?: string) =>
    apiPost<LucaAiChatLibraryResponse>('/api/luca-ai/chat/folders', { name }, base),
  renameChatFolder: (folderId: string, name: string, base?: string) =>
    apiPatch<LucaAiChatLibraryResponse>(`/api/luca-ai/chat/folders/${encodeURIComponent(folderId)}`, { name }, base),
  deleteChatFolder: (folderId: string, cascadeSessions = false, base?: string) =>
    apiDelete<LucaAiChatLibraryResponse>(
      `/api/luca-ai/chat/folders/${encodeURIComponent(folderId)}${cascadeSessions ? '?cascade=1' : ''}`,
      base,
    ),
  createChatSession: (body: { title?: string; folderId?: string | null; seedFromActive?: boolean } = {}, base?: string) =>
    apiPost<LucaAiChatLibraryResponse>('/api/luca-ai/chat/sessions', body as Record<string, unknown>, base),
  getChatSession: (sessionId: string, base?: string) =>
    apiGet<{ ok: boolean; session: LucaAiChatSession }>(
      `/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}`,
      8000,
      base,
    ),
  updateChatSession: (sessionId: string, patch: Record<string, unknown>, base?: string) =>
    apiPatch<LucaAiChatLibraryResponse>(
      `/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}`,
      patch,
      base,
    ),
  activateChatSession: (sessionId: string, base?: string) =>
    apiPost<LucaAiChatLibraryResponse>(
      `/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}/activate`,
      {},
      base,
    ),
  deleteChatSession: (sessionId: string, base?: string) =>
    apiDelete<LucaAiChatLibraryResponse>(
      `/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}`,
      base,
    ),
  getChatSessionShare: (sessionId: string, base?: string) =>
    apiGet<LucaAiChatSessionShareResponse>(
      `/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}/share`,
      8000,
      base,
    ),
  createChatSessionShare: (sessionId: string, base?: string) =>
    apiPost<LucaAiChatSessionShareResponse>(
      `/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}/share`,
      {},
      base,
    ),
  revokeChatSessionShare: (sessionId: string, base?: string) =>
    apiDelete<LucaAiChatSessionShareResponse>(
      `/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}/share`,
      base,
    ),
};
