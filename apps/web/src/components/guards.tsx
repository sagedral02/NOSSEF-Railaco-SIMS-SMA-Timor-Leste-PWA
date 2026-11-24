'use client';

import type { ReactNode } from 'react';

import { useAuth } from '@/features/auth/auth';

import { Denied } from './ui';

/** Page-level UX guard. Typing the URL manually still hits the API, which denies on its own (F1 exit criteria). */
export function RequirePermission({ any, children }: { any: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(...any)) return <Denied />;
  return <>{children}</>;
}
