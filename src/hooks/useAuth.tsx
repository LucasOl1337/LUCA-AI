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
}

interface AuthContextValue {
  loading: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const authMessages: Record<string, string> = {
  invalid_email: 'Digite um e-mail válido.',
  invalid_password: 'A senha precisa ter entre 8 e 128 caracteres.',
  email_already_registered: 'Este e-mail já possui uma conta.',
  invalid_credentials: 'E-mail ou senha incorretos.',
  account_disabled: 'Esta conta está desativada.',
  rate_limit_exceeded: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const payload = await authRequest('/api/auth/session');
      setUser(payload.user ?? null);
    } catch {
      setUser(null);
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
    async login(email, password) {
      const payload = await authRequest('/api/auth/login', { email, password });
      setUser(payload.user);
    },
    async register(name, email, password) {
      const payload = await authRequest('/api/auth/register', { name, email, password });
      setUser(payload.user);
    },
    async logout() {
      await authRequest('/api/auth/logout', {});
      setUser(null);
    },
    refreshSession,
  }), [loading, refreshSession, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return value;
}
