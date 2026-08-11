import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Eye,
  Gauge,
  Loader2,
  LogIn,
  MousePointerClick,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
  UsersRound,
  Workflow,
  AlertTriangle,
} from 'lucide-react';
import type { AuthUser } from '@/hooks/useAuth';
import { useAuth } from '@/hooks/useAuth';
import AdminChatViewer from '@/components/AdminChatViewer';
import type {
  LucaAiChatFolder as ChatFolder,
  LucaAiChatLibraryStats,
  LucaAiChatSessionSummary as ChatSessionSummary,
} from '@/lib/types';

interface Overview {
  totalUsers: number;
  admins: number;
  activeToday: number;
  activeHour?: number;
  activeSessions: number;
  usersWithRuns?: number;
  usersWithActions?: number;
  usersWithoutRuns?: number;
  totalLogins: number;
  totalRequests: number;
  totalActions: number;
  totalRuns: number;
  totalErrors?: number;
  totalWebsockets?: number;
  workspaces?: number;
  allowlistedAdmins?: string[];
  generatedAt: string;
}

interface TrackedUser extends AuthUser {
  sessionCount: number;
}

interface AdminReport {
  overview: Overview;
  funnel: {
    registered: number;
    activeToday: number;
    withActions: number;
    withRuns: number;
    withoutRuns: number;
    activationRate: number;
    activeRate: number;
  };
  rankings: {
    byRuns: Array<TrackedUser & { rank: number }>;
    byActions: Array<TrackedUser & { rank: number }>;
    byRequests: Array<TrackedUser & { rank: number }>;
    byActivity: Array<TrackedUser & { rank: number }>;
  };
  generatedAt: string;
}

interface ChatTranscriptEntry {
  id?: string;
  role?: string;
  name?: string;
  slug?: string;
  stage?: string;
  content?: string;
  status?: string;
  timestamp?: string;
  model?: string;
}

interface ChatSessionDetail extends ChatSessionSummary {
  missionDraft?: string;
  transcript?: ChatTranscriptEntry[];
  finalResult?: ChatTranscriptEntry | null;
  workflowAssignments?: Record<string, string[]>;
  individualAssignments?: { participants?: string[]; judge?: string | null };
}

interface UserChatLibrary {
  ok: boolean;
  mode?: string;
  account: { id: string; name: string; email: string; role?: string; lastSeenAt?: string };
  folders: ChatFolder[];
  sessions: ChatSessionSummary[];
  activeSessionId?: string | null;
  stats?: LucaAiChatLibraryStats;
}

function formatDate(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatRelative(value?: string) {
  const ts = Date.parse(value || '');
  if (!ts) return '—';
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return `há ${Math.max(1, Math.round(diff / 1000))}s`;
  if (diff < 3_600_000) return `há ${Math.round(diff / 60_000)} min`;
  if (diff < 172_800_000) return `há ${Math.round(diff / 3_600_000)}h`;
  return formatDate(value || '');
}

async function adminRequest(path: string) {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Não foi possível carregar o painel.');
  return response.json();
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <article>
      <Icon />
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function RankList({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: Array<TrackedUser & { rank: number }>;
  metric: (user: TrackedUser) => string;
}) {
  return (
    <div className="admin-rank-card" data-admin-rank>
      <header>
        <h3>{title}</h3>
        <span>{rows.length} top</span>
      </header>
      {rows.length === 0 ? (
        <p className="admin-rank-empty">Sem dados ainda.</p>
      ) : (
        <ol>
          {rows.map((user) => (
            <li key={`${title}-${user.id}`}>
              <span className="admin-rank-pos">{user.rank}</span>
              <span className="admin-rank-user">
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </span>
              <span className="admin-rank-metric">{metric(user)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user, impersonateUser } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [report, setReport] = useState<AdminReport | null>(null);
  const [users, setUsers] = useState<TrackedUser[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('activity_desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inspectUser, setInspectUser] = useState<TrackedUser | null>(null);
  const [chatLibrary, setChatLibrary] = useState<UserChatLibrary | null>(null);
  const [chatSession, setChatSession] = useState<ChatSessionDetail | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const [enterBusyId, setEnterBusyId] = useState<string | null>(null);
  const [enterError, setEnterError] = useState('');

  const load = useCallback(async (query = search, nextSort = sort) => {
    setLoading(true);
    setError('');
    try {
      const [overviewPayload, usersPayload, reportPayload] = await Promise.all([
        adminRequest('/api/admin/overview'),
        adminRequest(`/api/admin/users?search=${encodeURIComponent(query)}&sort=${encodeURIComponent(nextSort)}`),
        adminRequest('/api/admin/report?limit=8'),
      ]);
      setOverview(overviewPayload.overview);
      setUsers(usersPayload.users);
      setReport(reportPayload.report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o painel.');
    } finally {
      setLoading(false);
    }
  }, [search, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const funnel = report?.funnel;
  const generatedLabel = useMemo(() => {
    const stamp = report?.generatedAt || overview?.generatedAt;
    return stamp ? formatDate(stamp) : '—';
  }, [overview?.generatedAt, report?.generatedAt]);

  async function openUserChats(account: TrackedUser) {
    setInspectUser(account);
    setChatLibrary(null);
    setChatSession(null);
    setChatError('');
    setChatBusy(true);
    try {
      const payload = await adminRequest(`/api/admin/users/${encodeURIComponent(account.id)}/chat/library`) as UserChatLibrary;
      setChatLibrary(payload);
      const preferredId = payload.activeSessionId || payload.sessions?.[0]?.id;
      if (preferredId) {
        const sessionPayload = await adminRequest(
          `/api/admin/users/${encodeURIComponent(account.id)}/chat/sessions/${encodeURIComponent(preferredId)}`,
        ) as { session: ChatSessionDetail };
        setChatSession(sessionPayload.session);
      }
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : 'Falha ao carregar chats da conta.');
    } finally {
      setChatBusy(false);
    }
  }

  async function openChatSession(sessionId: string) {
    if (!inspectUser || !sessionId || chatBusy) return;
    setChatBusy(true);
    setChatError('');
    try {
      const sessionPayload = await adminRequest(
        `/api/admin/users/${encodeURIComponent(inspectUser.id)}/chat/sessions/${encodeURIComponent(sessionId)}`,
      ) as { session: ChatSessionDetail };
      setChatSession(sessionPayload.session);
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : 'Falha ao abrir a sessão.');
    } finally {
      setChatBusy(false);
    }
  }

  function closeChatInspect() {
    setInspectUser(null);
    setChatLibrary(null);
    setChatSession(null);
    setChatError('');
  }

  // Overlay de inspeção: portal no body + trava scroll + Esc.
  useEffect(() => {
    if (!inspectUser || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChatInspect();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [inspectUser]);

  async function enterAsUser(account: TrackedUser) {
    if (!account?.id || account.id === user?.id || enterBusyId) return;
    setEnterBusyId(account.id);
    setEnterError('');
    try {
      await impersonateUser(account.id);
    } catch (cause) {
      setEnterError(cause instanceof Error ? cause.message : 'Falha ao entrar na conta.');
      setEnterBusyId(null);
    }
  }

  return (
    <div className="admin-page luca-page-shell" data-admin-console>
      <header className="admin-heading">
        <div>
          <span>ADMINISTRAÇÃO</span>
          <h1>Console de operações</h1>
          <p>
            Relatórios de contas, ativação e uso do LUCA — no estilo do painel Sharingan.
            {user?.email ? ` Operando como ${user.email}.` : ''}
          </p>
        </div>
        <div className="admin-heading-actions">
          <span className="admin-updated">Atualizado {generatedLabel}</span>
          <button type="button" onClick={() => void load(search, sort)} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="admin-metrics" aria-label="Indicadores">
        <MetricCard icon={UsersRound} label="Contas cadastradas" value={overview?.totalUsers ?? '—'} />
        <MetricCard icon={Activity} label="Ativos 24h" value={overview?.activeToday ?? '—'} hint={overview?.activeHour != null ? `${overview.activeHour} na última hora` : undefined} />
        <MetricCard icon={ShieldCheck} label="Sessões ativas" value={overview?.activeSessions ?? '—'} />
        <MetricCard icon={Workflow} label="Workspaces" value={overview?.workspaces ?? '—'} />
        <MetricCard icon={Play} label="Execuções" value={overview?.totalRuns ?? '—'} />
        <MetricCard icon={MousePointerClick} label="Ações" value={overview?.totalActions ?? '—'} />
        <MetricCard icon={Gauge} label="Solicitações" value={overview?.totalRequests ?? '—'} hint="uso de produto (sem polling)" />
        <MetricCard icon={AlertTriangle} label="Erros" value={overview?.totalErrors ?? '—'} />
      </section>

      <section className="admin-section" data-admin-product>
        <div className="admin-section-header">
          <div>
            <h2>Visão de produto</h2>
            <p>Funil de ativação por conta autenticada: cadastrou → ficou ativo → rodou missão/persona.</p>
          </div>
        </div>
        <div className="admin-funnel" aria-label="Funil de ativação">
          <article>
            <span>Cadastradas</span>
            <strong>{funnel?.registered ?? overview?.totalUsers ?? '—'}</strong>
          </article>
          <article>
            <span>Ativas 24h</span>
            <strong>{funnel?.activeToday ?? overview?.activeToday ?? '—'}</strong>
            <small>{funnel ? `${funnel.activeRate}%` : ''}</small>
          </article>
          <article>
            <span>Com ações</span>
            <strong>{funnel?.withActions ?? overview?.usersWithActions ?? '—'}</strong>
          </article>
          <article>
            <span>Com execuções</span>
            <strong>{funnel?.withRuns ?? overview?.usersWithRuns ?? '—'}</strong>
            <small>{funnel ? `${funnel.activationRate}% ativação` : ''}</small>
          </article>
          <article>
            <span>Sem execuções</span>
            <strong>{funnel?.withoutRuns ?? overview?.usersWithoutRuns ?? '—'}</strong>
          </article>
        </div>
      </section>

      <section className="admin-section" data-admin-rankings>
        <div className="admin-section-header">
          <div>
            <h2>Ranking de uso</h2>
            <p>Contas que mais operam a bancada — execuções, ações e presença.</p>
          </div>
          <Trophy className="admin-section-icon" />
        </div>
        <div className="admin-rank-grid">
          <RankList title="Por execuções" rows={report?.rankings.byRuns || []} metric={(u) => `${u.runCount || 0} runs`} />
          <RankList title="Por ações" rows={report?.rankings.byActions || []} metric={(u) => `${u.actionCount || 0} ações`} />
          <RankList title="Por solicitações" rows={report?.rankings.byRequests || []} metric={(u) => `${u.requestCount || 0} req`} />
          <RankList title="Por atividade" rows={report?.rankings.byActivity || []} metric={(u) => formatRelative(u.lastSeenAt)} />
        </div>
      </section>

      <section className="admin-users-panel" data-admin-users>
        <div className="admin-users-toolbar">
          <div>
            <h2>Contas registradas</h2>
            <span>{users.length} resultado(s)</span>
          </div>
          <div className="admin-users-filters">
            <label className="admin-sort">
              <span>Ordenar</span>
              <select
                value={sort}
                onChange={(event) => {
                  const next = event.target.value;
                  setSort(next);
                  void load(search, next);
                }}
              >
                <option value="activity_desc">Atividade recente</option>
                <option value="runs_desc">Mais execuções</option>
                <option value="requests_desc">Mais solicitações</option>
                <option value="logins_desc">Mais logins</option>
                <option value="created_desc">Cadastro recente</option>
              </select>
            </label>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void load(search, sort);
              }}
            >
              <Search />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome ou e-mail"
              />
              <button type="submit">Buscar</button>
            </form>
          </div>
        </div>

        {error ? (
          <div className="admin-state error" data-admin-error data-tone="error" role="alert">
            <p className="admin-error-title">Falha ao carregar o painel</p>
            <p className="admin-error-detail">{error}</p>
            <p className="admin-error-hint">Não foi possível buscar overview, relatório e contas. Tente de novo.</p>
            <div className="admin-error-actions">
              <button
                type="button"
                className="btn-primary"
                data-admin-retry
                onClick={() => void load(search)}
                disabled={loading}
              >
                {loading ? 'Recarregando…' : 'Tentar novamente'}
              </button>
            </div>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Papel</th>
                  <th>Cadastro</th>
                  <th>Última atividade</th>
                  <th>Logins</th>
                  <th>Solicitações</th>
                  <th>Ações</th>
                  <th>Execuções</th>
                  <th>Erros</th>
                  <th title="Sessões de login ativas (cookie)">Sessões login</th>
                  <th>Chats</th>
                  <th>Suporte</th>
                </tr>
              </thead>
              <tbody>
                {users.map((account) => {
                  const isSelf = account.id === user?.id;
                  const entering = enterBusyId === account.id;
                  return (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.name}</strong>
                      <span>{account.email}</span>
                    </td>
                    <td>
                      <em data-role={account.role}>{account.role === 'admin' ? 'Admin' : 'Usuário'}</em>
                    </td>
                    <td>{formatDate(account.createdAt)}</td>
                    <td title={formatDate(account.lastSeenAt)}>{formatRelative(account.lastSeenAt)}</td>
                    <td>{account.loginCount}</td>
                    <td>{account.requestCount}</td>
                    <td>{account.actionCount}</td>
                    <td>{account.runCount}</td>
                    <td>{account.errorCount}</td>
                    <td>{account.sessionCount}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-inspect-btn"
                        data-admin-chat-inspect
                        onClick={() => void openUserChats(account)}
                      >
                        <Eye />
                        Ver chats
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-inspect-btn admin-enter-btn"
                        data-admin-impersonate
                        data-admin-impersonate-user={account.id}
                        disabled={isSelf || Boolean(enterBusyId)}
                        title={isSelf ? 'Você já está nesta conta' : `Entrar como ${account.name} (suporte)`}
                        onClick={() => void enterAsUser(account)}
                      >
                        {entering ? <Loader2 className="animate-spin" /> : <LogIn />}
                        {entering ? 'Entrando…' : 'Entrar'}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {enterError ? (
              <div className="admin-state error" data-admin-impersonate-error role="alert" style={{ margin: '12px 16px 16px' }}>
                <p className="admin-error-title">Não foi possível entrar na conta</p>
                <p className="admin-error-detail">{enterError}</p>
              </div>
            ) : null}
            {!loading && users.length === 0 && (
              <div className="admin-state" data-admin-empty data-tone="empty">
                <p className="admin-empty-title">Nenhuma conta encontrada</p>
                <p className="admin-empty-hint">
                  {search.trim()
                    ? 'Nenhuma conta corresponde à busca atual. Limpe o filtro ou tente de novo.'
                    : 'Ainda não há contas cadastradas ou a lista não retornou resultados.'}
                </p>
                <div className="admin-empty-actions">
                  {search.trim() ? (
                    <button
                      type="button"
                      className="btn-primary"
                      data-admin-empty-clear
                      onClick={() => {
                        setSearch('');
                        void load('');
                      }}
                      disabled={loading}
                    >
                      Limpar busca
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      data-admin-empty-retry
                      onClick={() => void load(search)}
                      disabled={loading}
                    >
                      Atualizar lista
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {inspectUser && typeof document !== 'undefined'
        ? createPortal(
          <AdminChatViewer
            account={inspectUser}
            library={chatLibrary}
            session={chatSession}
            busy={chatBusy}
            error={chatError}
            canEnterAsUser={inspectUser.id !== user?.id}
            enterBusy={enterBusyId === inspectUser.id}
            onClose={closeChatInspect}
            onOpenSession={(sessionId) => void openChatSession(sessionId)}
            onEnterAsUser={() => void enterAsUser(inspectUser)}
          />,
          document.body,
        )
        : null}
    </div>
  );
}
