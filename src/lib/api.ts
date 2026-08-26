import type {
  LucaAiChatAttachment,
  LucaAiChatLibraryResponse,
  LucaAiChatSession,
  LucaAiChatSessionShareResponse,
  LucaAiIndividualDepth,
  LucaAiPersonaTeamRunProgress,
  LucaAiPersonaTeamRunAccepted,
  LucaAiPersonaTeamRunResponse,
  LucaAiPersonaTeamRunStatus,
  LucaAiTeamTemplatesResponse,
  LucaAiWorkflowAssignment,
  LucaState,
  PersonaAgentEntry,
  RouterModelsResponse,
  RuntimeEvent,
  SompoTelemetryHistoryResponse,
  SompoTelemetryResponse,
  SompoTelemetrySimulationRecordResponse,
  YumePersonaSummary,
} from './types';
import { buildApiErrorMessage, requestJson } from './requestTimeout';
import {
  PersonaRunWatchError,
  startAndWatchPersonaTeamRun,
  watchPersonaTeamRun,
} from '../../shared/persona-run-watch.js';
// @ts-expect-error -- shared helper stays in plain JS so node:test can import without transpilation.
import { isTransientRequestError } from '../../shared/request-timeout.js';

const apiBase = typeof window !== 'undefined' ? window.location.origin : '';
const STATE_REQUEST_TIMEOUT_MS = 8000;
const ACTION_REQUEST_TIMEOUT_MS = 20000;
/** Aceite do job: borda pode hesitar sob carga; ainda deve ser bem abaixo do 524 (~100s). */
const PERSONA_RUN_START_TIMEOUT_MS = 45_000;
const PERSONA_RUN_POLL_TIMEOUT_MS = 12_000;
const PERSONA_RUN_POLL_INTERVAL_MS = 750;
const PERSONA_RUN_MAX_WAIT_MS = 30 * 60 * 1000;
/** Só desiste do acompanhamento se a borda ficar instável por este período seguido. */
const PERSONA_RUN_MAX_CONSECUTIVE_ERROR_MS = 3 * 60 * 1000;

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

export async function apiPut<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
  base = apiBase,
  timeoutMs = ACTION_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return requestJson(apiUrl(path, base), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function startPersonaTeamRun(
  body: Record<string, unknown>,
  base = apiBase,
  onProgress?: (progress: LucaAiPersonaTeamRunProgress) => void,
): Promise<LucaAiPersonaTeamRunResponse> {
  const result = await startAndWatchPersonaTeamRun({
    traceId: String(body.traceId || ''),
    startRun: () => apiPost<LucaAiPersonaTeamRunAccepted>(
      '/api/luca-ai/persona-team/run',
      body,
      base,
      PERSONA_RUN_START_TIMEOUT_MS,
    ),
    getStatus: (runId: string) => apiGet<LucaAiPersonaTeamRunStatus>(
      `/api/luca-ai/persona-team/runs/${encodeURIComponent(runId)}`,
      PERSONA_RUN_POLL_TIMEOUT_MS,
      base,
    ),
    maxWaitMs: PERSONA_RUN_MAX_WAIT_MS,
    pollIntervalMs: PERSONA_RUN_POLL_INTERVAL_MS,
    maxConsecutiveErrorMs: PERSONA_RUN_MAX_CONSECUTIVE_ERROR_MS,
    isTransient: isTransientRequestError,
    onProgress,
    wait,
  });
  return result as LucaAiPersonaTeamRunResponse;
}

async function startPersonaTeamRunResume(
  input: { runId: string; traceId?: string },
  base = apiBase,
  onProgress?: (progress: LucaAiPersonaTeamRunProgress) => void,
): Promise<LucaAiPersonaTeamRunResponse> {
  const runId = String(input.runId || '').trim();
  if (!runId) throw new Error('runId ausente para retomar a rodada.');
  const result = await watchPersonaTeamRun({
    runId,
    traceId: String(input.traceId || runId),
    getStatus: (id: string) => apiGet<LucaAiPersonaTeamRunStatus>(
      `/api/luca-ai/persona-team/runs/${encodeURIComponent(id)}`,
      PERSONA_RUN_POLL_TIMEOUT_MS,
      base,
    ),
    maxWaitMs: PERSONA_RUN_MAX_WAIT_MS,
    pollIntervalMs: PERSONA_RUN_POLL_INTERVAL_MS,
    maxConsecutiveErrorMs: PERSONA_RUN_MAX_CONSECUTIVE_ERROR_MS,
    isTransient: isTransientRequestError,
    onProgress,
    wait,
  });
  return result as LucaAiPersonaTeamRunResponse;
}

export { buildApiErrorMessage, PersonaRunWatchError, isTransientRequestError };

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
  listPersonas: (base?: string, timeoutMs = ACTION_REQUEST_TIMEOUT_MS) =>
    apiGet<{ ok: boolean; personas: YumePersonaSummary[] }>('/api/personas/available', timeoutMs, base),
  importYumePersona: (slug: string, base?: string) =>
    apiPost<{ ok: boolean; agent: PersonaAgentEntry | null }>('/api/agent/persona/add', { slug }, base),
  removeYumePersona: (slug: string, base?: string) =>
    apiPost<{ ok: boolean; removed: boolean }>('/api/agent/persona/remove', { slug }, base),
  setAgentConfig: (agentId: string, patch: { enabled?: boolean; model?: string }, base?: string) =>
    apiPost<{ ok: boolean; agent: PersonaAgentEntry | Record<string, unknown> }>('/api/agent/config', { agentId, ...patch }, base),
  listRouterModels: (base?: string, timeoutMs = ACTION_REQUEST_TIMEOUT_MS) =>
    apiGet<RouterModelsResponse>('/api/router/models', timeoutMs, base),
  getSompoTelemetry: (base?: string, timeoutMs = 8_000) =>
    apiGet<SompoTelemetryResponse>('/api/sompo/telemetry', timeoutMs, base),
  getSompoTelemetryHistory: (
    params: { fonte?: string; janelaMin?: number; trator?: string } = {},
    timeoutMs = 8_000,
    base?: string,
  ) =>
    apiGet<SompoTelemetryHistoryResponse>(
      `/api/sompo/telemetry/history${queryString({
        fonte: params.fonte,
        janelaMin: params.janelaMin,
        trator: params.trator,
      })}`,
      timeoutMs,
      base,
    ),
  postSompoTelemetrySimulation: (
    samples: Record<string, unknown>[],
    base?: string,
    timeoutMs = ACTION_REQUEST_TIMEOUT_MS,
  ) =>
    apiPost<SompoTelemetrySimulationRecordResponse>(
      '/api/sompo/telemetry/simulation',
      { samples },
      base,
      timeoutMs,
    ),
  listTeamTemplates: (base?: string, timeoutMs = ACTION_REQUEST_TIMEOUT_MS) =>
    apiGet<LucaAiTeamTemplatesResponse>('/api/luca-ai/team-templates', timeoutMs, base),
  createTeamTemplate: (kind: 'team' | 'individual', template: Record<string, unknown>, base?: string) =>
    apiPost<LucaAiTeamTemplatesResponse>('/api/luca-ai/team-templates', { kind, template }, base),
  updateTeamTemplate: (kind: 'team' | 'individual', id: string, template: Record<string, unknown>, base?: string) =>
    apiPut<LucaAiTeamTemplatesResponse>(`/api/luca-ai/team-templates/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { template }, base),
  deleteTeamTemplate: (kind: 'team' | 'individual', id: string, base?: string) =>
    apiDelete<LucaAiTeamTemplatesResponse>(`/api/luca-ai/team-templates/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, base),
  reorderTeamTemplates: (kind: 'team' | 'individual', ids: string[], base?: string) =>
    apiPut<LucaAiTeamTemplatesResponse>(`/api/luca-ai/team-templates/${encodeURIComponent(kind)}/order`, { ids }, base),
  runLucaAiPersonaTeam: (
    mission: string,
    slugs: string[],
    workflow?: LucaAiWorkflowAssignment[],
    traceId?: string,
    base?: string,
    modelOverrides?: Record<string, string>,
    sessionId?: string,
    attachmentIds: string[] = [],
    domain?: string,
    domainOverride?: boolean,
    onProgress?: (progress: LucaAiPersonaTeamRunProgress) => void,
  ) =>
    startPersonaTeamRun(
      { mission, slugs, workflow, traceId, modelOverrides, sessionId, attachmentIds, domain, domainOverride },
      base,
      onProgress,
    ),
  runLucaAiIndividualResolution: (
    mission: string,
    slugs: string[],
    judgeSlug: string,
    traceId?: string,
    base?: string,
    modelOverrides?: Record<string, string>,
    sessionId?: string,
    attachmentIds: string[] = [],
    depth?: LucaAiIndividualDepth,
    visualSlug?: string,
    domain?: string,
    domainOverride?: boolean,
    onProgress?: (progress: LucaAiPersonaTeamRunProgress) => void,
  ) =>
    startPersonaTeamRun(
      { mission, mode: 'individual', slugs, judgeSlug, visualSlug: visualSlug || undefined, traceId, modelOverrides, sessionId, attachmentIds, depth, domain, domainOverride },
      base,
      onProgress,
    ),
  /** Retoma o acompanhamento de um job já aceito (F5 / flap de borda). */
  resumePersonaTeamRun: (
    runId: string,
    traceId?: string,
    base?: string,
    onProgress?: (progress: LucaAiPersonaTeamRunProgress) => void,
  ) => startPersonaTeamRunResume({ runId, traceId }, base, onProgress),
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
  uploadChatAttachment: (sessionId: string, file: File, base = apiBase) =>
    requestJson(apiUrl(`/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}/attachments`, base), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        'X-File-Type': file.type || 'application/octet-stream',
      },
      body: file,
      timeoutMs: 60_000,
    }) as Promise<{ ok: boolean; attachment: LucaAiChatAttachment }>,
  deleteChatAttachment: (sessionId: string, attachmentId: string, base?: string) =>
    apiDelete<{ ok: boolean; id: string }>(
      `/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`,
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
