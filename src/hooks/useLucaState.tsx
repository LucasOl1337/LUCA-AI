import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildApiErrorMessage, fetchState, lucaApi, wsUrl } from '@/lib/api';
import { countDatabaseItems } from '@/lib/database';
import { formatBrazilDateTime } from '../../shared/time.js';
import type {
  AgentEntry,
  BackendEvent,
  ChatMessage,
  DatabaseState,
  GovernanceSummary,
  HeartbeatMonitor,
  LucaState,
  Mission,
  TemporaryDashboard,
  WsPayload,
} from '@/lib/types';

const fallbackDatabase: DatabaseState = {
  source: { name: 'database indisponivel', topic: 'LUCA-AI' },
  layers: {
    rawResearch: { status: 'offline', items: [] },
    processing: { status: 'empty', items: [] },
    dashboardIntegration: { status: 'empty', items: [] },
  },
  heartbeat: [],
};

const LOCAL_POLL_MS = 5000;
const CLOUD_IDLE_POLL_MS = 30000;
const CLOUD_ACTIVE_POLL_MS = 2500;
const CLOUD_SETTLED_POLL_MS = 12000;
const CLOUD_BLOCKED_POLL_MS = 15000;
const RECENT_MISSION_BLOCK_WINDOW_MS = 20 * 60 * 1000;

export type MissionUiPhase =
  | 'idle'
  | 'submitting'
  | 'running'
  | 'completed'
  | 'chat_completed'
  | 'needs_revision'
  | 'failed'
  | 'cancelled'
  | 'blocked';

function isRunSettled(status?: string | null): boolean {
  return ['completed', 'chat_completed', 'needs_revision', 'failed', 'cancelled'].includes(String(status ?? ''));
}

function hasRecentMissionConcurrencyBlock(snapshot: LucaState | null): boolean {
  const latest = snapshot?.heartbeatMonitor?.governance?.missionConcurrency?.latestUnmatched
    ?? snapshot?.governance?.missionConcurrency?.latestUnmatched
    ?? null;
  if (!latest?.timestamp) return false;
  const startedAt = Date.parse(latest.timestamp);
  if (Number.isNaN(startedAt)) return false;
  return (Date.now() - startedAt) <= RECENT_MISSION_BLOCK_WINDOW_MS;
}

function cloudPollDelayForSnapshot(snapshot: LucaState | null): number {
  if (!snapshot) return CLOUD_ACTIVE_POLL_MS;

  const runStatus = String(snapshot.activeRun?.status ?? '');
  if (runStatus === 'running' || runStatus === 'pending' || runStatus === 'verifying') {
    return CLOUD_ACTIVE_POLL_MS;
  }
  if (snapshot.activeMission && !isRunSettled(runStatus)) {
    return CLOUD_ACTIVE_POLL_MS;
  }
  if (isRunSettled(runStatus)) {
    return CLOUD_SETTLED_POLL_MS;
  }
  if (hasRecentMissionConcurrencyBlock(snapshot)) {
    return CLOUD_BLOCKED_POLL_MS;
  }
  return CLOUD_IDLE_POLL_MS;
}

function isLocalRuntimeHost(): boolean {
  if (typeof window === 'undefined') return false;
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  return localHost && window.location.port === '4242';
}

function missionUiPhaseForState(current: LucaState | null, busy: boolean): MissionUiPhase {
  if (busy) return 'submitting';

  const runStatus = String(current?.activeRun?.status ?? '');
  if (runStatus === 'completed') return 'completed';
  if (runStatus === 'chat_completed') return 'chat_completed';
  if (runStatus === 'needs_revision') return 'needs_revision';
  if (runStatus === 'failed') return 'failed';
  if (runStatus === 'cancelled') return 'cancelled';
  if (runStatus === 'running' || runStatus === 'pending' || runStatus === 'verifying') return 'running';

  if (current?.activeMission) return 'running';
  if (current?.heartbeatMonitor?.governance?.missionConcurrency?.blocked || current?.governance?.missionConcurrency?.blocked) {
    return 'blocked';
  }
  return 'idle';
}

function missionLockReasonForState(current: LucaState | null, busy: boolean): string | null {
  if (busy) return 'aguarde a missão atual ser enviada ao runtime';

  const runStatus = current?.activeRun?.status;
  if (runStatus === 'running' || runStatus === 'pending' || runStatus === 'verifying') {
    return `o runtime ainda está com execução ${runStatus}`;
  }
  if (current?.activeMission && !isRunSettled(runStatus)) {
    return 'há uma missão ativa; abra o centro operacional ou resete antes de iniciar outra';
  }

  const governance = (current?.heartbeatMonitor?.governance ?? current?.governance ?? null) as GovernanceSummary | null;
  const missionConcurrency = governance?.missionConcurrency ?? null;
  if (!missionConcurrency?.blocked) return null;

  const latest = missionConcurrency.latestUnmatched;
  const title = latest?.title?.trim();
  const startedAt = latest?.timestamp
    ? formatBrazilDateTime(latest.timestamp)
    : null;
  if (title && startedAt) return `concorrência bloqueada por missão sem fechamento: ${title} (${startedAt})`;
  if (title) return `concorrência bloqueada por missão sem fechamento: ${title}`;
  return `concorrência bloqueada por ${missionConcurrency.unmatchedCount ?? 1} missão(ões) sem fechamento`;
}

export interface LucaContextValue {
  backendReady: boolean;
  connectionState: 'checking' | 'online' | 'offline';
  runtimeMode: 'backend' | 'cloud';
  supervisorMode: string;
  missionActionBusy: boolean;
  operationError: string | null;
  canActivateMission: boolean;
  missionLockReason: string | null;
  missionPhase: MissionUiPhase;
  activeMission: Mission | null;
  agents: AgentEntry[];
  allAgents: AgentEntry[];
  database: DatabaseState;
  heartbeatMonitor: HeartbeatMonitor | null;
  heartbeatLogs: string[];
  globalChatMessages: ChatMessage[];
  temporaryDashboard: TemporaryDashboard | null;
  state: LucaState | null;

  getAgentLines: (agentId: string) => string[];
  getAgentStatus: (agentId: string) => string;

  activateMission: (mission: { title: string; description: string; success: string }) => Promise<boolean>;
  resetMission: () => Promise<void>;
  startSupervisor: () => Promise<void>;
  pauseSupervisor: () => Promise<void>;
  runAgent: (agentId: string) => Promise<void>;
  startHeartbeat: () => Promise<void>;
  pauseHeartbeat: () => Promise<void>;
  clearAgents: () => Promise<void>;
  sendChatMessage: (content: string) => Promise<void>;
  clearOperationError: () => void;
  refresh: () => Promise<boolean>;
}

const LucaContext = createContext<LucaContextValue | null>(null);

export function LucaStateProvider({ children }: { children: React.ReactNode }) {
  const localRuntime = isLocalRuntimeHost();
  const [runtimeMode] = useState<'backend' | 'cloud'>(localRuntime ? 'backend' : 'cloud');
  const [backendReady, setBackendReady] = useState(false);
  const [connectionState, setConnectionState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [missionActionBusy, setMissionActionBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [state, setState] = useState<LucaState | null>(null);
  const [supervisorMode, setSupervisorMode] = useState('standby');
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [allAgents, setAllAgents] = useState<AgentEntry[]>([]);
  const [database, setDatabase] = useState<DatabaseState>(fallbackDatabase);
  const [heartbeatMonitor, setHeartbeatMonitor] = useState<HeartbeatMonitor | null>(null);
  const [heartbeatLogs, setHeartbeatLogs] = useState<string[]>([]);
  const [globalChatMessages, setGlobalChatMessages] = useState<ChatMessage[]>([]);
  const [temporaryDashboard, setTemporaryDashboard] = useState<TemporaryDashboard | null>(null);

  const agentLinesRef = useRef<Record<string, string[]>>({});
  const cloudResultRef = useRef<LucaState | null>(null);
  const cloudRefreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const eventRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageVisibleRef = useRef(true);
  const stateRef = useRef<LucaState | null>(null);
  const missionActionBusyRef = useRef(false);

  const clearCloudRefreshTimers = useCallback(() => {
    cloudRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
    cloudRefreshTimersRef.current = [];
  }, []);

  const applyState = useCallback((next: LucaState) => {
    stateRef.current = next;
    setState(next);
    const list = next.agents ?? [];
    const supervisor = list.find((a) => a.id === 'supervisor');
    const visibleAgents = list.filter((a) => a.id !== 'supervisor');

    setAllAgents(list);
    setAgents(visibleAgents);
    setDatabase(next.database ?? fallbackDatabase);
    setHeartbeatMonitor(next.heartbeatMonitor ?? null);
    setHeartbeatLogs(next.heartbeatLogs ?? []);
    setGlobalChatMessages(next.globalChatMessages ?? []);
    setTemporaryDashboard(next.temporaryDashboard ?? null);
    setSupervisorMode(supervisor?.status ?? next.supervisorMode ?? 'standby');
    setActiveMission(
      next.activeMission ? { ...next.activeMission, activatedAt: next.activeMission.activatedAt ?? '' } : null,
    );

    list.forEach((agent) => {
      agentLinesRef.current = { ...agentLinesRef.current, [agent.id]: agent.lines ?? [] };
    });
  }, []);

  const syncState = useCallback((next: LucaState) => {
    if (runtimeMode === 'cloud' && (next.temporaryDashboard || next.activeRun)) {
      cloudResultRef.current = next;
    }
    applyState(next);
  }, [applyState, runtimeMode]);

  const patchState = useCallback((updater: (current: LucaState) => LucaState) => {
    const current = stateRef.current;
    if (!current) return;
    syncState(updater(current));
  }, [syncState]);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const pending = (async () => {
      const next = await fetchState();
      if (!next) {
        setBackendReady(false);
        setConnectionState('offline');
        return false;
      }
      syncState(next);
      setBackendReady(true);
      setConnectionState('online');
      return true;
    })();

    refreshInFlightRef.current = pending;
    try {
      return await pending;
    } finally {
      if (refreshInFlightRef.current === pending) refreshInFlightRef.current = null;
    }
  }, [runtimeMode, syncState]);

  const scheduleCloudRefreshBurst = useCallback(() => {
    if (runtimeMode !== 'cloud') return;
    clearCloudRefreshTimers();
    [500, 1500, 3000, 6000, 10000, 16000].forEach((delay) => {
      const timer = setTimeout(() => {
        void refresh();
      }, delay);
      cloudRefreshTimersRef.current.push(timer);
    });
  }, [clearCloudRefreshTimers, refresh, runtimeMode]);

  const scheduleEventRefresh = useCallback((delay = 350) => {
    if (eventRefreshTimerRef.current) clearTimeout(eventRefreshTimerRef.current);
    eventRefreshTimerRef.current = setTimeout(() => {
      eventRefreshTimerRef.current = null;
      if (runtimeMode === 'cloud' && !pageVisibleRef.current) return;
      void refresh();
    }, delay);
  }, [refresh, runtimeMode]);

  const applyBackendEvent = useCallback((event: BackendEvent) => {
    if (event.type === 'mission.activated') {
      const e = event as { mission: Mission; time: string };
      setActiveMission({ ...e.mission, activatedAt: e.time });
    }
    if (event.type === 'chat.message') {
      const e = event as { message: ChatMessage };
      setGlobalChatMessages((messages) => [...messages, e.message].slice(-120));
    }
    if (event.type === 'agent.status') {
      const e = event as { agentId?: string; status?: string };
      if (e.agentId && e.status) {
        const nextStatus = e.status;
        const agentId = e.agentId;
        patchState((current) => ({
          ...current,
          supervisorMode: agentId === 'supervisor' ? nextStatus : current.supervisorMode,
          agents: (current.agents ?? []).map((agent) => (
            agent.id === agentId ? { ...agent, status: nextStatus } : agent
          )),
        }));
      }
      scheduleEventRefresh();
      return;
    }
    if (event.type === 'agent.output') {
      const e = event as { agentId?: string; text?: string };
      if (e.agentId && typeof e.text === 'string' && e.text.trim()) {
        const agentId = e.agentId;
        const output = e.text;
        patchState((current) => ({
          ...current,
          agents: (current.agents ?? []).map((agent) => {
            if (agent.id !== agentId) return agent;
            const lastLine = agent.lines?.[agent.lines.length - 1];
            if (lastLine === output) return agent;
            return { ...agent, lines: [...(agent.lines ?? []), output] };
          }),
        }));
      }
      scheduleEventRefresh();
      return;
    }
    scheduleEventRefresh();
  }, [patchState, scheduleEventRefresh]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function nextPollDelay() {
      if (runtimeMode !== 'cloud') return LOCAL_POLL_MS;
      const snapshot = stateRef.current ?? cloudResultRef.current;
      return cloudPollDelayForSnapshot(snapshot);
    }

    function schedulePoll(delay = nextPollDelay()) {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(async () => {
        if (closed) return;
        if (runtimeMode === 'cloud' && !pageVisibleRef.current) {
          schedulePoll();
          return;
        }
        await refresh();
        schedulePoll();
      }, delay);
    }

    async function connect() {
      const hasBackend = await refresh();
      if (!localRuntime || !hasBackend || closed) return;
      socket = new WebSocket(wsUrl());

      socket.addEventListener('open', () => {
        setBackendReady(true);
        setConnectionState('online');
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      });

      socket.addEventListener('close', () => {
        setBackendReady(false);
        setConnectionState('offline');
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
      });

      socket.addEventListener('error', () => {
        setBackendReady(false);
        setConnectionState('offline');
      });

      socket.addEventListener('message', (message) => {
        try {
          const payload = JSON.parse(message.data) as WsPayload;
          if (payload.kind === 'state') syncState(payload.state);
          if (payload.kind === 'event') applyBackendEvent(payload.event);
        } catch {
          // Payload invalido nao deve derrubar a interface.
        }
      });
    }

    void connect();
    if (typeof document !== 'undefined') {
      pageVisibleRef.current = document.visibilityState !== 'hidden';
      const onVisibilityChange = () => {
        const visible = document.visibilityState !== 'hidden';
        pageVisibleRef.current = visible;
        if (visible) {
          void refresh();
          schedulePoll(1000);
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      schedulePoll();

      return () => {
        closed = true;
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (socket) socket.close();
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (pollTimer) clearTimeout(pollTimer);
        if (eventRefreshTimerRef.current) clearTimeout(eventRefreshTimerRef.current);
        clearCloudRefreshTimers();
      };
    }

    schedulePoll();

    return () => {
      closed = true;
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearTimeout(pollTimer);
      if (eventRefreshTimerRef.current) clearTimeout(eventRefreshTimerRef.current);
      clearCloudRefreshTimers();
    };
  }, [applyBackendEvent, clearCloudRefreshTimers, localRuntime, refresh, runtimeMode, syncState]);

  const getAgentLines = useCallback(
    (agentId: string): string[] => {
      if (agentId === 'heartbeat') return heartbeatLogs;
      return agentLinesRef.current[agentId] ?? [];
    },
    [heartbeatLogs],
  );

  const getAgentStatus = useCallback(
    (agentId: string): string => {
      if (agentId === 'heartbeat') return backendReady ? 'online' : 'offline';
      if (agentId === 'database') return `${countDatabaseItems(database)} itens`;
      if (agentId === 'supervisor') return supervisorMode;
      const agent = agents.find((a) => a.id === agentId);
      return agent?.status ?? 'idle';
    },
    [backendReady, database, supervisorMode, agents],
  );

  const wrap = useCallback(
    (fn: () => Promise<unknown>, fallbackMessage: string) => async () => {
      setOperationError(null);
      try {
        await fn();
        await refresh();
      } catch (error) {
        setOperationError(buildApiErrorMessage(error, fallbackMessage));
      }
    },
    [refresh],
  );

  const missionLockReason = missionLockReasonForState(state, missionActionBusy);
  const missionPhase = missionUiPhaseForState(state, missionActionBusy);

  const value = useMemo<LucaContextValue>(
    () => ({
      backendReady,
      connectionState,
      runtimeMode,
      supervisorMode,
      missionActionBusy,
      operationError,
      canActivateMission: !missionLockReason,
      missionLockReason,
      missionPhase,
      activeMission,
      agents,
      allAgents,
      database,
      heartbeatMonitor,
      heartbeatLogs,
      globalChatMessages,
      temporaryDashboard,
      state,
      getAgentLines,
      getAgentStatus,
      activateMission: async (mission) => {
        if (missionLockReasonForState(stateRef.current, missionActionBusyRef.current)) return false;
        setOperationError(null);
        missionActionBusyRef.current = true;
        setMissionActionBusy(true);
        try {
          const result = await lucaApi.activateMission(mission) as { state?: LucaState; mission?: Mission };
          if (result?.mission) {
            setActiveMission({
              ...result.mission,
              activatedAt: result.mission.activatedAt ?? new Date().toISOString(),
            });
            setSupervisorMode('running');
            setBackendReady(true);
            setConnectionState('online');
          }
          if (result?.state) {
            syncState(result.state);
            setBackendReady(true);
            scheduleCloudRefreshBurst();
            return true;
          }
          const refreshed = await refresh();
          scheduleCloudRefreshBurst();
          return refreshed;
        } catch (error) {
          setOperationError(buildApiErrorMessage(error, 'Falha ao ativar a missao.'));
          return false;
        } finally {
          missionActionBusyRef.current = false;
          setMissionActionBusy(false);
        }
      },
      resetMission: async () => {
        setOperationError(null);
        missionActionBusyRef.current = true;
        setMissionActionBusy(true);
        cloudResultRef.current = null;
        try {
          const result = await lucaApi.resetMission() as { state?: LucaState };
          if (result?.state) {
            syncState(result.state);
            setBackendReady(true);
            scheduleCloudRefreshBurst();
            return;
          }
          await refresh();
          scheduleCloudRefreshBurst();
        } catch (error) {
          setOperationError(buildApiErrorMessage(error, 'Falha ao resetar a missao.'));
        } finally {
          missionActionBusyRef.current = false;
          setMissionActionBusy(false);
        }
      },
      startSupervisor: async () => {
        await wrap(lucaApi.startSupervisor, 'Falha ao iniciar o supervisor.')();
        scheduleCloudRefreshBurst();
      },
      pauseSupervisor: async () => {
        await wrap(lucaApi.pauseSupervisor, 'Falha ao pausar o supervisor.')();
        scheduleCloudRefreshBurst();
      },
      runAgent: async (agentId) => {
        setOperationError(null);
        try {
          await lucaApi.runAgent(agentId);
          await refresh();
          scheduleCloudRefreshBurst();
        } catch (error) {
          setOperationError(buildApiErrorMessage(error, `Falha ao rodar o agente ${agentId}.`));
        }
      },
      startHeartbeat: async () => {
        await wrap(lucaApi.startHeartbeat, 'Falha ao iniciar o heartbeat.')();
        scheduleCloudRefreshBurst();
      },
      pauseHeartbeat: async () => {
        await wrap(lucaApi.pauseHeartbeat, 'Falha ao pausar o heartbeat.')();
        scheduleCloudRefreshBurst();
      },
      clearAgents: async () => {
        await wrap(lucaApi.clearAgents, 'Falha ao limpar os agentes.')();
        scheduleCloudRefreshBurst();
      },
      sendChatMessage: async (content) => {
        setOperationError(null);
        try {
          await lucaApi.sendChatMessage(content);
          await refresh();
          scheduleCloudRefreshBurst();
        } catch (error) {
          setOperationError(buildApiErrorMessage(error, 'Falha ao enviar mensagem no chat global.'));
        }
      },
      clearOperationError: () => setOperationError(null),
      refresh,
    }),
    [
      backendReady, connectionState, runtimeMode, supervisorMode, missionActionBusy, operationError, missionLockReason, missionPhase,
      activeMission, agents, allAgents, database, heartbeatMonitor, heartbeatLogs, globalChatMessages, temporaryDashboard,
      state, getAgentLines, getAgentStatus, refresh, scheduleCloudRefreshBurst, syncState, wrap,
    ],
  );

  return <LucaContext.Provider value={value}>{children}</LucaContext.Provider>;
}

export function useLuca(): LucaContextValue {
  const ctx = useContext(LucaContext);
  if (!ctx) throw new Error('useLuca deve ser usado dentro de <LucaStateProvider>');
  return ctx;
}

export function useRuntimeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}
