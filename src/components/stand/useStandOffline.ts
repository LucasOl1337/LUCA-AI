import { useEffect, useState } from 'react';
import { criarVigiaConexao, TIMEOUT_SAUDE_MS, type Decisao } from './vigiaConexao';

/** Only the stand opts into public, static offline content. Never cache auth. */
export function useStandOffline(stand: boolean) {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    if (!stand) return;
    let disposed = false;
    let checking = false;
    const vigia = criarVigiaConexao(navigator.onLine);
    const aplicar = (decisao: Decisao) => {
      if (disposed) return;
      if (decisao === 'recarregar') window.location.reload();
      else if (decisao === 'offline') setOffline(true);
      else if (decisao === 'online') setOffline(false);
    };
    const lost = () => aplicar(vigia.eventoOffline());
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_SAUDE_MS) });
        const health: unknown = await response.json();
        if (!response.ok || !health || typeof health !== 'object' || !('ok' in health) || health.ok !== true) throw new Error('offline');
        aplicar(vigia.saudeOk());
      } catch {
        aplicar(vigia.falhaSaude(navigator.onLine));
      } finally { checking = false; }
    };
    const register = async () => {
      if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
      try {
        const response = await fetch('/stand/sw.js', { cache: 'no-store' });
        if (response.status === 404 || response.headers.get('content-type')?.includes('text/html')) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.filter((r) => new URL(r.scope).pathname === '/stand/').map((r) => r.unregister()));
          await Promise.all((await caches.keys()).filter((key) => key.startsWith('luca-stand-')).map((key) => caches.delete(key)));
          return;
        }
        if (response.ok) await navigator.serviceWorker.register('/stand/sw.js', { scope: '/stand/', updateViaCache: 'none' });
      } catch { /* Offline or unsupported storage must not prevent the stand. */ }
    };
    void register();
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    window.addEventListener('offline', lost);
    window.addEventListener('online', check);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('offline', lost);
      window.removeEventListener('online', check);
    };
  }, [stand]);
  return stand && offline;
}
