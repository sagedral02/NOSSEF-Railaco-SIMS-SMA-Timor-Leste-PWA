'use client';

// Curriculum schedule editor: weekly matrix per class, collision-checked create/end, one-date exceptions (PRD §19.3).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ResourceForm, type FieldDef } from '@/components/resource';
import { useToast } from '@/components/toast';
import { Alert, ApiErrorAlert, Badge, Button, Card, Drawer, EmptyState, IconButton, KV, Mono, PageHeader, Select, Skeleton, Table, Td, Th, Tr } from '@/components/ui';
import { useClassrooms, useSelectedYear } from '@/features/academics/api';
import { roomOptions, teacherOptions } from '@/features/academics/options';
import { YearSelect } from '@/features/academics/year-select';
import { shiftWeek, Timetable, type Bell, type Slot, type TimetableData } from '@/features/schedules/timetable';
import { useI18n, type MessageKey } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { fmtDate, schoolToday } from '@/lib/format';

interface Assignment { id: string; subject_code: string; subject_name: string; teacher_name: string }
interface ExceptionRow { id: string; date: string; exception_type: string; classroom_name: string; subject_code: string; teacher_name: string; substitute_teacher_name: string | null; new_bell_period_name: string | null; new_room_code: string | null; reason: string }

function ManageScreen() {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { year } = useSelectedYear();
  const classes = useClassrooms(year?.id).data ?? [];
  const [classId, setClassId] = useState('');
  const cls = classes.find((c) => c.id === classId) ?? classes[0];
  const [date, setDate] = useState(() => schoolToday());
  const [adding, setAdding] = useState<{ weekday: number; bell: Bell } | null>(null);
  const [assignment, setAssignment] = useState('');
  const [selected, setSelected] = useState<Slot | null>(null);
  const [exType, setExType] = useState<string>('');
  const tt = useQuery({
    queryKey: ['timetable', { classroom_id: cls?.id }, date],
    queryFn: () => api.get<TimetableData>('/schedules/timetable/', { classroom_id: cls!.id, date }),
    enabled: !!cls,
    placeholderData: keepPreviousData,
  });
  const assignments = useQuery({
    queryKey: ['assignments', cls?.id],
    queryFn: () => api.get<Assignment[]>('/teaching-assignments/', { classroom_id: cls!.id, active: 'true', page_size: 100 }),
    enabled: !!cls,
  });
  const exceptions = useQuery({
    queryKey: ['schedule-exceptions', date],
    queryFn: () => api.get<ExceptionRow[]>('/schedule-exceptions/', { date_from: shiftWeek(date, -14), date_to: shiftWeek(date, 21), page_size: 100 }),
  });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['timetable'] }); qc.invalidateQueries({ queryKey: ['schedule-exceptions'] }); };
  const body = useMemo(() => (adding ? { teaching_assignment: assignment, weekday: adding.weekday, bell_period: adding.bell.id } : null), [adding, assignment]);
  const check = useQuery({
    queryKey: ['schedule-validate', body],
    queryFn: () => api.post<{ ok: boolean; conflicts: { code: string }[] }>('/schedules/validate/', body),
    enabled: !!body?.teaching_assignment,
  });
  const create = useMutation({
    mutationFn: () => api.post('/schedules/', body),
    onSuccess: () => { invalidate(); toast(t('common.saved')); setAdding(null); setAssignment(''); },
  });
  const end = useMutation({
    mutationFn: (s: Slot) => api.patch(`/schedules/${s.entry_id}/`, { valid_until: shiftWeek(s.date, -1) < (year?.start_date ?? '') ? s.date : shiftWeek(s.date, -1) }),
    onSuccess: () => { invalidate(); toast(t('common.saved')); setSelected(null); },
    onError: (e) => toast(e instanceof ApiError ? e.message : String(e), 'error'),
  });
  const exception = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.post(`/schedules/${selected!.entry_id}/exceptions/`, {
      date: selected!.date, exception_type: exType, reason: v.reason, substitute_teacher: v.substitute_teacher || null,
      new_bell_period: v.new_bell_period || null, new_room: v.new_room || null,
    }),
    onSuccess: () => { invalidate(); toast(t('common.saved')); setSelected(null); setExType(''); },
  });
  const exFields: FieldDef[] = [
    ...(exType === 'SUBSTITUTED' ? [{ name: 'substitute_teacher', label: 'sched.substitute' as MessageKey, type: 'select' as const, required: true, optionsFrom: teacherOptions }] : []),
    ...(exType === 'MOVED' ? [
      { name: 'new_bell_period', label: 'sched.newBell' as MessageKey, type: 'select' as const, optionsFrom: { path: '/bell-periods/', query: { active: 'true' }, label: (r: Record<string, unknown>) => String(r.name) } },
      { name: 'new_room', label: 'sched.newRoom' as MessageKey, type: 'select' as const, optionsFrom: roomOptions, allowEmpty: true },
    ] : []),
    { name: 'reason', label: 'common.reason', type: 'textarea', required: true },
  ];

  return (
    <>
      <PageHeader
        title={t('nav.scheduleManage')}
        subtitle={cls?.name}
        actions={
          <>
            <YearSelect />
            <Select aria-label={t('student.classroom')} className="h-9 w-auto" value={cls?.id ?? ''} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <IconButton icon={ChevronLeft} label={t('sched.prevWeek')} onClick={() => setDate(shiftWeek(date, -7))} />
            <IconButton icon={ChevronRight} label={t('sched.nextWeek')} onClick={() => setDate(shiftWeek(date, 7))} />
          </>
        }
      />
      <Card pad={false} className="mb-4">
        {!cls ? <EmptyState /> : tt.isPending ? <Skeleton /> : tt.data ? (
          <Timetable data={tt.data} show="teacher" onSlot={(s) => { exception.reset(); setExType(''); setSelected(s); }}
            onCell={(weekday, bell) => { create.reset(); setAssignment(''); setAdding({ weekday, bell }); }}
            renderEmpty={() => <span className="flex h-full items-center justify-center text-muted opacity-0 hover:opacity-100"><Plus className="w-4 h-4" strokeWidth={1.5} aria-hidden /></span>} />
        ) : null}
      </Card>
      <Card title={t('sched.exceptions')} pad={false}>
        {exceptions.data?.length ? (
          <Table>
            <thead><tr><Th>{t('common.startDate')}</Th><Th>{t('student.classroom')}</Th><Th>{t('subject.label')}</Th><Th>{t('common.type')}</Th><Th>{t('assignment.teacher')}</Th><Th>{t('common.reason')}</Th></tr></thead>
            <tbody>
              {exceptions.data.map((x) => (
                <Tr key={x.id}>
                  <Td className="text-xs">{fmtDate(x.date, locale)}</Td><Td>{x.classroom_name}</Td><Td mono>{x.subject_code}</Td>
                  <Td><Badge>{tx(`sched.exType.${x.exception_type}`, x.exception_type)}</Badge> {x.new_bell_period_name ?? ''} {x.new_room_code ?? ''}</Td>
                  <Td className="text-xs">{x.teacher_name}{x.substitute_teacher_name && <> → <strong>{x.substitute_teacher_name}</strong></>}</Td>
                  <Td className="text-xs text-ink2">{x.reason}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState />}
      </Card>

      <Drawer open={!!adding} onClose={() => setAdding(null)} title={t('sched.addEntry')} subtitle={adding && `${t(`day.${adding.weekday}` as MessageKey)} · ${adding.bell.name}`}
        footer={<><Button onClick={() => setAdding(null)}>{t('common.cancel')}</Button><Button variant="primary" disabled={!assignment || create.isPending || check.data?.ok === false} onClick={() => create.mutate()}>{t('common.save')}</Button></>}>
        <Select aria-label={t('assignment.offering')} value={assignment} onChange={(e) => setAssignment(e.target.value)}>
          <option value="">—</option>
          {(assignments.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.subject_code} — {a.subject_name} · {a.teacher_name}</option>)}
        </Select>
        <div className="mt-3">
          {check.data?.ok && <Alert tone="ok">{t('sched.conflictFree')}</Alert>}
          {check.data && !check.data.ok && check.data.conflicts.map((c, i) => <div key={i} className="mb-2"><Alert tone="bad">{tx(`error.${c.code}`, c.code)}</Alert></div>)}
          {create.error && <ApiErrorAlert error={create.error} />}
        </div>
      </Drawer>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.subject_code} — ${selected.subject_name}` : ''} subtitle={selected && `${fmtDate(selected.date, locale)} · ${selected.bell_period}`} width={480}>
        {selected && (
          <div className="space-y-4">
            <div>
              <KV k={t('assignment.teacher')} v={selected.teacher} />
              <KV k={t('class.room')} v={<Mono>{selected.room ?? '—'}</Mono>} />
              {selected.exception && <KV k={t('common.type')} v={<Badge>{tx(`sched.exType.${selected.exception}`, selected.exception)}</Badge>} />}
            </div>
            {!selected.exception && (
              <div>
                <h4 className="text-xs font-semibold text-ink2 mb-2">{t('sched.exception')} · {fmtDate(selected.date, locale)}</h4>
                <Select aria-label={t('common.type')} value={exType} onChange={(e) => { exception.reset(); setExType(e.target.value); }}>
                  <option value="">—</option>
                  {['CANCELLED', 'MOVED', 'SUBSTITUTED'].map((x) => <option key={x} value={x}>{tx(`sched.exType.${x}`, x)}</option>)}
                </Select>
                {exType && (
                  <div className="mt-3">
                    <ResourceForm key={exType} formId="ex-form" fields={exFields} editing={false} initial={{}} error={exception.error} onSubmit={(v) => exception.mutate(v)} />
                    <div className="flex justify-end mt-3"><Button variant="primary" type="submit" form="ex-form" disabled={exception.isPending}>{t('common.save')}</Button></div>
                  </div>
                )}
              </div>
            )}
            <div className="pt-3 border-t border-line">
              <Button variant="danger" icon={CalendarX2} disabled={end.isPending} onClick={() => end.mutate(selected)}>{t('sched.endEntry')}</Button>
              {end.error && <div className="mt-2"><ApiErrorAlert error={end.error} /></div>}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

export default function ScheduleManagePage() {
  return (
    <RequirePermission any={['schedule.manage']}>
      <ManageScreen />
    </RequirePermission>
  );
}
