import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Folder,
  FolderPlus,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import type { LucaAiChatFolder, LucaAiChatSessionSummary } from '@/lib/types';

interface ChatSessionsPanelProps {
  open: boolean;
  busy?: boolean;
  folders: LucaAiChatFolder[];
  sessions: LucaAiChatSessionSummary[];
  activeSessionId: string | null;
  onClose: () => void;
  onCreateSession: (folderId?: string | null) => void;
  onActivateSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder?: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveSession: (sessionId: string, folderId: string | null) => void;
}

export default function ChatSessionsPanel({
  open,
  busy = false,
  folders,
  sessions,
  activeSessionId,
  onClose,
  onCreateSession,
  onActivateSession,
  onDeleteSession,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveSession,
}: ChatSessionsPanelProps) {
  const [folderName, setFolderName] = useState('');
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const rootSessions = useMemo(
    () => sessions.filter((session) => !session.folderId),
    [sessions],
  );

  if (!open) return null;

  function submitFolder() {
    const name = folderName.trim();
    if (!name || busy) return;
    onCreateFolder(name);
    setFolderName('');
  }

  function startRename(folderId: string, currentName: string) {
    setMenuFolderId(null);
    setRenamingFolderId(folderId);
    setRenameValue(currentName);
  }

  function commitRename() {
    const id = renamingFolderId;
    const name = renameValue.trim();
    setRenamingFolderId(null);
    if (!id || !name || !onRenameFolder) return;
    onRenameFolder(id, name);
  }

  return (
    <div className="luca-ai-sessions-layer" role="dialog" aria-modal="true" aria-label="Sessões do LUCA-AI">
      <button type="button" className="luca-ai-sessions-backdrop" aria-label="Fechar sessões" onClick={onClose} />
      <aside className="luca-ai-sessions-panel">
        <header className="luca-ai-sessions-header">
          <div>
            <p className="luca-ai-sessions-kicker">Projetos</p>
            <h2>Sessões</h2>
          </div>
          <button type="button" className="luca-ai-sessions-icon-btn" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="luca-ai-sessions-actions">
          <button
            type="button"
            className="luca-ai-sessions-primary"
            disabled={busy}
            onClick={() => onCreateSession(null)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
            Nova sessão
          </button>
        </div>

        <div className="luca-ai-sessions-folder-form">
          <input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitFolder();
              }
            }}
            placeholder="Novo projeto / pasta"
            disabled={busy}
          />
          <button type="button" className="luca-ai-sessions-icon-btn" disabled={busy || !folderName.trim()} onClick={submitFolder} aria-label="Criar pasta">
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>

        <div className="luca-ai-sessions-scroll">
          {folders.map((folder) => {
            const children = sessions.filter((session) => session.folderId === folder.id);
            const isRenaming = renamingFolderId === folder.id;
            return (
              <section key={folder.id} className="luca-ai-sessions-group">
                <div className={`luca-ai-sessions-group-head ${menuFolderId === folder.id ? 'menu-open' : ''}`}>
                  {isRenaming ? (
                    <input
                      className="luca-ai-sessions-folder-rename"
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
                    <strong className="luca-ai-sessions-folder-label">
                      <Folder className="h-3.5 w-3.5" />
                      {folder.name}
                    </strong>
                  )}
                  <div className="luca-ai-sessions-group-actions">
                    <PanelFolderMenu
                      open={menuFolderId === folder.id}
                      busy={busy}
                      canRename={Boolean(onRenameFolder)}
                      onToggle={() => setMenuFolderId((prev) => (prev === folder.id ? null : folder.id))}
                      onClose={() => setMenuFolderId(null)}
                      onRename={() => startRename(folder.id, folder.name)}
                      onRemove={() => {
                        setMenuFolderId(null);
                        onDeleteFolder(folder.id);
                      }}
                    />
                    <button
                      type="button"
                      className="luca-ai-sessions-icon-btn"
                      title="Nova sessão nesta pasta"
                      disabled={busy}
                      onClick={() => onCreateSession(folder.id)}
                    >
                      <SquarePen className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {children.length === 0 ? (
                  <p className="luca-ai-sessions-empty">Sem sessões nesta pasta</p>
                ) : (
                  children.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      active={session.id === activeSessionId}
                      busy={busy}
                      folders={folders}
                      onActivate={() => onActivateSession(session.id)}
                      onDelete={() => onDeleteSession(session.id)}
                      onMove={(folderId) => onMoveSession(session.id, folderId)}
                    />
                  ))
                )}
              </section>
            );
          })}

          <section className="luca-ai-sessions-group">
            <div className="luca-ai-sessions-group-head">
              <strong className="luca-ai-sessions-folder-label mute">Recentes</strong>
              <div className="luca-ai-sessions-group-actions">
                <button
                  type="button"
                  className="luca-ai-sessions-icon-btn"
                  title="Nova sessão"
                  disabled={busy}
                  onClick={() => onCreateSession(null)}
                >
                  <SquarePen className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {rootSessions.length === 0 ? (
              <p className="luca-ai-sessions-empty">Nenhum chat</p>
            ) : (
              rootSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  busy={busy}
                  folders={folders}
                  onActivate={() => onActivateSession(session.id)}
                  onDelete={() => onDeleteSession(session.id)}
                  onMove={(folderId) => onMoveSession(session.id, folderId)}
                />
              ))
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function PanelFolderMenu({
  open,
  busy,
  canRename,
  onToggle,
  onClose,
  onRename,
  onRemove,
}: {
  open: boolean;
  busy: boolean;
  canRename: boolean;
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
    <div className="luca-ai-sessions-folder-menu">
      <button
        ref={buttonRef}
        type="button"
        className="luca-ai-sessions-icon-btn"
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
          className="luca-ai-sessions-folder-dropdown"
          role="menu"
          style={{ top: coords.top, left: coords.left }}
        >
          {canRename && (
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
          )}
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

function SessionRow({
  session,
  active,
  busy,
  folders,
  onActivate,
  onDelete,
  onMove,
}: {
  session: LucaAiChatSessionSummary;
  active: boolean;
  busy: boolean;
  folders: LucaAiChatFolder[];
  onActivate: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
}) {
  return (
    <div className={`luca-ai-session-row ${active ? 'active' : ''}`}>
      <button type="button" className="luca-ai-session-main" disabled={busy} onClick={onActivate}>
        <span className="min-w-0 flex-1 text-left">
          <strong className="block truncate">{session.title || 'Sem título'}</strong>
          <small className="block truncate">
            {session.messageCount ? `${session.messageCount} msg` : 'vazia'}
            {session.preview ? ` · ${session.preview}` : ''}
          </small>
        </span>
      </button>
      <div className="luca-ai-session-tools">
        {folders.length > 0 && (
          <select
            aria-label="Mover sessão"
            disabled={busy}
            value={session.folderId || ''}
            onChange={(event) => onMove(event.target.value || null)}
          >
            <option value="">Recentes</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="luca-ai-sessions-icon-btn danger"
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
