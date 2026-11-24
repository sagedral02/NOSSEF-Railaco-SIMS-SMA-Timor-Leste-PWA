'use client';

// Portal schedule (PRD §64 /student/schedule, §55.13–14): the student's or selected child's class timetable.
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Button, Card, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { ChildScope } from '@/features/portal/children';
import { shiftWeek, Timetable, type TimetableData } from '@/features/schedules/timetable';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { schoolToday } from '@/lib/format';

function ChildTimetable({ studentId }: { studentId: string }) {
  const { t } = useI18n();
  const [date, setDate] = useState(schoolToday);
  const q = useQuery({
    queryKey: ['timetable', 'portal', studentId, date],
    queryFn: () => api.get<TimetableData>('/schedules/timetable/', { student_id: studentId, date }),
  });
  return (
    <Card pad={false} title={q.data?.title} actions={
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" icon={ChevronLeft} aria-label={t('common.previous')} onClick={() => setDate(shiftWeek(date, -7))} />
        <Button size="sm" onClick={() => setDate(schoolToday())}>{t('portal.thisWeek')}</Button>
        <Button size="sm" variant="ghost" icon={ChevronRight} aria-label={t('common.next')} onClick={() => setDate(shiftWeek(date, 7))} />
      </div>
    }>
      {q.isPending ? <Skeleton /> : q.error ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : <Timetable data={q.data} show="teacher" />}
    </Card>
  );
}

export default function MySchedulePage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.mySchedule')} />
      <ChildScope>{(c) => <ChildTimetable studentId={c.id} />}</ChildScope>
    </>
  );
}
