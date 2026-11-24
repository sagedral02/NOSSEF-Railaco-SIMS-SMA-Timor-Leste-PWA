// Global state: I18nContext, ZoomContext, AuthContext, OfflineContext, DataContext.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, tokenStore } from '../lib/api';
import { translate, type Lang } from '../lib/i18n';
import { setDomLanguage, startDomTranslator } from '../i18n/domTranslator';
import type { DB, Role, User } from '../lib/types';

const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// ---------- I18n ----------
const I18nCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string }>(null!);
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>((ls.get('nossef.lang') as Lang) || 'id');
  // Whole-UI translation layer (see src/i18n/domTranslator.ts).
  useEffect(() => { startDomTranslator(lang); setDomLanguage(lang); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setLang = (l: Lang) => { setLangState(l); ls.set('nossef.lang', l); setDomLanguage(l); };
  const t = useCallback((k: string) => translate(lang, k), [lang]);
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}
export const useI18n = () => useContext(I18nCtx);

// ---------- Zoom (85% - 160%) ----------
const ZoomCtx = createContext<{ zoom: number; setZoom: (z: number) => void }>(null!);
export function ZoomProvider({ children }: { children: ReactNode }) {
  const [zoom, setZoomState] = useState<number>(Number(ls.get('nossef.zoom')) || 100);
  useEffect(() => { document.documentElement.style.fontSize = `${(16 * zoom) / 100}px`; }, [zoom]);
  const setZoom = (z: number) => { const v = Math.min(160, Math.max(85, z)); setZoomState(v); ls.set('nossef.zoom', String(v)); };
  return <ZoomCtx.Provider value={{ zoom, setZoom }}>{children}</ZoomCtx.Provider>;
}
export const useZoom = () => useContext(ZoomCtx);

// ---------- Toasts ----------
type Toast = { id: number; kind: 'ok' | 'error' | 'info'; text: string };
const ToastCtx = createContext<{ toasts: Toast[]; toast: (text: string, kind?: Toast['kind']) => void; dismiss: (id: number) => void }>(null!);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => dismiss(id), 4200);
  }, []);
  return <ToastCtx.Provider value={{ toasts, toast, dismiss }}>{children}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

// ---------- Auth ----------
interface AuthState { user: User | null; loading: boolean; login: (u: string, p: string) => Promise<void>; logout: () => void; can: (perm: string) => boolean; hasRole: (...r: Role[]) => boolean }
const AuthCtx = createContext<AuthState>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!tokenStore.get()) { setLoading(false); return; }
    api<User>('GET', '/api/auth/me')
      .then(setUser)
      .catch((e: ApiError) => { if (e.status === 401) tokenStore.set(null); })
      .finally(() => setLoading(false));
  }, []);
  const login = async (username: string, password: string) => {
    const r = await api<{ token: string; user: User }>('POST', '/api/auth/login', { username, password });
    tokenStore.set(r.token);
    setUser(r.user);
  };
  const logout = () => { api('POST', '/api/auth/logout').catch(() => {}); tokenStore.set(null); setUser(null); };
  const can = useCallback((perm: string) => {
    if (!user) return false;
    return user.permissions.some((p) => p === '*' || p === perm || (p.endsWith('.*') && perm.startsWith(p.slice(0, -1))));
  }, [user]);
  const hasRole = useCallback((...r: Role[]) => !!user && user.roles.some((x) => r.includes(x)), [user]);
  return <AuthCtx.Provider value={{ user, loading, login, logout, can, hasRole }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

// ---------- Offline (PWA queue) ----------
export interface QueuedMutation { id: string; method: string; url: string; body: any; label: string; at: string }
export interface SyncConflict { mutation: QueuedMutation; error: ApiError }
interface OfflineState {
  online: boolean; simulatedOffline: boolean; setSimulatedOffline: (v: boolean) => void; queue: QueuedMutation[];
  enqueue: (m: Omit<QueuedMutation, 'id' | 'at'>) => void; sync: () => Promise<void>; syncing: boolean;
  conflicts: SyncConflict[]; resolveConflict: (id: string) => void;
}
const OfflineCtx = createContext<OfflineState>(null!);
export function OfflineProvider({ children, onSynced }: { children: ReactNode; onSynced?: () => void }) {
  const [netOnline, setNetOnline] = useState(navigator.onLine);
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [queue, setQueue] = useState<QueuedMutation[]>(() => { try { return JSON.parse(ls.get('nossef.queue') || '[]'); } catch { return []; } });
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [syncing, setSyncing] = useState(false);
  const online = netOnline && !simulatedOffline;
  useEffect(() => {
    const on = () => setNetOnline(true); const off = () => setNetOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => ls.set('nossef.queue', JSON.stringify(queue)), [queue]);
  const enqueue = (m: Omit<QueuedMutation, 'id' | 'at'>) =>
    setQueue((q) => [...q, { ...m, id: `mut-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, at: new Date().toISOString() }]);
  const queueRef = useRef(queue); queueRef.current = queue;
  const sync = useCallback(async () => {
    if (syncing || !queueRef.current.length) return;
    setSyncing(true);
    const remaining: QueuedMutation[] = [];
    const newConflicts: SyncConflict[] = [];
    for (const m of queueRef.current) {
      try { await api(m.method, m.url, { ...m.body, clientMutationId: m.id }); }
      catch (e) {
        const err = e as ApiError;
        if (err.status === 0) remaining.push(m);
        else newConflicts.push({ mutation: m, error: err });
      }
    }
    setQueue(remaining);
    setConflicts((c) => [...c, ...newConflicts]);
    setSyncing(false);
    onSynced?.();
  }, [syncing, onSynced]);
  useEffect(() => { if (online && queue.length) sync(); }, [online]); // auto-sync on reconnect
  const resolveConflict = (id: string) => setConflicts((c) => c.filter((x) => x.mutation.id !== id));
  return <OfflineCtx.Provider value={{ online, simulatedOffline, setSimulatedOffline, queue, enqueue, sync, syncing, conflicts, resolveConflict }}>{children}</OfflineCtx.Provider>;
}
export const useOffline = () => useContext(OfflineCtx);

// ---------- Data ----------
interface DataState { db: DB | null; loading: boolean; error: string | null; reload: () => Promise<void> }
const DataCtx = createContext<DataState>(null!);
export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [db, setDb] = useState<DB | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const d = await api<DB>('GET', '/api/bootstrap');
      setDb(d); setError(null);
      try { sessionStorage.setItem('nossef.cache', JSON.stringify(d)); } catch { /* too large / unavailable */ }
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 0) {
        try { const c = sessionStorage.getItem('nossef.cache'); if (c) { setDb(JSON.parse(c)); return; } } catch { /* ignore */ }
      }
      setError(err.message);
    }
  }, []);
  useEffect(() => {
    if (!user) { setDb(null); return; }
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [user, reload]);
  return <DataCtx.Provider value={{ db, loading, error, reload }}>{children}</DataCtx.Provider>;
}
export function useData() {
  const ctx = useContext(DataCtx);
  return ctx;
}
const EMPTY_DB = { students: [], teachers: [], classes: [], subjects: [], rooms: [], guardians: [], invoices: [], staff: [], libraryBooks: [], libraryCopies: [], activities: [] } as unknown as DB;

/** Non-null db accessor for pages rendered inside the authenticated shell. */
export function useDB(): DB {
  return useContext(DataCtx).db!;
}

/** Run a mutation, reload data, toast result. */
export function useMutation() {
  const { reload } = useData();
  const { toast } = useToast();
  return useCallback(
    async <T,>(method: string, url: string, body?: unknown, success?: string): Promise<T | null> => {
      try {
        const r = await api<T>(method, url, body);
        await reload();
        if (success) toast(success, 'ok');
        return r;
      } catch (e) {
        const err = e as ApiError;
        toast(`${err.code}: ${err.message}`, 'error');
        return null;
      }
    },
    [reload, toast]
  );
}

export function useLookups() {
  const db = useContext(DataCtx).db ?? EMPTY_DB;
  return useMemo(() => {
    const m = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
    return {
      students: m(db.students), teachers: m(db.teachers), classes: m(db.classes), subjects: m(db.subjects), rooms: m(db.rooms),
      guardians: m(db.guardians), invoices: m(db.invoices), staff: m(db.staff), books: m(db.libraryBooks), copies: m(db.libraryCopies), activities: m(db.activities),
    };
  }, [db]);
}
