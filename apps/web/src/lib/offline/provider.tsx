'use client';

// Offline state for the whole app: queue counts, automatic sync on start/focus/online (PRD §34.5), manual retry.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/features/auth/auth';
import { useOnline } from '@/lib/storage';

import { bindUser, clearUserData, type QueuedMutation } from './db';
import { queueSnapshot, subscribe, syncNow, type SyncOutcome } from './sync';

interface OfflineValue {
  online: boolean;
  queue: QueuedMutation[];
  pending: number;
  conflicts: QueuedMutation[];
  rejected: QueuedMutation[];
  syncing: boolean;
  lastOutcome: SyncOutcome | null;
  sync: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Clear the local scoped cache (after the user has synced or explicitly discarded pending changes). */
  wipe: () => Promise<void>;
}

const Ctx = createContext<OfflineValue | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const online = useOnline();
  const { user } = useAuth();
  const [queue, setQueue] = useState<QueuedMutation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<SyncOutcome | null>(null);

  const refresh = useCallback(async () => {
    try {
      setQueue(await queueSnapshot());
    } catch {
      setQueue([]);
    }
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      setLastOutcome(await syncNow());
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribe(() => void refresh());
    return () => {
      unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      await bindUser(user.id);
      if (cancelled) return;
      await refresh();
      if (!cancelled && navigator.onLine) await sync();
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, refresh, sync]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => navigator.onLine && void sync();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    const timer = window.setInterval(() => navigator.onLine && queue.some((m) => m.state === 'PENDING') && void sync(), 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      window.clearInterval(timer);
    };
  }, [user, sync, queue]);

  const wipe = useCallback(async () => {
    await clearUserData().catch(() => undefined);
    await refresh();
  }, [refresh]);

  const value = useMemo<OfflineValue>(() => ({
    online, queue, syncing, lastOutcome, sync, refresh, wipe,
    pending: queue.filter((m) => m.state === 'PENDING' || m.state === 'SENDING').length,
    conflicts: queue.filter((m) => m.state === 'CONFLICT'),
    rejected: queue.filter((m) => m.state === 'REJECTED'),
  }), [online, queue, syncing, lastOutcome, sync, refresh, wipe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOffline() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOffline must be used inside OfflineProvider');
  return ctx;
}
