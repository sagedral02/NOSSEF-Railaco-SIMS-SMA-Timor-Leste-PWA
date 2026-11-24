'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';

import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/storage';

/** Top-bar inbox entry with unread badge (polls while online; the inbox is the delivery source of truth). */
export function NotificationBell() {
  const { t } = useI18n();
  const online = useOnline();
  const q = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count/'),
    refetchInterval: online ? 60_000 : false,
    enabled: online,
  });
  const n = q.data?.unread ?? 0;
  return (
    <Link href="/notifications" aria-label={`${t('nav.notifications')}${n ? ` (${n})` : ''}`} className="relative inline-flex items-center justify-center h-8 w-8 rounded-md border border-line hover:bg-hover text-ink2">
      <Bell className="w-4 h-4" strokeWidth={1.5} aria-hidden />
      {n > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-bad text-white text-[10px] font-semibold leading-4 text-center">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
