'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { Card, EmptyState, ErrorState, Input, Mono, PageHeader, ProgressBar, Select, Skeleton, Stat, StatusPill, Table, Td, Th, Tr } from '@/components/ui';
import { useClassrooms, useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDate, schoolToday } from '@/lib/format';

interface Report {
  classroom: string; sessions: number; open_sessions: number;
  students: { student_id: string; student_no: string; full_name: string; daily: Record<string, number>; total: number; attendance_rate: number | null }[];
}
interface SessionRow { id: string; date: string; session_type: string; subject_code: string | null; bell_period_name: string | null; status: string; classroom_name: string }

function ReviewScreen() {
  const { t, tx, locale } = useI18n();
  const router = useRouter();
  const { year } = useSelectedYear();
  const classes = useClassrooms(year?.id).data ?? [];
  const [classId, setClassId] = useState('');
  const cls = classes.find((c) => c.id === classId) ?? classes[0];
  const today = schoolToday();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(today);
  const report = useQuery({
    queryKey: ['attendance', 'report', cls?.id, from, to],
    queryFn: () => api.get<Report>('/attendance/class-report/', { classroom_id: cls!.id, date_from: from, date_to: to }),
    enabled: !!cls,
    placeholderData: keepPreviousData,
  });
  const sessions = useQuery({
    queryKey: ['attendance', 'sessions', cls?.id, from, to],
    queryFn: () => api.get<SessionRow[]>('/attendance/sessions/', { classroom_id: cls!.id, date_from: from, date_to: to, page_size: 100 }),
    enabled: !!cls,
  });
  const avg = report.data?.students.length
    ? report.data.students.reduce((a, s) => a + (s.attendance_rate ?? 0), 0) / report.data.students.filter((s) => s.attendance_rate != null).length || 0
    : 0;
  return (
    <>
      <PageHeader title={t('att.review')} subtitle={cls?.name}
        actions={<>
          <YearSelect />
          <Select aria-label={t('student.classroom')} className="h-9 w-auto" value={cls?.id ?? ''} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input type="date" aria-label={t('audit.dateFrom')} className="h-9 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" aria-label={t('audit.dateTo')} className="h-9 w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </>} />
      {report.isPending ? <Card pad={false}><Skeleton /></Card> : report.error ? <ErrorState error={report.error} onRetry={() => report.refetch()} /> : report.data && (
        <>
          <Card pad={false} className="mb-4">
            <div className="grid grid-cols-3 divide-x divide-line">
              <Stat label={t('att.rate')} value={`${avg.toFixed(1)}%`} tone={avg >= 90 ? 'ok' : 'bad'} />
              <Stat label={t('att.sessions')} value={report.data.sessions} />
              <Stat label={t('att.openSessions')} value={report.data.open_sessions} tone={report.data.open_sessions ? 'bad' : undefined} />
            </div>
          </Card>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card pad={false} className="xl:col-span-2">
              <Table>
                <thead><tr><Th>{t('student.no')}</Th><Th>{t('common.name')}</Th>{['PRESENT', 'LATE', 'SICK', 'PERMITTED', 'ABSENT'].map((s) => <Th key={s} align="right">{tx(`att.short.${s}`, s[0])}</Th>)}<Th>{t('att.rate')}</Th></tr></thead>
                <tbody>
                  {report.data.students.map((s) => (
                    <Tr key={s.student_id} onClick={() => router.push(`/students/${s.student_id}`)}>
                      <Td mono>{s.student_no}</Td><Td>{s.full_name}</Td>
                      {['PRESENT', 'LATE', 'SICK', 'PERMITTED', 'ABSENT'].map((st) => <Td key={st} align="right" mono className={st === 'ABSENT' && s.daily[st] ? 'text-bad font-semibold' : ''}>{s.daily[st] ?? 0}</Td>)}
                      <Td className="w-40"><div className="flex items-center gap-2"><ProgressBar value={s.attendance_rate ?? 0} tone={(s.attendance_rate ?? 0) >= 90 ? 'ok' : 'warn'} label={t('att.rate')} /><Mono className="text-xs">{s.attendance_rate ?? '—'}%</Mono></div></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card title={t('att.sessions')} pad={false}>
              {sessions.data?.length ? sessions.data.map((s) => (
                <button key={s.id} type="button" onClick={() => router.push(`/attendance/sessions/${s.id}`)} className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0 hover:bg-hover text-left">
                  <div className="flex-1"><div className="text-sm">{fmtDate(s.date, locale)}</div><div className="text-xs text-ink2">{s.session_type === 'DAILY' ? t('att.daily') : `${s.bell_period_name} · ${s.subject_code}`}</div></div>
                  <StatusPill status={s.status} />
                </button>
              )) : <EmptyState />}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export default function ReviewPage() {
  return (
    <RequirePermission any={['attendance.view']}>
      <ReviewScreen />
    </RequirePermission>
  );
}
