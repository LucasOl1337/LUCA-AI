export interface PersonaAgentEntry {
  id: string;
  slug: string;
  source: 'yume' | string;
  name: string;
  model?: string;
  enabled?: boolean;
  cachedVersion?: number | null;
  cachedSystemPrompt?: string | null;
  cachedAt?: string | null;
  addedAt?: string;
}

export interface YumePersonaSummary {
  slug: string;
  name: string;
  model?: string;
  description?: string;
  purpose?: string;
  avatar_url?: string;
  avatarUrl?: string;
  version?: number | null;
  updated_at?: string | null;
  imported: boolean;
}

export interface LucaAiPersonaTeamReply {
  ok: boolean;
  slug: string;
  name: string;
  model?: string;
  version?: number | null;
  cached?: boolean;
  stale?: boolean;
  content?: string;
  error?: string;
  workflowRoleId?: string;
  workflowRoleLabel?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface LucaAiWorkflowAssignment {
  roleId: string;
  slugs: string[];
}

export interface LucaAiPersonaTeamStep {
  id: string;
  roleId: string;
  roleLabel: string;
  participants: Array<{ slug: string; name: string; model?: string }>;
  replies: LucaAiPersonaTeamReply[];
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface LucaAiPersonaTeamRunResponse {
  ok: boolean;
  traceId?: string;
  mission: string;
  mode?: 'parallel' | 'workflow' | string;
  team: Array<{
    slug: string;
    name: string;
    model?: string;
    version?: number | null;
    cached?: boolean;
    stale?: boolean;
    error?: string | null;
  }>;
  replies: LucaAiPersonaTeamReply[];
  steps?: LucaAiPersonaTeamStep[];
  finalDisplay?: {
    roleId: string;
    roleLabel: string;
    slug: string;
    name: string;
    model?: string;
    content?: string;
  } | null;
  startedAt?: string;
  durationMs?: number;
  generatedAt: string;
}

export interface RuntimeEvent {
  id: string;
  type: string;
  time?: string | null;
  timestamp?: string | null;
  ts?: number;
  source?: string | null;
  traceId?: string | null;
  payload?: Record<string, unknown> | null;
}
