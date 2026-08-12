import type {
  PersonaWorkflowAssignments,
  PersonaWorkflowRoleId,
} from '../../shared/persona-workflow.js';
import type { MissionDomain, MissionDomainSource } from '../../shared/mission-triage.js';
import type { MissionLedger } from '../../shared/mission-ledger.js';

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
  source: 'yume' | 'luca-builtin' | string;
  name: string;
  model?: string;
  enabled?: boolean;
  cachedVersion?: number | null;
  cachedSystemPrompt?: string | null;
  cachedAt?: string | null;
  lastError?: string | null;
  isOfficial?: boolean;
  addedAt?: string;
}

export interface YumePersonaSummary {
  slug: string;
  name: string;
  /** Motor efetivo no 9Router (override local, Yume se catálogo, ou default LUCA). */
  model?: string;
  /** Modelo declarado no Yume (pode estar fora do catálogo 9Router). */
  yumeModel?: string;
  /** Override persistido no estado local do LUCA. */
  localModel?: string;
  modelOverridden?: boolean;
  description?: string;
  purpose?: string;
  avatar_url?: string;
  avatarUrl?: string;
  is_official?: boolean;
  version?: number | null;
  updated_at?: string | null;
  imported: boolean;
  source?: 'yume' | 'luca-builtin' | 'cache' | string;
}

export interface RouterModelProfile {
  id: string;
  name: string;
  model: string;
  capabilities?: Record<string, unknown>;
}

export interface RouterModelsResponse {
  ok: boolean;
  provider: string;
  baseUrl?: string;
  profiles: RouterModelProfile[];
  routeIds: string[];
  capabilities?: Record<string, unknown>;
}

export type LucaAiIndividualDepth = 1 | 2 | 3;
export type LucaAiPersonaTeamPhase = 'blind' | 'revision' | 'consensus' | 'judge';
export type LucaAiMissionDomain = MissionDomain;
export type LucaAiMissionDomainSource = MissionDomainSource;
export type LucaAiMissionLedger = MissionLedger;

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
  phase?: LucaAiPersonaTeamPhase;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface LucaAiWorkflowAssignment {
  roleId: PersonaWorkflowRoleId;
  slugs: string[];
}

export interface LucaAiPersonaTeamStep {
  id: string;
  roleId: string;
  roleLabel: string;
  phase?: LucaAiPersonaTeamPhase;
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

export interface LucaAiChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'pdf' | 'text';
  size: number;
  createdAt?: string;
  url: string;
}

export interface LucaAiPersonaTeamRunResponse {
  ok: boolean;
  traceId?: string;
  mission: string;
  mode?: 'parallel' | 'workflow' | 'individual' | string;
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
  judge?: LucaAiPersonaTeamReply | null;
  steps?: LucaAiPersonaTeamStep[];
  finalDisplay?: {
    roleId: string;
    roleLabel: string;
    slug: string;
    name: string;
    model?: string;
    content?: string;
  } | null;
  visualPack?: LucaAiVisualPack | null;
  missionLedger?: LucaAiMissionLedger | null;
  domain?: LucaAiMissionDomain;
  domainSource?: LucaAiMissionDomainSource;
  consensus?: {
    outcome?: 'consensus' | 'dissent' | string;
    cycleCount?: number;
    board?: {
      seats?: Array<{
        label?: string;
        vote?: string;
        stance?: string;
        dissentReason?: string;
      }>;
    };
  } | null;
  attachments?: LucaAiChatAttachment[];
  generatedAt: string;
  /** Servidor recuperou o resultado da sessão após perder a memória do job. */
  recoveredFromSession?: boolean;
}

export interface LucaAiActivePersonaRun {
  runId: string;
  traceId: string;
  status: 'running' | 'failed' | string;
  startedAt: string;
  errorMessage?: string | null;
  errorCode?: string | null;
}

export interface LucaAiPersonaRunReceipt {
  runId: string;
  traceId: string;
  status: 'complete';
  startedAt: string;
  completedAt: string;
  ok: boolean;
}

export interface LucaAiPersonaTeamRunAccepted {
  ok: true;
  runId: string;
  traceId: string;
  status: 'running' | 'complete' | 'failed';
  startedAt: string;
  reused?: boolean;
}

export interface LucaAiPersonaTeamRunStatus {
  ok: boolean;
  runId: string;
  traceId: string;
  status: 'running' | 'complete' | 'failed';
  startedAt: string;
  completedAt?: string | null;
  result?: LucaAiPersonaTeamRunResponse | null;
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  } | null;
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

export interface LucaAiChatFolder {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LucaAiChatSessionShare {
  token: string;
  url: string;
  sessionId: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
}

export interface LucaAiChatSessionShareResponse {
  ok: boolean;
  share: LucaAiChatSessionShare | null;
  error?: string;
}

export interface LucaAiChatSessionSummary {
  id: string;
  title: string;
  folderId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  operationMode?: 'team' | 'individual' | string;
  messageCount?: number;
  preview?: string;
  deleted?: boolean;
  deletedAt?: string | null;
  archivedOnly?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  sourceSessionId?: string;
}

export interface LucaAiChatSession extends LucaAiChatSessionSummary {
  workflowAssignments?: Record<string, string[]>;
  individualAssignments?: {
    participants?: string[];
    judge?: string | null;
    visual?: string | null;
    visualEnabled?: boolean;
  };
  missionDraft?: string;
  draftAttachments?: LucaAiChatAttachment[];
  transcript?: Array<Record<string, unknown>>;
  finalResult?: Record<string, unknown> | null;
  visualPack?: LucaAiVisualPack | null;
  missionLedger?: LucaAiMissionLedger | null;
  missionDomain?: LucaAiMissionDomain | string | null;
  missionDomainOverride?: boolean;
  activePersonaSlug?: string | null;
  /** Rodada assíncrona em andamento (sobrevive a 524/F5). */
  activePersonaRun?: LucaAiActivePersonaRun | null;
  /** Recibo durável da última rodada, usado pelo lifecycle após restart. */
  lastPersonaRun?: LucaAiPersonaRunReceipt | null;
}

export interface LucaAiChatLibraryResponse {
  ok: boolean;
  folders: LucaAiChatFolder[];
  sessions: LucaAiChatSessionSummary[];
  activeSessionId?: string | null;
  activeSession?: LucaAiChatSession | null;
  session?: LucaAiChatSession | null;
  folder?: LucaAiChatFolder | null;
  createdReplacement?: boolean;
  stats?: LucaAiChatLibraryStats;
  error?: string;
}

export interface LucaAiChatLibraryStats {
  folderCount: number;
  sessionCount: number;
  messageCount: number;
  liveSessionCount?: number;
  deletedSessionCount?: number;
  archivedOnlyCount?: number;
  archiveRecordCount?: number;
}


export type LucaAiTeamTemplateAssignments = PersonaWorkflowAssignments;

export interface LucaAiVisualChartArtifact {
  id: string;
  kind: 'chart';
  title: string;
  type: 'pie' | 'tower' | 'line' | string;
  items: Array<{ label: string; value: number }>;
  rationale?: string;
  status?: string;
}

export interface LucaAiVisualReportArtifact {
  id: string;
  kind: 'report';
  title: string;
  markdown: string;
  status?: string;
}

export interface LucaAiVisualImageArtifact {
  id: string;
  kind: 'image';
  title: string;
  prompt?: string;
  aspectRatio?: string;
  style?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  model?: string;
  status?: string;
  error?: string;
}

export interface LucaAiVisualPack {
  status: 'skipped' | 'complete' | 'partial' | 'failed' | string;
  summary?: string;
  report?: LucaAiVisualReportArtifact | null;
  charts?: LucaAiVisualChartArtifact[];
  images?: LucaAiVisualImageArtifact[];
  imageEngine?: string | null;
  planSource?: string;
  /** True quando o runtime re-promptou a persona por JSON inválido. */
  retried?: boolean;
  /** True quando a imagem veio do infográfico SVG local (9Router sem provider). */
  localImageFallback?: boolean;
  errors?: Array<{ id?: string; error?: string }>;
  generatedAt?: string;
  reason?: string;
}

export interface LucaAiTeamTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  assignments: LucaAiTeamTemplateAssignments;
  models?: Record<string, string>;
}

export interface LucaAiIndividualTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  participants: string[];
  judge: string | null;
  models?: Record<string, string>;
}

export interface LucaAiTeamTemplatesResponse {
  ok: boolean;
  version?: number;
  team: LucaAiTeamTemplate[];
  individual: LucaAiIndividualTemplate[];
  kind?: 'team' | 'individual';
  template?: LucaAiTeamTemplate | LucaAiIndividualTemplate;
  list?: Array<LucaAiTeamTemplate | LucaAiIndividualTemplate>;
  deleted?: boolean;
  id?: string;
  message?: string;
  error?: string;
}
