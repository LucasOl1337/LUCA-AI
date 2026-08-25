import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAppLocation } from '@/hooks/useAppLocation';

function keepCaretFree(event: React.FocusEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  requestAnimationFrame(() => {
    if (input.selectionStart === 0 && input.selectionEnd === input.value.length) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const { location, navigate } = useAppLocation();
  const mode = location.kind === 'auth' && location.authMode === 'register' ? 'register' : 'login';

  function setMode(next: 'login' | 'register') {
    navigate({ kind: 'auth', authMode: next }, 'push');
    setError('');
  }
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') await register(name, email, password);
      else await login(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível continuar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-label="Apresentação do LUCA">
        <div className="auth-brand">
          <img src="/icon-192.png" alt="" />
          <div><strong>LUCA</strong><span>centro operacional</span></div>
        </div>
        <div className="auth-copy">
          <span className="auth-kicker">PERSONA WORKBENCH</span>
          <h1>Uma missão.<br />Uma equipe inteira<br />pensando com você.</h1>
          <p>Coordene personas especializadas, acompanhe cada decisão e transforme contexto em execução.</p>
        </div>
        <div className="auth-route-line" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <header>
            <span>{mode === 'login' ? 'BEM-VINDO DE VOLTA' : 'COMECE AGORA'}</span>
            <h2>{mode === 'login' ? 'Entre no LUCA' : 'Crie sua conta'}</h2>
            <p>{mode === 'login' ? 'Continue de onde sua equipe parou.' : 'Acesso imediato. Nenhuma confirmação por e-mail.'}</p>
          </header>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <label><span>Nome</span><div><UserRound /><input value={name} onChange={(event) => setName(event.target.value)} onFocus={keepCaretFree} autoComplete="name" placeholder="Como devemos chamar você?" maxLength={80} /></div></label>
            )}
            <label><span>E-mail</span><div><Mail /><input type="text" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} onFocus={keepCaretFree} autoComplete="email" placeholder="voce@empresa.com" required /></div></label>
            <label><span>Senha</span><div><LockKeyhole /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} onFocus={keepCaretFree} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Mínimo de 8 caracteres" minLength={8} maxLength={128} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}<ArrowRight /></button>
          </form>

          <footer>
            {mode === 'login' ? 'Ainda não tem uma conta?' : 'Já possui uma conta?'}
            <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Criar conta' : 'Entrar'}</button>
          </footer>
        </div>
      </section>
    </main>
  );
}
