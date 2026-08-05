import { useMemo, useState } from 'react';
import {
  FolderPlus,
  Loader2,
  MessageSquarePlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { LucaAiChatFolder, LucaAiChatSessionSummary } from '@/lib/types';
import { useTheme } from '@/hooks/useTheme';

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
  onDeleteFolder,
  onMoveSession,
}: ChatSessionsPanelProps) {
  const theme = useTheme();
  const [folderName, setFolderName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
            return (
              <section key={folder.id} className="luca-ai-sessions-group">
                <div className="luca-ai-sessions-group-head">
                  <strong>{folder.name}</strong>
                  <div className="luca-ai-sessions-group-actions">
                    <button
                      type="button"
                      className="luca-ai-sessions-icon-btn"
                      title="Nova sessão nesta pasta"
                      disabled={busy}
                      onClick={() => onCreateSession(folder.id)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="luca-ai-sessions-icon-btn danger"
                      title="Apagar pasta"
                      disabled={busy}
                      onClick={() => onDeleteFolder(folder.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
                      confirmDelete={confirmDeleteId === session.id}
                      onConfirmDelete={() => setConfirmDeleteId(session.id)}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                      onActivate={() => onActivateSession(session.id)}
                      onDelete={() => {
                        onDeleteSession(session.id);
                        setConfirmDeleteId(null);
                      }}
                      onMove={(folderId) => onMoveSession(session.id, folderId)}
                    />
                  ))
                )}
              </section>
            );
          })}

          <section className="luca-ai-sessions-group">
            <div className="luca-ai-sessions-group-head">
              <strong style={{ color: theme.textSoft }}>Sem pasta</strong>
            </div>
            {rootSessions.length === 0 ? (
              <p className="luca-ai-sessions-empty">Nenhuma sessão solta</p>
            ) : (
              rootSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  busy={busy}
                  folders={folders}
                  confirmDelete={confirmDeleteId === session.id}
                  onConfirmDelete={() => setConfirmDeleteId(session.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onActivate={() => onActivateSession(session.id)}
                  onDelete={() => {
                    onDeleteSession(session.id);
                    setConfirmDeleteId(null);
                  }}
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

function SessionRow({
  session,
  active,
  busy,
  folders,
  confirmDelete,
  onConfirmDelete,
  onCancelDelete,
  onActivate,
  onDelete,
  onMove,
}: {
  session: LucaAiChatSessionSummary;
  active: boolean;
  busy: boolean;
  folders: LucaAiChatFolder[];
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onActivate: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
}) {
  return (
    <div className={`luca-ai-session-row ${active ? 'active' : ''}`}>
      <button type="button" className="luca-ai-session-main" disabled={busy} onClick={onActivate}>
        <span className="luca-ai-session-dot" aria-hidden />
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
            <option value="">Sem pasta</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        )}
        {confirmDelete ? (
          <>
            <button type="button" className="luca-ai-sessions-icon-btn danger" disabled={busy} onClick={onDelete} title="Confirmar exclusão">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="luca-ai-sessions-icon-btn" disabled={busy} onClick={onCancelDelete} title="Cancelar">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button type="button" className="luca-ai-sessions-icon-btn danger" disabled={busy} onClick={onConfirmDelete} title="Apagar sessão">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
