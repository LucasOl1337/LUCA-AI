import { useCallback, useEffect, useState } from 'react';
import { Activity, Gauge, MousePointerClick, Play, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react';
import type { AuthUser } from '@/hooks/useAuth';

interface Overview {
  totalUsers: number;
  admins: number;
  activeToday: number;
  activeSessions: number;
  totalLogins: number;
  totalRequests: number;
  totalActions: number;
  totalRuns: number;
  generatedAt: string;
}

interface TrackedUser extends AuthUser { sessionCount: number }

function formatDate(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

async function adminRequest(path: string) {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Não foi possível carregar o painel.');
  return response.json();
}

export default function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<TrackedUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (query = '') => {
    setLoading(true);
    setError('');
    try {
      const [overviewPayload, usersPayload] = await Promise.all([
        adminRequest('/api/admin/overview'),
        adminRequest(`/api/admin/users?search=${encodeURIComponent(query)}`),
      ]);
      setOverview(overviewPayload.overview);
      setUsers(usersPayload.users);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o painel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="admin-page luca-page-shell">
      <header className="admin-heading">
        <div><span>ADMINISTRAÇÃO</span><h1>Usuários</h1><p>Acompanhe a base cadastrada e a atividade de acesso ao LUCA.</p></div>
        <button type="button" onClick={() => void load(search)} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} />Atualizar</button>
      </header>

      <section className="admin-metrics">
        <article><UsersRound /><span>Usuários cadastrados</span><strong>{overview?.totalUsers ?? '—'}</strong></article>
        <article><Activity /><span>Ativos nas últimas 24h</span><strong>{overview?.activeToday ?? '—'}</strong></article>
        <article><ShieldCheck /><span>Sessões ativas</span><strong>{overview?.activeSessions ?? '—'}</strong></article>
        <article><RefreshCw /><span>Total de logins</span><strong>{overview?.totalLogins ?? '—'}</strong></article>
        <article><Gauge /><span>Solicitações à plataforma</span><strong>{overview?.totalRequests ?? '—'}</strong></article>
        <article><MousePointerClick /><span>Ações realizadas</span><strong>{overview?.totalActions ?? '—'}</strong></article>
        <article><Play /><span>Execuções iniciadas</span><strong>{overview?.totalRuns ?? '—'}</strong></article>
      </section>

      <section className="admin-users-panel">
        <div className="admin-users-toolbar">
          <div><h2>Contas</h2><span>{users.length} resultado(s)</span></div>
          <form onSubmit={(event) => { event.preventDefault(); void load(search); }}><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou e-mail" /><button type="submit">Buscar</button></form>
        </div>
        {error ? (
          <div className="admin-state error" data-admin-error data-tone="error" role="alert">
            <p className="admin-error-title">Falha ao carregar o painel</p>
            <p className="admin-error-detail">{error}</p>
            <p className="admin-error-hint">Não foi possível buscar overview e contas. Tente de novo ou confira se o runtime está no ar.</p>
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
            <table><thead><tr><th>Usuário</th><th>Papel</th><th>Cadastro</th><th>Última atividade</th><th>Logins</th><th>Solicitações</th><th>Ações</th><th>Execuções</th><th>Erros</th><th>Sessões</th></tr></thead>
              <tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><span>{user.email}</span></td><td><em data-role={user.role}>{user.role === 'admin' ? 'Admin' : 'Usuário'}</em></td><td>{formatDate(user.createdAt)}</td><td>{formatDate(user.lastSeenAt)}</td><td>{user.loginCount}</td><td>{user.requestCount}</td><td>{user.actionCount}</td><td>{user.runCount}</td><td>{user.errorCount}</td><td>{user.sessionCount}</td></tr>)}</tbody>
            </table>
            {!loading && users.length === 0 && (
              <div className="admin-state" data-admin-empty data-tone="empty">
                <p className="admin-empty-title">Nenhuma conta encontrada</p>
                <p className="admin-empty-hint">
                  {search.trim()
                    ? "Nenhuma conta corresponde à busca atual. Limpe o filtro ou tente de novo."
                    : "Ainda não há contas cadastradas ou a lista não retornou resultados."}
                </p>
                <div className="admin-empty-actions">
                  {search.trim() ? (
                    <button
                      type="button"
                      className="btn-primary"
                      data-admin-empty-clear
                      onClick={() => {
                        setSearch("");
                        void load("");
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
    </div>
  );
}
