'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CloudOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { Alert, ApiErrorAlert, Badge, Button, Card, EmptyState, Input, Mono, PageHeader, Skeleton, StatusPill } from '@/components/ui';
import { schoolToday } from '@/lib/format';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import type { CachedSession } from '@/lib/offline/db';
import { useOffline } from '@/lib/offline/provider';
import { listCachedSessions, saveSessionSnapshot } from '@/lib/offline/sync';

interface Lesson { entry_id: string; classroom: string; classroom_id: string; subject_code: string; subject_name: string; bell_period: string; start_time: string; end_time: string; room: string | null; substitute: boolean; exception: string | null; session_id: string | null; session_status: string | null }
interface MyClasses { date: string; teacher?: string; lessons: Lesson[]; homeroom: { classroom_id: string; classroom: string; session_id: string | null; session_status: string | null }[] }

function TodayScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { online, conflicts } = useOffline();
  const [date, setDate] = useState(() => schoolToday());
  const q = useQuery({ queryKey: ['attendance', 'mine', date], queryFn: () => api.get<MyClasses>('/attendance/my-classes/', { date }), enabled: online });
  const [cached, setCached] = useState<CachedSession[]>([]);
  useEffect(() => { listCachedSessions().then(setCached).catch(() => setCached([])); }, [online]);
  const open = useMutation({
    mutationFn: (body: Record<string, string>) => api.post<CachedSession>('/attendance/sessions/', { ...body, date }),
    onSuccess: async (s) => { await saveSessionSnapshot(s); router.push(`/attendance/sessions/${s.id}`); },
  });
  const sessionLink = (id: string | null, status: string | null, body: Record<string, string>) =>
    id ? (
      <Link href={`/attendance/sessions/${id}`} className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-line-strong text-xs font-medium hover:bg-hover">
        {status === 'OPEN' ? t('att.continue') : t('att.view')} <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
      </Link>
    ) : (
      <Button size="sm" variant="primary" disabled={!online || open.isPending} onClick={() => open.mutate(body)}>{t('att.open')}</Button>
    );
  return (
    <>
      <PageHeader title={t('att.today')} subtitle={q.data?.teacher} actions={<Input type="date" aria-label={t('common.startDate')} className="h-9 w-auto" value={date} onChange={(e) => setDate(e.target.value)} />} />
      {conflicts.length > 0 && <div className="mb-4"><Alert tone="bad" title={t('offline.conflictTitle')}>{conflicts.map((c) => c.label).join(' · ')}</Alert></div>}
      {open.error && <div className="mb-4"><ApiErrorAlert error={open.error} /></div>}
      {!online && (
        <Card title={<span className="inline-flex items-center gap-2"><CloudOff className="w-4 h-4" strokeWidth={1.5} aria-hidden />{t('offline.cached')}</span>} pad={false}>
          {cached.length ? cached.map((s) => (
            <Link key={s.id} href={`/attendance/sessions/${s.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-hover">
              <div className="flex-1"><div className="text-sm font-medium">{s.classroom_name} {s.subject_code && <Mono>{s.subject_code}</Mono>}</div><div className="text-xs text-ink2">{s.date} · {s.bell_period_name ?? t('att.daily')}</div></div>
              <StatusPill status={s.status} />
            </Link>
          )) : <EmptyState title={t('offline.unavailable')} />}
        </Card>
      )}
      {online && (q.isPending ? <Card pad={false}><Skeleton /></Card> : q.data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={t('att.lessons')} pad={false} className="lg:col-span-2">
            {q.data.lessons.length ? q.data.lessons.map((l) => (
              <div key={l.entry_id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line last:border-0">
                <div className="w-20 shrink-0"><Mono className="text-xs">{l.start_time.slice(0, 5)}–{l.end_time.slice(0, 5)}</Mono><div className="text-[11px] text-muted">{l.bell_period}</div></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{l.classroom} · <Mono>{l.subject_code}</Mono> {l.subject_name}</div>
                  <div className="text-xs text-ink2">{l.room ?? '—'} {l.substitute && <Badge tone="info" className="ml-1">{t('att.substitute')}</Badge>}</div>
                </div>
                {l.session_status && <StatusPill status={l.session_status} />}
                {l.exception === 'CANCELLED' ? <Badge tone="bad">{t('sched.exType.CANCELLED')}</Badge> : sessionLink(l.session_id, l.session_status, { schedule_entry: l.entry_id, session_type: 'LESSON' })}
              </div>
            )) : <EmptyState title={t('att.noLessons')} />}
          </Card>
          <Card title={t('att.homeroom')} pad={false}>
            {q.data.homeroom.length ? q.data.homeroom.map((h) => (
              <div key={h.classroom_id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0">
                <div className="flex-1 text-sm font-medium">{h.classroom}</div>
                {h.session_status && <StatusPill status={h.session_status} />}
                {sessionLink(h.session_id, h.session_status, { classroom: h.classroom_id, session_type: 'DAILY' })}
              </div>
            )) : <EmptyState />}
          </Card>
        </div>
      ))}
      <p className="text-[11px] text-muted mt-3">{new Date(`${date}T00:00:00`).toLocaleDateString(locale === 'id' ? 'id-ID' : 'pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    </>
  );
}

export default function TodayPage() {
  return (
    <RequirePermission any={['attendance.record', 'attendance.view']}>
      <TodayScreen />
    </RequirePermission>
  );
}
