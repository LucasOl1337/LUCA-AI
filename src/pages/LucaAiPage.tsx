import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  GitBranch,
  Loader2,
  MessageSquareText,
  Network,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Target,
  Terminal,
  Trash2,
  UserRound,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { buildApiErrorMessage, lucaApi } from '@/lib/api';
import type {
  LucaAiPersonaTeamReply,
  LucaAiPersonaTeamRunResponse,
  LucaAiWorkflowAssignment,
  RuntimeEvent,
  YumePersonaSummary,
} from '@/lib/types';
import { useLuca } from '@/hooks/useLucaState';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useTheme } from '@/hooks/useTheme';

const LOCAL_LUCA_BRIDGE_URL = 'http://127.0.0.1:4242';
const MAX_EXECUTORS = 4;

type TranscriptRole = 'operator' | 'persona' | 'system';
type WorkflowRoleId = 'supervisor' | 'mission' | 'execution' | 'approval' | 'display';
type WorkflowAssignments = Record<WorkflowRoleId, string[]>;

interface WorkflowRoleConfig {
  id: WorkflowRoleId;
  label: string;
  icon: LucideIcon;
  multiple: boolean;
  maxSlugs: number;
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
  | { kind: 'heading'; label: string }
  | { kind: 'bullet'; label?: string; body: string }
  | { kind: 'paragraph'; label?: string; body: string };

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

function buildSeedWorkflow(slugs: string[]): WorkflowAssignments {
  const unique = uniqueSlugs(slugs);
  const first = unique[0];
  const second = unique[1] || first;
  const third = unique[2] || first;
  const last = unique[unique.length - 1] || first;
  return {
    supervisor: first ? [first] : [],
    mission: second ? [second] : [],
    execution: unique.slice(0, MAX_EXECUTORS),
    approval: third ? [third] : [],
    display: last ? [last] : [],
  };
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

function roleLabelsForSlug(assignments: WorkflowAssignments, slug: string): string[] {
  return WORKFLOW_ROLES
    .filter((role) => assignments[role.id].includes(slug))
    .map((role) => role.label);
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
  const normalized = String(value || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n');
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !/^[-*_]{3,}$/.test(line));

  if (!lines.length) return [{ kind: 'paragraph', body: 'Sem conteudo textual.' }];

  const blocks = lines.map((line): MessageBlock | null => {
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      return { kind: 'heading', label: stripOuterMarkdown(heading[1]) };
    }

    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line)) {
      return null;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .split('|')
        .map((cell) => stripOuterMarkdown(cell.trim()))
        .filter(Boolean);
      if (cells.length >= 2) {
        return {
          kind: 'bullet',
          label: cells[0],
          body: cells.slice(1).join(' - '),
        };
      }
    }

    const bullet = line.match(/^(?:[-*]|•)\s+(.+)$/);
    const source = bullet ? bullet[1].trim() : line;
    const labelled = parseLabelledText(source);
    const body = stripOuterMarkdown(labelled.body);

    if (bullet) {
      return {
        kind: 'bullet',
        label: labelled.label,
        body: body || labelled.label || source,
      };
    }

    if (labelled.label && !body) {
      return { kind: 'heading', label: labelled.label };
    }

    return {
      kind: 'paragraph',
      label: labelled.label,
      body: body || source,
    };
  });

  return blocks.filter((block): block is MessageBlock => Boolean(block));
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

function modelLabel(value: unknown): string {
  return String(value || 'modelo n/d').trim();
}

function roleModelSummary(personas: YumePersonaSummary[]): string {
  const models = Array.from(new Set(personas.map((persona) => modelLabel(persona.model)).filter(Boolean)));
  if (!models.length) return 'modelo n/d';
  if (models.length === 1) return models[0];
  return `${models[0]} +${models.length - 1}`;
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

export default function LucaAiPage() {
  const theme = useTheme();
  const { runtimeMode } = useLuca();
  const [personas, setPersonas] = useState<YumePersonaSummary[]>([]);
  const [legacyTeamSlugs] = usePersistentState<string[]>('lucaAi.teamSlugs', []);
  const [workflowState, setWorkflowState] = usePersistentState<WorkflowAssignments>('lucaAi.workflowAssignments', createEmptyWorkflowAssignments());
  const [mission, setMission] = usePersistentState<string>('lucaAi.missionDraft', '');
  const [transcript, setTranscript] = usePersistentState<TeamTranscriptEntry[]>('lucaAi.transcript', []);
  const [finalResult, setFinalResult] = usePersistentState<TeamTranscriptEntry | null>('lucaAi.finalResult', null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePersonaSlug, setActivePersonaSlug] = usePersistentState<string | null>('lucaAi.activePersonaSlug', null);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [processEvents, setProcessEvents] = useState<RuntimeEvent[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const bridgeBase = runtimeMode === 'cloud' ? LOCAL_LUCA_BRIDGE_URL : undefined;
  const assignments = useMemo(() => normalizeWorkflowAssignments(workflowState), [workflowState]);
  const assignedSlugs = useMemo(() => flattenWorkflowAssignments(assignments), [assignments]);
  const readyRoles = useMemo(() => WORKFLOW_ROLES.filter((role) => assignments[role.id].length > 0).length, [assignments]);
  const isWorkflowReady = useMemo(() => workflowReady(assignments), [assignments]);

  const loadPersonas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lucaApi.listYumePersonas(bridgeBase, bridgeBase ? 15000 : undefined);
      setPersonas(normalizePersonaAssetUrls(data.personas ?? [], bridgeBase));
    } catch (err) {
      const fallback = runtimeMode === 'cloud'
        ? `Nao consegui acessar a ponte local do LUCA em ${LOCAL_LUCA_BRIDGE_URL}.`
        : 'Falha ao carregar personas do Yume.';
      setError(buildApiErrorMessage(err, fallback));
    } finally {
      setLoading(false);
    }
  }, [bridgeBase, runtimeMode]);

  useEffect(() => {
    void loadPersonas();
  }, [loadPersonas]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript.length, running, finalResult?.id]);

  const importedPersonas = useMemo(() => personas.filter((persona) => persona.imported), [personas]);
  const importedSlugs = useMemo(() => importedPersonas.map((persona) => persona.slug), [importedPersonas]);
  const importedSlugsKey = useMemo(() => importedSlugs.join('|'), [importedSlugs]);
  const personaBySlug = useMemo(() => new Map(importedPersonas.map((persona) => [persona.slug, persona])), [importedPersonas]);

  useEffect(() => {
    if (!assignedSlugs.length) {
      if (activePersonaSlug) setActivePersonaSlug(null);
      return;
    }
    if (!activePersonaSlug || !assignedSlugs.includes(activePersonaSlug)) {
      setActivePersonaSlug(assignedSlugs[0]);
    }
  }, [activePersonaSlug, assignedSlugs, setActivePersonaSlug]);

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
    const importedSet = new Set(importedSlugs);
    setWorkflowState((prev) => {
      const normalized = normalizeWorkflowAssignments(prev);
      let next = createEmptyWorkflowAssignments();
      for (const role of WORKFLOW_ROLES) {
        next[role.id] = normalized[role.id]
          .filter((slug) => importedSet.has(slug))
          .slice(0, role.maxSlugs);
      }

      const hasAnyAssignment = WORKFLOW_ROLES.some((role) => next[role.id].length > 0);
      if (!hasAnyAssignment) {
        const seedSource = legacyTeamSlugs.filter((slug) => importedSet.has(slug));
        next = buildSeedWorkflow(seedSource.length ? seedSource : importedSlugs);
      }

      return workflowAssignmentsEqual(normalized, next) ? prev : next;
    });
  }, [importedSlugs, importedSlugsKey, legacyTeamSlugs, loading, personas.length, setWorkflowState]);

  const filteredPersonas = useMemo(() => {
    const term = query.trim().toLowerCase();
    return importedPersonas.filter((persona) => {
      if (!term) return true;
      return [persona.name, persona.slug, persona.description, persona.purpose, persona.model]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [importedPersonas, query]);

  const canRun = mission.trim().length > 0 && isWorkflowReady && !running;

  function setSingleRole(roleId: WorkflowRoleId, slug: string) {
    setWorkflowState((prev) => {
      const next = normalizeWorkflowAssignments(prev);
      next[roleId] = slug ? [slug] : [];
      return next;
    });
  }

  function addRoleSlug(roleId: WorkflowRoleId, slug: string) {
    const role = WORKFLOW_ROLES.find((item) => item.id === roleId);
    if (!role || !slug) return;
    setWorkflowState((prev) => {
      const next = normalizeWorkflowAssignments(prev);
      next[roleId] = uniqueSlugs([...next[roleId], slug], role.maxSlugs);
      return next;
    });
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

  function clearTranscript() {
    setTranscript([]);
    setFinalResult(null);
    setProcessEvents([]);
    setActiveTraceId(null);
  }

  async function runTeam() {
    const trimmedMission = mission.trim();
    const assignmentsToRun = normalizeWorkflowAssignments(assignments);
    const slugsToRun = flattenWorkflowAssignments(assignmentsToRun);
    if (!trimmedMission || !slugsToRun.length || !workflowReady(assignmentsToRun) || running) return;

    const startedAt = new Date().toISOString();
    const traceId = createTraceId();
    setRunning(true);
    setError(null);
    setFinalResult(null);
    setMission('');
    setActiveTraceId(traceId);
    setProcessEvents(plannedRuntimeEvents(traceId, trimmedMission, assignmentsToRun, personaBySlug));
    if (!activePersonaSlug || !slugsToRun.includes(activePersonaSlug)) {
      setActivePersonaSlug(slugsToRun[0] ?? null);
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

    try {
      const data = await lucaApi.runLucaAiPersonaTeam(
        trimmedMission,
        slugsToRun,
        workflowPayload(assignmentsToRun),
        traceId,
        bridgeBase,
      );
      if (data.traceId) setActiveTraceId(data.traceId);
      const nextMessages = transcriptEntriesFromResponse(data);
      setTranscript((prev) => [...prev, ...nextMessages].slice(-140));
      if (data.finalDisplay?.content) {
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
      if (!data.ok) setError('A equipe foi acionada, mas nenhuma persona retornou resposta util.');
    } catch (err) {
      const message = buildApiErrorMessage(err, 'Falha ao rodar fluxo de personas.');
      setError(message);
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
      try {
        const data = await lucaApi.listEvents({ traceId, limit: 120 }, bridgeBase);
        if (data.ok && data.events?.length) setProcessEvents(sortRuntimeEvents(data.events));
      } catch {
        // Evento em tempo real é auxiliar; mantemos os dados locais se o polling falhar.
      }
      setRunning(false);
    }
  }

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

  return (
    <div className="h-full overflow-y-auto lg:overflow-hidden flex flex-col gap-3 p-3 sm:p-4 min-h-0">
      <LucaWorkflowRail
        personas={importedPersonas}
        personaBySlug={personaBySlug}
        assignments={assignments}
        activeSlug={activePersonaSlug}
        loading={loading}
        running={running}
        readyRoles={readyRoles}
        rounds={transcript.filter((entry) => entry.role === 'operator').length}
        onReload={loadPersonas}
        onClearWorkflow={clearWorkflow}
        onSetSingle={setSingleRole}
        onAdd={addRoleSlug}
        onRemove={removeRoleSlug}
        onInspect={setActivePersonaSlug}
      />

      {error && <Notice title="Atencao" body={error} />}

      <div className="flex-none lg:flex-1 grid grid-cols-12 gap-3 min-h-0">
        <div className="col-span-12 lg:col-span-3 min-h-[240px] lg:min-h-0">
          <LucaProcessTerminal
            persona={activePersona}
            events={activeProcessEvents}
            running={running}
            traceId={activeTraceId}
          />
        </div>

        <div className="col-span-12 lg:col-span-6 min-h-[360px] lg:min-h-0">
          <LucaMissionCanvas
            transcript={transcript}
            finalResult={finalResult}
            personaBySlug={personaBySlug}
            running={running}
            transcriptRef={transcriptRef}
            onInspect={setActivePersonaSlug}
          />
        </div>

        <div className="col-span-12 lg:col-span-3 min-h-[260px] lg:min-h-0">
          <LucaCommunication
            transcript={transcript}
            personas={filteredPersonas}
            assignments={assignments}
            personaBySlug={personaBySlug}
            query={query}
            loading={loading}
            running={running}
            activeSlug={activePersonaSlug}
            onQuery={setQuery}
            onRefresh={loadPersonas}
            onAddExecutor={(slug) => addRoleSlug('execution', slug)}
            onInspect={setActivePersonaSlug}
          />
        </div>
      </div>

      <LucaMissionBar
        mission={mission}
        running={running}
        canRun={canRun}
        readyRoles={readyRoles}
        isWorkflowReady={isWorkflowReady}
        traceId={activeTraceId}
        assignedCount={assignedSlugs.length}
        onMissionChange={setMission}
        onRun={runTeam}
        onClear={clearTranscript}
      />
    </div>
  );
}

function Metric({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  const theme = useTheme();
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>{label}</div>
      <div className="mt-0.5 text-sm font-mono font-semibold" style={{ color: theme.textSoft }}>{value}{suffix}</div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  const theme = useTheme();
  return (
    <div className="flex items-start gap-3 rounded-lg px-4 py-3" style={{ background: theme.warningBg, border: `1px solid ${theme.warning}` }}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.warning }} />
      <div>
        <div className="text-sm font-semibold" style={{ color: theme.goldDeep }}>{title}</div>
        <div className="mt-1 text-xs leading-relaxed" style={{ color: theme.textSoft }}>{body}</div>
      </div>
    </div>
  );
}

function LucaWorkflowRail({
  personas,
  personaBySlug,
  assignments,
  activeSlug,
  loading,
  running,
  readyRoles,
  rounds,
  onReload,
  onClearWorkflow,
  onSetSingle,
  onAdd,
  onRemove,
  onInspect,
}: {
  personas: YumePersonaSummary[];
  personaBySlug: Map<string, YumePersonaSummary>;
  assignments: WorkflowAssignments;
  activeSlug: string | null;
  loading: boolean;
  running: boolean;
  readyRoles: number;
  rounds: number;
  onReload: () => void | Promise<void>;
  onClearWorkflow: () => void;
  onSetSingle: (roleId: WorkflowRoleId, slug: string) => void;
  onAdd: (roleId: WorkflowRoleId, slug: string) => void;
  onRemove: (roleId: WorkflowRoleId, slug: string) => void;
  onInspect: (slug: string | null) => void;
}) {
  const theme = useTheme();
  const ready = readyRoles === WORKFLOW_ROLES.length;

  return (
    <div className="void-panel rounded-2xl px-3 py-3 flex items-stretch gap-3 overflow-x-auto overflow-y-hidden shrink-0 h-[118px] min-h-[118px]">
      <button
        type="button"
        className="shrink-0 flex h-[94px] w-[104px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 text-center transition"
        style={{
          background: running ? theme.aliveSoft : ready ? theme.fleetSoft : theme.input,
          borderColor: running ? theme.alive : ready ? theme.borderActive : theme.border,
          color: running ? theme.alive : ready ? theme.navyDeep : theme.textMute,
        }}
        onClick={() => onInspect(activeSlug)}
      >
        {running ? <Loader2 className="h-6 w-6 animate-spin" /> : <BrainCircuit className="h-6 w-6" />}
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
          {running ? 'rodando' : ready ? 'pronto' : 'setup'}
        </span>
        <span className="font-mono text-[10px] opacity-80">
          {readyRoles}/{WORKFLOW_ROLES.length} · {rounds}
        </span>
      </button>

      <div className="w-px h-16 self-center shrink-0" style={{ background: theme.border }} />

      {WORKFLOW_ROLES.map((role) => (
        <WorkflowRoleTile
          key={role.id}
          role={role}
          personas={personas}
          personaBySlug={personaBySlug}
          selectedSlugs={assignments[role.id]}
          activeSlug={activeSlug}
          disabled={running}
          onSetSingle={(slug) => onSetSingle(role.id, slug)}
          onAdd={(slug) => onAdd(role.id, slug)}
          onRemove={(slug) => onRemove(role.id, slug)}
          onInspect={onInspect}
        />
      ))}

      <div className="ml-auto flex shrink-0 flex-col gap-2">
        <button type="button" className="btn-fleet !h-10 !px-3" onClick={onReload} disabled={loading || running} title="recarregar personas">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
        <button type="button" className="btn-fleet !h-10 !px-3" onClick={onClearWorkflow} disabled={running} title="limpar fluxo">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function WorkflowRoleTile({
  role,
  personas,
  personaBySlug,
  selectedSlugs,
  activeSlug,
  disabled,
  onSetSingle,
  onAdd,
  onRemove,
  onInspect,
}: {
  role: WorkflowRoleConfig;
  personas: YumePersonaSummary[];
  personaBySlug: Map<string, YumePersonaSummary>;
  selectedSlugs: string[];
  activeSlug: string | null;
  disabled: boolean;
  onSetSingle: (slug: string) => void;
  onAdd: (slug: string) => void;
  onRemove: (slug: string) => void;
  onInspect: (slug: string | null) => void;
}) {
  const theme = useTheme();
  const Icon = role.icon;
  const selectedItems = selectedSlugs.map((slug) => ({
    slug,
    persona: personaBySlug.get(slug),
  }));
  const selectedPersonas = selectedSlugs
    .map((slug) => personaBySlug.get(slug))
    .filter((persona): persona is YumePersonaSummary => Boolean(persona));
  const availablePersonas = personas.filter((persona) => !selectedSlugs.includes(persona.slug));
  const active = selectedSlugs.includes(String(activeSlug || ''));
  const selectId = `luca-ai-rail-role-${role.id}`;
  const modelSummary = selectedPersonas.length ? roleModelSummary(selectedPersonas) : 'modelo n/d';

  return (
    <article
      className="agent-card shrink-0 rounded-2xl p-2 w-[178px] h-[94px] flex flex-col gap-1.5"
      style={{ borderColor: active ? theme.borderActive : selectedSlugs.length ? theme.borderHover : theme.border }}
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-2 text-left"
        onClick={() => onInspect(selectedSlugs[0] ?? null)}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border" style={{ background: theme.goldSoft, borderColor: theme.border, color: theme.goldDeep }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold" style={{ color: active ? theme.goldDeep : theme.textSoft }}>{role.label}</span>
          <span className="block truncate font-mono text-[10px]" style={{ color: selectedPersonas.length ? theme.goldDeep : theme.textGhost }}>
            {selectedSlugs.length}/{role.maxSlugs} · {modelSummary}
          </span>
        </span>
      </button>

      <div className="flex min-h-[28px] items-center gap-1.5 overflow-hidden">
        {selectedItems.length ? selectedItems.slice(0, 4).map(({ slug, persona }) => (
          <button
            key={slug}
            type="button"
            className="group relative h-7 w-7 shrink-0 rounded-lg"
            onClick={() => onInspect(slug)}
            title={`${persona?.name || slug} · ${role.label} · ${modelLabel(persona?.model)}`}
          >
            {persona ? (
              <PersonaAvatar persona={persona} size="xs" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] font-semibold uppercase" style={{ background: theme.surfaceHi, borderColor: theme.border, color: theme.textMute }}>
                {slug.charAt(0) || '?'}
              </span>
            )}
            {role.multiple && (
              <span
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border group-hover:flex"
                style={{ background: theme.input, borderColor: theme.border, color: theme.goldDeep }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!disabled) onRemove(slug);
                }}
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        )) : (
          <span className="text-[11px]" style={{ color: theme.textGhost }}>sem persona</span>
        )}
        {selectedItems.length > 4 && (
          <span className="rounded-full px-2 py-1 text-[10px] font-mono" style={{ background: theme.surfaceHi, color: theme.textMute }}>
            +{selectedItems.length - 4}
          </span>
        )}
      </div>

      <label className="sr-only" htmlFor={selectId}>{role.label}</label>
      {role.multiple ? (
        <select
          id={selectId}
          value=""
          onChange={(event) => {
            onAdd(event.target.value);
            event.currentTarget.value = '';
          }}
          className="mt-auto h-7 w-full rounded-lg border px-2 text-[11px] outline-none"
          style={{ background: theme.surfaceHi, borderColor: theme.border, color: theme.textSoft }}
          disabled={disabled || selectedSlugs.length >= role.maxSlugs || availablePersonas.length === 0}
        >
          <option value="">{selectedSlugs.length >= role.maxSlugs ? 'limite atingido' : 'adicionar'}</option>
          {availablePersonas.map((persona) => (
            <option key={persona.slug} value={persona.slug}>{persona.name}</option>
          ))}
        </select>
      ) : (
        <select
          id={selectId}
          value={selectedSlugs[0] ?? ''}
          onChange={(event) => onSetSingle(event.target.value)}
          className="mt-auto h-7 w-full rounded-lg border px-2 text-[11px] outline-none"
          style={{ background: theme.surfaceHi, borderColor: theme.border, color: theme.textSoft }}
          disabled={disabled || personas.length === 0}
        >
          <option value="">selecionar</option>
          {personas.map((persona) => (
            <option key={persona.slug} value={persona.slug}>{persona.name}</option>
          ))}
        </select>
      )}
    </article>
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
    <div className="void-panel rounded-2xl flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-2 px-4 h-12 border-b shrink-0" style={{ borderColor: theme.border }}>
        <Terminal className="w-4 h-4" style={{ color: theme.gold, opacity: 0.85 }} />
        <h3 className="text-[11px] font-semibold tracking-[0.2em] uppercase flex-1 min-w-0 luca-wrap" style={{ color: theme.textSoft }}>
          Processos
        </h3>
        <span className="text-[9px] font-semibold tracking-wider uppercase" style={{ color: stateColor }}>
          {latestState}
        </span>
      </header>

      <div className="term flex-1 overflow-hidden p-3 m-2 rounded-xl border-0">
        <p style={{ color: theme.textMute }}>feedback em tempo real</p>
        <p style={{ color: theme.consoleText }}>
          agente: {persona?.name || 'workflow'}
        </p>
        <p style={{ color: theme.consoleText }}>
          modelo: {modelLabel(persona?.model)}
        </p>
        <p style={{ color: theme.textGhost }}>
          trace: {traceId ? traceId.slice(-18) : 'aguardando'}
        </p>

        <div className="mt-3 space-y-2">
          {visibleEvents.length ? visibleEvents.map((event) => (
            <ProcessEventLine key={event.id} event={event} />
          )) : (
            <p style={{ color: theme.textGhost }}>clique em um card de agente para ver chamadas e requests.</p>
          )}
        </div>
        <p className="mt-3" style={{ color: theme.gold }}>$ _</p>
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
}: {
  transcript: TeamTranscriptEntry[];
  finalResult: TeamTranscriptEntry | null;
  personaBySlug: Map<string, YumePersonaSummary>;
  running: boolean;
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  onInspect: (slug: string | null) => void;
}) {
  const theme = useTheme();
  const headerStatus = running ? 'workflow em andamento' : finalResult ? 'exibicao final pronta' : transcript.length ? 'rodada registrada' : 'aguardando missao';

  return (
    <div className="void-panel rounded-2xl flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-2 px-5 h-12 border-b shrink-0 min-w-0" style={{ borderColor: theme.border }}>
        <GitBranch className="h-4 w-4" style={{ color: theme.gold, opacity: 0.85 }} />
        <h3 className="text-[11px] font-semibold tracking-[0.2em] uppercase flex-1 min-w-0 luca-wrap" style={{ color: theme.textSoft }}>
          Canvas da Bancada
        </h3>
        <span className="text-[10px] max-w-[44%] shrink-0 text-right luca-wrap" style={{ color: theme.textMute }}>
          {headerStatus}
        </span>
      </header>

      <div ref={transcriptRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {finalResult && (
          <FinalDisplayCard entry={finalResult} persona={finalResult.slug ? personaBySlug.get(finalResult.slug) : undefined} />
        )}

        {transcript.length ? (
          transcript.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="block w-full text-left"
              onClick={() => onInspect(entry.slug || null)}
            >
              <TranscriptEntry
                entry={entry}
                persona={entry.slug ? personaBySlug.get(entry.slug) : undefined}
              />
            </button>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
            <BrainCircuit className="h-10 w-10 mb-3" style={{ color: theme.textGhost }} />
            <p className="text-sm mt-1 max-w-xs leading-relaxed" style={{ color: theme.textMute }}>
              O resultado da bancada aparece aqui, no mesmo padrao do canvas operacional.
            </p>
          </div>
        )}

        {running && (
          <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ background: theme.goldSoft, borderColor: theme.border, color: theme.goldDeep }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Workflow em andamento...
          </div>
        )}
      </div>
    </div>
  );
}

function LucaCommunication({
  transcript,
  personas,
  assignments,
  personaBySlug,
  query,
  loading,
  running,
  activeSlug,
  onQuery,
  onRefresh,
  onAddExecutor,
  onInspect,
}: {
  transcript: TeamTranscriptEntry[];
  personas: YumePersonaSummary[];
  assignments: WorkflowAssignments;
  personaBySlug: Map<string, YumePersonaSummary>;
  query: string;
  loading: boolean;
  running: boolean;
  activeSlug: string | null;
  onQuery: (value: string) => void;
  onRefresh: () => void | Promise<void>;
  onAddExecutor: (slug: string) => void;
  onInspect: (slug: string | null) => void;
}) {
  const theme = useTheme();
  const latestMessages = transcript.slice(-4).reverse();

  return (
    <div className="void-panel rounded-2xl flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-2 px-4 h-12 border-b shrink-0 min-w-0" style={{ borderColor: theme.border }}>
        <MessageSquareText className="w-4 h-4" style={{ color: theme.gold, opacity: 0.85 }} />
        <h3 className="text-[11px] font-semibold tracking-[0.2em] uppercase flex-1 min-w-0 luca-wrap" style={{ color: theme.textSoft }}>
          Comunicacao
        </h3>
        <span
          className="text-[9px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full"
          style={{ color: running ? theme.gold : theme.alive, border: `1px solid ${theme.border}` }}
        >
          {running ? 'ao vivo' : 'online'}
        </span>
      </header>

      <div className="border-b p-3" style={{ borderColor: theme.border }}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: theme.textGhost }} />
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="buscar persona"
            className="w-full rounded-lg border py-2 pl-9 pr-10 text-xs outline-none transition"
            style={{ background: theme.input, borderColor: theme.border, color: theme.text }}
          />
          <button
            type="button"
            className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md"
            onClick={() => void onRefresh()}
            disabled={loading}
            title="recarregar personas"
            style={{ color: theme.goldDeep }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2.5">
        {latestMessages.map((entry) => (
          <button
            type="button"
            key={entry.id}
            className="w-full rounded-xl border p-2 text-left"
            style={{ background: theme.input, borderColor: entry.slug === activeSlug ? theme.borderActive : theme.border }}
            onClick={() => onInspect(entry.slug || null)}
          >
            <div className="flex items-center gap-2">
              {entry.slug && personaBySlug.get(entry.slug) ? (
                <PersonaAvatar persona={personaBySlug.get(entry.slug)!} size="sm" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border" style={{ background: theme.fleetSoft, borderColor: theme.border, color: theme.navyDeep }}>
                  <UserRound className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-xs font-semibold" style={{ color: theme.textSoft }}>{entry.name}</span>
                  {entry.model && (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
                      {entry.model}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed" style={{ color: theme.textMute }}>
                  {compactText(entry.content, 120)}
                </p>
              </div>
            </div>
          </button>
        ))}

        <div className="pt-2">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>
            <UserPlus className="h-3.5 w-3.5" />
            Personas
          </div>
          <div className="space-y-2">
            {personas.slice(0, 10).map((persona) => {
              const usageLabels = roleLabelsForSlug(assignments, persona.slug);
              const executionSelected = assignments.execution.includes(persona.slug);
              return (
          <article
            key={persona.slug}
            className="flex w-full items-center gap-2 rounded-lg border p-2 text-left cursor-pointer"
            style={{ background: usageLabels.length ? theme.goldSoft : theme.input, borderColor: persona.slug === activeSlug ? theme.borderActive : theme.border }}
            onClick={() => onInspect(persona.slug)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onInspect(persona.slug);
              }
            }}
          >
            <PersonaAvatar persona={persona} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-xs font-semibold" style={{ color: theme.textSoft }}>{persona.name}</span>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono" style={{ background: theme.surfaceHi, color: theme.goldDeep }}>
                  {modelLabel(persona.model)}
                </span>
              </span>
              <span className="block truncate text-[10px]" style={{ color: usageLabels.length ? theme.goldDeep : theme.textGhost }}>
                {usageLabels.length ? usageLabels.join(' / ') : persona.slug}
              </span>
            </span>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-45"
                    style={{ background: executionSelected ? theme.okBg : theme.fleetSoft, borderColor: executionSelected ? theme.ok : theme.border, color: executionSelected ? theme.ok : theme.navyDeep }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddExecutor(persona.slug);
                      onInspect(persona.slug);
                    }}
                    disabled={running || executionSelected || assignments.execution.length >= MAX_EXECUTORS}
                    aria-label={`Adicionar ${persona.name} como executor`}
            >
              {executionSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function LucaMissionBar({
  mission,
  running,
  canRun,
  readyRoles,
  isWorkflowReady,
  traceId,
  assignedCount,
  onMissionChange,
  onRun,
  onClear,
}: {
  mission: string;
  running: boolean;
  canRun: boolean;
  readyRoles: number;
  isWorkflowReady: boolean;
  traceId: string | null;
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

  return (
    <div className="void-panel rounded-2xl p-3 flex flex-col gap-2 shrink-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 min-w-0">
          <label className="sr-only" htmlFor="luca-ai-mission">Missao da bancada</label>
          <textarea
            id="luca-ai-mission"
            value={mission}
            onChange={(event) => onMissionChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed py-2.5 px-3 rounded-xl"
            style={{ color: theme.text, background: theme.input, border: `1px solid ${theme.border}`, minHeight: 44, maxHeight: 120 }}
            placeholder="Descreva a missão para os agentes..."
            disabled={running}
          />
        </div>

        <button type="button" className="btn-fleet flex items-center justify-center gap-2 whitespace-nowrap" onClick={onClear} disabled={running}>
          <RotateCcw className="w-4 h-4" />
          Limpar
        </button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={submit}
          disabled={!canRun}
          className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Rodar fluxo
        </motion.button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]" style={{ color: theme.textGhost }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1" style={{ background: isWorkflowReady ? theme.okBg : theme.warningBg, color: isWorkflowReady ? theme.ok : theme.warning }}>
            <Radio className="h-3 w-3" />
            {readyRoles}/{WORKFLOW_ROLES.length} modulos
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1" style={{ background: theme.fleetSoft, color: theme.navyDeep }}>
            <Network className="h-3 w-3" />
            {assignedCount} personas
          </span>
        </div>
        <span className="font-mono">
          {running ? 'processando no GLM' : traceId ? `trace ${traceId.slice(-10)}` : 'pronta para nova missao'}
        </span>
      </div>
    </div>
  );
}

function PersonaAvatar({ persona, size = 'md' }: { persona: YumePersonaSummary; size?: 'xs' | 'sm' | 'md' }) {
  const theme = useTheme();
  const avatarUrl = persona.avatarUrl || persona.avatar_url || '';
  const initial = (persona.name || persona.slug || '?').trim().charAt(0).toUpperCase();
  const sizeClass = size === 'xs'
    ? 'h-7 w-7 text-sm'
    : size === 'sm'
      ? 'h-10 w-10 text-lg'
      : 'h-12 w-12 text-xl';

  return (
    <div className={`${sizeClass} relative shrink-0 overflow-hidden rounded-lg border`} style={{ background: theme.goldSoft, borderColor: theme.borderHover, color: theme.goldDeep }}>
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

function WorkflowRoleCard({
  role,
  personas,
  personaBySlug,
  selectedSlugs,
  disabled,
  onSetSingle,
  onAdd,
  onRemove,
}: {
  role: WorkflowRoleConfig;
  personas: YumePersonaSummary[];
  personaBySlug: Map<string, YumePersonaSummary>;
  selectedSlugs: string[];
  disabled: boolean;
  onSetSingle: (slug: string) => void;
  onAdd: (slug: string) => void;
  onRemove: (slug: string) => void;
}) {
  const theme = useTheme();
  const Icon = role.icon;
  const selectedPersonas = selectedSlugs
    .map((slug) => personaBySlug.get(slug))
    .filter((persona): persona is YumePersonaSummary => Boolean(persona));
  const availablePersonas = personas.filter((persona) => !selectedSlugs.includes(persona.slug));
  const selectId = `luca-ai-role-${role.id}`;

  return (
    <article className="flex min-h-[168px] flex-col rounded-lg border p-3" style={{ background: theme.input, borderColor: selectedSlugs.length ? theme.borderActive : theme.border }}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border" style={{ background: theme.goldSoft, borderColor: theme.border, color: theme.goldDeep }}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold" style={{ color: theme.textSoft }}>{role.label}</h3>
          <div className="mt-0.5 text-[10px] font-mono" style={{ color: theme.textGhost }}>{selectedSlugs.length}/{role.maxSlugs}</div>
        </div>
      </div>

      <div className="mt-3 min-h-[58px] space-y-2">
        {selectedPersonas.length ? (
          selectedPersonas.map((persona) => (
            <AssignedPersona
              key={persona.slug}
              persona={persona}
              canRemove={role.multiple}
              disabled={disabled}
              onRemove={() => onRemove(persona.slug)}
            />
          ))
        ) : (
          <div className="flex h-[52px] items-center rounded-lg border border-dashed px-3 text-xs" style={{ borderColor: theme.border, color: theme.textGhost }}>
            Sem persona
          </div>
        )}
      </div>

      <label className="sr-only" htmlFor={selectId}>{role.label}</label>
      {role.multiple ? (
        <select
          id={selectId}
          value=""
          onChange={(event) => {
            onAdd(event.target.value);
            event.currentTarget.value = '';
          }}
          className="mt-auto w-full rounded-lg border px-3 py-2 text-xs outline-none"
          style={{ background: theme.surfaceHi, borderColor: theme.border, color: theme.textSoft }}
          disabled={disabled || selectedSlugs.length >= role.maxSlugs || availablePersonas.length === 0}
        >
          <option value="">{selectedSlugs.length >= role.maxSlugs ? 'limite atingido' : 'adicionar executor'}</option>
          {availablePersonas.map((persona) => (
            <option key={persona.slug} value={persona.slug}>{persona.name}</option>
          ))}
        </select>
      ) : (
        <select
          id={selectId}
          value={selectedSlugs[0] ?? ''}
          onChange={(event) => onSetSingle(event.target.value)}
          className="mt-auto w-full rounded-lg border px-3 py-2 text-xs outline-none"
          style={{ background: theme.surfaceHi, borderColor: theme.border, color: theme.textSoft }}
          disabled={disabled || personas.length === 0}
        >
          <option value="">selecionar persona</option>
          {personas.map((persona) => (
            <option key={persona.slug} value={persona.slug}>{persona.name}</option>
          ))}
        </select>
      )}
    </article>
  );
}

function AssignedPersona({
  persona,
  canRemove,
  disabled,
  onRemove,
}: {
  persona: YumePersonaSummary;
  canRemove: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const theme = useTheme();
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2" style={{ background: theme.surfaceHi, borderColor: theme.border }}>
      <PersonaAvatar persona={persona} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold" style={{ color: theme.textSoft }}>{persona.name}</div>
        <div className="mt-0.5 truncate text-[10px] font-mono" style={{ color: theme.textGhost }}>{persona.slug}</div>
      </div>
      {canRemove && (
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition hover:scale-105 disabled:opacity-40"
          style={{ background: theme.goldSoft, borderColor: theme.border, color: theme.goldDeep }}
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remover ${persona.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function PersonaCatalogItem({
  persona,
  usageLabels,
  executionSelected,
  disabled,
  onAdd,
}: {
  persona: YumePersonaSummary;
  usageLabels: string[];
  executionSelected: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  const theme = useTheme();
  const selected = usageLabels.length > 0;
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-[96px] items-center gap-3 rounded-lg border p-3"
      style={{ background: selected ? theme.goldSoft : theme.input, borderColor: selected ? theme.borderActive : theme.border }}
    >
      <PersonaAvatar persona={persona} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold" style={{ color: theme.textSoft }}>{persona.name}</h3>
          {persona.imported && <span className="state-badge ok !px-2 !py-0.5">LUCA</span>}
        </div>
        <div className="mt-1 truncate text-[11px] font-mono" style={{ color: theme.textGhost }}>{persona.slug}</div>
        {usageLabels.length ? (
          <div className="mt-1 truncate text-[11px]" style={{ color: theme.goldDeep }}>
            {usageLabels.join(' / ')}
          </div>
        ) : (persona.description || persona.purpose) && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: theme.textMute }}>
            {persona.description || persona.purpose}
          </p>
        )}
      </div>
      <button
        type="button"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition hover:scale-105 disabled:opacity-45"
        style={{ background: executionSelected ? theme.okBg : theme.fleetSoft, borderColor: executionSelected ? theme.ok : theme.border, color: executionSelected ? theme.ok : theme.navyDeep }}
        onClick={onAdd}
        disabled={disabled}
        aria-label={`Adicionar ${persona.name} como executor`}
      >
        {executionSelected ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
    </motion.article>
  );
}

function FinalDisplayCard({ entry, persona }: { entry: TeamTranscriptEntry; persona?: YumePersonaSummary }) {
  const theme = useTheme();
  return (
    <article className="rounded-lg border" style={{ background: theme.fleetSoft, borderColor: theme.borderActive }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: theme.border }}>
        <div className="flex min-w-0 items-center gap-3">
          <SpeakerAvatar entry={entry} persona={persona} compact />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Eye className="h-4 w-4 shrink-0" style={{ color: theme.navyDeep }} />
              <h3 className="truncate text-sm font-semibold" style={{ color: theme.navyDeep }}>Exibicao final</h3>
            </div>
            <div className="mt-0.5 truncate text-xs" style={{ color: theme.textMute }}>{entry.name}</div>
          </div>
        </div>
        {entry.model && <span className="rounded-full px-2 py-0.5 text-[10px] font-mono" style={{ background: theme.goldSoft, color: theme.goldDeep }}>{entry.model}</span>}
      </div>
      <div className="px-4 py-4">
        <RichMessageBody content={entry.content} />
      </div>
    </article>
  );
}

function TranscriptEntry({ entry, persona }: { entry: TeamTranscriptEntry; persona?: YumePersonaSummary }) {
  const theme = useTheme();
  const isOperator = entry.role === 'operator';
  const isSystem = entry.role === 'system';
  const tone = entry.status === 'error'
    ? { background: theme.errorBg, border: theme.error, color: theme.error }
    : isOperator
      ? { background: theme.fleetSoft, border: theme.borderHover, color: theme.navyDeep }
      : { background: theme.input, border: theme.border, color: theme.textSoft };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex min-w-0 gap-3 ${isOperator ? 'justify-end' : 'justify-start'}`}
    >
      {!isOperator && <SpeakerAvatar entry={entry} persona={persona} />}
      <article
        className={`min-w-0 overflow-hidden rounded-lg border ${isOperator ? 'max-w-[76%]' : 'max-w-[920px] flex-1'}`}
        style={{ background: tone.background, borderColor: tone.border }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: theme.border, background: isSystem ? theme.errorBg : theme.surfaceHi }}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold" style={{ color: tone.color }}>{entry.name}</span>
            {entry.stage && <StageBadge stage={entry.stage} />}
            {entry.model && <span className="rounded-full px-2 py-0.5 text-[10px] font-mono" style={{ background: theme.goldSoft, color: theme.goldDeep }}>{entry.model}</span>}
          </div>
          <time className="text-[10px] font-mono" style={{ color: theme.textGhost }}>
            {new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
        <div className="px-4 py-4">
          <RichMessageBody content={entry.content} compact={isOperator} />
        </div>
      </article>
      {isOperator && <SpeakerAvatar entry={entry} persona={persona} />}
    </motion.div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const theme = useTheme();
  const roleId = [...ROLE_LABEL_BY_ID.entries()].find(([, label]) => label === stage)?.[0];
  const Icon = WORKFLOW_ROLES.find((role) => role.id === roleId)?.icon ?? GitBranch;

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: theme.fleetSoft, color: theme.navyDeep }}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{stage}</span>
    </span>
  );
}

function SpeakerAvatar({ entry, persona, compact = false }: { entry: TeamTranscriptEntry; persona?: YumePersonaSummary; compact?: boolean }) {
  const theme = useTheme();
  const sizeClass = compact ? 'h-9 w-9' : 'h-10 w-10';
  if (persona) return <PersonaAvatar persona={persona} size="sm" />;

  const Icon = entry.status === 'error' ? AlertCircle : entry.role === 'operator' ? UserRound : MessageSquareText;
  const color = entry.status === 'error' ? theme.error : entry.role === 'operator' ? theme.navyDeep : theme.goldDeep;
  const background = entry.status === 'error' ? theme.errorBg : entry.role === 'operator' ? theme.fleetSoft : theme.goldSoft;

  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-lg border`} style={{ background, borderColor: theme.border, color }}>
      <Icon className="h-4 w-4" />
    </div>
  );
}

function RichMessageBody({ content, compact = false }: { content: string; compact?: boolean }) {
  const theme = useTheme();
  const blocks = parseMessageBlocks(content);

  return (
    <div className={`max-w-[78ch] space-y-3 ${compact ? 'text-sm' : 'text-[13px] sm:text-sm'}`} style={{ color: theme.textSoft }}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <h4 key={`${block.kind}-${index}`} className="text-sm font-semibold leading-snug" style={{ color: theme.text }}>
              <InlineText value={block.label} />
            </h4>
          );
        }

        if (block.kind === 'bullet') {
          return (
            <div key={`${block.kind}-${index}`} className="flex gap-3 rounded-lg border px-3 py-2.5" style={{ background: theme.surfaceHi, borderColor: theme.border }}>
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: theme.goldDeep }} />
              <div className="min-w-0 flex-1 leading-relaxed">
                {block.label && (
                  <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: theme.goldDeep }}>
                    <InlineText value={block.label} />
                  </span>
                )}
                <p className="luca-wrap">
                  <InlineText value={block.body} />
                </p>
              </div>
            </div>
          );
        }

        return (
          <p key={`${block.kind}-${index}`} className="luca-wrap leading-relaxed">
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
