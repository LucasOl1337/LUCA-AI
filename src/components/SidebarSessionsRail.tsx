import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Folder,
  FolderPlus,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Search,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useChatLibrary } from '@/hooks/useChatLibrary';
import { useDeferredFlag } from '@/hooks/useDeferredFlag';
import { useAppLocation } from '@/hooks/useAppLocation';

interface SidebarSessionsRailProps {
  compact?: boolean;
  onOpenLucaAi?: () => void;
}

export default function SidebarSessionsRail({ compact = false, onOpenLucaAi }: SidebarSessionsRailProps) {
  const { navigate } = useAppLocation();
  const {
    ready,
    busy,
    error,
    folders,
    sessions,
    activeSessionId,
    refresh,
    createSession,
    activateSession,
    deleteSession,
    createFolder,
    renameFolder,
    deleteFolder,
  } = useChatLibrary();
  const [query, setQuery] = useState('');
  const [folderName, setFolderName] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const showSessionSkeleton = useDeferredFlag(!ready && sessions.length === 0);
  const searching = query.trim().length > 0;

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
    const session = sessions.find((item) => item.id === sessionId);
    navigate({
      page: 'luca-ai',
      sessao: sessionId,
      aba: '',
      modo: session?.operationMode === 'individual' ? 'individual' : '',
    }, 'push');
    onOpenLucaAi?.();
    await activateSession(sessionId);
  }

  async function handleCreate(folderId?: string | null) {
    onOpenLucaAi?.();
    const session = await createSession(folderId);
    if (session?.id) navigate({ page: 'luca-ai', sessao: session.id, aba: '' }, 'push');
  }

  function submitFolder() {
    const name = folderName.trim();
    if (!name || busy) return;
    void createFolder(name).then(() => {
      setFolderName('');
      setShowFolderForm(false);
    });
  }

  function startRename(folderId: string, currentName: string) {
    setMenuFolderId(null);
    setRenamingFolderId(folderId);
    setRenameValue(currentName);
  }

  function commitRename() {
    const id = renamingFolderId;
    const name = renameValue.trim();
    if (!id) return;
    setRenamingFolderId(null);
    if (!name) return;
    void renameFolder(id, name);
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

      {error ? (
        <div className="luca-sidebar-library-error" data-sidebar-sessions-error data-tone="error" role="alert">
          <p>{error}</p>
          <button type="button" data-sidebar-sessions-retry onClick={() => void refresh()} disabled={busy}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      <div className="luca-sidebar-session-scroll">
        {showSessionSkeleton ? (
          <div className="luca-sidebar-skeleton" data-sidebar-sessions-loading role="status" aria-label="Carregando sessões">
            <span /><span /><span /><span />
          </div>
        ) : null}

        {!showSessionSkeleton && searching && filtered.length === 0 && sessions.length > 0 ? (
          <div className="luca-sidebar-empty-block" data-sidebar-sessions-empty="search">
            <p>Nenhuma sessão para “{query.trim()}”.</p>
            <button type="button" onClick={() => setQuery('')}>Limpar busca</button>
          </div>
        ) : null}

        {!showSessionSkeleton && !searching && sessions.length === 0 && folders.length === 0 && !error ? (
          <div className="luca-sidebar-empty-block" data-sidebar-sessions-empty="library">
            <p>Nenhum chat ainda. A primeira sessão guarda a missão e o rumo da equipe.</p>
            <button type="button" disabled={busy} onClick={() => void handleCreate(null)}>Começar o primeiro chat</button>
          </div>
        ) : null}

        {folders.map((folder) => {
          const children = filtered.filter((session) => session.folderId === folder.id);
          const isCollapsed = Boolean(collapsed[folder.id]);
          const isRenaming = renamingFolderId === folder.id;
          return (
            <section key={folder.id} className="luca-sidebar-folder">
              <div className={`luca-sidebar-folder-head ${menuFolderId === folder.id ? 'menu-open' : ''}`}>
                {isRenaming ? (
                  <input
                    className="luca-sidebar-folder-rename"
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRename();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setRenamingFolderId(null);
                      }
                    }}
                    disabled={busy}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="luca-sidebar-folder-toggle"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }))}
                  >
                    <Folder className="h-3.5 w-3.5 luca-sidebar-folder-icon" />
                    <strong>{folder.name}</strong>
                  </button>
                )}
                <div className="luca-sidebar-folder-actions">
                  <FolderMenu
                    open={menuFolderId === folder.id}
                    busy={busy}
                    onToggle={() => setMenuFolderId((prev) => (prev === folder.id ? null : folder.id))}
                    onClose={() => setMenuFolderId(null)}
                    onRename={() => startRename(folder.id, folder.name)}
                    onRemove={() => {
                      setMenuFolderId(null);
                      void deleteFolder(folder.id);
                    }}
                  />
                  <button
                    type="button"
                    className="luca-sidebar-mini-btn"
                    title="Nova sessão neste projeto"
                    disabled={busy}
                    onClick={() => void handleCreate(folder.id)}
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                children.length === 0
                  ? (
                    <div className="luca-sidebar-empty-block compact" data-sidebar-sessions-empty="folder">
                      <p>Este projeto ainda não tem sessões.</p>
                      <button type="button" disabled={busy} onClick={() => void handleCreate(folder.id)}>
                        Nova sessão aqui
                      </button>
                    </div>
                  )
                  : children.map((session) => (
                    <SessionItem
                      key={session.id}
                      title={session.title}
                      preview={session.preview}
                      messageCount={session.messageCount}
                      active={session.id === activeSessionId}
                      busy={busy}
                      onActivate={() => void handleActivate(session.id)}
                      onDelete={() => {
                        void deleteSession(session.id);
                      }}
                    />
                  ))
              )}
            </section>
          );
        })}

        <section className="luca-sidebar-folder">
          <div className="luca-sidebar-folder-head">
            <div className="luca-sidebar-folder-toggle static">
              <strong className="luca-sidebar-root-label">Recentes</strong>
            </div>
            <div className="luca-sidebar-folder-actions">
              <button
                type="button"
                className="luca-sidebar-mini-btn"
                title="Nova sessão"
                disabled={busy}
                onClick={() => void handleCreate(null)}
              >
                <SquarePen className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {sessions.length > 0 && rootSessions.length === 0 ? (
            <div className="luca-sidebar-empty-block compact" data-sidebar-sessions-empty="recent">
              <p>{searching ? 'Nada recente com essa busca.' : 'Nenhum chat fora de projeto.'}</p>
              {searching ? (
                <button type="button" onClick={() => setQuery('')}>Limpar busca</button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void handleCreate(null)}>Nova sessão recente</button>
              )}
            </div>
          ) : rootSessions.length === 0 && sessions.length === 0 ? null : rootSessions.map((session) => (
            <SessionItem
              key={session.id}
              title={session.title}
              preview={session.preview}
              messageCount={session.messageCount}
              active={session.id === activeSessionId}
              busy={busy}
              onActivate={() => void handleActivate(session.id)}
              onDelete={() => {
                void deleteSession(session.id);
              }}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function FolderMenu({
  open,
  busy,
  onToggle,
  onClose,
  onRename,
  onRemove,
}: {
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onClose: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setCoords(null);
      return undefined;
    }
    const place = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const menuWidth = 176;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      setCoords({ top: rect.bottom + 6, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div className="luca-sidebar-folder-menu">
      <button
        ref={buttonRef}
        type="button"
        className="luca-sidebar-mini-btn"
        title="Mais opções"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          className="luca-sidebar-folder-dropdown"
          role="menu"
          style={{ top: coords.top, left: coords.left }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onRename();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar projeto
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remover
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function SessionItem({
  title,
  preview,
  messageCount,
  active,
  busy,
  onActivate,
  onDelete,
}: {
  title?: string;
  preview?: string;
  messageCount?: number;
  active: boolean;
  busy: boolean;
  onActivate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`luca-sidebar-session ${active ? 'active' : ''}`}>
      <button type="button" className="luca-sidebar-session-main" disabled={busy} onClick={onActivate}>
        <span className="min-w-0 flex-1 text-left">
          <strong className="block truncate">{title || 'Sem título'}</strong>
          <small className="block truncate">
            {messageCount ? `${messageCount} msg` : 'vazia'}
            {preview ? ` · ${preview}` : ''}
          </small>
        </span>
      </button>
      <div className="luca-sidebar-session-tools">
        <button
          type="button"
          className="luca-sidebar-mini-btn danger"
          disabled={busy}
          onClick={onDelete}
          title="Apagar sessão"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
