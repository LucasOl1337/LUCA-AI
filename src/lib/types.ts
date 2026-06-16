// Tipos do contrato do backend LUCA-AI (server/state.js getState()).
// Mantidos propositalmente permissivos: o backend evolui e o front degrada com
// segurança via defaults.

export interface AgentEntry {
  id: string;
  role: string;
  name: string;
  status: string;
  enabled?: boolean;
  model?: string;
  lines: string[];
}

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
  lastError?: string | null;
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
  participants: Array<{
    slug: string;
    name: string;
    model?: string;
  }>;
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
  generatedAt: string;
}

export interface RuntimeEvent {
  id: string;
  type: string;
  time?: string | null;
  timestamp?: string | null;
  ts?: number;
  source?: string | null;
  missionId?: string | null;
  goalId?: string | null;
  traceId?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface Mission {
  title?: string;
  description?: string;
  success?: string;
  activatedAt?: string;
  context?: unknown;
  realtimeFeed?: unknown[];
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  agentId?: string;
  agentName: string;
  type: string;
  content: string;
  timestamp: string;
}

export interface MissionFinding {
  title?: string;
  detail?: string;
  basis?: string;
  importance?: string;
}

export interface MissionFinalReport {
  summary?: string;
  findings?: MissionFinding[];
  [key: string]: unknown;
}

export interface DatabaseLayerRaw {
  status?: string;
  dashboardVisibility?: string;
  rule?: string;
  title?: string;
  items?: DatabaseItem[];
}

export interface DatabaseItem {
  id?: string;
  label?: string;
  title?: string;
  type?: string;
  status?: string;
  importedAt?: string;
  payload?: Record<string, unknown>;
  publicView?: {
    plainSummary?: string;
    whyItMatters?: string;
    clearInformation?: string | string[];
    viewerQuestions?: string | string[];
    approvedLinks?: { label: string; target: string }[];
  };
  [key: string]: unknown;
}

export interface DatabaseState {
  source?: { name?: string; topic?: string };
  layers?: {
    rawResearch?: DatabaseLayerRaw;
    processing?: DatabaseLayerRaw;
    dashboardIntegration?: DatabaseLayerRaw;
  };
  heartbeat?: { agentId: string; status?: string; state?: string; note?: string; time?: string }[];
  reliableSources?: { label: string; url: string; use?: string }[];
  simulations?: { title: string; path: string; scenario?: string; thesis?: string }[];
  methods?: { title: string; id: string; objective?: string }[];
  procedures?: { title: string; id: string; trigger?: string }[];
  reports?: { title: string; path: string; thesis?: string }[];
  [key: string]: unknown;
}

export interface HeartbeatMonitor {
  service?: string;
  status?: string;
  updatedAt?: string | null;
  intervalSeconds?: number;
  summary?: string;
  governance?: GovernanceSummary;
  [key: string]: unknown;
}

export interface GovernanceSummary {
  source?: string;
  runtime?: string;
  provider?: string;
  liveMissionConcurrency?: string;
  irreversibleActions?: string;
  missionConcurrency?: {
    blocked?: boolean;
    unmatchedCount?: number;
    latestUnmatched?: {
      missionId?: string | null;
      title?: string | null;
      timestamp?: string | null;
    } | null;
  };
  destructiveGuards?: string[];
  irreversibleActionList?: string[];
  shellAccess?: boolean;
  filesystemWriteAccess?: boolean;
  requiredPreflightEndpoints?: string[];
  defaultBudget?: {
    maxIterations?: number;
    maxSeconds?: number;
    maxToolCalls?: number;
  };
  rules?: string[];
  summaryLines?: string[];
  summaryText?: string;
  [key: string]: unknown;
}

export interface TemporaryDashboard {
  title?: string;
  subtitle?: string;
  layout?: string;
  fallback?: boolean;
  sourceAgentId?: string;
  updatedAt?: string;
  metrics?: { label: string; value: string | number }[];
  panels?: { title: string; body: string }[];
  blocks?: DashboardBlockData[];
  [key: string]: unknown;
}

export interface DashboardBlockData {
  type?: string;
  title?: string;
  value?: string | number;
  body?: string;
  items?: unknown[];
}

export interface ScheduledMission {
  id: string;
  title?: string;
  description?: string;
  success?: string;
  status?: string;
  cron?: string;
  nextRun?: string;
  [key: string]: unknown;
}

export interface GoalEntry {
  id: string;
  title: string;
  description?: string;
  definitionOfDone?: string;
  status: string;
  origin?: string;
  priority?: number;
  maxIterations?: number;
  maxSeconds?: number;
  maxToolCalls?: number;
  iterations?: number;
  toolCalls?: number;
  tokensUsed?: number;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
}

export interface ArchivedMission {
  id: string;
  status?: string;
  reason?: string;
  archivedAt?: string;
  mission?: Mission | null;
  run?: MissionRun | null;
  dashboard?: TemporaryDashboard | null;
  evidence?: unknown[];
  chatMessages?: ChatMessage[];
  agents?: AgentEntry[];
}

export interface MissionRun {
  id?: string;
  status?: string;
  intent?: string;
  phase?: string;
  progressLabel?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  attempts?: number | null;
  finalReport?: MissionFinalReport | null;
  [key: string]: unknown;
}

export interface LucaState {
  supervisorMode: string;
  activeMission: Mission | null;
  activeRun: MissionRun | null;
  missionHistory: ArchivedMission[];
  temporaryDashboard: TemporaryDashboard | null;
  database: DatabaseState;
  heartbeatLogs: string[];
  globalChatMessages: ChatMessage[];
  scheduledMissions: ScheduledMission[];
  missionQueue: unknown[];
  goals?: GoalEntry[];
  governance?: GovernanceSummary;
  personaAgents: PersonaAgentEntry[];
  agents: AgentEntry[];
  heartbeatMonitor?: HeartbeatMonitor | null;
}

export interface MissionConcurrencyLock {
  blocked: boolean;
  unmatchedCount?: number;
  latestUnmatched?: {
    missionId?: string | null;
    title?: string | null;
    timestamp?: string | null;
  } | null;
}

export type BackendEvent =
  | { type: 'mission.activated'; mission: Mission; time: string }
  | { type: 'chat.message'; message: ChatMessage }
  | { type: 'agent.output'; [key: string]: unknown }
  | { type: 'agent.status'; [key: string]: unknown }
  | { type: string; [key: string]: unknown };

export type WsPayload =
  | { kind: 'state'; state: LucaState }
  | { kind: 'event'; event: BackendEvent };
