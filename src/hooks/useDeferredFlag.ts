import { useEffect, useState } from 'react';

/** Only flip true after `delayMs` so a short wait never paints a spinner. */
export function useDeferredFlag(active: boolean, delayMs = 220): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return undefined;
    }
    const id = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);

  return shown;
}
