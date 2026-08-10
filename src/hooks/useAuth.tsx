import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: string;
  createdAt: string;
  lastLoginAt: string;
  lastSeenAt: string;
  loginCount: number;
  requestCount: number;
  actionCount: number;
  runCount: number;
  errorCount: number;
  websocketCount: number;
  lastRequestAt: string;
}

export interface ImpersonationState {
  active: boolean;
  actorAdminId: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role?: string;
  } | null;
}

interface AuthContextValue {
  loading: boolean;
  user: AuthUser | null;
  impersonation: ImpersonationState | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  impersonateUser: (userId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const authMessages: Record<string, string> = {
  invalid_email: 'Digite um e-mail válido.',
  invalid_password: 'A senha precisa ter entre 8 e 128 caracteres.',
  email_already_registered: 'Este e-mail já possui uma conta.',
  invalid_credentials: 'E-mail ou senha incorretos.',
  account_disabled: 'Esta conta está desativada.',
  rate_limit_exceeded: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
  admin_required: 'Somente administradores podem entrar em contas.',
  user_not_found: 'Conta não encontrada.',
  cannot_impersonate_self: 'Você já está nesta conta.',
  not_impersonating: 'Nenhuma sessão de suporte ativa.',
  authentication_required: 'Faça login novamente.',
};

async function authRequest(path: string, body?: object) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload?.error || 'auth_failed');
    throw new Error(authMessages[code] || 'Não foi possível concluir a autenticação.');
  }
  return payload;
}

function normalizeImpersonation(raw: unknown): ImpersonationState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!value.active) return null;
  const actorRaw = value.actor && typeof value.actor === 'object' ? value.actor as Record<string, unknown> : null;
  return {
    active: true,
    actorAdminId: String(value.actorAdminId || ''),
    actor: actorRaw
      ? {
        id: String(actorRaw.id || ''),
        name: String(actorRaw.name || ''),
        email: String(actorRaw.email || ''),
        role: actorRaw.role ? String(actorRaw.role) : undefined,
      }
      : null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const payload = await authRequest('/api/auth/session');
      setUser(payload.user ?? null);
      setImpersonation(normalizeImpersonation(payload.impersonation));
    } catch {
      setUser(null);
      setImpersonation(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
    const onFocus = () => void refreshSession();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    user,
    impersonation,
    async login(email, password) {
      const payload = await authRequest('/api/auth/login', { email, password });
      setUser(payload.user);
      setImpersonation(null);
    },
    async register(name, email, password) {
      const payload = await authRequest('/api/auth/register', { name, email, password });
      setUser(payload.user);
      setImpersonation(null);
    },
    async logout() {
      await authRequest('/api/auth/logout', {});
      setUser(null);
      setImpersonation(null);
    },
    async impersonateUser(userId: string) {
      const payload = await authRequest(`/api/admin/users/${encodeURIComponent(userId)}/impersonate`, {});
      setUser(payload.user ?? null);
      setImpersonation(normalizeImpersonation(payload.impersonation));
      // Limpa UI da conta admin e abre a bancada na conta do usuário.
      try {
        window.localStorage.setItem('luca.activePage', JSON.stringify('luca-ai'));
      } catch {
        // best-effort
      }
      window.location.assign('/');
    },
    async stopImpersonation() {
      const payload = await authRequest('/api/auth/stop-impersonation', {});
      setUser(payload.user ?? null);
      setImpersonation(null);
      try {
        window.localStorage.setItem('luca.activePage', JSON.stringify('admin'));
      } catch {
        // best-effort
      }
      window.location.assign('/');
    },
    refreshSession,
  }), [impersonation, loading, refreshSession, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return value;
}
