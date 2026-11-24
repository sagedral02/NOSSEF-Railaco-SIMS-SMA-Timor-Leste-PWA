'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ToastProvider } from '@/components/toast';
import { ZoomProvider } from '@/components/zoom';
import { AuthProvider } from '@/features/auth/auth';
import { I18nProvider } from '@/i18n';
import { ApiError } from '@/lib/api';
import { OfflineProvider } from '@/lib/offline/provider';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Never retry authorization/validation failures; retry transient ones once.
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ZoomProvider>
          <ToastProvider>
            <AuthProvider>
              <OfflineProvider>{children}</OfflineProvider>
            </AuthProvider>
          </ToastProvider>
        </ZoomProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
