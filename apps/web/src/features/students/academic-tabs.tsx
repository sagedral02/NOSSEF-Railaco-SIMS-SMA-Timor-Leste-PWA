'use client';

// Student 360 academic tabs (PRD §17.5): published report cards, transcript and attendance summary.
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';

import { Card, Drawer, EmptyState, ErrorState, Mono, ProgressBar, Skeleton, Stat, StatusPill, Table, Td, Th, Tr, cx } from '@/components/ui';
import { ReportSnapshot, reportPdfUrl, type ReportCard } from '@/features/reports/report-card';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface TranscriptYear {
  academic_year: string; classroom: string | null; grade: string | null; major: string | null;
  subjects: { subject_code: string; subject_name: string; trimesters: Record<string, string>; annual: string | null }[];
}
interface Transcript { student_id: string; student_no: string; full_name: string; years: TranscriptYear[] }
interface AttendanceSummary { basis: string; attendance_rate: number | null; daily: Record<string, number>; lesson: Record<string, number> }

export function StudentGradesTab({ studentId }: { studentId: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState<ReportCard | null>(null);
  const reports = useQuery({ queryKey: ['reports', 'student', studentId], queryFn: () => api.get<ReportCard[]>('/report-cards/', { student_id: studentId }) });
  const transcript = useQuery({ queryKey: ['reports', 'transcript', studentId], queryFn: () => api.get<Transcript>(`/students/${studentId}/transcript/`) });
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <Card title={t('nav.reportCards')} pad={false} className="xl:col-span-2">
        {reports.isPending ? <Skeleton rows={3} /> : reports.error ? <ErrorState error={reports.error} /> : reports.data?.length ? reports.data.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0">
            <button type="button" className="flex-1 text-left" onClick={() => setOpen(r)}>
              <div className="text-sm font-medium">{r.academic_year} · T{r.trimester_number} <span className="text-ink2 font-normal">· {r.classroom}</span></div>
              <div className="text-xs text-ink2">{t('rc.average')}: <Mono className="text-xs">{r.snapshot.average ?? '—'}</Mono> · {t('rc.revision')} {r.revision_no}{r.published_at ? ` · ${fmtDateTime(r.published_at, locale)}` : ''}</div>
            </button>
            <StatusPill status={r.status} />
            {r.status === 'PUBLISHED' && <a href={reportPdfUrl(r.id)} aria-label={t('rc.download')} className="p-1.5 rounded hover:bg-hover"><Download className="w-4 h-4" aria-hidden /></a>}
          </div>
        )) : <EmptyState />}
      </Card>
      <Card title={t('rc.transcript')} pad={false} className="xl:col-span-3 overflow-x-auto">
        {transcript.isPending ? <Skeleton rows={4} /> : transcript.error ? <ErrorState error={transcript.error} /> : transcript.data?.years.length ? transcript.data.years.map((y) => (
          <div key={y.academic_year} className="border-b border-line last:border-0">
            <div className="px-4 pt-3 pb-1 text-sm font-semibold">{y.academic_year} <span className="text-ink2 font-normal">· {y.classroom}</span></div>
            <Table>
              <thead><tr><Th>{t('gb.assignment')}</Th>{['1', '2', '3'].map((n) => <Th key={n} align="center">T{n}</Th>)}<Th align="center">{t('rc.annual')}</Th></tr></thead>
              <tbody>
                {y.subjects.map((s) => (
                  <Tr key={s.subject_code}>
                    <Td><Mono className="text-xs mr-2">{s.subject_code}</Mono>{s.subject_name}</Td>
                    {['1', '2', '3'].map((n) => <Td key={n} align="center" mono className={cx(s.trimesters[n] && Number(s.trimesters[n]) <= 5 && 'text-bad')}>{s.trimesters[n] ? Number(s.trimesters[n]).toFixed(2) : '—'}</Td>)}
                    <Td align="center" mono className="font-semibold">{s.annual ?? '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )) : <EmptyState />}
      </Card>
      {open && (
        <Drawer open onClose={() => setOpen(null)} width={560} title={`${open.academic_year} · T${open.trimester_number}`} subtitle={`${open.classroom} · ${t('rc.revision')} ${open.revision_no}`}>
          <ReportSnapshot r={open} />
          {open.homeroom_note && <div className="mt-4"><div className="text-xs font-semibold text-ink2 mb-1">{t('rc.review')}</div><p className="text-sm whitespace-pre-line">{open.homeroom_note}</p></div>}
        </Drawer>
      )}
    </div>
  );
}

export function StudentAttendanceTab({ studentId }: { studentId: string }) {
  const { t, tx } = useI18n();
  const q = useQuery({ queryKey: ['attendance', 'student', studentId], queryFn: () => api.get<AttendanceSummary>(`/attendance/students/${studentId}/summary/`) });
  if (q.isPending) return <Card pad={false}><Skeleton rows={3} /></Card>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data!;
  const counts = s.basis === 'DAILY' ? s.daily : s.lesson;
  const rate = s.attendance_rate ?? 0;
  return (
    <Card pad={false}>
      <div className="grid grid-cols-2 md:grid-cols-6 divide-x divide-line">
        <Stat label={t('att.rate')} value={s.attendance_rate != null ? `${s.attendance_rate}%` : '—'} tone={rate >= 90 ? 'ok' : 'bad'} />
        {['PRESENT', 'LATE', 'SICK', 'PERMITTED', 'ABSENT'].map((k) => <Stat key={k} label={tx(`status.${k}`, k)} value={counts?.[k] ?? 0} tone={k === 'ABSENT' && counts?.[k] ? 'bad' : undefined} />)}
      </div>
      <div className="px-4 pb-4"><ProgressBar value={rate} tone={rate >= 90 ? 'ok' : 'warn'} label={t('att.rate')} /></div>
    </Card>
  );
}
