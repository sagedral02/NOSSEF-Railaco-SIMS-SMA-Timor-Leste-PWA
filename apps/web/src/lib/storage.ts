// UI preferences only (locale, zoom). Never store auth tokens or domain data here (PRD §13).
import { useSyncExternalStore } from 'react';

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable (private mode) */
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Persisted preference readable during render without hydration mismatch (server = fallback). */
export function usePreference(key: string, fallback: string): string {
  return useSyncExternalStore(subscribe, () => storage.get(key) ?? fallback, () => fallback);
}

export function setPreference(key: string, value: string) {
  storage.set(key, value);
  listeners.forEach((l) => l());
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
