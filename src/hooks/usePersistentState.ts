import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';

const STORAGE_PREFIX = 'luca.';

/**
 * Persistent state — localStorage para preferência da máquina (densidade,
 * colunas). Página e filtro moram na URL; o operacional vem do backend.
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  const [value, setValueState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setValueState((prev) => {
      const next = typeof action === 'function'
        ? (action as (p: T) => T)(prev)
        : action;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // silent — persistência local é best-effort
      }
      return next;
    });
  }, [storageKey]);

  return [value, setValue];
}
