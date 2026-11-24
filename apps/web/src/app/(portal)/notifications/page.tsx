'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Alert, ApiErrorAlert, Button, Card, Checkbox, EmptyState, ErrorState, PageHeader, Skeleton, Table, Td, Th, Tr, cx } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Item { id: string; type: string; title: string; body: string; target_url: string; read_at: string | null; created_at: string }
interface Pref { event_type: string; push_enabled: boolean; email_enabled: boolean }

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function PushCard() {
  const { t } = useI18n();
  const info = useQuery({ queryKey: ['notifications', 'push'], queryFn: () => api.get<{ enabled: boolean; public_key: string; devices: number }>('/notifications/push/') });
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const sub = useMutation({
    mutationFn: async () => {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('permission');
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(info.data!.public_key) });
      return api.post('/notifications/push/', s.toJSON());
    },
    onSuccess: () => info.refetch(),
  });
  if (!info.data) return null;
  return (
    <Card title={<span className="inline-flex items-center gap-2"><BellRing className="w-4 h-4" aria-hidden />{t('notif.push')}</span>}>
      <ApiErrorAlert error={sub.error} />
      {!info.data.enabled || !supported ? <p className="text-sm text-ink2">{t('notif.pushUnavailable')}</p>
        : info.data.devices > 0 && !sub.isIdle ? <Alert tone="ok">{t('notif.pushOn')}</Alert>
        : <Button icon={BellRing} disabled={sub.isPending} onClick={() => sub.mutate()}>{t('notif.enablePush')}</Button>}
    </Card>
  );
}

function Preferences() {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', 'prefs'], queryFn: () => api.get<Pref[]>('/notifications/preferences/') });
  const [draft, setDraft] = useState<Pref[] | null>(null);
  const rows = draft ?? q.data ?? [];
  const save = useMutation({ mutationFn: () => api.put<Pref[]>('/notifications/preferences/', rows), onSuccess: (d) => { qc.setQueryData(['notifications', 'prefs'], d); setDraft(null); } });
  const set = (i: number, k: 'push_enabled' | 'email_enabled', v: boolean) => setDraft(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <Card title={t('notif.prefs')} pad={false}>
      <Table>
        <thead><tr><Th /><Th align="center">{t('notif.push')}</Th><Th align="center">{t('notif.email')}</Th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <Tr key={r.event_type}>
            <Td className="text-sm">{tx(`notif.event.${r.event_type}`, r.event_type)}</Td>
            <Td align="center"><Checkbox label={`${r.event_type} push`} checked={r.push_enabled} onChange={(v) => set(i, 'push_enabled', v)} /></Td>
            <Td align="center"><Checkbox label={`${r.event_type} email`} checked={r.email_enabled} onChange={(v) => set(i, 'email_enabled', v)} /></Td>
          </Tr>
        ))}</tbody>
      </Table>
      {draft && <div className="p-3 flex justify-end"><Button size="sm" variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button></div>}
    </Card>
  );
}

export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => api.feed<Item>('/notifications/', pageParam ? { cursor: pageParam } : undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.next_cursor ?? undefined,
  });
  const read = useMutation({
    mutationFn: (ids?: string[]) => api.post('/notifications/read/', ids ? { ids } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <PageHeader title={t('nav.notifications')} actions={<Button icon={CheckCheck} disabled={!items.some((i) => !i.read_at)} onClick={() => read.mutate(undefined)}>{t('notif.markAll')}</Button>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : items.length ? (
            <Card pad={false}>
              {items.map((n) => (
                <Link key={n.id} href={n.target_url || '#'} onClick={() => !n.read_at && read.mutate([n.id])}
                  className={cx('flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-hover', !n.read_at && 'bg-selected/40')}>
                  <Bell className={cx('w-4 h-4 mt-0.5 shrink-0', n.read_at ? 'text-muted' : 'text-accent')} strokeWidth={1.5} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className={cx('text-sm', !n.read_at && 'font-semibold')}>{n.title}</div>
                    <div className="text-sm text-ink2">{n.body}</div>
                    <div className="text-[11px] text-muted mt-0.5">{fmtDateTime(n.created_at, locale)}{!n.read_at && ` · ${t('notif.unread')}`}</div>
                  </div>
                </Link>
              ))}
              {list.hasNextPage && <div className="p-3 text-center"><Button size="sm" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{t('common.loadMore')}</Button></div>}
            </Card>
          ) : <EmptyState icon={Bell} title={t('notif.empty')} />}
        </div>
        <div className="space-y-4">
          <PushCard />
          <Preferences />
        </div>
      </div>
    </>
  );
}
