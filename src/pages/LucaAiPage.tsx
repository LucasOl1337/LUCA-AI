import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  GitBranch,
  Loader2,
  MessageSquareText,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Scale,
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
  LucaAiChatSession,
  LucaAiPersonaTeamReply,
  LucaAiPersonaTeamRunResponse,
  LucaAiWorkflowAssignment,
  RouterModelProfile,
  RuntimeEvent,
  YumePersonaSummary,
} from '@/lib/types';
import CopyLogButton from '@/components/CopyLogButton';
import { useLuca } from '@/hooks/useLucaState';
import {
  LUCA_INDIVIDUAL_PRESETS,
  LUCA_TEAM_PRESETS,
  individualPresetMatches,
  individualPresetSlugs,
  teamPresetMatches,
  teamPresetSlugs,
  type LucaIndividualPreset,
  type LucaTeamPreset,
} from '@/lib/lucaPresets';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useChatLibrary } from '@/hooks/useChatLibrary';
import { useTheme } from '@/hooks/useTheme';

const MAX_EXECUTORS = 4;
const LUCA_AI_CLEAN_UI_VERSION = '9router-clean-v1';
const LUCA_AI_CLEAN_UI_STORAGE_KEY = 'luca.lucaAi.cleanUiVersion';

interface LucaAiPageProps {
  onNavigate: (page: 'personas') => void;
}

type TranscriptRole = 'operator' | 'persona' | 'system';
type OperationMode = 'team' | 'individual';
type WorkflowRoleId = 'supervisor' | 'mission' | 'execution' | 'approval' | 'display';
type WorkflowAssignments = Record<WorkflowRoleId, string[]>;
type IndividualPickerId = 'participants' | 'judge';
type PickerTarget = { mode: 'team'; id: WorkflowRoleId } | { mode: 'individual'; id: IndividualPickerId };

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
}

interface WorkflowRoleConfig extends PersonaPickerConfig {
  id: WorkflowRoleId;
}

interface TeamTranscriptEntry {
  id: string;
  role: TranscriptRole;
  name: string;
  slug?: string;
  model?: string;
  stage?: string;
  content: string;
  status?: 'ok' | 'error' | 'info';
  timestamp: string;
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
];

const INDIVIDUAL_PICKER_CONFIGS: Record<IndividualPickerId, PersonaPickerConfig> = {
  participants: { id: 'participants', label: 'Participantes', icon: Users, multiple: true, maxSlugs: 5 },
  judge: { id: 'judge', label: 'Juiz', icon: Scale, multiple: false, maxSlugs: 1 },
};

const ROLE_LABEL_BY_ID = new Map(WORKFLOW_ROLES.map((role) => [role.id, role.label]));

function createEmptyWorkflowAssignments(): WorkflowAssignments {
  return {
    supervisor: [],
    mission: [],
    execution: [],
    approval: [],
    display: [],
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
  return WORKFLOW_ROLES.every((role) => assignments[role.id].length > 0);
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

function transcriptEntryFromReply(
  reply: LucaAiPersonaTeamReply,
  timestamp: string,
  stage?: string,
): TeamTranscriptEntry {
  return {
    id: nowId(`persona-${reply.slug}`),
    role: 'persona',
    name: reply.name || reply.slug,
    slug: reply.slug,
    model: reply.model,
    stage,
    content: reply.ok
      ? reply.content || 'Sem resposta textual da persona.'
      : `Falha ao rodar esta persona: ${reply.error || 'erro desconhecido'}`,
    status: reply.ok ? 'ok' : 'error',
    timestamp,
  };
}

function transcriptEntriesFromResponse(data: LucaAiPersonaTeamRunResponse): TeamTranscriptEntry[] {
  const timestamp = data.generatedAt || new Date().toISOString();
  if (data.steps?.length) {
    return data.steps.flatMap((step) => (
      step.replies.map((reply) => transcriptEntryFromReply(reply, timestamp, step.roleLabel))
    ));
  }
  return (data.replies ?? []).map((reply) => transcriptEntryFromReply(reply, timestamp, reply.workflowRoleLabel));
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
  const [operationMode, setOperationMode] = usePersistentState<OperationMode>('lucaAi.operationMode', 'team');
  const [workflowState, setWorkflowState] = usePersistentState<WorkflowAssignments>('lucaAi.workflowAssignments', createEmptyWorkflowAssignments());
  const [individualState, setIndividualState] = usePersistentState<IndividualAssignments>('lucaAi.individualAssignments', createEmptyIndividualAssignments());
  const [mission, setMission] = usePersistentState<string>('lucaAi.missionDraft', '');
  const [transcript, setTranscript] = usePersistentState<TeamTranscriptEntry[]>('lucaAi.transcript', []);
  const [finalResult, setFinalResult] = usePersistentState<TeamTranscriptEntry | null>('lucaAi.finalResult', null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRetry, setErrorRetry] = useState<'personas' | 'run' | null>(null);
  const [activePersonaSlug, setActivePersonaSlug] = usePersistentState<string | null>('lucaAi.activePersonaSlug', null);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [processEvents, setProcessEvents] = useState<RuntimeEvent[]>([]);
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<'result' | 'activity'>('result');
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [busyPersonaSlug, setBusyPersonaSlug] = useState<string | null>(null);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const skipNextPersistRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);

  // O frontend publicado e o runtime Express compartilham a mesma origem
  // através do Cloudflare Tunnel. Nunca tente acessar o loopback do visitante.
  const bridgeBase: string | undefined = undefined;
  const {
    ready: libraryReady,
    busy: sessionsBusy,
    activeSessionId,
    activeSession,
    persistSession,
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
  const readyRoles = useMemo(() => WORKFLOW_ROLES.filter((role) => assignments[role.id].length > 0).length, [assignments]);
  const isWorkflowReady = useMemo(() => workflowReady(assignments), [assignments]);
  const isIndividualReady = individualAssignments.participants.length > 0 && Boolean(individualAssignments.judge);

  const loadPersonas = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorRetry(null);
    try {
      const [data, models] = await Promise.all([
        lucaApi.listYumePersonas(bridgeBase, bridgeBase ? 15000 : undefined),
        lucaApi.listRouterModels(bridgeBase, bridgeBase ? 15000 : undefined).catch(() => null),
      ]);
      setPersonas(normalizePersonaAssetUrls(data.personas ?? [], bridgeBase));
      if (models?.profiles?.length) setRouterProfiles(models.profiles);
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
    if (!session) {
      boundSessionIdRef.current = null;
      skipNextPersistRef.current = true;
      setMission('');
      setTranscript([]);
      setFinalResult(null);
      return;
    }
    skipNextPersistRef.current = true;
    boundSessionIdRef.current = session.id;
    setOperationMode(session.operationMode === 'individual' ? 'individual' : 'team');
    setWorkflowState(normalizeWorkflowAssignments(session.workflowAssignments || createEmptyWorkflowAssignments()));
    setIndividualState({
      participants: uniqueSlugs(session.individualAssignments?.participants || [], 5),
      judge: session.individualAssignments?.judge ? String(session.individualAssignments.judge) : null,
    });
    setMission(String(session.missionDraft || ''));
    const nextTranscript = ((Array.isArray(session.transcript) ? session.transcript : []) as unknown[])
      .filter(isTeamTranscriptEntry);
    setTranscript(nextTranscript);
    setFinalResult(isTeamTranscriptEntry(session.finalResult) ? session.finalResult : null);
    setActivePersonaSlug(session.activePersonaSlug ? String(session.activePersonaSlug) : null);
  }, [setActivePersonaSlug, setFinalResult, setIndividualState, setMission, setOperationMode, setTranscript, setWorkflowState]);

  useEffect(() => {
    if (!libraryReady) return;
    if (!activeSessionId) {
      applySession(null);
      return;
    }
    if (!activeSession || activeSession.id !== activeSessionId) {
      if (boundSessionIdRef.current !== activeSessionId) {
        skipNextPersistRef.current = true;
        setRunning(false);
        setProcessEvents([]);
        setActiveTraceId(null);
        setTranscript([]);
        setFinalResult(null);
        setMission('');
        boundSessionIdRef.current = null;
      }
      return;
    }
    if (boundSessionIdRef.current === activeSession.id) return;
    applySession(activeSession);
  }, [activeSession, activeSessionId, applySession, libraryReady, setFinalResult, setMission, setTranscript]);

  useEffect(() => {
    if (!libraryReady || !activeSessionId || running || sessionsBusy) return undefined;
    if (boundSessionIdRef.current !== activeSessionId) return undefined;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return undefined;
    }
    const sessionId = activeSessionId;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      if (boundSessionIdRef.current !== sessionId) return;
      void persistSession(sessionId, {
        operationMode,
        workflowAssignments: assignments,
        individualAssignments,
        missionDraft: mission,
        transcript,
        finalResult,
        activePersonaSlug,
      });
    }, 450);
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [
    activePersonaSlug,
    activeSessionId,
    assignments,
    finalResult,
    individualAssignments,
    libraryReady,
    mission,
    operationMode,
    persistSession,
    running,
    sessionsBusy,
    transcript,
  ]);

  useEffect(() => {
    if (window.localStorage.getItem(LUCA_AI_CLEAN_UI_STORAGE_KEY) === LUCA_AI_CLEAN_UI_VERSION) return;
    setTranscript([]);
    setFinalResult(null);
    setProcessEvents([]);
    setActiveTraceId(null);
    window.localStorage.setItem(LUCA_AI_CLEAN_UI_STORAGE_KEY, LUCA_AI_CLEAN_UI_VERSION);
  }, [setFinalResult, setTranscript]);

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

  const canRun = mission.trim().length > 0
    && (operationMode === 'individual' ? isIndividualReady : isWorkflowReady)
    && !running;

  async function ensurePersonaImported(slug: string): Promise<boolean> {
    const persona = personaBySlug.get(slug);
    if (!persona || persona.imported) return Boolean(persona);
    setBusyPersonaSlug(slug);
    setError(null);
    setErrorRetry(null);
    try {
      await lucaApi.importYumePersona(slug, bridgeBase);
      const data = await lucaApi.listYumePersonas(bridgeBase, bridgeBase ? 15000 : undefined);
      setPersonas(normalizePersonaAssetUrls(data.personas ?? [], bridgeBase));
      if (runtimeMode === 'backend') await refresh();
      return true;
    } catch (err) {
      setError(buildApiErrorMessage(err, `Falha ao conectar ${persona.name || slug} ao LUCA.`));
      setErrorRetry('personas');
      return false;
    } finally {
      setBusyPersonaSlug(null);
    }
  }

  async function setPersonaModel(slug: string, model: string) {
    if (!slug || !model) return;
    if (!(await ensurePersonaImported(slug))) return;
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
    if (slug && !(await ensurePersonaImported(slug))) return;
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
    if (!(await ensurePersonaImported(slug))) return;
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
    if (!slug || !(await ensurePersonaImported(slug))) return;
    setIndividualState((prev) => ({
      participants: uniqueSlugs([...(prev?.participants || []), slug], 5),
      judge: prev?.judge || null,
    }));
    setActivePersonaSlug(slug);
  }

  async function setIndividualJudge(slug: string) {
    if (slug && !(await ensurePersonaImported(slug))) return;
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

  // Conecta (importa) os slugs de um preset com uma só releitura do catálogo no final.
  async function importPresetSlugs(slugs: string[]): Promise<{ ok: Set<string>; failed: string[] }> {
    const ok = new Set<string>();
    const failed: string[] = [];
    let touched = false;
    for (const slug of slugs) {
      const persona = personaBySlug.get(slug);
      if (!persona) {
        failed.push(slug);
        continue;
      }
      if (persona.imported) {
        ok.add(slug);
        continue;
      }
      try {
        await lucaApi.importYumePersona(slug, bridgeBase);
        ok.add(slug);
        touched = true;
      } catch {
        failed.push(slug);
      }
    }
    if (touched) {
      try {
        const data = await lucaApi.listYumePersonas(bridgeBase, bridgeBase ? 15000 : undefined);
        setPersonas(normalizePersonaAssetUrls(data.personas ?? [], bridgeBase));
        if (runtimeMode === 'backend') await refresh();
      } catch {
        // A lista será recarregada no próximo ciclo; os slugs importados já valem.
      }
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
      const { ok, failed } = await importPresetSlugs(wanted);
      const next = createEmptyWorkflowAssignments();
      for (const role of WORKFLOW_ROLES) {
        next[role.id] = uniqueSlugs((preset.assignments[role.id] ?? []).filter((slug) => ok.has(slug)), role.maxSlugs);
      }
      setWorkflowState(next);
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
      const { ok, failed } = await importPresetSlugs(wanted);
      const participants = uniqueSlugs(preset.participants.filter((slug) => ok.has(slug)), 5);
      const judge = ok.has(preset.judge) ? preset.judge : null;
      setIndividualState({ participants, judge });
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
    setProcessEvents([]);
    setActiveTraceId(null);
  }

  async function runMission() {
    const trimmedMission = mission.trim();
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
      id: nowId('operator'),
      role: 'operator',
      name: 'Operador',
      content: trimmedMission,
      status: 'info',
      timestamp: startedAt,
    };
    setTranscript((prev) => [...prev, operatorEntry].slice(-100));

    const stillOwner = () => (
      runOwnerSessionIdRef.current === ownerSessionId
      && boundSessionIdRef.current === ownerSessionId
    );

    try {
      const modelOverrides = Object.fromEntries(
        runPersonas
          .map((slug) => {
            const model = String(personaBySlug.get(slug)?.model || '').trim();
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
        )
        : await lucaApi.runLucaAiPersonaTeam(
          trimmedMission,
          slugsToRun,
          workflowPayload(assignmentsToRun),
          traceId,
          bridgeBase,
          modelOverrides,
        );
      if (!stillOwner()) return;
      if (data.traceId) setActiveTraceId(data.traceId);
      const nextMessages = operationMode === 'individual'
        ? (data.replies ?? []).map((reply) => transcriptEntryFromReply(reply, data.generatedAt || new Date().toISOString(), 'Resposta individual'))
        : transcriptEntriesFromResponse(data);
      setTranscript((prev) => [...prev, ...nextMessages].slice(-140));
      const finalReply = operationMode === 'individual' ? data.judge : null;
      if (operationMode === 'individual' && finalReply?.content) {
        setFinalResult({
          id: nowId('judge-verdict'),
          role: 'persona',
          name: finalReply.name || finalReply.slug,
          slug: finalReply.slug,
          model: finalReply.model,
          stage: 'Juiz',
          content: finalReply.content,
          status: finalReply.ok ? 'ok' : 'error',
          timestamp: data.generatedAt || new Date().toISOString(),
        });
      } else if (data.finalDisplay?.content) {
        setFinalResult({
          id: nowId('final-display'),
          role: 'persona',
          name: data.finalDisplay.name || data.finalDisplay.slug,
          slug: data.finalDisplay.slug,
          model: data.finalDisplay.model,
          stage: data.finalDisplay.roleLabel,
          content: data.finalDisplay.content,
          status: 'ok',
          timestamp: data.generatedAt || new Date().toISOString(),
        });
      }
      if (data.ok) {
        setMission('');
      } else {
        setError(operationMode === 'individual'
          ? 'As respostas individuais foram acionadas, mas o juiz não concluiu um veredito útil.'
          : 'A equipe foi acionada, mas nenhuma persona retornou resposta util.');
        setErrorRetry('run');
      }
    } catch (err) {
      if (!stillOwner()) return;
      const message = buildApiErrorMessage(err, operationMode === 'individual'
        ? 'Falha ao rodar resolução individual.'
        : 'Falha ao rodar fluxo de personas.');
      setError(message);
      setErrorRetry('run');
      const errorEntry: TeamTranscriptEntry = {
        id: nowId('system-error'),
        role: 'system',
        name: 'LUCA-AI',
        content: message,
        status: 'error',
        timestamp: new Date().toISOString(),
      };
      setTranscript((prev) => [...prev, errorEntry].slice(-140));
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
    LUCA_TEAM_PRESETS.find((preset) => teamPresetMatches(assignments, preset))?.id ?? null
  ), [assignments]);
  const activeIndividualPresetId = useMemo(() => (
    LUCA_INDIVIDUAL_PRESETS.find((preset) => individualPresetMatches(individualAssignments, preset))?.id ?? null
  ), [individualAssignments]);

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
              <button type="button" className={operationMode === 'team' ? 'active' : ''} disabled={running} aria-pressed={operationMode === 'team'} onClick={() => { setOperationMode('team'); setPickerTarget(null); clearTranscript(); }}>
                <GitBranch className="h-4 w-4" /> Equipe
              </button>
              <button type="button" className={operationMode === 'individual' ? 'active' : ''} disabled={running} aria-pressed={operationMode === 'individual'} onClick={() => { setOperationMode('individual'); setPickerTarget(null); clearTranscript(); }}>
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
          <button
            type="button"
            className={`luca-ai-team-trigger ${teamPanelOpen ? 'active' : ''}`}
            onClick={() => setTeamPanelOpen((open) => !open)}
            aria-expanded={teamPanelOpen}
            aria-controls="luca-ai-team-side"
          >
            <BrainCircuit className="h-4 w-4" />
            <span>{operationMode === 'individual' ? 'Seleção' : 'Equipe'}</span>
            <span className="font-mono text-[10px]">{operationMode === 'individual' ? `${individualAssignments.participants.length}/5` : `${readyRoles}/${WORKFLOW_ROLES.length}`}</span>
          </button>
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
              personaBySlug={personaBySlug}
              running={running}
              transcriptRef={transcriptRef}
              onInspect={setActivePersonaSlug}
              operationMode={operationMode}
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
            running={running}
            canRun={canRun}
            operationMode={operationMode}
            readyRoles={readyRoles}
            isWorkflowReady={isWorkflowReady}
            isIndividualReady={isIndividualReady}
            assignedCount={operationMode === 'individual' ? individualAssignments.participants.length : assignedSlugs.length}
            onMissionChange={setMission}
            onRun={runMission}
            onClear={clearTranscript}
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
                activeSlug={activePersonaSlug}
                loading={loading}
                running={running}
                readyRoles={readyRoles}
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
        <PresetGallery
          title="Seleções prontas"
          presets={LUCA_INDIVIDUAL_PRESETS}
          resolveSlugs={individualPresetSlugs}
          personaBySlug={personaBySlug}
          activeId={activePresetId}
          applyingId={applyingPresetId}
          disabled={running || loading}
          onApply={onApplyPreset}
        />
        <div className="space-y-2">
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
          <div className="rounded-xl px-3 py-3 text-[11px] leading-relaxed" style={{ background: theme.surfaceHi, color: theme.textMute }}>
            Cada participante recebe somente a missão original. Depois, a chamada separada do juiz recebe todas as respostas para comparar, corrigir e decidir.
          </div>
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
  activeSlug,
  loading,
  running,
  readyRoles,
  busySlug,
  onReload,
  onClearWorkflow,
  onRemove,
  onInspect,
  onOpenPicker,
  onSetModel,
  onOpenPersonas,
  onClose,
}: {
  personas: YumePersonaSummary[];
  personaBySlug: Map<string, YumePersonaSummary>;
  routerProfiles: RouterModelProfile[];
  assignments: WorkflowAssignments;
  activeSlug: string | null;
  loading: boolean;
  running: boolean;
  readyRoles: number;
  busySlug: string | null;
  onReload: () => void | Promise<void>;
  onClearWorkflow: () => void;
  onRemove: (roleId: WorkflowRoleId, slug: string) => void;
  onInspect: (slug: string | null) => void;
  onOpenPicker: (roleId: WorkflowRoleId) => void;
  onSetModel: (slug: string, model: string) => void | Promise<void>;
  onOpenPersonas: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const ready = readyRoles === WORKFLOW_ROLES.length;
  const assignedCount = flattenWorkflowAssignments(assignments).length;

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
              {readyRoles}/{WORKFLOW_ROLES.length}
            </span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg transition" onClick={onClose} aria-label="Fechar equipe" style={{ color: theme.textMute }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: theme.surfaceHi }}>
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(readyRoles / WORKFLOW_ROLES.length) * 100}%`, background: ready ? theme.alive : theme.gold }} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: theme.textMute }}>
          {running ? 'A equipe está executando a missão.' : ready ? `${assignedCount} persona${assignedCount === 1 ? '' : 's'} pronta${assignedCount === 1 ? '' : 's'} para executar.` : 'Escolha uma persona para cada etapa. A conexão ao LUCA acontece automaticamente.'}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
          <span className="block truncate text-xs font-semibold" style={{ color: active ? theme.goldDeep : theme.textSoft }}>{role.label}</span>
          <span className="block truncate text-[10px]" style={{ color: theme.textGhost }}>{role.multiple ? `até ${role.maxSlugs} personas` : 'uma persona'}</span>
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
  const rosterPersonas = visiblePersonas.filter((persona) => persona.imported);
  const secondaryPersonas = visiblePersonas.filter((persona) => !persona.imported);
  const limitReached = role.multiple && selectedSlugs.length >= role.maxSlugs;

  useEffect(() => {
    if (term) setSecondaryOpen(true);
  }, [term]);

  const renderPersonaOption = (persona: YumePersonaSummary) => {
    const selected = selectedSlugs.includes(persona.slug);
    const busy = busySlug === persona.slug;
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
          opacity: !selected && limitReached ? 0.5 : 1,
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
          <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: persona.imported ? theme.alive : theme.textGhost }}>
            {selected ? 'selecionada' : persona.imported ? 'no LUCA' : 'adicionar'}
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
                Nenhuma persona do roster corresponde à busca. Use as disponíveis abaixo para adicionar uma especialista ao LUCA.
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
                <span id="luca-picker-secondary-title" className="block text-xs font-semibold">Disponíveis no Yume</span>
                <span className="mt-0.5 block text-[10px]" style={{ color: theme.textMute }}>{secondaryPersonas.length} fora do roster</span>
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

function LucaMissionCanvas({
  transcript,
  finalResult,
  personaBySlug,
  running,
  transcriptRef,
  onInspect,
  operationMode,
}: {
  transcript: TeamTranscriptEntry[];
  finalResult: TeamTranscriptEntry | null;
  personaBySlug: Map<string, YumePersonaSummary>;
  running: boolean;
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  onInspect: (slug: string | null) => void;
  operationMode: OperationMode;
}) {
  const theme = useTheme();
  const headerStatus = running
    ? operationMode === 'individual' ? 'respostas individuais em andamento' : 'workflow em andamento'
    : finalResult
      ? operationMode === 'individual' ? 'veredito do juiz pronto' : 'exibicao final pronta'
      : transcript.length ? 'rodada registrada' : 'aguardando missao';
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

        {supportingTranscript.length ? supportingTranscript.map((entry) => (
          entry.stage === 'Resposta individual' ? (
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
            className="flex min-h-[48vh] flex-col items-center justify-center gap-3 px-4 text-center sm:px-6"
            data-luca-canvas-empty
            data-tone="empty"
          >
            <div className="mb-2 grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border" style={{ borderColor: theme.border, background: theme.goldSoft }}>
              <img src="/icon-512.png" alt="" className="h-full w-full object-cover object-[center_28%]" />
            </div>
            <h1 className="text-xl font-semibold tracking-[-0.025em]" style={{ color: theme.text }}>
              {operationMode === 'individual' ? 'Qual problema deve ser julgado?' : 'O que a equipe deve entregar?'}
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
                Escrever missão
              </button>
            </div>
          </div>
        )}

        {finalResult && (
          <FinalDisplayCard entry={finalResult} persona={finalResult.slug ? personaBySlug.get(finalResult.slug) : undefined} />
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

function LucaMissionBar({
  mission,
  running,
  canRun,
  operationMode,
  readyRoles,
  isWorkflowReady,
  isIndividualReady,
  assignedCount,
  onMissionChange,
  onRun,
  onClear,
}: {
  mission: string;
  running: boolean;
  canRun: boolean;
  operationMode: OperationMode;
  readyRoles: number;
  isWorkflowReady: boolean;
  isIndividualReady: boolean;
  assignedCount: number;
  onMissionChange: (value: string) => void;
  onRun: () => void | Promise<void>;
  onClear: () => void;
}) {
  const theme = useTheme();

  function submit() {
    if (canRun) void onRun();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const statusText = running
    ? operationMode === 'individual' ? '9Router executa as respostas; o juiz entra em seguida' : '9Router está executando o fluxo'
    : operationMode === 'individual'
      ? isIndividualReady
        ? `Resolução pronta com ${assignedCount} participante${assignedCount === 1 ? '' : 's'} e um juiz`
        : 'Escolha participantes e uma persona juíza'
      : isWorkflowReady
        ? `Fluxo pronto com ${assignedCount} persona${assignedCount === 1 ? '' : 's'}`
        : `${readyRoles} de ${WORKFLOW_ROLES.length} etapas configuradas`;
  const statusColor = running
    ? theme.goldDeep
    : (operationMode === 'individual' ? isIndividualReady : isWorkflowReady)
      ? theme.ok
      : theme.textMute;

  return (
    <>
      <div className="luca-ai-composer-status" style={{ color: statusColor }}>
        {statusText}
      </div>
      <div className="luca-ai-composer">
        <label className="sr-only" htmlFor="luca-ai-mission">Missão da bancada</label>
        <textarea
          id="luca-ai-mission"
          value={mission}
          onChange={(event) => onMissionChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          className="luca-ai-composer-input"
          placeholder={operationMode === 'individual' ? 'Faça o que quiser' : 'Envie uma missão para a equipe...'}
          disabled={running}
        />
        <div className="luca-ai-composer-toolbar">
          <button type="button" className="luca-ai-composer-action" onClick={onClear} disabled={running} aria-label="Limpar conversa" title="Limpar conversa">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <motion.button whileTap={{ scale: 0.94 }} type="button" onClick={submit} disabled={!canRun} className="luca-ai-send-button" aria-label="Enviar missão" title={(operationMode === 'individual' ? isIndividualReady : isWorkflowReady) ? 'Enviar missão' : operationMode === 'individual' ? 'Escolha participantes e juiz' : 'Configure a equipe primeiro'}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
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
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: theme.textMute }}>
          {isJudge ? <Scale className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {isJudge ? 'Veredito do juiz' : 'Entrega final'}
        </span>
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
        {entry.stage && <StageBadge stage={entry.stage} />}
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
