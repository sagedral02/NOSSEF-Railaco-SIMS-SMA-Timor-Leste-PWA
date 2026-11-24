'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { Button, Card, EmptyState, ErrorState, IconButton, PageHeader, Select, Skeleton, Tabs } from '@/components/ui';
import { useClassrooms, useSelectedYear } from '@/features/academics/api';
import { useAuth } from '@/features/auth/auth';
import { shiftWeek, Timetable, type TimetableData } from '@/features/schedules/timetable';
import { schoolToday } from '@/lib/format';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

type Mode = 'mine' | 'class' | 'teacher';

function SchedulesScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isTeacher = !!user?.roles.some((r) => r === 'TEACHER' || r === 'HOMEROOM_TEACHER');
  const [mode, setMode] = useState<Mode>(isTeacher ? 'mine' : 'class');
  const [date, setDate] = useState(() => schoolToday());
  const { year } = useSelectedYear();
  const classes = useClassrooms(year?.id).data ?? [];
  const teachers = useQuery({ queryKey: ['teachers', 'all'], queryFn: () => api.get<{ id: string; full_name: string }[]>('/staff/teachers/', { page_size: 100, employment_status: 'ACTIVE' }) });
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const effectiveClass = classId || classes[0]?.id;
  const query = mode === 'mine' ? { mine: 'true' } : mode === 'class' ? { classroom_id: effectiveClass } : { teacher_id: teacherId };
  const enabled = mode === 'mine' || (mode === 'class' ? !!effectiveClass : !!teacherId);
  const tt = useQuery({
    queryKey: ['timetable', query, date],
    queryFn: () => api.get<TimetableData>('/schedules/timetable/', { ...query, date }),
    enabled,
    placeholderData: keepPreviousData,
  });
  const tabs = [
    ...(isTeacher ? [{ id: 'mine' as const, label: t('sched.mine') }] : []),
    { id: 'class' as const, label: t('sched.byClass') },
    { id: 'teacher' as const, label: t('sched.byTeacher') },
  ];
  return (
    <>
      <PageHeader
        title={t('sched.title')}
        subtitle={tt.data?.title}
        actions={
          <>
            <IconButton icon={ChevronLeft} label={t('sched.prevWeek')} onClick={() => setDate(shiftWeek(date, -7))} />
            <Button size="sm" onClick={() => setDate(schoolToday())}>{t('sched.thisWeek')}</Button>
            <IconButton icon={ChevronRight} label={t('sched.nextWeek')} onClick={() => setDate(shiftWeek(date, 7))} />
            <Button icon={Printer} onClick={() => window.print()}>{t('sched.print')}</Button>
          </>
        }
      />
      <Tabs tabs={tabs} value={mode} onChange={setMode} className="no-print" />
      <div className="flex gap-2 mb-3 no-print">
        {mode === 'class' && (
          <Select aria-label={t('student.classroom')} className="h-9 w-auto" value={effectiveClass ?? ''} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        {mode === 'teacher' && (
          <Select aria-label={t('assignment.teacher')} className="h-9 w-auto" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">—</option>
            {(teachers.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
          </Select>
        )}
      </div>
      <Card pad={false}>
        {!enabled ? <EmptyState /> : tt.isPending ? <Skeleton /> : tt.error ? <div className="p-4"><ErrorState error={tt.error} onRetry={() => tt.refetch()} /></div> : !tt.data.slots.length ? (
          <EmptyState title={t('sched.empty')} />
        ) : (
          <Timetable data={tt.data} show={mode === 'class' ? 'teacher' : 'classroom'} />
        )}
      </Card>
    </>
  );
}

export default function SchedulesPage() {
  return (
    <RequirePermission any={['schedule.view']}>
      <SchedulesScreen />
    </RequirePermission>
  );
}
