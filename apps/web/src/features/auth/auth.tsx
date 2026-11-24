'use client';

// Frontend auth bootstrap (F1-11). The backend is the security boundary; these helpers only shape UX.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { isSupportedLocale, useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { storage } from '@/lib/storage';

export interface Me {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  preferred_locale: string;
  account_status: string;
  roles: string[];
  permissions: string[];
  features: Record<string, boolean>;
}

interface AuthValue {
  user: Me | null;
  loading: boolean;
  can: (...perms: string[]) => boolean;
  hasRole: (...roles: string[]) => boolean;
  login: (username: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthCtx = createContext<AuthValue | null>(null);
export const ME_KEY = ['auth', 'me'] as const;

// Last known identity (no token/cookie) so offline work (attendance) keeps the shell usable when the network
// is down. The server stays authoritative: a 401 always clears it, and every write is re-authorized online.
const PROFILE_KEY = 'nossef.me';

async function fetchMe(): Promise<Me | null> {
  try {
    const me = await api.get<Me>('/auth/me/');
    storage.set(PROFILE_KEY, JSON.stringify(me));
    return me;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      storage.remove(PROFILE_KEY);
      return null;
    }
    if (e instanceof ApiError && e.status === 0) {
      const cached = storage.get(PROFILE_KEY);
      if (cached) return JSON.parse(cached) as Me;
    }
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { setLocale } = useI18n();
  const me = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: 1 });
  const user = me.data ?? null;

  useEffect(() => {
    if (user && isSupportedLocale(user.preferred_locale)) setLocale(user.preferred_locale);
  }, [user, setLocale]);

  useEffect(() => {
    const onExpired = () => {
      storage.remove(PROFILE_KEY);
      qc.setQueryData(ME_KEY, null);
    };
    window.addEventListener('nossef:unauthenticated', onExpired);
    return () => window.removeEventListener('nossef:unauthenticated', onExpired);
  }, [qc]);

  const perms = useMemo(() => new Set(user?.permissions ?? []), [user]);
  const can = useCallback((...codes: string[]) => codes.some((c) => perms.has(c)), [perms]);
  const hasRole = useCallback((...roles: string[]) => !!user && user.roles.some((r) => roles.includes(r)), [user]);

  const login = useCallback(
    async (username: string, password: string) => {
      const next = await api.post<Me>('/auth/login/', { username, password });
      storage.set(PROFILE_KEY, JSON.stringify(next));
      // Drop data cached for any previous identity, but keep the observed `me` query alive.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
      qc.setQueryData(ME_KEY, next);
      return next;
    },
    [qc],
  );
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout/');
    } finally {
      storage.remove(PROFILE_KEY);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
      qc.setQueryData(ME_KEY, null);
    }
  }, [qc]);

  const value = useMemo<AuthValue>(
    () => ({ user, loading: me.isPending, can, hasRole, login, logout, refresh: me.refetch }),
    [user, me.isPending, can, hasRole, login, logout, me.refetch],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Redirects anonymous visitors to /login?next=... ; renders nothing until the session is known. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);
  if (!user) return null;
  return <>{children}</>;
}
