import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchState, lucaApi, wsUrl } from '@/lib/api';
import { countDatabaseItems } from '@/lib/database';
import type {
  AgentEntry,
  BackendEvent,
  ChatMessage,
  DatabaseState,
  HeartbeatMonitor,
  LucaState,
  Mission,
  TemporaryDashboard,
  WsPayload,
} from '@/lib/types';

const fallbackDatabase: DatabaseState = {
  source: { name: 'database offline', topic: 'LUCA-AI' },
  layers: {
    rawResearch: { status: 'offline', items: [] },
    processing: { status: 'empty', items: [] },
    dashboardIntegration: { status: 'empty', items: [] },
  },
  heartbeat: [],
};

export interface LucaContextValue {
  backendReady: boolean;
  supervisorMode: string;
  activeMission: Mission | null;
  agents: AgentEntry[];               // sem o supervisor (UI principal)
  allAgents: AgentEntry[];            // bruto, inclui supervisor
  database: DatabaseState;
  heartbeatMonitor: HeartbeatMonitor | null;
  heartbeatLogs: string[];
  globalChatMessages: ChatMessage[];
  temporaryDashboard: TemporaryDashboard | null;
  state: LucaState | null;

  // derivados
  getAgentLines: (agentId: string) => string[];
  getAgentStatus: (agentId: string) => string;

  // ações
  activateMission: (mission: { title: string; description: string; success: string }) => Promise<void>;
  resetMission: () => Promise<void>;
  startSupervisor: () => Promise<void>;
  pauseSupervisor: () => Promise<void>;
  runAgent: (agentId: string) => Promise<void>;
  startHeartbeat: () => Promise<void>;
  pauseHeartbeat: () => Promise<void>;
  clearAgents: () => Promise<void>;
  sendChatMessage: (content: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const LucaContext = createContext<LucaContextValue | null>(null);

export function LucaStateProvider({ children }: { children: React.ReactNode }) {
  const [backendReady, setBackendReady] = useState(false);
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

  const syncBackendState = useCallback((next: LucaState) => {
    setState(next);
    const list = next.agents ?? [];
    const supervisor = list.find((a) => a.id === 'supervisor');
    const visibleAgents = list.filter((a) => a.id !== 'supervisor');

    setAllAgents(list);
    setDatabase(next.database ?? fallbackDatabase);
    setHeartbeatMonitor(next.heartbeatMonitor ?? null);
    setHeartbeatLogs(next.heartbeatLogs ?? []);
    setGlobalChatMessages(next.globalChatMessages ?? []);
    setTemporaryDashboard(next.temporaryDashboard ?? null);

    if (supervisor) {
      setSupervisorMode(supervisor.status);
      agentLinesRef.current = { ...agentLinesRef.current, supervisor: supervisor.lines };
    }
    setActiveMission(
      next.activeMission ? { ...next.activeMission, activatedAt: next.activeMission.activatedAt ?? '' } : null,
    );
    if (visibleAgents.length) {
      setAgents(visibleAgents);
      visibleAgents.forEach((agent) => {
        agentLinesRef.current = { ...agentLinesRef.current, [agent.id]: agent.lines };
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchState();
    if (next) {
      syncBackendState(next);
      setBackendReady(true);
    } else {
      setBackendReady(false);
    }
  }, [syncBackendState]);

  const applyBackendEvent = useCallback((event: BackendEvent) => {
    if (event.type === 'mission.activated') {
      const e = event as { mission: Mission; time: string };
      setActiveMission({ ...e.mission, activatedAt: e.time });
    }
    if (event.type === 'chat.message') {
      const e = event as { message: ChatMessage };
      setGlobalChatMessages((messages) => [...messages, e.message].slice(-120));
    }
    if (event.type === 'agent.output' || event.type === 'agent.status') {
      void refresh();
    }
  }, [refresh]);

  // WS + reconnect + poll — porta de main.jsx:318-356.
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    function connect() {
      void refresh();
      socket = new WebSocket(wsUrl());

      socket.addEventListener('open', () => {
        setBackendReady(true);
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      });

      socket.addEventListener('close', () => {
        setBackendReady(false);
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
      });

      socket.addEventListener('error', () => setBackendReady(false));

      socket.addEventListener('message', (message) => {
        try {
          const payload = JSON.parse(message.data) as WsPayload;
          if (payload.kind === 'state') syncBackendState(payload.state);
          if (payload.kind === 'event') applyBackendEvent(payload.event);
        } catch {
          // ignora payloads malformados
        }
      });
    }

    connect();
    pollTimer = setInterval(() => void refresh(), 5000);

    return () => {
      closed = true;
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [refresh, syncBackendState, applyBackendEvent]);

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

  // Ações — cada uma dispara refresh, como em main.jsx.
  const wrap = useCallback(
    (fn: () => Promise<unknown>) => async () => {
      await fn();
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<LucaContextValue>(
    () => ({
      backendReady,
      supervisorMode,
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
        await lucaApi.activateMission(mission);
        await refresh();
      },
      resetMission: wrap(lucaApi.resetMission),
      startSupervisor: wrap(lucaApi.startSupervisor),
      pauseSupervisor: wrap(lucaApi.pauseSupervisor),
      runAgent: async (agentId) => {
        await lucaApi.runAgent(agentId);
        await refresh();
      },
      startHeartbeat: wrap(lucaApi.startHeartbeat),
      pauseHeartbeat: wrap(lucaApi.pauseHeartbeat),
      clearAgents: wrap(lucaApi.clearAgents),
      sendChatMessage: async (content) => {
        await lucaApi.sendChatMessage(content);
        await refresh();
      },
      refresh,
    }),
    [
      backendReady, supervisorMode, activeMission, agents, allAgents, database,
      heartbeatMonitor, heartbeatLogs, globalChatMessages, temporaryDashboard, state,
      getAgentLines, getAgentStatus, refresh, wrap,
    ],
  );

  return <LucaContext.Provider value={value}>{children}</LucaContext.Provider>;
}

export function useLuca(): LucaContextValue {
  const ctx = useContext(LucaContext);
  if (!ctx) throw new Error('useLuca deve ser usado dentro de <LucaStateProvider>');
  return ctx;
}

// Tick global de 1s para atualizar runtimes ("rodando há Xmin").
export function useRuntimeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}
