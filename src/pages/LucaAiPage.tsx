import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquareText,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Scale,
  Share2,
  ShieldCheck,
  Target,
  Terminal,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { buildApiErrorMessage, lucaApi } from '@/lib/api';
import type {
  LucaAiChatAttachment,
  LucaAiChatSession,
  LucaAiChatSessionShare,
  LucaAiIndividualDepth,
  LucaAiPersonaTeamPhase,
  LucaAiPersonaTeamRunResponse,
  LucaAiVisualPack,
  LucaAiWorkflowAssignment,
  RouterModelProfile,
  RuntimeEvent,
  YumePersonaSummary,
} from '@/lib/types';
import {
  finalEntryFromPersonaRun,
  personaRunOperatorEntryId,
  transcriptEntriesFromPersonaRun,
} from '../../shared/persona-run-transcript.js';
import CopyLogButton from '@/components/CopyLogButton';
import DashboardBlock from '@/components/DashboardBlock';
import { useLuca } from '@/hooks/useLucaState';
import {
  LUCA_INDIVIDUAL_PRESETS,
  LUCA_TEAM_PRESETS,
  hydrateIndividualTemplate,
  hydrateTeamTemplate,
  individualPresetMatches,
  individualPresetSlugs,
  teamPresetMatches,
  teamPresetSlugs,
  type LucaIndividualPreset,
  type LucaTeamPreset,
} from '@/lib/lucaPresets';
import { useChatLibrary } from '@/hooks/useChatLibrary';
import { useTheme } from '@/hooks/useTheme';
import {
  consumeSompoLaunch,
  type SompoLaunchPayload,
} from '@/lib/sompo-cases';

const MAX_EXECUTORS = 4;
const LUCA_AI_CLEAN_UI_VERSION = 'session-isolation-v2';
const LUCA_AI_CLEAN_UI_STORAGE_KEY = 'luca.lucaAi.cleanUiVersion';
const LUCA_AI_ENTRY_MODE_STORAGE_KEY = 'luca.lucaAi.entryMode';
const LUCA_AI_LEGACY_LOCAL_KEYS = [
  'luca.lucaAi.operationMode',
  'luca.lucaAi.workflowAssignments',
  'luca.lucaAi.individualAssignments',
  'luca.lucaAi.missionDraft',
  'luca.lucaAi.transcript',
  'luca.lucaAi.finalResult',
  'luca.lucaAi.activePersonaSlug',
];

interface LucaAiPageProps {
  onNavigate: (page: 'personas' | 'sompo') => void;
}

type TranscriptRole = 'operator' | 'persona' | 'system';
type OperationMode = 'team' | 'individual';
type WorkflowRoleId = 'supervisor' | 'mission' | 'execution' | 'approval' | 'display' | 'visual';
type WorkflowAssignments = Record<WorkflowRoleId, string[]>;
type IndividualPickerId = 'participants' | 'judge';
type PickerTarget = { mode: 'team'; id: WorkflowRoleId } | { mode: 'individual'; id: IndividualPickerId };

function consumeEntryMode(): OperationMode | null {
  try {
    const value = window.sessionStorage.getItem(LUCA_AI_ENTRY_MODE_STORAGE_KEY);
    window.sessionStorage.removeItem(LUCA_AI_ENTRY_MODE_STORAGE_KEY);
    return value === 'individual' || value === 'team' ? value : null;
  } catch {
    return null;
  }
}

interface IndividualAssignments {
  participants: string[];
  judge: string | null;
}

interface PersonaPickerConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  multiple: boolean;
  maxSlugs: number;
  optional?: boolean;
}

interface WorkflowRoleConfig extends PersonaPickerConfig {
  id: WorkflowRoleId;
  /** Se true, vazio nao bloqueia canRun — etapa so roda quando preenchida. */
  optional?: boolean;
}

interface TeamTranscriptEntry {
  id: string;
  role: TranscriptRole;
  name: string;
  slug?: string;
  model?: string;
  stage?: string;
  phase?: LucaAiPersonaTeamPhase;
  content: string;
  status?: 'ok' | 'error' | 'info';
  timestamp: string;
  attachments?: LucaAiChatAttachment[];
}

type MessageBlock =
  | { kind: 'heading'; label: string; level: number }
  | { kind: 'bullet'; label?: string; body: string }
  | { kind: 'paragraph'; label?: string; body: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'code'; language?: string; body: string }
  | { kind: 'image'; alt: string; src: string };

interface InlineTextPart {
  text: string;
  strong: boolean;
}

const WORKFLOW_ROLES: WorkflowRoleConfig[] = [
  { id: 'supervisor', label: 'Supervisor', icon: ShieldCheck, multiple: false, maxSlugs: 1 },
  { id: 'mission', label: 'Decisor da missao', icon: Target, multiple: false, maxSlugs: 1 },
  { id: 'execution', label: 'Executores', icon: BrainCircuit, multiple: true, maxSlugs: MAX_EXECUTORS },
  { id: 'approval', label: 'Aprovacao', icon: ClipboardCheck, multiple: false, maxSlugs: 1 },
  { id: 'display', label: 'Exibicao final', icon: Eye, multiple: false, maxSlugs: 1 },
  { id: 'visual', label: 'Especialista visual', icon: ImageIcon, multiple: false, maxSlugs: 1, optional: true },
];

const REQUIRED_WORKFLOW_ROLES = WORKFLOW_ROLES.filter((role) => !role.optional);

const INDIVIDUAL_PICKER_CONFIGS: Record<IndividualPickerId, PersonaPickerConfig> = {
  participants: { id: 'participants', label: 'Participantes', icon: Users, multiple: true, maxSlugs: 5 },
  judge: { id: 'judge', label: 'Juiz', icon: Scale, multiple: false, maxSlugs: 1 },
};

const INDIVIDUAL_DEPTH_OPTIONS: Array<{ value: LucaAiIndividualDepth; label: string; description: string }> = [
  { value: 1, label: '1 Padrão', description: 'Respostas cegas e decisão do juiz.' },
  { value: 2, label: '2 Deliberação', description: 'Inclui revisão anônima antes do juiz.' },
  { value: 3, label: '3 Máx.', description: 'Mesmo protocolo, com orçamento máximo.' },
];

const INDIVIDUAL_PHASE_LABELS: Record<LucaAiPersonaTeamPhase, string> = {
  blind: 'Cega',
  revision: 'Revisão',
  judge: 'Juiz',
};

const ROLE_LABEL_BY_ID = new Map(WORKFLOW_ROLES.map((role) => [role.id, role.label]));

function createEmptyWorkflowAssignments(): WorkflowAssignments {
  return {
    supervisor: [],
    mission: [],
    execution: [],
    approval: [],
    display: [],
    visual: [],
  };
}

function uniqueSlugs(values: unknown[], limit = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const slug = String(value || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeWorkflowAssignments(value: Partial<Record<WorkflowRoleId, unknown>> | null | undefined): WorkflowAssignments {
  const next = createEmptyWorkflowAssignments();
  for (const role of WORKFLOW_ROLES) {
    const raw = value?.[role.id];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    next[role.id] = uniqueSlugs(list, role.maxSlugs);
  }
  return next;
}

function workflowAssignmentsEqual(a: WorkflowAssignments, b: WorkflowAssignments): boolean {
  return WORKFLOW_ROLES.every((role) => {
    const left = a[role.id];
    const right = b[role.id];
    return left.length === right.length && left.every((slug, index) => slug === right[index]);
  });
}

function flattenWorkflowAssignments(assignments: WorkflowAssignments): string[] {
  return uniqueSlugs(WORKFLOW_ROLES.flatMap((role) => assignments[role.id]));
}

function workflowReady(assignments: WorkflowAssignments): boolean {
  // visual e opcional: so as etapas obrigatorias precisam de persona
  return REQUIRED_WORKFLOW_ROLES.every((role) => assignments[role.id].length > 0);
}

function workflowPayload(assignments: WorkflowAssignments): LucaAiWorkflowAssignment[] {
  return WORKFLOW_ROLES.map((role) => ({
    roleId: role.id,
    slugs: assignments[role.id],
  }));
}

function withBaseUrl(value: string | undefined, base: string | undefined): string | undefined {
  const raw = String(value || '').trim();
  if (!raw || !base || /^https?:\/\//i.test(raw)) return raw || undefined;
  if (!raw.startsWith('/')) return raw;
  return `${base.replace(/\/+$/, '')}${raw}`;
}

function normalizePersonaAssetUrls(personas: YumePersonaSummary[], base: string | undefined): YumePersonaSummary[] {
  return personas.map((persona) => ({
    ...persona,
    avatarUrl: withBaseUrl(persona.avatarUrl, base),
    avatar_url: withBaseUrl(persona.avatar_url, base),
  }));
}

function nowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Coleta arquivos de clipboard ou drag-and-drop (imagem do print, etc.). */
function filesFromDataTransfer(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const fromList = Array.from(data.files || []).filter((file) => file && file.size > 0);
  if (fromList.length) return fromList;
  const fromItems: File[] = [];
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && file.size > 0) fromItems.push(file);
  }
  return fromItems;
}

/** Clipboard/OS às vezes entrega blob sem nome útil; normaliza para o upload. */
function nameClipboardFile(file: File, index: number): File {
  const rawName = String(file.name || '').trim();
  if (rawName && rawName !== 'blob') return file;
  const mime = String(file.type || '').toLowerCase();
  const ext = mime === 'image/jpeg' ? 'jpg'
    : mime === 'image/webp' ? 'webp'
      : mime === 'image/gif' ? 'gif'
        : mime.startsWith('image/') ? 'png'
          : 'bin';
  const base = mime.startsWith('image/') ? 'clipboard' : 'anexo';
  return new File([file], `${base}-${Date.now()}-${index + 1}.${ext}`, {
    type: file.type || (ext === 'png' ? 'image/png' : 'application/octet-stream'),
    lastModified: file.lastModified || Date.now(),
  });
}

/** Anexos preservados na bolha do operador, com miniatura para imagens. */
function AttachmentList({ attachments }: { attachments?: LucaAiChatAttachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="luca-ai-message-attachments">
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          className="luca-ai-attachment"
        >
          {attachment.kind === 'image' ? (
            <img src={attachment.url} alt={attachment.name} className="luca-ai-attachment-thumb" />
          ) : (
            <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">
            <strong>{attachment.name}</strong>
            <small>{formatAttachmentSize(attachment.size)}</small>
          </span>
        </a>
      ))}
    </div>
  );
}

function transcriptEntriesFromResponse(data: LucaAiPersonaTeamRunResponse): TeamTranscriptEntry[] {
  return transcriptEntriesFromPersonaRun(data) as TeamTranscriptEntry[];
}

function stripOuterMarkdown(value: string): string {
  return value
    .replace(/^\s*\*\*(.+?)\*\*\s*$/g, '$1')
    .replace(/^\s*__(.+?)__\s*$/g, '$1')
    .trim();
}

function parseLabelledText(value: string): { label?: string; body: string } {
  const text = value.trim();
  const boldMatch = text.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
  if (boldMatch) {
    return {
      label: stripOuterMarkdown(boldMatch[1]),
      body: boldMatch[2].trim(),
    };
  }

  const labelMatch = text.match(/^([^:]{2,48}):\s+(.+)$/);
  if (labelMatch) {
    return {
      label: stripOuterMarkdown(labelMatch[1]),
      body: labelMatch[2].trim(),
    };
  }

  return { body: text };
}

function parseMessageBlocks(value: string): MessageBlock[] {
  const lines = String(value || '').replace(/\r/g, '').split('\n');
  const blocks: MessageBlock[] = [];
  const markdownCells = (line: string) => line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => stripOuterMarkdown(cell.trim()));
  const isTableDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line || /^[-*_]{3,}$/.test(line)) {
      index += 1;
      continue;
    }

    const codeStart = line.match(/^```([\w-]+)?\s*$/);
    if (codeStart) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: 'code', language: codeStart[1], body: code.join('\n') });
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = markdownCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const row = lines[index].trim();
        if (!row || !row.includes('|')) break;
        rows.push(markdownCells(row));
        index += 1;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)$/i);
    if (image) {
      blocks.push({ kind: 'image', alt: image[1] || 'Imagem da entrega', src: image[2] });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: 'heading', label: stripOuterMarkdown(heading[2]), level: heading[1].length });
      index += 1;
      continue;
    }

    const bullet = line.match(/^(?:[-*]|•)\s+(.+)$/);
    const ordered = line.match(/^(\d+)[.)]\s+(.+)$/);
    const source = bullet ? bullet[1].trim() : ordered ? ordered[2].trim() : line;
    const labelled = parseLabelledText(source);
    const body = stripOuterMarkdown(labelled.body);

    if (bullet || ordered) {
      blocks.push({
        kind: 'bullet',
        label: ordered ? String(ordered[1]).padStart(2, '0') : labelled.label,
        body: body || labelled.label || source,
      });
      index += 1;
      continue;
    }

    if (labelled.label && !body) {
      blocks.push({ kind: 'heading', label: labelled.label, level: 3 });
    } else {
      blocks.push({ kind: 'paragraph', label: labelled.label, body: body || source });
    }
    index += 1;
  }

  return blocks.length ? blocks : [{ kind: 'paragraph', body: 'Sem conteúdo textual.' }];
}

function createEmptyIndividualAssignments(): IndividualAssignments {
  return { participants: [], judge: null };
}


function isTeamTranscriptEntry(value: unknown): value is TeamTranscriptEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as TeamTranscriptEntry;
  return typeof entry.id === 'string' && typeof entry.content === 'string' && typeof entry.role === 'string';
}

function inlineTextParts(value: string): InlineTextPart[] {
  const parts: InlineTextPart[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index), strong: false });
    }
    parts.push({ text: match[1], strong: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex), strong: false });
  }

  return parts.length ? parts : [{ text: value, strong: false }];
}

function compactText(value: unknown, maxLength = 220): string {
  const text = String(value ?? '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, ' ')
    .replace(/[-*_]{3,}/g, ' ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function runtimePayload(event: RuntimeEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === 'object' ? event.payload : {};
}

function runtimeEventSlug(event: RuntimeEvent): string {
  const payload = runtimePayload(event);
  return String(payload.slug || payload.personaSlug || '').trim();
}

function runtimeEventRoleId(event: RuntimeEvent): string {
  const payload = runtimePayload(event);
  return String(payload.roleId || '').trim();
}

function runtimeEventRoleLabel(event: RuntimeEvent): string {
  const payload = runtimePayload(event);
  return String(payload.roleLabel || ROLE_LABEL_BY_ID.get(runtimeEventRoleId(event) as WorkflowRoleId) || '').trim();
}

function runtimeEventTime(event: RuntimeEvent): string {
  const raw = event.time || event.timestamp;
  if (!raw) return '--:--';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function runtimeEventLabel(event: RuntimeEvent): string {
  if (event.type === 'luca_ai.workflow.started') return 'workflow iniciado';
  if (event.type === 'luca_ai.workflow.completed') return 'workflow concluido';
  if (event.type === 'luca_ai.workflow.step_started') return `etapa iniciou${runtimeEventRoleLabel(event) ? `: ${runtimeEventRoleLabel(event)}` : ''}`;
  if (event.type === 'luca_ai.workflow.step_completed') return `etapa concluiu${runtimeEventRoleLabel(event) ? `: ${runtimeEventRoleLabel(event)}` : ''}`;
  if (event.type === 'luca_ai.llm.requested') return 'LLM request';
  if (event.type === 'luca_ai.llm.completed') return 'LLM response';
  if (event.type === 'luca_ai.llm.failed') return 'LLM erro';
  if (event.type === 'luca_ai.ui.queued') return 'aguardando chamada';
  return event.type.replace(/^luca_ai\./, '').replace(/[_.]+/g, ' ');
}

function runtimeEventState(event: RuntimeEvent): 'running' | 'ok' | 'error' | 'info' {
  if (event.type.includes('failed')) return 'error';
  if (event.type.includes('completed')) return 'ok';
  if (event.type.includes('requested') || event.type.includes('started')) return 'running';
  return 'info';
}

function sortRuntimeEvents(events: RuntimeEvent[]): RuntimeEvent[] {
  return [...events].sort((a, b) => (Number(a.ts || Date.parse(String(a.time || ''))) || 0) - (Number(b.ts || Date.parse(String(b.time || ''))) || 0));
}

function createTraceId(): string {
  return nowId('luca-ai-trace');
}

function plannedRuntimeEvents(traceId: string, mission: string, assignments: WorkflowAssignments, personaBySlug: Map<string, YumePersonaSummary>): RuntimeEvent[] {
  const now = new Date().toISOString();
  const events: RuntimeEvent[] = [
    {
      id: `${traceId}-ui-started`,
      type: 'luca_ai.workflow.started',
      time: now,
      ts: Date.now(),
      source: 'luca-ai-ui',
      traceId,
      payload: {
        mode: 'workflow',
        missionSummary: compactText(mission, 260),
        teamSize: flattenWorkflowAssignments(assignments).length,
      },
    },
  ];

  for (const role of WORKFLOW_ROLES) {
    for (const slug of assignments[role.id]) {
      const persona = personaBySlug.get(slug);
      events.push({
        id: `${traceId}-ui-${role.id}-${slug}`,
        type: 'luca_ai.ui.queued',
        time: now,
        ts: Date.now(),
        source: 'luca-ai-ui',
        traceId,
        payload: {
          slug,
          name: persona?.name || slug,
          model: persona?.model || '',
          roleId: role.id,
          roleLabel: role.label,
          inputSummary: compactText(mission, 260),
        },
      });
    }
  }

  return events;
}

export default function LucaAiPage({ onNavigate }: LucaAiPageProps) {
  const { runtimeMode, refresh } = useLuca();
  const [personas, setPersonas] = useState<YumePersonaSummary[]>([]);
  const [routerProfiles, setRouterProfiles] = useState<RouterModelProfile[]>([]);
  const [teamPresets, setTeamPresets] = useState<LucaTeamPreset[]>(LUCA_TEAM_PRESETS);
  const [individualPresets, setIndividualPresets] = useState<LucaIndividualPreset[]>(LUCA_INDIVIDUAL_PRESETS);
  // Session-bound UI lives in React state + backend chat-library.
  // localStorage here would leak mission/transcript across sessions.
  const [operationMode, setOperationMode] = useState<OperationMode>('team');
  const [workflowState, setWorkflowState] = useState<WorkflowAssignments>(createEmptyWorkflowAssignments());
  const [individualState, setIndividualState] = useState<IndividualAssignments>(createEmptyIndividualAssignments());
  const [individualDepth, setIndividualDepth] = useState<LucaAiIndividualDepth>(1);
  const [mission, setMission] = useState<string>('');
  const [draftAttachments, setDraftAttachments] = useState<LucaAiChatAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [transcript, setTranscript] = useState<TeamTranscriptEntry[]>([]);
  const [finalResult, setFinalResult] = useState<TeamTranscriptEntry | null>(null);
  const [visualPack, setVisualPack] = useState<LucaAiVisualPack | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRetry, setErrorRetry] = useState<'personas' | 'run' | null>(null);
  const [activePersonaSlug, setActivePersonaSlug] = useState<string | null>(null);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [processEvents, setProcessEvents] = useState<RuntimeEvent[]>([]);
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<'result' | 'activity'>('result');
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [busyPersonaSlug, setBusyPersonaSlug] = useState<string | null>(null);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  // SHARE_LINKS_V1 — public read-only link for the active session.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareInfo, setShareInfo] = useState<LucaAiChatSessionShare | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSompoLaunchRef = useRef<SompoLaunchPayload | null>(null);
  const sompoPresetAppliedRef = useRef(false);
  const sompoAutoRunArmedRef = useRef(false);
  const [hydratedSessionId, setHydratedSessionId] = useState<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const latestPersistRef = useRef<{
    sessionId: string | null;
    payload: Record<string, unknown>;
  }>({ sessionId: null, payload: {} });

  // O frontend publicado e o runtime Express compartilham a mesma origem
  // através do Cloudflare Tunnel. Nunca tente acessar o loopback do visitante.
  const bridgeBase: string | undefined = undefined;
  const {
    ready: libraryReady,
    busy: sessionsBusy,
    activeSessionId,
    activeSession,
    persistSession,
    refresh: refreshChatLibrary,
  } = useChatLibrary();
  const boundSessionIdRef = useRef<string | null>(null);
  const runOwnerSessionIdRef = useRef<string | null>(null);
  const assignments = useMemo(() => normalizeWorkflowAssignments(workflowState), [workflowState]);
  const assignedSlugs = useMemo(() => flattenWorkflowAssignments(assignments), [assignments]);
  const individualAssignments = useMemo<IndividualAssignments>(() => ({
    participants: uniqueSlugs(Array.isArray(individualState?.participants) ? individualState.participants : [], 5),
    judge: String(individualState?.judge || '').trim() || null,
  }), [individualState]);
  const individualConfiguredSlugs = useMemo(() => uniqueSlugs([
    ...individualAssignments.participants,
    individualAssignments.judge,
  ]), [individualAssignments]);
  const configuredSlugs = operationMode === 'individual' ? individualConfiguredSlugs : assignedSlugs;
  const readyRoles = useMemo(
    () => REQUIRED_WORKFLOW_ROLES.filter((role) => assignments[role.id].length > 0).length,
    [assignments],
  );
  const requiredRoleCount = REQUIRED_WORKFLOW_ROLES.length;
  const isWorkflowReady = useMemo(() => workflowReady(assignments), [assignments]);
  const isIndividualReady = individualAssignments.participants.length > 0 && Boolean(individualAssignments.judge);

  const loadPersonas = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorRetry(null);
    try {
      const [data, models, templates] = await Promise.all([
        lucaApi.listYumePersonas(bridgeBase, bridgeBase ? 15000 : undefined),
        lucaApi.listRouterModels(bridgeBase, bridgeBase ? 15000 : undefined).catch(() => null),
        lucaApi.listTeamTemplates(bridgeBase, bridgeBase ? 15000 : undefined).catch(() => null),
      ]);
      setPersonas(normalizePersonaAssetUrls(data.personas ?? [], bridgeBase));
      if (models?.profiles?.length) setRouterProfiles(models.profiles);
      if (templates?.team) setTeamPresets(templates.team.map(hydrateTeamTemplate));
      if (templates?.individual) setIndividualPresets(templates.individual.map(hydrateIndividualTemplate));
    } catch (err) {
      const fallback = 'Falha ao carregar personas do Yume.';
      setError(buildApiErrorMessage(err, fallback));
      setErrorRetry('personas');
    } finally {
      setLoading(false);
    }
  }, [bridgeBase]);

  useEffect(() => {
    void loadPersonas();
  }, [loadPersonas]);

  const applySession = useCallback((session: LucaAiChatSession | null | undefined) => {
    setRunning(false);
    setProcessEvents([]);
    setActiveTraceId(null);
    setError(null);
    setErrorRetry(null);
    setPickerTarget(null);
    setActiveWorkspaceView('result');
    sompoPresetAppliedRef.current = false;
    sompoAutoRunArmedRef.current = false;
    if (!session) {
      boundSessionIdRef.current = null;
      setHydratedSessionId(null);
      const launch = consumeSompoLaunch();
      setOperationMode(launch?.mode || consumeEntryMode() || 'team');
      setMission(launch?.mission || '');
      setDraftAttachments([]);
      setTranscript([]);
      setFinalResult(null);
      setVisualPack(null);
      pendingSompoLaunchRef.current = launch;
      sompoAutoRunArmedRef.current = Boolean(launch?.autoRun);
      return;
    }
    boundSessionIdRef.current = session.id;
    const sessionMission = String(session.missionDraft || '').trim();
    const nextTranscript = ((Array.isArray(session.transcript) ? session.transcript : []) as unknown[])
      .filter(isTeamTranscriptEntry);
    const workspaceEmpty = !sessionMission && nextTranscript.length === 0;
    const launch = workspaceEmpty ? consumeSompoLaunch() : null;
    setOperationMode(launch?.mode || consumeEntryMode() || (session.operationMode === 'individual' ? 'individual' : 'team'));
    setWorkflowState(normalizeWorkflowAssignments(session.workflowAssignments || createEmptyWorkflowAssignments()));
    setIndividualState({
      participants: uniqueSlugs(session.individualAssignments?.participants || [], 5),
      judge: session.individualAssignments?.judge ? String(session.individualAssignments.judge) : null,
    });
    setMission(sessionMission || launch?.mission || '');
    setDraftAttachments(Array.isArray(session.draftAttachments) ? session.draftAttachments.slice(0, 4) : []);
    setTranscript(nextTranscript);
    setFinalResult(isTeamTranscriptEntry(session.finalResult) ? session.finalResult : null);
    setVisualPack(session.visualPack && typeof session.visualPack === 'object' ? session.visualPack as LucaAiVisualPack : null);
    setActivePersonaSlug(session.activePersonaSlug ? String(session.activePersonaSlug) : null);
    setHydratedSessionId(session.id);
    pendingSompoLaunchRef.current = launch;
    sompoAutoRunArmedRef.current = Boolean(launch?.autoRun);
  }, [setActivePersonaSlug, setFinalResult, setIndividualState, setMission, setOperationMode, setTranscript, setWorkflowState]);

  useEffect(() => {
    if (!libraryReady) return;
    if (!activeSessionId) {
      applySession(null);
      return;
    }
    // Wait for full session body without wiping the canvas. Clearing here made
    // F5 / session switch look like history vanished while the GET was in flight.
    if (!activeSession || activeSession.id !== activeSessionId) {
      return;
    }
    if (boundSessionIdRef.current === activeSession.id) return;
    // Flush previous session before binding the next body (session switch).
    const prev = latestPersistRef.current;
    if (
      boundSessionIdRef.current
      && prev.sessionId
      && prev.sessionId === boundSessionIdRef.current
      && prev.sessionId !== activeSession.id
    ) {
      void persistSession(prev.sessionId, prev.payload);
    }
    applySession(activeSession);
  }, [activeSession, activeSessionId, applySession, libraryReady, persistSession]);

  const buildPersistPayload = useCallback((overrides: Record<string, unknown> = {}) => ({
    operationMode,
    workflowAssignments: assignments,
    individualAssignments,
    missionDraft: mission,
    draftAttachments,
    activePersonaSlug,
    ...overrides,
  }), [
    activePersonaSlug,
    assignments,
    draftAttachments,
    individualAssignments,
    mission,
    operationMode,
  ]);

  const flushSessionNow = useCallback(async (
    sessionId: string | null | undefined,
    overrides: Record<string, unknown> = {},
  ) => {
    const id = String(sessionId || '').trim();
    if (!id || boundSessionIdRef.current !== id) return;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const payload = buildPersistPayload(overrides);
    latestPersistRef.current = { sessionId: id, payload };
    await persistSession(id, payload, { throwOnError: true });
  }, [buildPersistPayload, persistSession]);

  // SHARE_LINKS_V1 — reset panel when switching sessions.
  useEffect(() => {
    setShareOpen(false);
    setShareInfo(null);
    setShareError(null);
    setShareCopied(false);
  }, [activeSessionId]);

  const absoluteShareUrl = useCallback((share: LucaAiChatSessionShare | null) => {
    if (!share?.url) return '';
    try {
      return new URL(share.url, window.location.origin).toString();
    } catch {
      return share.url;
    }
  }, []);

  const toggleSharePanel = useCallback(async () => {
    if (shareOpen) {
      setShareOpen(false);
      return;
    }
    setShareOpen(true);
    setShareError(null);
    setShareCopied(false);
    if (!activeSessionId) return;
    setShareBusy(true);
    try {
      const data = await lucaApi.getChatSessionShare(activeSessionId, bridgeBase);
      setShareInfo(data.share ?? null);
    } catch (err) {
      setShareError(buildApiErrorMessage(err, 'Falha ao consultar o link de compartilhamento.'));
    } finally {
      setShareBusy(false);
    }
  }, [activeSessionId, bridgeBase, shareOpen]);

  const copyShareUrl = useCallback(async (share: LucaAiChatSessionShare | null) => {
    const url = absoluteShareUrl(share);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2200);
    } catch {
      setShareError('Não foi possível copiar automaticamente. Copie o link manualmente.');
    }
  }, [absoluteShareUrl]);

  const generateShare = useCallback(async () => {
    if (!activeSessionId || shareBusy) return;
    setShareBusy(true);
    setShareError(null);
    try {
      // Snapshot must include everything on screen: flush pending edits first.
      await flushSessionNow(activeSessionId);
      const data = await lucaApi.createChatSessionShare(activeSessionId, bridgeBase);
      setShareInfo(data.share ?? null);
      if (data.share) void copyShareUrl(data.share);
    } catch (err) {
      setShareError(buildApiErrorMessage(err, 'Falha ao gerar o link público.'));
    } finally {
      setShareBusy(false);
    }
  }, [activeSessionId, bridgeBase, copyShareUrl, flushSessionNow, shareBusy]);

  const revokeShare = useCallback(async () => {
    if (!activeSessionId || shareBusy) return;
    setShareBusy(true);
    setShareError(null);
    try {
      await lucaApi.revokeChatSessionShare(activeSessionId, bridgeBase);
      setShareInfo(null);
      setShareCopied(false);
    } catch (err) {
      setShareError(buildApiErrorMessage(err, 'Falha ao revogar o link.'));
    } finally {
      setShareBusy(false);
    }
  }, [activeSessionId, bridgeBase, shareBusy]);

  useEffect(() => {
    if (!libraryReady || !activeSessionId) return;
    if (boundSessionIdRef.current !== activeSessionId) return;
    latestPersistRef.current = {
      sessionId: activeSessionId,
      payload: buildPersistPayload(),
    };
  }, [activeSessionId, buildPersistPayload, libraryReady]);

  useEffect(() => {
    if (!libraryReady || !activeSessionId || sessionsBusy) return undefined;
    if (boundSessionIdRef.current !== activeSessionId) return undefined;
    if (hydratedSessionId !== activeSessionId) return undefined;
    // Debounce while typing/configuring. Run path also flushes immediately.
    // Do NOT gate on `running` — that blocked the only write path during long
    // team/individual runs, so F5 mid-run or right after lost the transcript.
    const sessionId = activeSessionId;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      if (boundSessionIdRef.current !== sessionId) return;
      const payload = buildPersistPayload();
      latestPersistRef.current = { sessionId, payload };
      void persistSession(sessionId, payload);
    }, 450);
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [
    activePersonaSlug,
    activeSessionId,
    assignments,
    buildPersistPayload,
    draftAttachments,
    hydratedSessionId,
    individualAssignments,
    libraryReady,
    mission,
    operationMode,
    persistSession,
    sessionsBusy,
  ]);

  useEffect(() => {
    function flushOnLeave() {
      const { sessionId, payload } = latestPersistRef.current;
      if (!sessionId || boundSessionIdRef.current !== sessionId) return;
      // keepalive survives tab close better than a cancelled fetch.
      try {
        void fetch(`/api/luca-ai/chat/sessions/${encodeURIComponent(sessionId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin',
          keepalive: true,
        });
      } catch {
        // ignore — best effort on unload
      }
    }
    window.addEventListener('pagehide', flushOnLeave);
    window.addEventListener('beforeunload', flushOnLeave);
    return () => {
      window.removeEventListener('pagehide', flushOnLeave);
      window.removeEventListener('beforeunload', flushOnLeave);
    };
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem(LUCA_AI_CLEAN_UI_STORAGE_KEY) === LUCA_AI_CLEAN_UI_VERSION) return;
    for (const key of LUCA_AI_LEGACY_LOCAL_KEYS) {
      try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    }
    // Only purge legacy localStorage keys. Never wipe React transcript here —
    // that raced applySession on first paint after F5 and blanked recovered chat.
    window.localStorage.setItem(LUCA_AI_CLEAN_UI_STORAGE_KEY, LUCA_AI_CLEAN_UI_VERSION);
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript.length, running, finalResult?.id]);

  const personaBySlug = useMemo(() => new Map(personas.map((persona) => [persona.slug, persona])), [personas]);

  useEffect(() => {
    if (!configuredSlugs.length) {
      if (activePersonaSlug) setActivePersonaSlug(null);
      return;
    }
    if (!activePersonaSlug || !configuredSlugs.includes(activePersonaSlug)) {
      setActivePersonaSlug(configuredSlugs[0]);
    }
  }, [activePersonaSlug, configuredSlugs, setActivePersonaSlug]);

  useEffect(() => {
    if (!activeTraceId || !running) return undefined;
    const traceId = activeTraceId;
    let cancelled = false;

    async function pollEvents() {
      try {
        const data = await lucaApi.listEvents({ traceId, limit: 120 }, bridgeBase);
        if (cancelled || !data.ok || !data.events?.length) return;
        setProcessEvents(sortRuntimeEvents(data.events));
      } catch {
        // O painel de eventos é auxiliar; falha de polling não deve afetar a rodada.
      }
    }

    void pollEvents();
    const interval = window.setInterval(() => void pollEvents(), 1200);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTraceId, bridgeBase, running]);

  useEffect(() => {
    if (loading || !personas.length) return;
    const rosterSet = new Set(personas.filter((persona) => persona.imported).map((persona) => persona.slug));
    setWorkflowState((prev) => {
      const normalized = normalizeWorkflowAssignments(prev);
      const next = createEmptyWorkflowAssignments();
      for (const role of WORKFLOW_ROLES) {
        next[role.id] = normalized[role.id]
          .filter((slug) => rosterSet.has(slug))
          .slice(0, role.maxSlugs);
      }
      return workflowAssignmentsEqual(normalized, next) ? prev : next;
    });
  }, [loading, personas, setWorkflowState]);

  useEffect(() => {
    if (loading || !personas.length) return;
    const rosterSet = new Set(personas.filter((persona) => persona.imported).map((persona) => persona.slug));
    setIndividualState((prev) => {
      const participants = uniqueSlugs(
        (Array.isArray(prev?.participants) ? prev.participants : []).filter((slug) => rosterSet.has(slug)),
        5,
      );
      const judge = rosterSet.has(String(prev?.judge || '')) ? String(prev.judge) : null;
      if (participants.join('|') === (prev?.participants || []).join('|') && judge === (prev?.judge || null)) return prev;
      return { participants, judge };
    });
  }, [loading, personas, setIndividualState]);

  // Anexo sozinho ja e uma mensagem valida ("olha esse arquivo").
  const canRun = (mission.trim().length > 0 || draftAttachments.length > 0)
    && (operationMode === 'individual' ? isIndividualReady : isWorkflowReady)
    && !running
    && !uploadingAttachment;

  async function addAttachments(files: FileList | File[] | null) {
    if (!files || !activeSessionId || running || uploadingAttachment) return;
    const available = Math.max(0, 4 - draftAttachments.length);
    const selected = Array.from(files)
      .filter((file) => file && file.size > 0)
      .slice(0, available)
      .map((file, index) => nameClipboardFile(file, index));
    if (!selected.length) {
      setError(Array.from(files || []).length
        ? 'Você pode anexar até 4 arquivos por mensagem.'
        : 'Nenhum arquivo válido para anexar.');
      setErrorRetry(null);
      return;
    }
    // Captura a sessão dona ANTES do await: trocar de sessão durante o upload
    // não pode empurrar o anexo para dentro da conversa nova.
    const ownerSessionId = activeSessionId;
    const stillOwner = () => boundSessionIdRef.current === ownerSessionId;
    setUploadingAttachment(true);
    setError(null);
    setErrorRetry(null);
    try {
      const uploaded: LucaAiChatAttachment[] = [];
      for (const file of selected) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} ultrapassa o limite de 10 MB.`);
        const data = await lucaApi.uploadChatAttachment(ownerSessionId, file, bridgeBase);
        if (!stillOwner()) {
          // Usuário saiu da sessão: descarta o que já subiu para não virar órfão.
          void lucaApi.deleteChatAttachment(ownerSessionId, data.attachment.id, bridgeBase).catch(() => {});
          for (const item of uploaded) {
            void lucaApi.deleteChatAttachment(ownerSessionId, item.id, bridgeBase).catch(() => {});
          }
          return;
        }
        uploaded.push(data.attachment);
      }
      const next = [...draftAttachments, ...uploaded].slice(0, 4);
      setDraftAttachments(next);
      await flushSessionNow(ownerSessionId, { draftAttachments: next });
    } catch (err) {
      if (stillOwner()) {
        setError(buildApiErrorMessage(err, 'Falha ao anexar arquivo.'));
        setErrorRetry(null);
      }
    } finally {
      if (stillOwner()) setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function removeAttachment(attachment: LucaAiChatAttachment) {
    if (!activeSessionId || running || uploadingAttachment) return;
    const ownerSessionId = activeSessionId;
    try {
      // Apaga no servidor ANTES de soltar o handle: se o DELETE falhar, o chip
      // continua na tela e o arquivo segue removível, em vez de virar órfão.
      await lucaApi.deleteChatAttachment(ownerSessionId, attachment.id, bridgeBase);
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao remover anexo.'));
      setErrorRetry(null);
      return;
    }
    if (boundSessionIdRef.current !== ownerSessionId) return;
    const next = draftAttachments.filter((item) => item.id !== attachment.id);
    setDraftAttachments(next);
    await flushSessionNow(ownerSessionId, { draftAttachments: next });
  }

  async function ensurePersonaAvailable(slug: string): Promise<boolean> {
    const persona = personaBySlug.get(slug);
    if (!persona) {
      setError(`Persona ${slug} não está no catálogo Yume.`);
      setErrorRetry('personas');
      return false;
    }
    if (persona.imported) return true;
    // Secundária: cache local via GET (nunca escreve no Yume).
    setBusyPersonaSlug(slug);
    try {
      await lucaApi.importYumePersona(slug, bridgeBase);
      const data = await lucaApi.listYumePersonas(bridgeBase, bridgeBase ? 15000 : undefined);
      setPersonas(normalizePersonaAssetUrls(data.personas ?? [], bridgeBase));
      if (runtimeMode === 'backend') await refresh();
      return true;
    } catch (err) {
      setError(buildApiErrorMessage(err, `Falha ao preparar ${persona.name || slug}.`));
      setErrorRetry('personas');
      return false;
    } finally {
      setBusyPersonaSlug(null);
    }
  }

  async function setPersonaModel(slug: string, model: string) {
    if (!slug || !model) return;
    if (!(await ensurePersonaAvailable(slug))) return;
    setBusyPersonaSlug(slug);
    setError(null);
    setErrorRetry(null);
    try {
      await lucaApi.setAgentConfig(`yume:${slug}`, { model }, bridgeBase);
      const data = await lucaApi.listYumePersonas(bridgeBase, bridgeBase ? 15000 : undefined);
      setPersonas(normalizePersonaAssetUrls(data.personas ?? [], bridgeBase));
      if (runtimeMode === 'backend') await refresh();
    } catch (err) {
      setError(buildApiErrorMessage(err, `Falha ao definir modelo de ${slug}.`));
      setErrorRetry('personas');
    } finally {
      setBusyPersonaSlug(null);
    }
  }

  async function setSingleRole(roleId: WorkflowRoleId, slug: string) {
    if (slug && !(await ensurePersonaAvailable(slug))) return;
    setWorkflowState((prev) => {
      const next = normalizeWorkflowAssignments(prev);
      next[roleId] = slug ? [slug] : [];
      return next;
    });
    if (slug) setActivePersonaSlug(slug);
  }

  async function addRoleSlug(roleId: WorkflowRoleId, slug: string) {
    const role = WORKFLOW_ROLES.find((item) => item.id === roleId);
    if (!role || !slug) return;
    if (!(await ensurePersonaAvailable(slug))) return;
    setWorkflowState((prev) => {
      const next = normalizeWorkflowAssignments(prev);
      next[roleId] = uniqueSlugs([...next[roleId], slug], role.maxSlugs);
      return next;
    });
    setActivePersonaSlug(slug);
  }

  function removeRoleSlug(roleId: WorkflowRoleId, slug: string) {
    setWorkflowState((prev) => {
      const next = normalizeWorkflowAssignments(prev);
      next[roleId] = next[roleId].filter((item) => item !== slug);
      return next;
    });
  }

  function clearWorkflow() {
    setWorkflowState(createEmptyWorkflowAssignments());
  }

  async function addIndividualParticipant(slug: string) {
    if (!slug || !(await ensurePersonaAvailable(slug))) return;
    setIndividualState((prev) => ({
      participants: uniqueSlugs([...(prev?.participants || []), slug], 5),
      judge: prev?.judge || null,
    }));
    setActivePersonaSlug(slug);
  }

  async function setIndividualJudge(slug: string) {
    if (slug && !(await ensurePersonaAvailable(slug))) return;
    setIndividualState((prev) => ({
      participants: uniqueSlugs(prev?.participants || [], 5),
      judge: slug || null,
    }));
    if (slug) setActivePersonaSlug(slug);
  }

  function removeIndividualParticipant(slug: string) {
    setIndividualState((prev) => ({
      participants: uniqueSlugs(prev?.participants || [], 5).filter((item) => item !== slug),
      judge: prev?.judge || null,
    }));
  }

  function clearIndividualAssignments() {
    setIndividualState(createEmptyIndividualAssignments());
  }

  // Presets usam qualquer persona do catálogo Yume (oficial ou secundária).
  async function resolveCatalogPresetSlugs(slugs: string[]): Promise<{ ok: Set<string>; failed: string[] }> {
    const ok = new Set<string>();
    const failed: string[] = [];
    for (const slug of slugs) {
      if (!(await ensurePersonaAvailable(slug))) {
        failed.push(slug);
        continue;
      }
      ok.add(slug);
    }
    return { ok, failed };
  }

  function presetApplyError(label: string, missing: string[], failed: string[]): string | null {
    if (missing.length) {
      return `Preset "${label}": persona${missing.length === 1 ? '' : 's'} fora do catálogo Yume: ${missing.join(', ')}.`;
    }
    if (failed.length) {
      return `Preset "${label}" aplicado sem ${failed.length} persona${failed.length === 1 ? '' : 's'}: ${failed.join(', ')}.`;
    }
    return null;
  }

  async function applyTeamPreset(preset: LucaTeamPreset) {
    if (running || applyingPresetId) return;
    setApplyingPresetId(preset.id);
    setError(null);
    setErrorRetry(null);
    try {
      const wanted = teamPresetSlugs(preset);
      const missing = wanted.filter((slug) => !personaBySlug.has(slug));
      if (missing.length) {
        setError(presetApplyError(preset.label, missing, []) || '');
        setErrorRetry('personas');
        return;
      }
      const { ok, failed } = await resolveCatalogPresetSlugs(wanted);
      const next = createEmptyWorkflowAssignments();
      for (const role of WORKFLOW_ROLES) {
        next[role.id] = uniqueSlugs((preset.assignments[role.id] ?? []).filter((slug) => ok.has(slug)), role.maxSlugs);
      }
      setWorkflowState(next);
      setOperationMode('team');
      const first = flattenWorkflowAssignments(next)[0];
      if (first) setActivePersonaSlug(first);
      const message = presetApplyError(preset.label, [], failed);
      if (message) {
        setError(message);
        setErrorRetry('personas');
      }
    } finally {
      setApplyingPresetId(null);
    }
  }

  // Handoff SOMPO → bancada: aplica a equipe (Equipe ou Individual) escolhida no caso.
  useEffect(() => {
    const launch = pendingSompoLaunchRef.current;
    if (!launch || sompoPresetAppliedRef.current || loading || running || applyingPresetId) return;
    if (!personas.length) return;
    if (launch.mode === 'individual') {
      const preset = individualPresets.find((item) => item.id === launch.presetId);
      if (!preset) {
        setError(`Equipe individual "${launch.presetLabel || launch.presetId}" não encontrada na bancada.`);
        setErrorRetry('personas');
        pendingSompoLaunchRef.current = null;
        sompoAutoRunArmedRef.current = false;
        return;
      }
      sompoPresetAppliedRef.current = true;
      void applyIndividualPreset(preset);
      return;
    }
    const preset = teamPresets.find((item) => item.id === launch.presetId);
    if (!preset) {
      setError(`Equipe "${launch.presetLabel || launch.presetId}" não encontrada na bancada.`);
      setErrorRetry('personas');
      pendingSompoLaunchRef.current = null;
      sompoAutoRunArmedRef.current = false;
      return;
    }
    sompoPresetAppliedRef.current = true;
    void applyTeamPreset(preset);
  // one-shot handoff after templates/personas hydrate
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyingPresetId, individualPresets, loading, personas.length, running, teamPresets]);

  // Após montar missão + equipe do SOMPO, dispara a run automaticamente.
  useEffect(() => {
    if (!sompoAutoRunArmedRef.current) return;
    if (!sompoPresetAppliedRef.current) return;
    if (!activeSessionId || boundSessionIdRef.current !== activeSessionId) return;
    if (loading || running || applyingPresetId) return;
    if (!mission.trim()) return;
    const ready = operationMode === 'individual' ? isIndividualReady : isWorkflowReady;
    if (!ready) return;
    sompoAutoRunArmedRef.current = false;
    pendingSompoLaunchRef.current = null;
    void runMission();
  // runMission closes over latest mission/assignments
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSessionId,
    applyingPresetId,
    isIndividualReady,
    isWorkflowReady,
    loading,
    mission,
    operationMode,
    running,
    workflowState,
    individualState,
  ]);

  async function applyIndividualPreset(preset: LucaIndividualPreset) {
    if (running || applyingPresetId) return;
    setApplyingPresetId(preset.id);
    setError(null);
    setErrorRetry(null);
    try {
      const wanted = individualPresetSlugs(preset);
      const missing = wanted.filter((slug) => !personaBySlug.has(slug));
      if (missing.length) {
        setError(presetApplyError(preset.label, missing, []) || '');
        setErrorRetry('personas');
        return;
      }
      const { ok, failed } = await resolveCatalogPresetSlugs(wanted);
      const participants = uniqueSlugs(preset.participants.filter((slug) => ok.has(slug)), 5);
      const judge = ok.has(preset.judge) ? preset.judge : null;
      setIndividualState({ participants, judge });
      setOperationMode('individual');
      const first = participants[0] ?? judge;
      if (first) setActivePersonaSlug(first);
      const message = presetApplyError(preset.label, [], failed);
      if (message) {
        setError(message);
        setErrorRetry('personas');
      }
    } finally {
      setApplyingPresetId(null);
    }
  }

  function clearTranscript() {
    setTranscript([]);
    setFinalResult(null);
    setVisualPack(null);
    setProcessEvents([]);
    setActiveTraceId(null);
    void flushSessionNow(activeSessionId, { transcript: [], finalResult: null, visualPack: null });
  }

  function switchOperationMode(next: OperationMode) {
    if (next === operationMode || running) return;
    setOperationMode(next);
    setPickerTarget(null);
    // Keep transcript/finalResult/mission — mode is view/config, not a new session.
    setProcessEvents([]);
    setActiveTraceId(null);
  }

  async function runMission() {
    const attachmentsToRun = draftAttachments.slice(0, 4);
    // Anexo sem texto ainda e uma missao valida para as personas.
    const trimmedMission = mission.trim() || (attachmentsToRun.length ? 'Analise os anexos enviados.' : '');
    const assignmentsToRun = normalizeWorkflowAssignments(assignments);
    const individualToRun = {
      participants: uniqueSlugs(individualAssignments.participants, 5),
      judge: individualAssignments.judge,
    };
    const slugsToRun = operationMode === 'individual'
      ? individualToRun.participants
      : flattenWorkflowAssignments(assignmentsToRun);
    const readyToRun = operationMode === 'individual'
      ? slugsToRun.length > 0 && Boolean(individualToRun.judge)
      : workflowReady(assignmentsToRun);
    if (!trimmedMission || !slugsToRun.length || !readyToRun || running) return;

    const ownerSessionId = activeSessionId;
    if (!ownerSessionId || boundSessionIdRef.current !== ownerSessionId) return;
    runOwnerSessionIdRef.current = ownerSessionId;

    const startedAt = new Date().toISOString();
    const traceId = createTraceId();
    setRunning(true);
    setError(null);
    setErrorRetry(null);
    setFinalResult(null);
    setVisualPack(null);
    setActiveTraceId(traceId);
    setProcessEvents(operationMode === 'team'
      ? plannedRuntimeEvents(traceId, trimmedMission, assignmentsToRun, personaBySlug)
      : []);
    const runPersonas = operationMode === 'individual'
      ? uniqueSlugs([...slugsToRun, individualToRun.judge])
      : slugsToRun;
    if (!activePersonaSlug || !runPersonas.includes(activePersonaSlug)) {
      setActivePersonaSlug(runPersonas[0] ?? null);
    }
    const operatorEntry: TeamTranscriptEntry = {
      id: personaRunOperatorEntryId({ traceId }),
      role: 'operator',
      name: 'Operador',
      content: trimmedMission,
      status: 'info',
      timestamp: startedAt,
      attachments: attachmentsToRun,
    };
    // Capture next transcript eagerly — setState is async and F5 must not lose the question.
    const transcriptWithOperator = [...transcript, operatorEntry].slice(-100);
    setTranscript(transcriptWithOperator);
    // Codex-style send: message is committed to the thread; composer leaves empty.
    // Restore mission + attachments only if pre-run flush or the round fails.
    setMission('');
    setDraftAttachments([]);
    try {
      await flushSessionNow(ownerSessionId, {
        missionDraft: '',
        draftAttachments: [],
        transcript: transcriptWithOperator,
        finalResult: null,
        visualPack: null,
      });
    } catch (err) {
      setMission(trimmedMission);
      setDraftAttachments(attachmentsToRun);
      setError(buildApiErrorMessage(err, 'Falha ao salvar a missão antes de iniciar.'));
      setErrorRetry('run');
      setRunning(false);
      runOwnerSessionIdRef.current = null;
      return;
    }

    const stillOwner = () => (
      runOwnerSessionIdRef.current === ownerSessionId
      && boundSessionIdRef.current === ownerSessionId
    );

    try {
      const presetModels = operationMode === 'individual'
        ? individualPresets.find((preset) => individualPresetMatches(individualToRun, preset))?.models
        : teamPresets.find((preset) => teamPresetMatches(assignmentsToRun, preset))?.models;
      const modelOverrides = Object.fromEntries(
        runPersonas
          .map((slug) => {
            const model = String(presetModels?.[slug] || personaBySlug.get(slug)?.model || '').trim();
            return model ? [slug, model] : null;
          })
          .filter(Boolean) as Array<[string, string]>,
      );
      const data = operationMode === 'individual'
        ? await lucaApi.runLucaAiIndividualResolution(
          trimmedMission,
          slugsToRun,
          String(individualToRun.judge),
          traceId,
          bridgeBase,
          modelOverrides,
          ownerSessionId,
          attachmentsToRun.map((attachment) => attachment.id),
          individualDepth,
        )
        : await lucaApi.runLucaAiPersonaTeam(
          trimmedMission,
          slugsToRun,
          workflowPayload(assignmentsToRun),
          traceId,
          bridgeBase,
          modelOverrides,
          ownerSessionId,
          attachmentsToRun.map((attachment) => attachment.id),
        );
      if (!stillOwner()) return;
      if (data.traceId) setActiveTraceId(data.traceId);
      const nextMessages = transcriptEntriesFromResponse(data);
      const transcriptAfter = [...transcriptWithOperator, ...nextMessages].slice(-140);
      setTranscript(transcriptAfter);
      const nextFinal = finalEntryFromPersonaRun(data) as TeamTranscriptEntry | null;
      setFinalResult(nextFinal);
      const nextVisual = data.visualPack && typeof data.visualPack === 'object' ? data.visualPack : null;
      setVisualPack(nextVisual);
      // O servidor é o escritor canônico da rodada: recarrega em vez de reenviar.
      if (stillOwner()) await refreshChatLibrary();
      if (!data.ok) {
        // Soft failure: put the message back so "Reenviar missão" works.
        setMission(trimmedMission);
        setDraftAttachments(attachmentsToRun);
        setError(operationMode === 'individual'
          ? 'As respostas individuais foram acionadas, mas o juiz não concluiu um veredito útil.'
          : 'A equipe foi acionada, mas nenhuma persona retornou resposta util.');
        setErrorRetry('run');
      }
      // Success: composer stays empty; original question lives on the operator bubble.
    } catch (err) {
      if (!stillOwner()) return;
      const message = buildApiErrorMessage(err, operationMode === 'individual'
        ? 'Falha ao rodar resolução individual.'
        : 'Falha ao rodar fluxo de personas.');
      setError(message);
      setErrorRetry('run');
      setMission(trimmedMission);
      setDraftAttachments(attachmentsToRun);
      const errorEntry: TeamTranscriptEntry = {
        id: nowId('system-error'),
        role: 'system',
        name: 'LUCA-AI',
        content: message,
        status: 'error',
        timestamp: new Date().toISOString(),
      };
      const transcriptAfterError = [...transcriptWithOperator, errorEntry].slice(-140);
      setTranscript(transcriptAfterError);
      void flushSessionNow(ownerSessionId, {
        missionDraft: trimmedMission,
        draftAttachments: attachmentsToRun,
        transcript: transcriptAfterError,
        finalResult: null,
      });
    } finally {
      if (stillOwner()) {
        try {
          const data = await lucaApi.listEvents({ traceId, limit: 120 }, bridgeBase);
          if (stillOwner() && data.ok && data.events?.length) setProcessEvents(sortRuntimeEvents(data.events));
        } catch {
          // Evento em tempo real é auxiliar; mantemos os dados locais se o polling falhar.
        }
        if (stillOwner()) setRunning(false);
      }
      if (runOwnerSessionIdRef.current === ownerSessionId) runOwnerSessionIdRef.current = null;
    }
  }

  const activeTeamPresetId = useMemo(() => (
    teamPresets.find((preset) => teamPresetMatches(assignments, preset))?.id ?? null
  ), [assignments, teamPresets]);
  const activeIndividualPresetId = useMemo(() => (
    individualPresets.find((preset) => individualPresetMatches(individualAssignments, preset))?.id ?? null
  ), [individualAssignments, individualPresets]);

  const activePersona = activePersonaSlug ? personaBySlug.get(activePersonaSlug) ?? null : null;
  const activePersonaRoleIds = useMemo(() => (
    activePersonaSlug
      ? WORKFLOW_ROLES.filter((role) => assignments[role.id].includes(activePersonaSlug)).map((role) => role.id)
      : []
  ), [activePersonaSlug, assignments]);
  const activeProcessEvents = useMemo(() => {
    if (!activePersonaSlug) return processEvents;
    const filtered = processEvents.filter((event) => {
      const slug = runtimeEventSlug(event);
      if (slug) return slug === activePersonaSlug;
      const roleId = runtimeEventRoleId(event);
      return Boolean(roleId && activePersonaRoleIds.includes(roleId as WorkflowRoleId));
    });
    return filtered.length ? filtered : processEvents;
  }, [activePersonaRoleIds, activePersonaSlug, processEvents]);

  if (loading && personas.length === 0) {
    return (
      <LucaAiStartState
        state="loading"
        onReload={loadPersonas}
        onOpenPersonas={() => onNavigate('personas')}
      />
    );
  }

  if (error && personas.length === 0) {
    return (
      <LucaAiStartState
        state="error"
        message={error}
        onReload={loadPersonas}
        onOpenPersonas={() => onNavigate('personas')}
      />
    );
  }

  if (personas.length === 0) {
    return (
      <LucaAiStartState
        state="empty"
        onReload={loadPersonas}
        onOpenPersonas={() => onNavigate('personas')}
      />
    );
  }

  const pickerConfig = pickerTarget
    ? pickerTarget.mode === 'team'
      ? WORKFLOW_ROLES.find((role) => role.id === pickerTarget.id) ?? null
      : INDIVIDUAL_PICKER_CONFIGS[pickerTarget.id]
    : null;
  const pickerSelectedSlugs = pickerTarget
    ? pickerTarget.mode === 'team'
      ? assignments[pickerTarget.id]
      : pickerTarget.id === 'participants'
        ? individualAssignments.participants
        : individualAssignments.judge ? [individualAssignments.judge] : []
    : [];

  return (
    <div className="luca-ai-page luca-ai-chat-page relative h-full min-h-0">
      <div className="luca-ai-chat-column">
        <header className="luca-ai-chat-toolbar">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
<div className="luca-ai-view-switch" role="group" aria-label="Modo de operação">
              <button type="button" className={operationMode === 'team' ? 'active' : ''} disabled={running} aria-pressed={operationMode === 'team'} onClick={() => switchOperationMode('team')}>
                <GitBranch className="h-4 w-4" /> Equipe
              </button>
              <button type="button" className={operationMode === 'individual' ? 'active' : ''} disabled={running} aria-pressed={operationMode === 'individual'} onClick={() => switchOperationMode('individual')}>
                <UserRound className="h-4 w-4" /> Individual
              </button>
            </div>
            <div className="luca-ai-view-switch" role="tablist" aria-label="Visualização da bancada">
              <button type="button" role="tab" aria-selected={activeWorkspaceView === 'result'} className={activeWorkspaceView === 'result' ? 'active' : ''} onClick={() => setActiveWorkspaceView('result')}>
                <Eye className="h-4 w-4" /> Chat
              </button>
              <button type="button" role="tab" aria-selected={activeWorkspaceView === 'activity'} className={activeWorkspaceView === 'activity' ? 'active' : ''} onClick={() => setActiveWorkspaceView('activity')}>
                <Terminal className="h-4 w-4" /> Atividade
              </button>
            </div>
          </div>
          <div className="luca-ai-toolbar-actions">
            <div className="luca-ai-share-anchor">
              <button
                type="button"
                className={`luca-ai-team-trigger luca-ai-share-trigger ${shareOpen ? 'active' : ''}`}
                onClick={() => { void toggleSharePanel(); }}
                aria-expanded={shareOpen}
                aria-controls="luca-ai-share-panel"
                title="Compartilhar sessão (link público somente leitura)"
              >
                <Share2 className="h-4 w-4" />
                <span>Compartilhar</span>
              </button>
              <AnimatePresence>
                {shareOpen && (
                  <motion.div
                    id="luca-ai-share-panel"
                    className="luca-ai-share-panel"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.16 }}
                  >
                    <div className="luca-ai-share-head">
                      <Link2 className="h-4 w-4" />
                      <span>Link público da sessão</span>
                      <button type="button" className="luca-ai-share-close" onClick={() => setShareOpen(false)} aria-label="Fechar">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="luca-ai-share-hint">
                      Gera um link somente leitura com o snapshot atual da conversa e do resultado. Quem receber o link vê o conteúdo sem precisar de conta.
                    </p>
                    {shareError && <div className="luca-ai-share-error" role="alert">{shareError}</div>}
                    {shareInfo ? (
                      <>
                        <div className="luca-ai-share-url" title={absoluteShareUrl(shareInfo)}>
                          {absoluteShareUrl(shareInfo)}
                        </div>
                        <div className="luca-ai-share-actions">
                          <button type="button" className="luca-ai-share-btn primary" disabled={shareBusy} onClick={() => { void copyShareUrl(shareInfo); }}>
                            {shareCopied ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                            {shareCopied ? 'Copiado!' : 'Copiar link'}
                          </button>
                          <button type="button" className="luca-ai-share-btn" disabled={shareBusy} onClick={() => { void generateShare(); }}>
                            {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Atualizar snapshot
                          </button>
                          <button type="button" className="luca-ai-share-btn danger" disabled={shareBusy} onClick={() => { void revokeShare(); }}>
                            <X className="h-4 w-4" />
                            Revogar
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="luca-ai-share-actions">
                        <button type="button" className="luca-ai-share-btn primary" disabled={shareBusy || !activeSessionId} onClick={() => { void generateShare(); }}>
                          {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                          Gerar link público
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              className={`luca-ai-team-trigger ${teamPanelOpen ? 'active' : ''}`}
              onClick={() => setTeamPanelOpen((open) => !open)}
              aria-expanded={teamPanelOpen}
              aria-controls="luca-ai-team-side"
            >
              <BrainCircuit className="h-4 w-4" />
              <span>{operationMode === 'individual' ? 'Seleção' : 'Equipe'}</span>
              <span className="font-mono text-[10px]">{operationMode === 'individual' ? `${individualAssignments.participants.length}/5` : `${readyRoles}/${requiredRoleCount}`}</span>
            </button>
          </div>
        </header>

        {error && (
        <div
          className="luca-ai-chat-notice"
          data-luca-chat-error
          data-tone="error"
          data-luca-chat-error-kind={errorRetry === 'run' ? 'run' : 'personas'}
          role="alert"
        >
          <Notice
            title="Atenção"
            body={error}
            onRetry={() => {
              if (errorRetry === 'run') void runMission();
              else void loadPersonas();
            }}
            onDismiss={() => {
              setError(null);
              setErrorRetry(null);
            }}
            busy={loading || running}
            retryLabel={errorRetry === 'run' ? 'Reenviar missão' : 'Tentar novamente'}
          />
        </div>
      )}

        <main className="luca-ai-chat-stage">
          {activeWorkspaceView === 'result' ? (
            <LucaMissionCanvas
              transcript={transcript}
              finalResult={finalResult}
              visualPack={visualPack}
              personaBySlug={personaBySlug}
              running={running}
              transcriptRef={transcriptRef}
              onInspect={setActivePersonaSlug}
              operationMode={operationMode}
              missionDraft={mission}
            />
          ) : (
            <div className="h-full min-h-0 w-full overflow-y-auto px-4 py-4 sm:px-5">
              <LucaProcessTerminal persona={activePersona} events={activeProcessEvents} running={running} traceId={activeTraceId} />
            </div>
          )}
        </main>

        <div className="luca-ai-composer-dock">
          <LucaMissionBar
            mission={mission}
            attachments={draftAttachments}
            uploadingAttachment={uploadingAttachment}
            fileInputRef={fileInputRef}
            running={running}
            canRun={canRun}
            operationMode={operationMode}
            readyRoles={readyRoles}
            requiredRoleCount={requiredRoleCount}
            isWorkflowReady={isWorkflowReady}
            isIndividualReady={isIndividualReady}
            assignedCount={operationMode === 'individual' ? individualAssignments.participants.length : assignedSlugs.length}
            onMissionChange={setMission}
            onFilesSelected={addAttachments}
            onRemoveAttachment={removeAttachment}
            onRun={runMission}
            onClear={clearTranscript}
            onConfigureTeam={() => setTeamPanelOpen(true)}
          />
        </div>
      </div>
<AnimatePresence>
        {teamPanelOpen && (
          <motion.aside
            id="luca-ai-team-side"
            className="luca-ai-team-side"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.18 }}
          >
            {operationMode === 'individual' ? (
              <LucaIndividualPanel
                personas={personas}
                personaBySlug={personaBySlug}
                routerProfiles={routerProfiles}
                assignments={individualAssignments}
                depth={individualDepth}
                presets={individualPresets}
                activeSlug={activePersonaSlug}
                loading={loading}
                running={running}
                busySlug={busyPersonaSlug}
                activePresetId={activeIndividualPresetId}
                applyingPresetId={applyingPresetId}
                onReload={loadPersonas}
                onClear={clearIndividualAssignments}
                onRemoveParticipant={removeIndividualParticipant}
                onClearJudge={() => void setIndividualJudge('')}
                onInspect={setActivePersonaSlug}
                onOpenPicker={(id) => setPickerTarget({ mode: 'individual', id })}
                onSetModel={setPersonaModel}
                onDepthChange={setIndividualDepth}
                onApplyPreset={(preset) => void applyIndividualPreset(preset)}
                onOpenPersonas={() => onNavigate('personas')}
                onClose={() => setTeamPanelOpen(false)}
              />
            ) : (
              <LucaWorkflowPanel
                personas={personas}
                personaBySlug={personaBySlug}
                routerProfiles={routerProfiles}
                assignments={assignments}
                presets={teamPresets}
                activeSlug={activePersonaSlug}
                loading={loading}
                running={running}
                readyRoles={readyRoles}
                requiredRoleCount={requiredRoleCount}
                busySlug={busyPersonaSlug}
                activePresetId={activeTeamPresetId}
                applyingPresetId={applyingPresetId}
                onReload={loadPersonas}
                onClearWorkflow={clearWorkflow}
                onRemove={removeRoleSlug}
                onInspect={setActivePersonaSlug}
                onOpenPicker={(id) => setPickerTarget({ mode: 'team', id })}
                onSetModel={setPersonaModel}
                onApplyPreset={(preset) => void applyTeamPreset(preset)}
                onOpenPersonas={() => onNavigate('personas')}
                onClose={() => setTeamPanelOpen(false)}
              />
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pickerConfig && pickerTarget && (
          <PersonaPickerSheet
            key={`${pickerTarget.mode}-${pickerConfig.id}`}
            role={pickerConfig}
            personas={personas}
            selectedSlugs={pickerSelectedSlugs}
            query={query}
            busySlug={busyPersonaSlug}
            onQuery={setQuery}
            onClose={() => { setPickerTarget(null); setQuery(''); }}
            onChoose={async (slug) => {
              if (pickerTarget.mode === 'team') {
                if (pickerConfig.multiple) await addRoleSlug(pickerTarget.id, slug);
                else {
                  await setSingleRole(pickerTarget.id, slug);
                  setPickerTarget(null);
                  setQuery('');
                }
              } else if (pickerTarget.id === 'participants') {
                await addIndividualParticipant(slug);
              } else {
                await setIndividualJudge(slug);
                setPickerTarget(null);
                setQuery('');
              }
            }}
            onRemove={(slug) => {
              if (pickerTarget.mode === 'team') removeRoleSlug(pickerTarget.id, slug);
              else if (pickerTarget.id === 'participants') removeIndividualParticipant(slug);
              else void setIndividualJudge('');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Notice({
  title,
  body,
  onRetry,
  onDismiss,
  busy,
  retryLabel = 'Tentar novamente',
}: {
  title: string;
  body: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  busy?: boolean;
  retryLabel?: string;
}) {
  const theme = useTheme();
  const recoverable = Boolean(onRetry || onDismiss);
  return (
    <div
      className="flex items-start gap-3 rounded-lg px-4 py-3"
      style={{
        background: recoverable ? theme.errorBg : theme.warningBg,
        border: `1px solid ${recoverable ? theme.error : theme.warning}`,
      }}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: recoverable ? theme.error : theme.warning }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color: recoverable ? theme.error : theme.goldDeep }}>{title}</div>
        <div className="mt-1 text-xs leading-relaxed" style={{ color: theme.textSoft }}>{body}</div>
        {recoverable ? (
          <div className="mt-3 flex flex-wrap gap-2" data-luca-chat-error-actions>
            {onRetry ? (
              <button
                type="button"
                className="btn-primary !px-4 !py-2 !text-xs"
                data-luca-chat-retry
                onClick={onRetry}
                disabled={busy}
              >
                {busy ? (retryLabel === 'Reenviar missão' ? 'Reenviando…' : 'Recarregando…') : retryLabel}
              </button>
            ) : null}
            {onDismiss ? (
              <button
                type="button"
                className="btn-fleet !px-4 !py-2 !text-xs"
                data-luca-chat-dismiss
                onClick={onDismiss}
                disabled={busy}
              >
                Dispensar
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LucaAiStartState({
  state,
  message,
  onReload,
  onOpenPersonas,
}: {
  state: 'loading' | 'empty' | 'error';
  message?: string;
  onReload: () => void | Promise<void>;
  onOpenPersonas: () => void;
}) {
  const theme = useTheme();
  const loading = state === 'loading';
  const error = state === 'error';

  return (
    <div
      className="flex h-full min-h-0 items-center justify-center overflow-y-auto p-4 sm:p-8"
      data-luca-start-state={state}
      data-luca-start-error={error ? '' : undefined}
      data-luca-start-empty={!loading && !error ? '' : undefined}
      data-tone={error ? 'error' : undefined}
      role={error ? 'alert' : undefined}
    >
      <section className="void-panel relative w-full max-w-[760px] overflow-hidden rounded-[26px] p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full" style={{ background: `radial-gradient(circle, ${theme.goldSoft}, transparent 68%)` }} />
        <div className="relative max-w-[560px]">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: error ? theme.errorBg : theme.goldSoft, color: error ? theme.error : theme.goldDeep }}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : error ? <AlertCircle className="h-5 w-5" /> : <BrainCircuit className="h-5 w-5" />}
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: theme.textGhost }}>Bancada de personas</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl" style={{ color: theme.text }}>
            {loading ? 'Preparando a equipe' : error ? 'A equipe não pôde ser carregada' : 'Conecte a primeira persona'}
          </h1>
          <p className="mt-3 max-w-[58ch] text-sm leading-relaxed" style={{ color: theme.textMute }}>
            {loading
              ? 'Buscando as personas disponíveis no Yume e conferindo quais já estão conectadas ao LUCA.'
              : error
                ? message
                : 'Escolha no catálogo as personas que poderão supervisionar, executar, aprovar e apresentar as missões desta bancada.'}
          </p>
          {!loading && (
            <div className="mt-7 flex flex-wrap gap-2" data-luca-start-actions={error ? 'error' : 'empty'}>
              {error ? (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    data-luca-start-retry
                    onClick={() => void onReload()}
                  >
                    Tentar novamente
                  </button>
                  <button
                    type="button"
                    className="btn-fleet"
                    data-luca-start-open-personas
                    onClick={onOpenPersonas}
                  >
                    Abrir Personas
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    data-luca-start-open-personas
                    onClick={onOpenPersonas}
                  >
                    Abrir Personas
                  </button>
                  <button
                    type="button"
                    className="btn-fleet"
                    data-luca-start-retry
                    onClick={() => void onReload()}
                  >
                    Verificar novamente
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function LucaIndividualPanel({
  personas,
  personaBySlug,
  routerProfiles,
  assignments,
  depth,
  presets: individualPresets,
  activeSlug,
  loading,
  running,
  busySlug,
  onReload,
  onClear,
  onRemoveParticipant,
  onClearJudge,
  onInspect,
  onOpenPicker,
  onSetModel,
  onDepthChange,
  onOpenPersonas,
  onClose,
  activePresetId,
  applyingPresetId,
  onApplyPreset,
}: {
  personas: YumePersonaSummary[];
  personaBySlug: Map<string, YumePersonaSummary>;
  routerProfiles: RouterModelProfile[];
  assignments: IndividualAssignments;
  depth: LucaAiIndividualDepth;
  presets: LucaIndividualPreset[];
  activeSlug: string | null;
  loading: boolean;
  running: boolean;
  busySlug: string | null;
  onReload: () => void | Promise<void>;
  onClear: () => void;
  onRemoveParticipant: (slug: string) => void;
  onClearJudge: () => void;
  onInspect: (slug: string | null) => void;
  onOpenPicker: (id: IndividualPickerId) => void;
  onSetModel: (slug: string, model: string) => void | Promise<void>;
  onDepthChange: (depth: LucaAiIndividualDepth) => void;
  onOpenPersonas: () => void;
  onClose: () => void;
  activePresetId: string | null;
  applyingPresetId: string | null;
  onApplyPreset: (preset: LucaIndividualPreset) => void;
}) {
  const theme = useTheme();
  const readyCount = Number(assignments.participants.length > 0) + Number(Boolean(assignments.judge));
  const ready = readyCount === 2;
  const configuredCount = uniqueSlugs([...assignments.participants, assignments.judge]).length;

  return (
    <aside className="luca-ai-flow-panel min-h-0 overflow-hidden">
      <header className="border-b px-4 py-4" style={{ borderColor: theme.border }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>Modo individual</p>
            <h2 className="mt-1 text-base font-semibold" style={{ color: theme.text }}>Resolução com juiz</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg px-2.5 py-1 font-mono text-[10px]" style={{ background: ready ? theme.aliveSoft : theme.goldSoft, color: ready ? theme.alive : theme.goldDeep }}>
              {readyCount}/2
            </span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg transition" onClick={onClose} aria-label="Fechar seleção" style={{ color: theme.textMute }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: theme.surfaceHi }}>
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(readyCount / 2) * 100}%`, background: ready ? theme.alive : theme.gold }} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: theme.textMute }}>
          {running
            ? 'As personas respondem isoladamente; o juiz entra depois.'
            : ready
              ? `${assignments.participants.length} participante${assignments.participants.length === 1 ? '' : 's'} e um juiz prontos.`
              : 'Escolha de 1 a 5 participantes e uma persona juíza. O juiz pode também estar entre os participantes.'}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          <WorkflowRoleRow
            role={INDIVIDUAL_PICKER_CONFIGS.judge}
            personaBySlug={personaBySlug}
            routerProfiles={routerProfiles}
            selectedSlugs={assignments.judge ? [assignments.judge] : []}
            activeSlug={activeSlug}
            disabled={running}
            busySlug={busySlug}
            onOpen={() => onOpenPicker('judge')}
            onRemove={onClearJudge}
            onInspect={onInspect}
            onSetModel={onSetModel}
          />
          <WorkflowRoleRow
            role={INDIVIDUAL_PICKER_CONFIGS.participants}
            personaBySlug={personaBySlug}
            routerProfiles={routerProfiles}
            selectedSlugs={assignments.participants}
            activeSlug={activeSlug}
            disabled={running}
            busySlug={busySlug}
            onOpen={() => onOpenPicker('participants')}
            onRemove={onRemoveParticipant}
            onInspect={onInspect}
            onSetModel={onSetModel}
          />
          <fieldset
            className="rounded-xl border p-3"
            data-luca-individual-depth
            disabled={running}
            style={{ borderColor: theme.border }}
          >
            <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.textGhost }}>
              Profundidade
            </legend>
            <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Profundidade da resolução individual">
              {INDIVIDUAL_DEPTH_OPTIONS.map((option) => {
                const selected = depth === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="rounded-lg border px-2 py-2 text-[10px] font-semibold transition"
                    onClick={() => onDepthChange(option.value)}
                    title={option.description}
                    style={{
                      background: selected ? theme.goldSoft : theme.input,
                      borderColor: selected ? theme.borderActive : theme.border,
                      color: selected ? theme.goldDeep : theme.textMute,
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: theme.textGhost }}>
              {INDIVIDUAL_DEPTH_OPTIONS.find((option) => option.value === depth)?.description}
            </p>
          </fieldset>
          <div className="rounded-xl px-3 py-3 text-[11px] leading-relaxed" style={{ background: theme.surfaceHi, color: theme.textMute }}>
            {depth === 1
              ? 'Cada participante responde às cegas; depois, o juiz compara e decide.'
              : 'Cada participante responde às cegas, revisa com contribuições anônimas e então o juiz decide.'}
          </div>
        </div>
        <div className="mt-3">
          <PresetGallery
            title="Seleções prontas"
            presets={individualPresets}
            resolveSlugs={individualPresetSlugs}
            personaBySlug={personaBySlug}
            activeId={activePresetId}
            applyingId={applyingPresetId}
            disabled={running || loading}
            onApply={onApplyPreset}
          />
        </div>
      </div>

      <footer className="grid grid-cols-2 gap-2 border-t p-3" style={{ borderColor: theme.border }}>
        <button type="button" className="btn-fleet !px-3 text-xs" onClick={onOpenPersonas} disabled={running}>Catálogo</button>
        <button type="button" className="btn-fleet !px-3 text-xs" onClick={onClear} disabled={running || configuredCount === 0}>Limpar seleção</button>
        <button type="button" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] transition" onClick={() => void onReload()} disabled={loading || running} style={{ color: theme.textMute }}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar {personas.length} personas
        </button>
      </footer>
    </aside>
  );
}

function LucaWorkflowPanel({
  personas,
  personaBySlug,
  routerProfiles,
  assignments,
  presets: teamPresets,
  activeSlug,
  loading,
  running,
  readyRoles,
  requiredRoleCount,
  busySlug,
  onReload,
  onClearWorkflow,
  onRemove,
  onInspect,
  onOpenPicker,
  onSetModel,
  onOpenPersonas,
  onClose,
  activePresetId,
  applyingPresetId,
  onApplyPreset,
}: {
  personas: YumePersonaSummary[];
  personaBySlug: Map<string, YumePersonaSummary>;
  routerProfiles: RouterModelProfile[];
  assignments: WorkflowAssignments;
  presets: LucaTeamPreset[];
  activeSlug: string | null;
  loading: boolean;
  running: boolean;
  readyRoles: number;
  requiredRoleCount: number;
  busySlug: string | null;
  onReload: () => void | Promise<void>;
  onClearWorkflow: () => void;
  onRemove: (roleId: WorkflowRoleId, slug: string) => void;
  onInspect: (slug: string | null) => void;
  onOpenPicker: (roleId: WorkflowRoleId) => void;
  onSetModel: (slug: string, model: string) => void | Promise<void>;
  onOpenPersonas: () => void;
  onClose: () => void;
  activePresetId: string | null;
  applyingPresetId: string | null;
  onApplyPreset: (preset: LucaTeamPreset) => void;
}) {
  const theme = useTheme();
  const denom = Math.max(1, requiredRoleCount);
  const ready = readyRoles >= denom;
  const assignedCount = flattenWorkflowAssignments(assignments).length;
  const visualFilled = assignments.visual.length > 0;

  return (
    <aside className="luca-ai-flow-panel min-h-0 overflow-hidden">
      <header className="border-b px-4 py-4" style={{ borderColor: theme.border }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>Composição</p>
            <h2 className="mt-1 text-base font-semibold" style={{ color: theme.text }}>Fluxo de personas</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg px-2.5 py-1 font-mono text-[10px]" style={{ background: ready ? theme.aliveSoft : theme.goldSoft, color: ready ? theme.alive : theme.goldDeep }}>
              {readyRoles}/{requiredRoleCount}
            </span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg transition" onClick={onClose} aria-label="Fechar equipe" style={{ color: theme.textMute }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: theme.surfaceHi }}>
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(readyRoles / denom) * 100}%`, background: ready ? theme.alive : theme.gold }} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: theme.textMute }}>
          {running
            ? 'A equipe está executando a missão.'
            : ready
              ? `${assignedCount} persona${assignedCount === 1 ? '' : 's'} pronta${assignedCount === 1 ? '' : 's'} para executar.${visualFilled ? '' : ' Especialista visual opcional.'}`
              : 'Preencha as etapas obrigatórias. Especialista visual é opcional e só roda se você adicionar.'}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <PresetGallery
          title="Equipes prontas"
          presets={teamPresets}
          resolveSlugs={teamPresetSlugs}
          personaBySlug={personaBySlug}
          activeId={activePresetId}
          applyingId={applyingPresetId}
          disabled={running || loading}
          onApply={onApplyPreset}
        />
        <div className="space-y-2">
          {WORKFLOW_ROLES.map((role) => (
            <WorkflowRoleRow
              key={role.id}
              role={role}
              personaBySlug={personaBySlug}
              routerProfiles={routerProfiles}
              selectedSlugs={assignments[role.id]}
              activeSlug={activeSlug}
              disabled={running}
              busySlug={busySlug}
              onOpen={() => onOpenPicker(role.id)}
              onRemove={(slug) => onRemove(role.id, slug)}
              onInspect={onInspect}
              onSetModel={onSetModel}
            />
          ))}
        </div>
      </div>

      <footer className="grid grid-cols-2 gap-2 border-t p-3" style={{ borderColor: theme.border }}>
        <button type="button" className="btn-fleet !px-3 text-xs" onClick={onOpenPersonas} disabled={running}>Catálogo</button>
        <button type="button" className="btn-fleet !px-3 text-xs" onClick={onClearWorkflow} disabled={running || assignedCount === 0}>Limpar fluxo</button>
        <button type="button" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] transition" onClick={() => void onReload()} disabled={loading || running} style={{ color: theme.textMute }}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar {personas.length} personas
        </button>
      </footer>
    </aside>
  );
}

interface PresetGalleryItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

function PresetGallery<T extends PresetGalleryItem>({
  title,
  presets,
  resolveSlugs,
  personaBySlug,
  activeId,
  applyingId,
  disabled,
  onApply,
}: {
  title: string;
  presets: T[];
  resolveSlugs: (preset: T) => string[];
  personaBySlug: Map<string, YumePersonaSummary>;
  activeId: string | null;
  applyingId: string | null;
  disabled: boolean;
  onApply: (preset: T) => void;
}) {
  const theme = useTheme();
  if (!presets.length) return null;
  return (
    <section className="mb-3" aria-label={title} data-luca-preset-gallery={title}>
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>{title}</p>
      <div className="space-y-2">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const active = activeId === preset.id;
          const applying = applyingId === preset.id;
          const slugs = resolveSlugs(preset);
          const presetPersonas = slugs
            .map((slug) => personaBySlug.get(slug))
            .filter((persona): persona is YumePersonaSummary => Boolean(persona));
          const shown = presetPersonas.slice(0, 5);
          const extra = presetPersonas.length - shown.length;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`preset-${preset.id}`}
              aria-pressed={active}
              aria-label={`Aplicar preset ${preset.label}`}
              className="w-full rounded-xl border p-3 text-left transition"
              disabled={disabled || Boolean(applyingId)}
              onClick={() => onApply(preset)}
              style={{
                borderColor: active ? theme.borderActive : theme.border,
                background: active ? theme.goldSoft : 'transparent',
                opacity: disabled || (applyingId && !applying) ? 0.72 : 1,
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border" style={{ background: theme.goldSoft, borderColor: theme.border, color: theme.goldDeep }}>
                  {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold" style={{ color: active ? theme.goldDeep : theme.textSoft }}>{preset.label}</span>
                  <span className="block truncate text-[10px]" style={{ color: theme.textGhost }}>
                    {applying ? 'Conectando personas…' : `${slugs.length} persona${slugs.length === 1 ? '' : 's'} na seleção`}
                  </span>
                </span>
                {active && !applying ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ background: theme.aliveSoft, color: theme.alive }}>
                    <CheckCircle2 className="h-3 w-3" /> Aplicado
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: theme.textMute }}>{preset.description}</p>
              {presetPersonas.length ? (
                <div className="mt-2 flex items-center">
                  <div className="flex -space-x-1.5">
                    {shown.map((persona) => (
                      <PersonaAvatar key={persona.slug} persona={persona} size="xs" />
                    ))}
                  </div>
                  {extra > 0 ? (
                    <span className="ml-2 text-[10px] font-medium" style={{ color: theme.textGhost }}>+{extra}</span>
                  ) : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WorkflowRoleRow({
  role,
  personaBySlug,
  routerProfiles,
  selectedSlugs,
  activeSlug,
  disabled,
  busySlug,
  onOpen,
  onRemove,
  onInspect,
  onSetModel,
}: {
  role: PersonaPickerConfig;
  personaBySlug: Map<string, YumePersonaSummary>;
  routerProfiles: RouterModelProfile[];
  selectedSlugs: string[];
  activeSlug: string | null;
  disabled: boolean;
  busySlug: string | null;
  onOpen: () => void;
  onRemove: (slug: string) => void;
  onInspect: (slug: string | null) => void;
  onSetModel: (slug: string, model: string) => void | Promise<void>;
}) {
  const theme = useTheme();
  const Icon = role.icon;
  const selectedItems = selectedSlugs.map((slug) => ({
    slug,
    persona: personaBySlug.get(slug),
  }));
  const active = selectedSlugs.includes(String(activeSlug || ''));

  return (
    <article
      className="rounded-xl border p-3 transition"
      data-testid={`workflow-role-${role.id}`}
      style={{ borderColor: active ? theme.borderActive : selectedSlugs.length ? theme.borderHover : theme.border }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border" style={{ background: theme.goldSoft, borderColor: theme.border, color: theme.goldDeep }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="block truncate text-xs font-semibold" style={{ color: active ? theme.goldDeep : theme.textSoft }}>{role.label}</span>
            {role.optional ? (
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ background: 'rgba(255,255,255,0.06)', color: theme.textGhost }}>
                opcional
              </span>
            ) : null}
          </span>
          <span className="block truncate text-[10px]" style={{ color: theme.textGhost }}>
            {role.optional
              ? 'opcional — roda só se preenchido'
              : role.multiple ? `até ${role.maxSlugs} personas` : 'uma persona'}
          </span>
        </span>
        <button type="button" className="rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition" onClick={onOpen} disabled={disabled} style={{ background: theme.goldSoft, borderColor: theme.border, color: theme.goldDeep }}>
          {selectedSlugs.length ? role.multiple ? 'Adicionar' : 'Trocar' : 'Escolher'}
        </button>
      </div>

      {selectedItems.length ? (
        <div className="mt-2 space-y-1.5">
          {selectedItems.map(({ slug, persona }) => (
            <div key={slug} className="rounded-lg px-2 py-1.5" style={{ background: theme.surfaceHi }}>
              <div className="flex items-center gap-2">
                {persona ? <PersonaAvatar persona={persona} size="xs" /> : <span className="h-7 w-7 rounded-lg" style={{ background: theme.goldSoft }} />}
                <button type="button" className="min-w-0 flex-1 truncate text-left text-[11px] font-medium" onClick={() => onInspect(slug)} style={{ color: theme.textSoft }}>{persona?.name || slug}</button>
                <button type="button" className="grid h-7 w-7 place-items-center rounded-md transition" onClick={() => !disabled && onRemove(slug)} disabled={disabled} aria-label={`Remover ${persona?.name || slug} de ${role.label}`} style={{ color: theme.textGhost }}><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-9">
                <PersonaModelSelect
                  slug={slug}
                  persona={persona}
                  profiles={routerProfiles}
                  disabled={disabled || busySlug === slug}
                  onChange={onSetModel}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <button type="button" className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-left text-[10px] transition" onClick={onOpen} disabled={disabled} style={{ borderColor: theme.border, color: theme.textGhost }}>
          <Plus className="h-3.5 w-3.5" /> Nenhuma persona atribuída
        </button>
      )}
    </article>
  );
}

function PersonaModelSelect({
  slug,
  persona,
  profiles,
  disabled,
  onChange,
}: {
  slug: string;
  persona?: YumePersonaSummary;
  profiles: RouterModelProfile[];
  disabled?: boolean;
  onChange: (slug: string, model: string) => void | Promise<void>;
}) {
  const theme = useTheme();
  const value = String(persona?.model || '').trim();
  const options = profiles.length
    ? profiles
    : value
      ? [{ id: value, name: value, model: value }]
      : [];
  const hasValue = options.some((profile) => profile.model === value);
  // Fundo opaco: option nativo no Windows herda contraste ruim de rgba translúcido.
  const selectSurface = '#12161d';
  const selectText = theme.text;

  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5" data-persona-model-select={slug}>
      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide" style={{ color: theme.textGhost }}>
        Motor
      </span>
      <select
        className="luca-persona-model-select min-w-0 flex-1 truncate rounded-md border px-1.5 py-1 font-mono text-[10px] outline-none"
        value={hasValue ? value : ''}
        disabled={disabled || !options.length}
        aria-label={`Modelo 9Router de ${persona?.name || slug}`}
        onChange={(event) => {
          const next = event.target.value;
          if (next) void onChange(slug, next);
        }}
        style={{ background: selectSurface, borderColor: theme.border, color: selectText, colorScheme: 'dark' }}
      >
        {!hasValue && <option value="">{value || 'Escolher modelo'}</option>}
        {options.map((profile) => (
          <option key={`${profile.id}-${profile.model}`} value={profile.model} style={{ background: selectSurface, color: selectText }}>
            {profile.name}
          </option>
        ))}
      </select>
      {persona?.modelOverridden ? (
        <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
          LUCA
        </span>
      ) : (
        <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase" style={{ background: theme.aliveSoft, color: theme.alive }} title="Motor do Yume (sem override local)">
          Yume
        </span>
      )}
    </label>
  );
}

function PersonaPickerSheet({ role, personas, selectedSlugs, query, busySlug, onQuery, onClose, onChoose, onRemove }: {
  role: PersonaPickerConfig;
  personas: YumePersonaSummary[];
  selectedSlugs: string[];
  query: string;
  busySlug: string | null;
  onQuery: (value: string) => void;
  onClose: () => void;
  onChoose: (slug: string) => void | Promise<void>;
  onRemove: (slug: string) => void;
}) {
  const theme = useTheme();
  const RoleIcon = role.icon;
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const term = query.trim().toLowerCase();
  const visiblePersonas = personas.filter((persona) => !term || [persona.name, persona.description, persona.purpose, persona.slug].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  const rosterPersonas = visiblePersonas.filter((persona) => persona.is_official === true);
  const secondaryPersonas = visiblePersonas.filter((persona) => persona.is_official !== true);
  const limitReached = role.multiple && selectedSlugs.length >= role.maxSlugs;

  useEffect(() => {
    if (term) setSecondaryOpen(true);
  }, [term]);

  const renderPersonaOption = (persona: YumePersonaSummary) => {
    const selected = selectedSlugs.includes(persona.slug);
    const busy = busySlug === persona.slug;
    const secondary = persona.is_official !== true;
    return (
      <button
        key={persona.slug}
        type="button"
        className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition"
        data-testid={`persona-option-${persona.slug}`}
        onClick={() => selected ? onRemove(persona.slug) : void onChoose(persona.slug)}
        disabled={Boolean(busySlug) || (!selected && limitReached)}
        style={{
          background: selected ? theme.goldSoft : theme.input,
          borderColor: selected ? theme.borderActive : theme.border,
          opacity: (!selected && limitReached) ? 0.5 : 1,
        }}
      >
        <PersonaAvatar persona={persona} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold" style={{ color: theme.textSoft }}>{persona.name}</span>
          <span className="mt-0.5 block line-clamp-2 text-[11px] leading-relaxed" style={{ color: theme.textMute }}>{persona.description || persona.purpose || 'Especialista disponível no catálogo.'}</span>
          {persona.model ? (
            <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px]" style={{ background: 'rgba(255,255,255,0.05)', color: theme.textGhost }}>
              {persona.model}
              {persona.modelOverridden ? ' · LUCA' : ''}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.goldDeep }} /> : selected ? <CheckCircle2 className="h-4 w-4" style={{ color: theme.alive }} /> : <Plus className="h-4 w-4" style={{ color: theme.goldDeep }} />}
          <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: persona.is_official ? theme.alive : theme.textGhost }}>
            {selected ? 'selecionada' : persona.is_official ? 'oficial' : 'secundária'}
          </span>
        </span>
      </button>
    );
  };

  return (
    <motion.div className="luca-ai-picker-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar seleção de personas" onClick={onClose} />
      <motion.aside className="luca-ai-picker" initial={{ x: 36, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 36, opacity: 0 }} transition={{ duration: 0.2 }} role="dialog" aria-modal="true" aria-labelledby="luca-persona-picker-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
        <header className="border-b p-5" style={{ borderColor: theme.border }}>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: theme.goldSoft, color: theme.goldDeep }}><RoleIcon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.textGhost }}>Selecionar para</p>
              <h2 id="luca-persona-picker-title" className="mt-1 text-lg font-semibold" style={{ color: theme.text }}>{role.label}</h2>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: theme.textMute }}>{role.multiple ? `Escolha até ${role.maxSlugs} personas. Você pode combinar especialistas.` : 'Escolha a persona responsável por esta etapa.'}</p>
            </div>
            <button type="button" className="grid h-9 w-9 place-items-center rounded-lg" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: theme.textGhost }} />
            <input autoFocus type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar por nome ou especialidade" className="w-full rounded-xl border py-3 pl-10 pr-3 text-sm outline-none" style={{ background: theme.input, borderColor: theme.border, color: theme.text }} />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <section aria-labelledby="luca-picker-roster-title" className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1 pb-1">
              <h3 id="luca-picker-roster-title" className="text-xs font-semibold" style={{ color: theme.textSoft }}>Roster principal</h3>
              <span className="text-[10px] font-mono" style={{ color: theme.textGhost }}>{rosterPersonas.length}</span>
            </div>
            {rosterPersonas.length > 0 ? rosterPersonas.map(renderPersonaOption) : (
              <p className="rounded-xl border px-3 py-4 text-xs leading-relaxed" style={{ borderColor: theme.border, color: theme.textMute }}>
                Nenhuma persona oficial corresponde à busca. A composição do roster é gerenciada no Yume.
              </p>
            )}
          </section>

          <section aria-labelledby="luca-picker-secondary-title" className="mt-5 space-y-2">
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left active:scale-[0.96] motion-safe:transition-transform"
              style={{ background: theme.input, borderColor: theme.border, color: theme.text }}
              aria-expanded={secondaryOpen}
              aria-controls="luca-picker-secondary-panel"
              onClick={() => setSecondaryOpen((open) => !open)}
            >
              <span className="min-w-0 flex-1">
                <span id="luca-picker-secondary-title" className="block text-xs font-semibold">Secundárias no Yume</span>
                <span className="mt-0.5 block text-[10px]" style={{ color: theme.textMute }}>{secondaryPersonas.length} disponíveis via cache local do LUCA</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 motion-safe:transition-transform ${secondaryOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {secondaryOpen && (
              <div id="luca-picker-secondary-panel" className="space-y-2 pt-1">
                {secondaryPersonas.length > 0 ? secondaryPersonas.map(renderPersonaOption) : (
                  <p className="px-3 py-4 text-xs" style={{ color: theme.textMute }}>Nenhuma persona secundária corresponde à busca.</p>
                )}
              </div>
            )}
          </section>
          {!visiblePersonas.length && (
            <div
              className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-4 py-12 text-center"
              data-luca-picker-empty
              data-tone="empty"
            >
              <p className="text-sm font-semibold" style={{ color: theme.textSoft }}>
                {term
                  ? "Nenhuma persona corresponde à busca."
                  : "Nenhuma persona disponível no catálogo."}
              </p>
              <p className="max-w-[40ch] text-xs leading-relaxed" style={{ color: theme.textMute }}>
                {term
                  ? "Limpe a busca para ver o catálogo completo ou ajuste o termo."
                  : "Conecte personas no Yume e abra o picker de novo."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {term ? (
                  <button
                    type="button"
                    className="btn-primary !px-4 !py-2 !text-xs"
                    data-luca-picker-clear
                    onClick={() => onQuery("")}
                  >
                    Limpar busca
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-fleet !px-4 !py-2 !text-xs"
                  data-luca-picker-close
                  onClick={onClose}
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </motion.div>
  );
}

function LucaProcessTerminal({
  persona,
  events,
  running,
  traceId,
}: {
  persona: YumePersonaSummary | null;
  events: RuntimeEvent[];
  running: boolean;
  traceId: string | null;
}) {
  const theme = useTheme();
  const visibleEvents = events.slice(-8);
  const latest = visibleEvents.length ? visibleEvents[visibleEvents.length - 1] : undefined;
  const latestState = latest ? runtimeEventState(latest) : running ? 'running' : 'info';
  const stateColor = latestState === 'error'
    ? theme.error
    : latestState === 'ok'
      ? theme.ok
      : latestState === 'running'
        ? theme.gold
        : theme.textMute;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl" style={{ background: theme.input }}>
      <header className="flex items-center gap-2 px-4 h-12 border-b shrink-0" style={{ borderColor: theme.border }}>
        <Terminal className="w-4 h-4" style={{ color: theme.gold, opacity: 0.85 }} />
        <h3 className="text-xs font-semibold flex-1 min-w-0 luca-wrap" style={{ color: theme.textSoft }}>
          Atividade
        </h3>
        <span className="text-[9px] font-semibold tracking-wider uppercase" style={{ color: stateColor }}>
          {latestState}
        </span>
      </header>

      <div className="term flex-1 overflow-y-auto p-3 m-2 rounded-xl border-0">
        {visibleEvents.length ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-2 text-[10px]" style={{ color: theme.textGhost }}>
              <span className="truncate">{persona?.name || 'Fluxo completo'}</span>
              {traceId && <span className="font-mono">sessão {traceId.slice(-6)}</span>}
            </div>
            <div className="space-y-2">
              {visibleEvents.map((event) => (
            <ProcessEventLine key={event.id} event={event} />
              ))}
            </div>
          </>
        ) : (
          <div
            className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 px-5 text-center"
            data-luca-activity-empty
            data-tone="empty"
          >
            <Terminal className="h-7 w-7" style={{ color: theme.textGhost }} />
            <p className="text-sm font-semibold" style={{ color: theme.textSoft }}>
              Nenhuma atividade nesta sessão
            </p>
            <p className="max-w-[28ch] text-xs leading-relaxed" style={{ color: theme.textMute }}>
              {running
                ? 'Aguardando o primeiro evento da execução em curso.'
                : 'Envie uma missão com a equipe configurada para ver o fluxo dos agentes aqui.'}
            </p>
            {!running && (
              <button
                type="button"
                className="btn-primary !px-4 !py-2 !text-xs"
                data-luca-activity-focus-mission
                onClick={() => {
                  const el = document.getElementById('luca-ai-mission') as HTMLTextAreaElement | null;
                  el?.focus();
                  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }}
              >
                Escrever missão
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessEventLine({ event }: { event: RuntimeEvent }) {
  const theme = useTheme();
  const payload = runtimePayload(event);
  const state = runtimeEventState(event);
  const color = state === 'error'
    ? theme.error
    : state === 'ok'
      ? theme.ok
      : state === 'running'
        ? theme.gold
        : theme.textMute;
  const input = compactText(payload.inputSummary || payload.missionSummary, 110);
  const output = compactText(payload.outputSummary || payload.error, 130);
  const duration = typeof payload.durationMs === 'number' ? `${Math.round(payload.durationMs)}ms` : '';
  const model = compactText(payload.model, 28);

  return (
    <div className="rounded-lg border px-2.5 py-2 text-[11px]" style={{ borderColor: 'rgba(184,216,176,0.18)', background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate" style={{ color }}>
          {runtimeEventLabel(event)}
        </span>
        {model && (
          <span className="font-mono shrink-0 rounded px-1.5 py-0.5" style={{ background: 'rgba(255,255,255,0.05)', color: theme.textGhost }}>
            {model}
          </span>
        )}
        <span className="font-mono shrink-0" style={{ color: theme.textGhost }}>{duration || runtimeEventTime(event)}</span>
      </div>
      <div className="mt-1 grid gap-1">
        {input && (
          <p className="line-clamp-1" style={{ color: theme.consoleText }}>
            IN: {input}
          </p>
        )}
        {output && (
          <p className="line-clamp-2" style={{ color: state === 'error' ? theme.error : theme.consoleText }}>
            OUT: {output}
          </p>
        )}
      </div>
    </div>
  );
}

function lastOperatorMission(transcript: TeamTranscriptEntry[]): string {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.role === 'operator' && String(entry.content || '').trim()) {
      return String(entry.content).trim();
    }
  }
  return '';
}

function LucaMissionCanvas({
  transcript,
  finalResult,
  visualPack,
  personaBySlug,
  running,
  transcriptRef,
  onInspect,
  operationMode,
  missionDraft,
}: {
  transcript: TeamTranscriptEntry[];
  finalResult: TeamTranscriptEntry | null;
  visualPack: LucaAiVisualPack | null;
  personaBySlug: Map<string, YumePersonaSummary>;
  running: boolean;
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  onInspect: (slug: string | null) => void;
  operationMode: OperationMode;
  missionDraft?: string;
}) {
  const theme = useTheme();
  const headerStatus = running
    ? operationMode === 'individual' ? 'respostas individuais em andamento' : 'workflow em andamento'
    : finalResult
      ? operationMode === 'individual'
        ? 'veredito do juiz pronto'
        : visualPack && visualPack.status !== 'skipped'
          ? 'entrega final e artefatos visuais prontos'
          : 'exibicao final pronta'
      : transcript.length ? 'rodada registrada' : 'aguardando missao';
  const originalMission = lastOperatorMission(transcript) || String(missionDraft || '').trim();
  const hasDraftOnlyMission = Boolean(String(missionDraft || '').trim()) && !lastOperatorMission(transcript);
  const supportingTranscript = finalResult
    ? transcript.filter((entry) => !(
      entry.slug === finalResult.slug
      && entry.stage === finalResult.stage
      && compactText(entry.content) === compactText(finalResult.content)
    ))
    : transcript;

  return (
    <div ref={transcriptRef} className="luca-ai-chat-scroll">
      <div className="luca-ai-chat-thread">
        {(supportingTranscript.length > 0 || finalResult) && (
          <div className="mb-5 flex items-center gap-2 text-[11px]" style={{ color: theme.textGhost }}>
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span className="luca-wrap">{headerStatus}</span>
          </div>
        )}

        {/* Missão legível no canvas: rascunho SOMPO/composer ou pergunta da rodada. */}
        {originalMission && (
          <div
            className="luca-ai-mission-pin mb-4 rounded-2xl border px-4 py-3"
            data-luca-mission-pin
            data-luca-mission-pin-kind={hasDraftOnlyMission ? 'draft' : 'question'}
            style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.textGhost }}>
              {hasDraftOnlyMission ? 'Missão no compositor' : 'Pergunta original'}
            </p>
            <p className="text-[15px] leading-relaxed luca-wrap luca-ai-selectable" style={{ color: theme.text }}>
              {originalMission}
            </p>
          </div>
        )}

        {supportingTranscript.length ? supportingTranscript.map((entry) => (
          entry.role === 'operator' ? (
            <div key={entry.id} className="block w-full min-w-0">
              <TranscriptEntry entry={entry} persona={undefined} />
            </div>
          ) : entry.phase === 'blind' || entry.phase === 'revision' ? (
            <IndividualResponseCard
              key={entry.id}
              entry={entry}
              persona={entry.slug ? personaBySlug.get(entry.slug) : undefined}
              onInspect={onInspect}
            />
          ) : (
            <button key={entry.id} type="button" className="block w-full min-w-0 text-left" onClick={() => onInspect(entry.slug || null)}>
              <TranscriptEntry entry={entry} persona={entry.slug ? personaBySlug.get(entry.slug) : undefined} />
            </button>
          )
        )) : !finalResult && (
          <div
            className={`flex flex-col items-center justify-center gap-3 px-4 text-center sm:px-6 ${originalMission ? 'min-h-[28vh] py-8' : 'min-h-[48vh]'}`}
            data-luca-canvas-empty
            data-tone="empty"
          >
            {!originalMission && (
              <div className="mb-2 grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border" style={{ borderColor: theme.border, background: theme.goldSoft }}>
                <img src="/icon-512.png" alt="" className="h-full w-full object-cover object-[center_28%]" />
              </div>
            )}
            <h1 className="text-xl font-semibold tracking-[-0.025em]" style={{ color: theme.text }}>
              {originalMission
                ? (operationMode === 'individual' ? 'Configure a seleção e envie' : 'Configure a equipe e envie')
                : (operationMode === 'individual' ? 'Qual problema deve ser julgado?' : 'O que a equipe deve entregar?')}
            </h1>
            <p className="mt-0 max-w-[46ch] text-sm leading-relaxed luca-wrap" style={{ color: theme.textMute }}>
              {operationMode === 'individual'
                ? 'Abra Seleção no topo, escolha até cinco participantes e um juiz. Cada resposta fica isolada e o veredito encerra a rodada.'
                : 'Abra Equipe no topo, escolha as personas e envie a missão abaixo. As respostas aparecem aqui como uma conversa.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="btn-primary !px-4 !py-2 !text-xs"
                data-luca-canvas-focus-mission
                onClick={() => {
                  const el = document.getElementById('luca-ai-mission') as HTMLTextAreaElement | null;
                  el?.focus();
                  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }}
              >
                {originalMission ? 'Editar missão' : 'Escrever missão'}
              </button>
            </div>
          </div>
        )}

        {finalResult && (
          <FinalDisplayCard entry={finalResult} persona={finalResult.slug ? personaBySlug.get(finalResult.slug) : undefined} />
        )}

        {visualPack && visualPack.status !== 'skipped' && (
          <VisualPackCard pack={visualPack} />
        )}

        {running && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            {operationMode === 'individual' ? 'As personas estão resolvendo individualmente...' : 'A equipe está trabalhando...'}
          </div>
        )}
      </div>
    </div>
  );
}

function VisualPackCard({ pack }: { pack: LucaAiVisualPack }) {
  const theme = useTheme();
  const charts = Array.isArray(pack.charts) ? pack.charts : [];
  const images = Array.isArray(pack.images) ? pack.images : [];
  const report = pack.report || null;
  const statusLabel = pack.status === 'complete'
    ? 'completo'
    : pack.status === 'partial'
      ? 'parcial'
      : pack.status === 'failed'
        ? 'falhou'
        : String(pack.status || 'artefatos');

  return (
    <article className="luca-ai-message mt-4">
      <div className="luca-ai-message-meta">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full" style={{ background: theme.goldSoft, color: theme.gold }}>
          <ImageIcon className="h-4 w-4" />
        </span>
        <h3 className="truncate text-[13px] font-semibold" style={{ color: theme.text }}>Artefatos visuais</h3>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: theme.textMute }}>
          {statusLabel}
        </span>
        {pack.imageEngine ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', color: theme.textGhost }} title="Motor de imagem 9Router">
            {pack.imageEngine}
          </span>
        ) : null}
        {report?.markdown ? (
          <span className="luca-ai-message-copy ml-auto">
            <CopyLogButton text={report.markdown} label="Copiar relatório" />
          </span>
        ) : null}
      </div>
      <div className="luca-ai-message-body space-y-4">
        {pack.summary ? (
          <p className="text-sm leading-relaxed" style={{ color: theme.textSoft }}>{pack.summary}</p>
        ) : null}

        {report?.markdown ? (
          <section className="rounded-xl border p-3" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: theme.textGhost }}>
              <FileText className="h-3.5 w-3.5" />
              {report.title || 'Relatório'}
            </div>
            <div className="luca-ai-selectable">
              <RichMessageBody content={report.markdown} />
            </div>
          </section>
        ) : null}

        {charts.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-2">
            {charts.map((chart) => (
              <DashboardBlock
                key={chart.id}
                block={{
                  type: chart.type === 'pie' ? 'pie' : 'tower',
                  title: chart.title,
                  items: chart.items,
                  body: chart.rationale,
                }}
              />
            ))}
          </section>
        ) : null}

        {images.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-2">
            {images.map((image) => (
              <figure
                key={image.id}
                className="overflow-hidden rounded-xl border"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
              >
                {image.status === 'ok' && image.url ? (
                  <img
                    src={image.url}
                    alt={image.title || 'Artefato visual'}
                    className="max-h-72 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex min-h-32 items-center justify-center px-3 py-6 text-center text-xs" style={{ color: theme.textMute }}>
                    {image.status === 'failed'
                      ? (image.error || 'Falha ao gerar imagem')
                      : 'Imagem não gerada'}
                  </div>
                )}
                <figcaption className="space-y-1 px-3 py-2">
                  <strong className="block text-xs" style={{ color: theme.text }}>{image.title || image.id}</strong>
                  {image.prompt ? (
                    <p className="text-[11px] leading-snug" style={{ color: theme.textGhost }}>{image.prompt}</p>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </section>
        ) : null}

        {Array.isArray(pack.errors) && pack.errors.length > 0 ? (
          <p className="text-[11px]" style={{ color: theme.error || theme.textMute }}>
            {pack.errors.map((item) => item.error).filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function LucaMissionBar({
  mission,
  attachments,
  uploadingAttachment,
  fileInputRef,
  running,
  canRun,
  operationMode,
  readyRoles,
  requiredRoleCount,
  isWorkflowReady,
  isIndividualReady,
  assignedCount,
  onMissionChange,
  onFilesSelected,
  onRemoveAttachment,
  onRun,
  onClear,
  onConfigureTeam,
}: {
  mission: string;
  attachments: LucaAiChatAttachment[];
  uploadingAttachment: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  running: boolean;
  canRun: boolean;
  operationMode: OperationMode;
  readyRoles: number;
  requiredRoleCount: number;
  isWorkflowReady: boolean;
  isIndividualReady: boolean;
  assignedCount: number;
  onMissionChange: (value: string) => void;
  onFilesSelected: (files: FileList | File[] | null) => void | Promise<void>;
  onRemoveAttachment: (attachment: LucaAiChatAttachment) => void | Promise<void>;
  onRun: () => void | Promise<void>;
  onClear: () => void;
  onConfigureTeam?: () => void;
}) {
  const theme = useTheme();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const canAttach = !running && !uploadingAttachment && attachments.length < 4;

  // Composer cresce com o texto — missões longas (SOMPO) não cabem em 1 linha.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.max(40, Math.min(el.scrollHeight, 240));
    el.style.height = `${next}px`;
  }, [mission]);

  function submit() {
    if (canRun) {
      void onRun();
      return;
    }
    // Play / Enter sem equipe pronta: abre o painel em vez de engolir a ação.
    onConfigureTeam?.();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    // Enter só envia quando a rodada pode rodar. Sem equipe pronta, deixa
    // quebrar linha — senão o usuário “não consegue escrever”.
    if (!canRun) return;
    event.preventDefault();
    submit();
  }

  /**
   * Ctrl+V / Cmd+V:
   * - texto puro (ou texto + HTML) → cola no composer (nunca bloquear)
   * - imagem/arquivo puro (print, copiar imagem) → anexa
   * Antes, qualquer item `file` no clipboard fazia preventDefault e matava colar texto.
   */
  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!canAttach) return;
    const plain = String(event.clipboardData?.getData('text/plain') || '');
    if (plain.trim()) return;
    const files = filesFromDataTransfer(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    void onFilesSelected(files);
  }

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!canAttach) return;
    if (![...event.dataTransfer.types].includes('Files')) return;
    event.preventDefault();
    setDragOver(true);
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!canAttach) return;
    if (![...event.dataTransfer.types].includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }

  function onDragLeave(event: React.DragEvent<HTMLDivElement>) {
    // Só some o highlight ao sair do container (não ao entrar em filhos).
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragOver(false);
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (!canAttach) return;
    const files = filesFromDataTransfer(event.dataTransfer);
    if (!files.length) return;
    void onFilesSelected(files);
  }

  const isReady = operationMode === 'individual' ? isIndividualReady : isWorkflowReady;
  // Pill only earns screen space while it informs: progress during a run or
  // guidance while the selection is incomplete. "Pronta" idle state is noise —
  // it used to stick permanently over the chat (reported as a stuck button).
  const showStatus = running || !isReady;
  const statusText = running
    ? operationMode === 'individual' ? '9Router executa as respostas; o juiz entra em seguida' : '9Router está executando o fluxo'
    : operationMode === 'individual'
      ? 'Escolha participantes e uma persona juíza'
      : `${readyRoles} de ${requiredRoleCount} etapas obrigatórias — clique para montar a equipe`;
  const statusColor = running ? theme.goldDeep : theme.textMute;
  const sendTitle = canRun
    ? 'Enviar missão'
    : operationMode === 'individual'
      ? 'Escolha participantes e juiz (abre a seleção)'
      : 'Configure a equipe primeiro (abre o painel)';

  return (
    <>
      {showStatus && (
        running ? (
          <div className="luca-ai-composer-status" style={{ color: statusColor }}>
            {statusText}
          </div>
        ) : (
          <button
            type="button"
            className="luca-ai-composer-status is-action"
            style={{ color: statusColor }}
            onClick={() => onConfigureTeam?.()}
            data-luca-composer-configure
          >
            {statusText}
          </button>
        )
      )}
      {attachments.length > 0 && (
        <div className="luca-ai-attachment-list" aria-label="Anexos desta mensagem">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="luca-ai-attachment">
              {attachment.kind === 'image' ? (
                <img src={attachment.url} alt="" className="luca-ai-attachment-thumb" />
              ) : (
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <strong>{attachment.name}</strong>
                <small>{formatAttachmentSize(attachment.size)}</small>
              </span>
              <button
                type="button"
                onClick={() => { void onRemoveAttachment(attachment); }}
                disabled={running || uploadingAttachment}
                aria-label={`Remover ${attachment.name}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className={`luca-ai-composer${dragOver ? ' is-drag-over' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <label className="sr-only" htmlFor="luca-ai-mission">Missão da bancada</label>
        <textarea
          id="luca-ai-mission"
          ref={inputRef}
          value={mission}
          onChange={(event) => onMissionChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={2}
          className="luca-ai-composer-input"
          placeholder={operationMode === 'individual' ? 'Faça o que quiser' : 'Envie uma missão para a equipe...'}
          disabled={running}
          spellCheck
        />
        <div className="luca-ai-composer-toolbar">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,text/*,.md,.csv,.json,.xml,.yaml,.yml,.toml,.sql,.js,.jsx,.ts,.tsx,.css,.html,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.hpp"
            className="sr-only"
            aria-label="Selecionar fotos e arquivos de texto"
            onChange={(event) => { void onFilesSelected(event.target.files); }}
            disabled={!canAttach}
          />
          <button
            type="button"
            className="luca-ai-composer-action"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canAttach}
            aria-label="Anexar arquivos e fotos"
            title="Fotos e arquivos de texto (até 10 MB). Cole com Ctrl+V ou arraste. PDF ainda não é lido pelos modelos."
          >
            {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          </button>
          <button type="button" className="luca-ai-composer-action" onClick={onClear} disabled={running} aria-label="Limpar conversa" title="Limpar conversa">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={submit}
            disabled={running}
            className={`luca-ai-send-button${canRun ? '' : ' is-needs-team'}`}
            aria-label={canRun ? 'Enviar missão' : 'Configurar equipe para enviar'}
            title={sendTitle}
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : canRun ? <Play className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
          </motion.button>
        </div>
      </div>
    </>
  );
}

function PersonaAvatar({ persona, size = 'md' }: { persona: YumePersonaSummary; size?: 'xs' | 'sm' | 'md' }) {
  const theme = useTheme();
  const avatarUrl = persona.avatarUrl || persona.avatar_url || '';
  const initial = (persona.name || persona.slug || '?').trim().charAt(0).toUpperCase();
  const sizeClass = size === 'xs'
    ? 'h-7 w-7 text-sm'
    : size === 'sm'
      ? 'h-8 w-8 text-base'
      : 'h-11 w-11 text-lg';
  const radius = size === 'md' ? 'rounded-xl' : 'rounded-full';

  return (
    <div className={`${sizeClass} ${radius} relative shrink-0 overflow-hidden border`} style={{ background: theme.goldSoft, borderColor: 'rgba(255,255,255,0.08)', color: theme.goldDeep }}>
      <div className="absolute inset-0 flex items-center justify-center font-display font-bold">{initial}</div>
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt={persona.name}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: 'center 18%' }}
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </div>
  );
}

function FinalDisplayCard({ entry, persona }: { entry: TeamTranscriptEntry; persona?: YumePersonaSummary }) {
  const theme = useTheme();
  const isJudge = entry.stage === 'Juiz';
  return (
    <article className="luca-ai-message group">
      <div className="luca-ai-message-meta">
        <SpeakerAvatar entry={entry} persona={persona} compact />
        <h3 className="truncate text-[13px] font-semibold" style={{ color: theme.text }}>{entry.name}</h3>
        {entry.phase && <PhaseBadge phase={entry.phase} />}
        {!isJudge && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: theme.textMute }}>
            <Eye className="h-3 w-3" /> Entrega final
          </span>
        )}
        {entry.model ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', color: theme.textGhost }} title="Motor 9Router">
            {entry.model}
          </span>
        ) : null}
        <span className="luca-ai-message-copy ml-auto">
          <CopyLogButton text={entry.content} label="Copiar veredito" />
        </span>
      </div>
      <div className="luca-ai-message-body luca-ai-selectable">
        <RichMessageBody content={entry.content} />
      </div>
    </article>
  );
}

function IndividualResponseCard({
  entry,
  persona,
  onInspect,
}: {
  entry: TeamTranscriptEntry;
  persona?: YumePersonaSummary;
  onInspect: (slug: string | null) => void;
}) {
  const theme = useTheme();
  return (
    <motion.details
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="luca-ai-individual-response luca-ai-message group"
    >
      <summary
        className="luca-ai-message-meta cursor-pointer list-none"
        onClick={() => onInspect(entry.slug || null)}
      >
        <SpeakerAvatar entry={entry} persona={persona} compact />
        <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold" style={{ color: entry.status === 'error' ? theme.error : theme.text }}>{entry.name}</span>
                  <span className="block text-[11px]" style={{ color: theme.textGhost }}>{entry.status === 'error' ? 'Falha individual' : 'Resposta individual · expandir'}</span>
                </span>
                {entry.phase && <PhaseBadge phase={entry.phase} />}
                {entry.model ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', color: theme.textGhost }} title="Motor 9Router">
                    {entry.model}
                  </span>
                ) : null}
                <span
                  className="luca-ai-message-copy"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <CopyLogButton text={entry.content} label={`Copiar resposta de ${entry.name}`} />
                </span>
        <ChevronDown className="luca-ai-individual-chevron h-4 w-4 shrink-0" style={{ color: theme.textMute }} />
      </summary>
      <div className="luca-ai-message-body luca-ai-selectable mt-2 pl-1">
        <RichMessageBody content={entry.content} />
      </div>
    </motion.details>
  );
}

function TranscriptEntry({ entry, persona }: { entry: TeamTranscriptEntry; persona?: YumePersonaSummary }) {
  const theme = useTheme();
  const isOperator = entry.role === 'operator';
  const toneColor = entry.status === 'error' ? theme.error : theme.text;

  if (isOperator) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="luca-ai-message luca-ai-message-operator group flex justify-end">
        <div className="relative min-w-0 max-w-[min(100%,34rem)]">
          <article
            className="luca-ai-operator-bubble luca-ai-selectable min-w-0 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.06)', color: theme.text, border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RichMessageBody content={entry.content} compact />
            <AttachmentList attachments={entry.attachments} />
          </article>
          <span className="luca-ai-message-copy luca-ai-message-copy-operator">
            <CopyLogButton text={entry.content} label="Copiar mensagem enviada" />
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="luca-ai-message group"
    >
      <div className="luca-ai-message-meta">
        <SpeakerAvatar entry={entry} persona={persona} compact />
        <span className="min-w-0 text-[13px] font-semibold luca-wrap" style={{ color: toneColor }}>{entry.name}</span>
        {entry.phase ? <PhaseBadge phase={entry.phase} /> : entry.stage && <StageBadge stage={entry.stage} />}
        {entry.model ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', color: theme.textGhost }} title="Motor 9Router">
            {entry.model}
          </span>
        ) : null}
        <time className="ml-auto shrink-0 text-[10px] font-mono" style={{ color: theme.textGhost }}>
          {new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </time>
        <span className="luca-ai-message-copy">
          <CopyLogButton text={entry.content} label={`Copiar mensagem de ${entry.name}`} />
        </span>
      </div>
      <div className="luca-ai-message-body luca-ai-selectable">
        <RichMessageBody content={entry.content} />
      </div>
    </motion.article>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const theme = useTheme();
  const roleId = [...ROLE_LABEL_BY_ID.entries()].find(([, label]) => label === stage)?.[0];
  const Icon = WORKFLOW_ROLES.find((role) => role.id === roleId)?.icon ?? GitBranch;

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide" style={{ color: theme.textMute }}>
      <Icon className="h-3 w-3 shrink-0 opacity-70" />
      <span className="truncate">{stage}</span>
    </span>
  );
}

function PhaseBadge({ phase }: { phase: LucaAiPersonaTeamPhase }) {
  const theme = useTheme();
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
      data-luca-individual-phase={phase}
      style={{ background: theme.goldSoft, borderColor: theme.border, color: theme.goldDeep }}
    >
      {INDIVIDUAL_PHASE_LABELS[phase]}
    </span>
  );
}

function SpeakerAvatar({ entry, persona, compact = false }: { entry: TeamTranscriptEntry; persona?: YumePersonaSummary; compact?: boolean }) {
  const theme = useTheme();
  const sizeClass = compact ? 'h-7 w-7' : 'h-8 w-8';
  if (persona) return <PersonaAvatar persona={persona} size="xs" />;

  const Icon = entry.status === 'error' ? AlertCircle : entry.role === 'operator' ? UserRound : MessageSquareText;
  const color = entry.status === 'error' ? theme.error : entry.role === 'operator' ? theme.navyDeep : theme.goldDeep;
  const background = entry.status === 'error' ? theme.errorBg : entry.role === 'operator' ? theme.fleetSoft : theme.goldSoft;

  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border`} style={{ background, borderColor: 'rgba(255,255,255,0.08)', color }}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function RichMessageBody({ content, compact = false }: { content: string; compact?: boolean }) {
  const theme = useTheme();
  const blocks = parseMessageBlocks(content);

  return (
    <div
      className={`luca-ai-prose luca-wrap ${compact ? 'text-[13px]' : ''}`}
      style={{ color: theme.textSoft }}
    >
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const headingClass = block.level <= 1
            ? 'text-[15px] font-semibold tracking-[-0.02em]'
            : block.level === 2
              ? 'text-[14.5px] font-semibold tracking-[-0.015em]'
              : 'text-[13.5px] font-semibold';
          return (
            <h4 key={`${block.kind}-${index}`} className={`${headingClass} leading-snug luca-wrap`} style={{ color: theme.text }}>
              <InlineText value={block.label} />
            </h4>
          );
        }

        if (block.kind === 'table') {
          return (
            <div key={`${block.kind}-${index}`} className="max-w-full overflow-x-auto rounded-xl border" style={{ borderColor: theme.border }}>
              <table className="w-full min-w-[min(100%,480px)] border-collapse text-left text-xs sm:text-sm">
                <thead style={{ background: theme.surfaceHi }}>
                  <tr>{block.headers.map((header, cellIndex) => <th key={`${header}-${cellIndex}`} className="border-b px-3 py-2.5 font-semibold luca-wrap sm:px-4 sm:py-3" style={{ borderColor: theme.border, color: theme.text }}><InlineText value={header} /></th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`} className="border-b last:border-b-0" style={{ borderColor: theme.border }}>
                      {block.headers.map((_, cellIndex) => <td key={`cell-${cellIndex}`} className="px-3 py-2.5 align-top luca-wrap sm:px-4 sm:py-3"><InlineText value={row[cellIndex] || '—'} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.kind === 'code') {
          return (
            <div key={`${block.kind}-${index}`} className="max-w-full overflow-hidden rounded-xl border" style={{ borderColor: theme.border, background: theme.console }}>
              {block.language && <div className="border-b px-4 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ borderColor: theme.border, color: theme.textGhost }}>{block.language}</div>}
              <pre className="luca-pre overflow-x-auto p-4 font-mono text-xs leading-relaxed" style={{ color: theme.consoleText }}><code>{block.body}</code></pre>
            </div>
          );
        }

        if (block.kind === 'image') {
          return (
            <figure key={`${block.kind}-${index}`} className="max-w-full overflow-hidden rounded-xl border" style={{ borderColor: theme.border, background: theme.input }}>
              <img src={block.src} alt={block.alt} className="max-h-[680px] w-full object-contain" />
              {block.alt && <figcaption className="border-t px-4 py-2 text-xs luca-wrap" style={{ borderColor: theme.border, color: theme.textMute }}>{block.alt}</figcaption>}
            </figure>
          );
        }

        if (block.kind === 'bullet') {
          return (
            <div key={`${block.kind}-${index}`} className="luca-ai-bullet">
              <span className="luca-ai-bullet-dot" style={{ background: theme.textMute }} />
              <div className="min-w-0 flex-1">
                {block.label && (
                  <span className="font-semibold luca-wrap" style={{ color: theme.text }}>
                    <InlineText value={block.label} />
                    {block.body ? ': ' : ''}
                  </span>
                )}
                {block.body ? (
                  <span className="luca-wrap">
                    <InlineText value={block.body} />
                  </span>
                ) : null}
              </div>
            </div>
          );
        }

        return (
          <p key={`${block.kind}-${index}`} className="luca-wrap">
            {block.label && (
              <span className="font-semibold" style={{ color: theme.text }}>
                <InlineText value={block.label} />
                {' '}
              </span>
            )}
            <InlineText value={block.body} />
          </p>
        );
      })}
    </div>
  );
}

function InlineText({ value }: { value: string }) {
  const theme = useTheme();
  return (
    <>
      {inlineTextParts(value).map((part, index) => (
        part.strong ? (
          <strong key={`${part.text}-${index}`} style={{ color: theme.text }}>
            {part.text}
          </strong>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        )
      ))}
    </>
  );
}
