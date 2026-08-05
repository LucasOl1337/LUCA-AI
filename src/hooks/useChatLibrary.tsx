import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { buildApiErrorMessage, lucaApi } from '@/lib/api';
import type {
  LucaAiChatFolder,
  LucaAiChatSession,
  LucaAiChatSessionSummary,
} from '@/lib/types';

interface ChatLibraryContextValue {
  ready: boolean;
  busy: boolean;
  error: string | null;
  folders: LucaAiChatFolder[];
  sessions: LucaAiChatSessionSummary[];
  activeSessionId: string | null;
  activeSession: LucaAiChatSession | null;
  refresh: () => Promise<void>;
  createSession: (folderId?: string | null) => Promise<LucaAiChatSession | null>;
  activateSession: (sessionId: string) => Promise<LucaAiChatSession | null>;
  deleteSession: (sessionId: string) => Promise<LucaAiChatSession | null>;
  createFolder: (name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveSession: (sessionId: string, folderId: string | null) => Promise<void>;
  persistSession: (sessionId: string, patch: Record<string, unknown>) => Promise<void>;
  clearError: () => void;
}

const ChatLibraryContext = createContext<ChatLibraryContextValue | null>(null);

function mergeSessionSummary(
  prev: LucaAiChatSessionSummary[],
  next: LucaAiChatSessionSummary[] | undefined,
): LucaAiChatSessionSummary[] {
  if (!Array.isArray(next)) return prev;
  // Keep previous order; only insert brand-new ids at the front (createSession).
  const nextById = new Map(next.map((item) => [item.id, item]));
  const kept: LucaAiChatSessionSummary[] = [];
  for (const item of prev) {
    const fresh = nextById.get(item.id);
    if (fresh) {
      kept.push(fresh);
      nextById.delete(item.id);
    }
  }
  const brandNew = next.filter((item) => nextById.has(item.id));
  return [...brandNew, ...kept];
}

export function ChatLibraryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<LucaAiChatFolder[]>([]);
  const [sessions, setSessions] = useState<LucaAiChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<LucaAiChatSession | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const activateSeqRef = useRef(0);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const applySnapshot = useCallback((data: {
    folders?: LucaAiChatFolder[];
    sessions?: LucaAiChatSessionSummary[];
    activeSessionId?: string | null;
    activeSession?: LucaAiChatSession | null;
    session?: LucaAiChatSession | null;
  }, options: { replaceSessionOrder?: boolean; setActive?: boolean } = {}) => {
    if (Array.isArray(data.folders)) setFolders(data.folders);
    if (Array.isArray(data.sessions)) {
      setSessions((prev) => (
        options.replaceSessionOrder || prev.length === 0
          ? data.sessions!
          : mergeSessionSummary(prev, data.sessions)
      ));
    }
    if (options.setActive !== false && Object.prototype.hasOwnProperty.call(data, 'activeSessionId')) {
      setActiveSessionId(data.activeSessionId || null);
    }
    if (data.session) setActiveSession(data.session);
    else if (data.activeSession) setActiveSession(data.activeSession);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await lucaApi.getChatLibrary();
      applySnapshot(data, { replaceSessionOrder: true, setActive: true });
      if (!data.activeSession && data.activeSessionId) {
        const full = await lucaApi.getChatSession(data.activeSessionId);
        if (full.session && activeSessionIdRef.current === data.activeSessionId) {
          setActiveSession(full.session);
        }
      }
      setReady(true);
    } catch (err) {
      setReady(true);
      setError(buildApiErrorMessage(err, 'Falha ao carregar sessões.'));
    }
  }, [applySnapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSession = useCallback(async (folderId?: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const data = await lucaApi.createChatSession({
        title: 'Nova sessão',
        folderId: folderId || null,
        seedFromActive: true,
      });
      // New session is prepended; accept server order for this path.
      applySnapshot(data, { replaceSessionOrder: true, setActive: true });
      const session = data.session || data.activeSession || null;
      if (session) setActiveSession(session);
      return session;
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao criar sessão.'));
      return null;
    } finally {
      setBusy(false);
    }
  }, [applySnapshot]);

  const activateSession = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId === activeSessionIdRef.current) {
      return activeSession;
    }
    const seq = ++activateSeqRef.current;
    setBusy(true);
    setError(null);
    // Optimistic: switch highlight immediately, clear stale body until fetch lands.
    setActiveSessionId(sessionId);
    setActiveSession(null);
    try {
      // Prefer GET session content first (full transcript) then mark active.
      const full = await lucaApi.getChatSession(sessionId);
      if (seq !== activateSeqRef.current) return null;
      const session = full.session || null;
      if (!session) throw new Error('session_not_found');
      setActiveSession(session);
      // Activate without reshuffling list; ignore list payload order.
      const activated = await lucaApi.activateChatSession(sessionId);
      if (seq !== activateSeqRef.current) return session;
      if (Array.isArray(activated.sessions)) {
        setSessions((prev) => mergeSessionSummary(prev, activated.sessions));
      }
      if (Array.isArray(activated.folders)) setFolders(activated.folders);
      setActiveSessionId(sessionId);
      // Prefer the full GET body over activate payload if both exist.
      setActiveSession(activated.session && activated.session.id === session.id
        ? { ...session, ...activated.session, transcript: session.transcript, finalResult: session.finalResult ?? activated.session.finalResult }
        : session);
      return session;
    } catch (err) {
      if (seq === activateSeqRef.current) {
        setError(buildApiErrorMessage(err, 'Falha ao trocar de sessão.'));
      }
      return null;
    } finally {
      if (seq === activateSeqRef.current) setBusy(false);
    }
  }, [activeSession]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!sessionId || busy) return null;
    setBusy(true);
    setError(null);
    try {
      const data = await lucaApi.deleteChatSession(sessionId);
      applySnapshot(data, { replaceSessionOrder: true, setActive: true });
      return data.activeSession || null;
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao apagar sessão.'));
      return null;
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, busy]);

  const createFolder = useCallback(async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await lucaApi.createChatFolder(name);
      applySnapshot(data, { replaceSessionOrder: false, setActive: false });
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao criar pasta.'));
    } finally {
      setBusy(false);
    }
  }, [applySnapshot]);

  const deleteFolder = useCallback(async (folderId: string) => {
    if (!folderId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await lucaApi.deleteChatFolder(folderId, false);
      applySnapshot(data, { replaceSessionOrder: false, setActive: false });
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao apagar pasta.'));
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, busy]);

  const moveSession = useCallback(async (sessionId: string, folderId: string | null) => {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await lucaApi.updateChatSession(sessionId, { folderId });
      applySnapshot(data, { replaceSessionOrder: false, setActive: false });
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao mover sessão.'));
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, busy]);

  const persistSession = useCallback(async (sessionId: string, patch: Record<string, unknown>) => {
    const id = String(sessionId || '').trim();
    if (!id) return;
    // The provider survives SPA route changes. Mirror the patch synchronously so
    // remounting LUCA cannot rehydrate an older empty body while PATCH is in flight.
    setActiveSession((prev) => (
      prev?.id === id ? { ...prev, ...patch, id } as LucaAiChatSession : prev
    ));
    try {
      const data = await lucaApi.updateChatSession(id, patch);
      // Never reshuffle list; only refresh summaries in place.
      if (Array.isArray(data.sessions)) {
        setSessions((prev) => mergeSessionSummary(prev, data.sessions));
      }
      if (Array.isArray(data.folders)) setFolders(data.folders);
      // Keep local body authoritative while editing; only merge server summary fields.
      // Replacing transcript from server response can race with in-flight UI updates
      // and wipe content on the next applySession pass.
      if (activeSessionIdRef.current === id && data.session) {
        setActiveSession((prev) => {
          if (!prev || prev.id !== id) return data.session!;
          return {
            ...data.session!,
            transcript: Array.isArray(prev.transcript) ? prev.transcript : data.session!.transcript,
            finalResult: prev.finalResult !== undefined ? prev.finalResult : data.session!.finalResult,
            missionDraft: typeof prev.missionDraft === 'string' ? prev.missionDraft : data.session!.missionDraft,
          };
        });
      }
    } catch {
      // best-effort — runMission also flushes; silent here keeps typing smooth.
    }
  }, []);

  const value = useMemo<ChatLibraryContextValue>(() => ({
    ready,
    busy,
    error,
    folders,
    sessions,
    activeSessionId,
    activeSession,
    refresh,
    createSession,
    activateSession,
    deleteSession,
    createFolder,
    deleteFolder,
    moveSession,
    persistSession,
    clearError: () => setError(null),
  }), [
    activateSession,
    activeSession,
    activeSessionId,
    busy,
    createFolder,
    createSession,
    deleteFolder,
    deleteSession,
    error,
    folders,
    moveSession,
    persistSession,
    ready,
    refresh,
    sessions,
  ]);

  return (
    <ChatLibraryContext.Provider value={value}>
      {children}
    </ChatLibraryContext.Provider>
  );
}

export function useChatLibrary() {
  const ctx = useContext(ChatLibraryContext);
  if (!ctx) throw new Error('useChatLibrary requires ChatLibraryProvider');
  return ctx;
}
