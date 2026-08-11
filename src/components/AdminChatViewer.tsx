/**
 * Inspeção admin de chat: layout da bancada LUCA-AI (somente leitura),
 * não um drawer lateral de transcript cru.
 */
import {
  AlertCircle,
  ArrowLeft,
  GitBranch,
  Loader2,
  LogIn,
  MessageSquareText,
  UserRound,
  X,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import type {
  LucaAiChatFolder as ChatFolder,
  LucaAiChatLibraryStats,
  LucaAiChatSessionSummary as ChatSessionSummary,
} from '@/lib/types';

export interface AdminChatTranscriptEntry {
  id?: string;
  role?: string;
  name?: string;
  slug?: string;
  stage?: string;
  phase?: string;
  content?: string;
  status?: string;
  timestamp?: string;
  model?: string;
}

export interface AdminChatSessionDetail extends ChatSessionSummary {
  missionDraft?: string;
  transcript?: AdminChatTranscriptEntry[];
  finalResult?: AdminChatTranscriptEntry | null;
}

export interface AdminChatLibrary {
  folders: ChatFolder[];
  sessions: ChatSessionSummary[];
  stats?: LucaAiChatLibraryStats;
}

interface AdminChatViewerProps {
  account: { id: string; name: string; email: string };
  library: AdminChatLibrary | null;
  session: AdminChatSessionDetail | null;
  busy?: boolean;
  error?: string;
  canEnterAsUser?: boolean;
  enterBusy?: boolean;
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
  onEnterAsUser?: () => void;
}

function formatRelative(value?: string) {
  const ts = Date.parse(value || '');
  if (!ts) return '—';
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return `há ${Math.max(1, Math.round(diff / 1000))}s`;
  if (diff < 3_600_000) return `há ${Math.round(diff / 60_000)} min`;
  if (diff < 172_800_000) return `há ${Math.round(diff / 3_600_000)}h`;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts));
}

function formatClock(value?: string) {
  const ts = Date.parse(value || '');
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function lastOperatorContent(transcript: AdminChatTranscriptEntry[], missionDraft?: string) {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.role === 'operator' && String(entry.content || '').trim()) {
      return String(entry.content).trim();
    }
  }
  return String(missionDraft || '').trim();
}

/** Corpo legível: headings, listas, negrito básico — espelha a bancada sem o parser completo. */
function ReadBody({ content, compact = false }: { content: string; compact?: boolean }) {
  const theme = useTheme();
  const text = String(content || '').trim() || '—';
  const lines = text.replace(/\r/g, '').split('\n');

  return (
    <div
      className={`luca-ai-prose luca-wrap luca-ai-selectable ${compact ? 'text-[13px]' : ''}`}
      style={{ color: theme.textSoft }}
    >
      {lines.map((raw, index) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={index} className="h-2" />;

        const heading = line.match(/^(#{1,4})\s+(.+)$/);
        if (heading) {
          return (
            <h4
              key={index}
              className="text-[14.5px] font-semibold tracking-[-0.015em] leading-snug"
              style={{ color: theme.text }}
            >
              <InlineBold text={heading[2]} />
            </h4>
          );
        }

        const bullet = line.match(/^(?:[-*]|•|\d+[.)])\s+(.+)$/);
        if (bullet) {
          return (
            <div key={index} className="luca-ai-bullet">
              <span className="luca-ai-bullet-dot" style={{ background: theme.textMute }} />
              <span className="min-w-0 flex-1"><InlineBold text={bullet[1]} /></span>
            </div>
          );
        }

        return (
          <p key={index} className="luca-wrap">
            <InlineBold text={line} />
          </p>
        );
      })}
    </div>
  );
}

function InlineBold({ text }: { text: string }) {
  const theme = useTheme();
  const parts: Array<{ text: string; strong: boolean }> = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), strong: false });
    parts.push({ text: match[1], strong: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), strong: false });
  if (!parts.length) parts.push({ text, strong: false });

  return (
    <>
      {parts.map((part, i) => (
        part.strong
          ? <strong key={i} style={{ color: theme.text }}>{part.text}</strong>
          : <span key={i}>{part.text}</span>
      ))}
    </>
  );
}

function MessageEntry({ entry }: { entry: AdminChatTranscriptEntry }) {
  const theme = useTheme();
  const role = String(entry.role || 'system');
  const isOperator = role === 'operator';
  const isError = entry.status === 'error';
  const tone = isError ? theme.error : theme.text;

  if (isOperator) {
    return (
      <div className="luca-ai-message luca-ai-message-operator group flex justify-end">
        <div className="relative min-w-0 max-w-[min(100%,34rem)]">
          <article
            className="luca-ai-operator-bubble luca-ai-selectable min-w-0 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.06)', color: theme.text, border: '1px solid rgba(255,255,255,0.08)' }}
            data-role="operator"
          >
            <ReadBody content={String(entry.content || '')} compact />
          </article>
        </div>
      </div>
    );
  }

  const Icon = isError ? AlertCircle : MessageSquareText;
  const iconBg = isError ? theme.errorBg : theme.goldSoft;
  const iconColor = isError ? theme.error : theme.goldDeep;

  return (
    <article className="luca-ai-message group" data-role={role}>
      <div className="luca-ai-message-meta">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
          style={{ background: iconBg, borderColor: 'rgba(255,255,255,0.08)', color: iconColor }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 text-[13px] font-semibold luca-wrap" style={{ color: tone }}>
          {entry.name || role || 'mensagem'}
        </span>
        {entry.stage ? (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: theme.textMute }}>
            <GitBranch className="h-3 w-3 shrink-0 opacity-70" />
            <span className="truncate">{entry.stage}</span>
          </span>
        ) : null}
        {entry.phase ? (
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ background: theme.goldSoft, borderColor: theme.border, color: theme.goldDeep }}
          >
            {entry.phase}
          </span>
        ) : null}
        {entry.model ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', color: theme.textGhost }}>
            {entry.model}
          </span>
        ) : null}
        {entry.timestamp ? (
          <time className="ml-auto shrink-0 text-[10px] font-mono" style={{ color: theme.textGhost }}>
            {formatClock(entry.timestamp)}
          </time>
        ) : null}
      </div>
      <div className="luca-ai-message-body luca-ai-selectable">
        <ReadBody content={String(entry.content || '')} />
      </div>
    </article>
  );
}

function SessionButton({
  session,
  active,
  onOpen,
}: {
  session: ChatSessionSummary;
  active: boolean;
  onOpen: () => void;
}) {
  const archived = Boolean(session.deleted || session.archivedOnly);
  return (
    <button
      type="button"
      className={`admin-chat-session ${active ? 'active' : ''} ${archived ? 'is-deleted' : ''}`}
      onClick={onOpen}
    >
      <span>
        {session.title || 'Sem título'}
        {archived ? ` · ${session.archiveReason === 'transcript_clear' ? 'antes da limpeza' : 'apagada'}` : ''}
      </span>
      <small>
        {session.messageCount || 0} msg · {session.operationMode || 'team'}
        {session.deleted ? ' · soft-delete' : ''}
        {session.archivedOnly ? ' · arquivo' : ''}
      </small>
    </button>
  );
}

export default function AdminChatViewer({
  account,
  library,
  session,
  busy = false,
  error = '',
  canEnterAsUser = false,
  enterBusy = false,
  onClose,
  onOpenSession,
  onEnterAsUser,
}: AdminChatViewerProps) {
  const theme = useTheme();
  const transcript = Array.isArray(session?.transcript) ? session!.transcript! : [];
  const finalResult = session?.finalResult || null;
  const originalMission = session
    ? lastOperatorContent(transcript, session.missionDraft)
    : '';
  const hasDraftOnly = Boolean(String(session?.missionDraft || '').trim())
    && !transcript.some((e) => e.role === 'operator' && String(e.content || '').trim());
  const supporting = finalResult
    ? transcript.filter((entry) => !(
      entry.slug === finalResult.slug
      && entry.stage === finalResult.stage
      && String(entry.content || '').trim() === String(finalResult.content || '').trim()
    ))
    : transcript;

  const modeLabel = session?.operationMode === 'individual' ? 'Modo individual' : 'Modo equipe';
  const headerStatus = finalResult
    ? (session?.operationMode === 'individual' ? 'veredito do juiz no arquivo' : 'exibição final no arquivo')
    : supporting.length
      ? 'rodada registrada'
      : originalMission
        ? 'missão salva, sem respostas'
        : 'sessão vazia';

  return (
    <div
      className="admin-chat-layer"
      data-admin-chat-inspect-layer
      role="dialog"
      aria-modal="true"
      aria-label={`Chat de ${account.name} — visão da bancada`}
    >
      <div className="admin-chat-shell">
        {/* Top bar — conta + somente leitura */}
        <header className="admin-chat-topbar">
          <div className="admin-chat-topbar-left">
            <button type="button" className="admin-chat-back" onClick={onClose}>
              <ArrowLeft />
              Admin
            </button>
            <div className="admin-chat-topbar-user">
              <span>VISÃO SOMENTE LEITURA · inclui apagadas</span>
              <h2>{account.name}</h2>
              <p>{account.email}</p>
            </div>
          </div>
          <div className="admin-chat-topbar-actions">
            {library?.stats ? (
              <div className="admin-chat-top-stats" aria-label="Resumo da biblioteca">
                <em>{library.stats.sessionCount ?? 0} sessões</em>
                <em>{library.stats.messageCount ?? 0} msgs</em>
                <em>
                  {(library.stats.deletedSessionCount || 0) + (library.stats.archivedOnlyCount || 0)} arquivo
                </em>
              </div>
            ) : null}
            {canEnterAsUser && onEnterAsUser ? (
              <button
                type="button"
                className="admin-inspect-btn admin-enter-btn"
                data-admin-impersonate
                data-admin-impersonate-user={account.id}
                disabled={enterBusy}
                onClick={onEnterAsUser}
              >
                {enterBusy ? <Loader2 className="animate-spin" /> : <LogIn />}
                {enterBusy ? 'Entrando…' : 'Entrar como usuário'}
              </button>
            ) : null}
            <button type="button" className="admin-chat-close" onClick={onClose} aria-label="Fechar">
              <X />
            </button>
          </div>
        </header>

        {error ? (
          <div className="admin-state error" role="alert" style={{ margin: 24 }}>
            <p className="admin-error-title">Não foi possível inspecionar</p>
            <p className="admin-error-detail">{error}</p>
          </div>
        ) : (
          <div className="admin-chat-workspace luca-ai-chat-page">
            {/* Rail de sessões — espelho da sidebar da bancada */}
            <aside className="admin-chat-rail" aria-label="Sessões do usuário">
              <div className="admin-chat-rail-head">
                <MessageSquareText />
                <h3>Sessões de chat</h3>
                {busy ? <Loader2 className="animate-spin" /> : null}
              </div>
              <div className="admin-chat-rail-scroll">
                {(library?.folders || []).map((folder) => {
                  const children = (library?.sessions || []).filter((s) => s.folderId === folder.id);
                  return (
                    <div key={folder.id} className="admin-chat-group">
                      <strong>{folder.name}</strong>
                      {children.length === 0 ? (
                        <p className="admin-chat-empty">Sem sessões nesta pasta</p>
                      ) : children.map((item) => (
                        <SessionButton
                          key={item.id}
                          session={item}
                          active={session?.id === item.id}
                          onOpen={() => onOpenSession(item.id)}
                        />
                      ))}
                    </div>
                  );
                })}
                <div className="admin-chat-group">
                  <strong>Sem pasta</strong>
                  {(library?.sessions || []).filter((s) => !s.folderId).map((item) => (
                    <SessionButton
                      key={item.id}
                      session={item}
                      active={session?.id === item.id}
                      onOpen={() => onOpenSession(item.id)}
                    />
                  ))}
                  {!busy && (library?.sessions || []).length === 0 ? (
                    <p className="admin-chat-empty">Esta conta ainda não tem sessões de chat.</p>
                  ) : null}
                </div>
              </div>
            </aside>

            {/* Coluna principal — mesma estrutura da bancada */}
            <div className="luca-ai-chat-column admin-chat-main" data-admin-chat-main>
              <header className="luca-ai-chat-toolbar admin-chat-toolbar">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold" style={{ color: theme.text }}>
                      {session?.title || (busy ? 'Carregando…' : 'Selecione uma sessão')}
                    </h3>
                    {session ? (
                      <em className="admin-chat-readonly-pill">somente leitura</em>
                    ) : null}
                  </div>
                  {session ? (
                    <p className="mt-0.5 text-[11px]" style={{ color: theme.textMute }}>
                      {modeLabel}
                      {session.updatedAt ? ` · atualizada ${formatRelative(session.updatedAt)}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: theme.textGhost }}>
                  <UserRound className="h-3.5 w-3.5" />
                  <span>como o usuário viu na bancada</span>
                </div>
              </header>

              <main className="luca-ai-chat-stage">
                {!session ? (
                  <div className="admin-chat-empty-stage">
                    <MessageSquareText />
                    <p>Escolha uma sessão na barra à esquerda para ver o chat real.</p>
                  </div>
                ) : (
                  <div className="luca-ai-chat-scroll">
                    <div className="luca-ai-chat-thread" data-admin-chat-thread>
                      <div className="mb-5 flex items-center gap-2 text-[11px]" style={{ color: theme.textGhost }}>
                        <GitBranch className="h-3.5 w-3.5 shrink-0" />
                        <span className="luca-wrap">{headerStatus}</span>
                      </div>

                      {originalMission ? (
                        <div
                          className="luca-ai-mission-pin mb-4 rounded-2xl border px-4 py-3"
                          data-luca-mission-pin
                          data-luca-mission-pin-kind={hasDraftOnly ? 'draft' : 'question'}
                          style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}
                        >
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.textGhost }}>
                            {hasDraftOnly ? 'Missão no compositor' : 'Pergunta original'}
                          </p>
                          <p className="text-[15px] leading-relaxed luca-wrap luca-ai-selectable" style={{ color: theme.text }}>
                            {originalMission}
                          </p>
                        </div>
                      ) : null}

                      {supporting.length === 0 && !finalResult ? (
                        <p className="admin-chat-empty" style={{ textAlign: 'center', padding: '48px 16px' }}>
                          Transcript vazio nesta sessão.
                        </p>
                      ) : (
                        supporting.map((entry, index) => (
                          <MessageEntry key={entry.id || `e-${index}`} entry={entry} />
                        ))
                      )}

                      {finalResult?.content ? (
                        <article
                          className="luca-ai-message mt-2 rounded-2xl border px-4 py-4"
                          data-role="final"
                          style={{
                            borderColor: 'color-mix(in srgb, var(--l-alive, #58d6a0) 35%, transparent)',
                            background: 'rgba(48, 209, 88, 0.06)',
                          }}
                        >
                          <div className="luca-ai-message-meta">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                              style={{ background: theme.aliveSoft, borderColor: 'rgba(255,255,255,0.08)', color: theme.alive }}
                            >
                              <MessageSquareText className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-[13px] font-semibold" style={{ color: theme.text }}>
                              {finalResult.name || 'Resultado final'}
                            </span>
                            <span className="text-[10px]" style={{ color: theme.textMute }}>
                              {finalResult.stage || 'final'}
                            </span>
                          </div>
                          <div className="luca-ai-message-body luca-ai-selectable mt-2">
                            <ReadBody content={String(finalResult.content || '')} />
                          </div>
                        </article>
                      ) : null}
                    </div>
                  </div>
                )}
              </main>

              {/* Composer desativado — só para lembrar a bancada real */}
              <div className="admin-chat-composer-ghost" aria-hidden="true">
                <div>
                  <span>Compositor bloqueado</span>
                  <p>Modo somente leitura — use “Entrar como usuário” para operar a conta.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
