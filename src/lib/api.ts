import type {
  LucaAiPersonaTeamRunResponse,
  LucaAiWorkflowAssignment,
  PersonaAgentEntry,
  RuntimeEvent,
  YumePersonaSummary,
} from './types';
import { buildApiErrorMessage, requestJson } from './requestTimeout';

const ACTION_TIMEOUT_MS = 20000;

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const value = query.toString();
  return value ? `?${value}` : '';
}

function get<T>(path: string, timeoutMs = ACTION_TIMEOUT_MS): Promise<T> {
  return requestJson<T>(path, { timeoutMs });
}

function post<T>(path: string, body: Record<string, unknown>, timeoutMs = ACTION_TIMEOUT_MS): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs,
  });
}

export { buildApiErrorMessage };

export const lucaApi = {
  health: () => get<{ ok: boolean }>('/api/health', 4000),
  listYumePersonas: () => get<{ ok: boolean; personas: YumePersonaSummary[] }>('/api/personas/available'),
  importYumePersona: (slug: string) => post<{ ok: boolean; agent: PersonaAgentEntry | null }>('/api/agent/persona/add', { slug }),
  removeYumePersona: (slug: string) => post<{ ok: boolean; removed: boolean }>('/api/agent/persona/remove', { slug }),
  runLucaAiPersonaTeam: (mission: string, slugs: string[], workflow?: LucaAiWorkflowAssignment[], traceId?: string) =>
    post<LucaAiPersonaTeamRunResponse>('/api/luca-ai/persona-team/run', { mission, slugs, workflow, traceId }, 180000),
  listEvents: (params: { traceId?: string; type?: string; limit?: number } = {}) =>
    get<{ ok: boolean; events: RuntimeEvent[] }>(`/api/events${queryString(params)}`, 8000),
};
