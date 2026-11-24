'use client';

import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { RequireAuth } from '@/features/auth/auth';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
