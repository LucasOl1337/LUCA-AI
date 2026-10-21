import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  exigeNovoDocumento,
  formatAppUrl,
  mergeAppLocation,
  parseAppLocation,
  type AppLocation,
} from '../../shared/app-location.js';

type HistoryMode = 'push' | 'replace';

interface AppLocationContextValue {
  location: AppLocation;
  href: string;
  navigate: (patch: Partial<AppLocation>, history?: HistoryMode) => void;
}

const AppLocationContext = createContext<AppLocationContextValue | null>(null);

function currentHref() {
  const path = window.location.pathname === '/' || window.location.pathname === '/stand/'
    ? window.location.pathname
    : window.location.pathname.replace(/\/+$/, '') || '/';
  return `${path}${window.location.search}`;
}

export function AppLocationProvider({ children }: { children: ReactNode }) {
  const [href, setHref] = useState(currentHref);
  const location = useMemo(() => parseAppLocation(href), [href]);
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    const sync = () => setHref(currentHref());
    const clean = currentHref();
    if (clean !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', clean);
      setHref(clean);
    }
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const apply = useCallback((next: AppLocation, history: HistoryMode) => {
    const formatted = formatAppUrl(next);
    const nextHref = next.kind === 'app' && next.page === 'stand'
      ? formatted.replace(/^\/stand(?=\?|$)/, '/stand/')
      : formatted;
    // Câmera só no documento da /sonolencia, microfone só no do /stand: cruzar
    // a fronteira carrega o documento para valer a Permissions-Policy dele.
    if (exigeNovoDocumento(locationRef.current, next)) {
      if (history === 'replace') window.location.replace(nextHref);
      else window.location.assign(nextHref);
      return;
    }
    locationRef.current = parseAppLocation(nextHref);
    const now = currentHref();
    if (nextHref === now) {
      setHref(nextHref);
      return;
    }
    if (history === 'push') window.history.pushState(null, '', nextHref);
    else window.history.replaceState(null, '', nextHref);
    setHref(nextHref);
  }, []);

  const navigate = useCallback((patch: Partial<AppLocation>, history: HistoryMode = 'push') => {
    apply(mergeAppLocation(locationRef.current, patch), history);
  }, [apply]);

  const value = useMemo<AppLocationContextValue>(() => ({
    location,
    href,
    navigate,
  }), [href, location, navigate]);

  return (
    <AppLocationContext.Provider value={value}>
      {children}
    </AppLocationContext.Provider>
  );
}

export function useAppLocation() {
  const value = useContext(AppLocationContext);
  if (!value) throw new Error('useAppLocation exige AppLocationProvider');
  return value;
}
