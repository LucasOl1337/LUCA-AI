import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Loader2,
  MessageSquarePlus,
  Search,
  Trash2,
} from 'lucide-react';
import { useChatLibrary } from '@/hooks/useChatLibrary';
import { useTheme } from '@/hooks/useTheme';

interface SidebarSessionsRailProps {
  compact?: boolean;
  onOpenLucaAi?: () => void;
}

export default function SidebarSessionsRail({ compact = false, onOpenLucaAi }: SidebarSessionsRailProps) {
  const theme = useTheme();
  const {
    busy,
    folders,
    sessions,
    activeSessionId,
    createSession,
    activateSession,
    deleteSession,
    createFolder,
    deleteFolder,
  } = useChatLibrary();
  const [query, setQuery] = useState('');
  const [folderName, setFolderName] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showFolderForm, setShowFolderForm] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((session) => {
      const hay = `${session.title || ''} ${session.preview || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, sessions]);

  const rootSessions = useMemo(
    () => filtered.filter((session) => !session.folderId),
    [filtered],
  );

  async function handleActivate(sessionId: string) {
    onOpenLucaAi?.();
    await activateSession(sessionId);
  }

  async function handleCreate(folderId?: string | null) {
    onOpenLucaAi?.();
    await createSession(folderId);
  }

  function submitFolder() {
    const name = folderName.trim();
    if (!name || busy) return;
    void createFolder(name).then(() => {
      setFolderName('');
      setShowFolderForm(false);
    });
  }

  if (compact) {
    return (
      <div className="luca-sidebar-sessions compact">
        <button
          type="button"
          className="luca-sidebar-new-session compact"
          disabled={busy}
          title="Nova sessão"
          onClick={() => void handleCreate(null)}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <div className="luca-sidebar-sessions" data-sidebar-sessions>
      <button
        type="button"
        className="luca-sidebar-new-session"
        disabled={busy}
        onClick={() => void handleCreate(null)}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
        <span>Nova sessão</span>
      </button>

      <label className="luca-sidebar-session-search">
        <Search className="h-3.5 w-3.5" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar sessões…"
        />
      </label>

      <div className="luca-sidebar-section-head">
        <span>Projetos</span>
        <button
          type="button"
          className="luca-sidebar-mini-btn"
          title="Novo projeto"
          onClick={() => setShowFolderForm((open) => !open)}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {showFolderForm && (
        <div className="luca-sidebar-folder-form">
          <input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitFolder();
              }
            }}
            placeholder="Nome do projeto"
            disabled={busy}
            autoFocus
          />
          <button type="button" disabled={busy || !folderName.trim()} onClick={submitFolder}>
            Criar
          </button>
        </div>
      )}

      <div className="luca-sidebar-session-scroll">
        {folders.map((folder) => {
          const children = filtered.filter((session) => session.folderId === folder.id);
          const isCollapsed = Boolean(collapsed[folder.id]);
          return (
            <section key={folder.id} className="luca-sidebar-folder">
              <div className="luca-sidebar-folder-head">
                <button
                  type="button"
                  className="luca-sidebar-folder-toggle"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }))}
                >
                  {isCollapsed
                    ? <ChevronRight className="h-3.5 w-3.5" />
                    : <ChevronDown className="h-3.5 w-3.5" />}
                  <strong>{folder.name}</strong>
                </button>
                <div className="luca-sidebar-folder-actions">
                  <button
                    type="button"
                    className="luca-sidebar-mini-btn"
                    title="Nova sessão neste projeto"
                    disabled={busy}
                    onClick={() => void handleCreate(folder.id)}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="luca-sidebar-mini-btn danger"
                    title="Apagar pasta"
                    disabled={busy}
                    onClick={() => void deleteFolder(folder.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                children.length === 0
                  ? <p className="luca-sidebar-empty">Sem sessões</p>
                  : children.map((session) => (
                    <SessionItem
                      key={session.id}
                      title={session.title}
                      preview={session.preview}
                      messageCount={session.messageCount}
                      active={session.id === activeSessionId}
                      confirmDelete={confirmDeleteId === session.id}
                      busy={busy}
                      onActivate={() => void handleActivate(session.id)}
                      onAskDelete={() => setConfirmDeleteId(session.id)}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                      onDelete={() => {
                        void deleteSession(session.id);
                        setConfirmDeleteId(null);
                      }}
                    />
                  ))
              )}
            </section>
          );
        })}

        <section className="luca-sidebar-folder">
          <div className="luca-sidebar-folder-head">
            <strong style={{ color: theme.textGhost, paddingLeft: 8 }}>Sem pasta</strong>
          </div>
          {rootSessions.length === 0 ? (
            <p className="luca-sidebar-empty">Nenhuma sessão solta</p>
          ) : rootSessions.map((session) => (
            <SessionItem
              key={session.id}
              title={session.title}
              preview={session.preview}
              messageCount={session.messageCount}
              active={session.id === activeSessionId}
              confirmDelete={confirmDeleteId === session.id}
              busy={busy}
              onActivate={() => void handleActivate(session.id)}
              onAskDelete={() => setConfirmDeleteId(session.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={() => {
                void deleteSession(session.id);
                setConfirmDeleteId(null);
              }}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function SessionItem({
  title,
  preview,
  messageCount,
  active,
  confirmDelete,
  busy,
  onActivate,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  title?: string;
  preview?: string;
  messageCount?: number;
  active: boolean;
  confirmDelete: boolean;
  busy: boolean;
  onActivate: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`luca-sidebar-session ${active ? 'active' : ''}`}>
      <button type="button" className="luca-sidebar-session-main" disabled={busy} onClick={onActivate}>
        <span className="luca-sidebar-session-dot" aria-hidden />
        <span className="min-w-0 flex-1 text-left">
          <strong className="block truncate">{title || 'Sem título'}</strong>
          <small className="block truncate">
            {messageCount ? `${messageCount} msg` : 'vazia'}
            {preview ? ` · ${preview}` : ''}
          </small>
        </span>
      </button>
      {confirmDelete ? (
        <div className="luca-sidebar-session-tools">
          <button type="button" className="luca-sidebar-mini-btn danger" disabled={busy} onClick={onDelete} title="Confirmar">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="luca-sidebar-mini-btn" disabled={busy} onClick={onCancelDelete} title="Cancelar">
            ×
          </button>
        </div>
      ) : (
        <button type="button" className="luca-sidebar-mini-btn danger" disabled={busy} onClick={onAskDelete} title="Apagar">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
