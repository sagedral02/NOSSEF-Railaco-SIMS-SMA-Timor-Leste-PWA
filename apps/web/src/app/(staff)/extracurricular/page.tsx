'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ResourceForm } from '@/components/resource';
import {
  ApiErrorAlert, Badge, Button, Card, Drawer, EmptyState, ErrorState, Field, Input, Mono, PageHeader, ProgressBar, Skeleton, StatusPill, Table, Tabs, Td,
  Th, Tr, cx,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { useSelectedYear } from '@/features/academics/api';
import { teacherOptions } from '@/features/academics/options';
import { YearSelect } from '@/features/academics/year-select';
import { useAuth } from '@/features/auth/auth';
import { StudentSearchField } from '@/features/students/student-field';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDate, schoolToday } from '@/lib/format';

const CATEGORIES = ['LEADERSHIP', 'PASTORAL', 'DRUM_BAND', 'SPORTS', 'ACADEMIC', 'OTHER'] as const;

interface Activity { id: string; name: string; category: string; description: string; schedule_text: string; advisor_teacher: string | null; advisor_name: string | null; capacity: number | null; active: boolean; members: number; waitlist: number; can_manage: boolean }
interface Member { id: string; student: string; student_name: string; student_no: string; joined_at: string; left_at: string | null; status: string; role: string; note: string }

function ActivityDrawer({ a, onClose }: { a: Activity; onClose: () => void }) {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'members' | 'attendance'>('members');
  const [student, setStudent] = useState<string | null>(null);
  const [date, setDate] = useState(() => schoolToday());
  const [marks, setMarks] = useState<Record<string, string>>({});
  const members = useQuery({ queryKey: ['ekskul', 'members', a.id], queryFn: () => api.get<Member[]>(`/extracurricular/activities/${a.id}/members/`) });
  const att = useQuery({
    queryKey: ['ekskul', 'att', a.id, date],
    queryFn: () => api.get<{ student: string; status: string }[]>(`/extracurricular/activities/${a.id}/attendance/`, { date }),
    enabled: tab === 'attendance',
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['ekskul'] });
  const add = useMutation({ mutationFn: () => api.post(`/extracurricular/activities/${a.id}/members/`, { student }), onSuccess: () => { setStudent(null); refresh(); } });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/extracurricular/members/${id}/`, { status }), onSuccess: refresh });
  const active = (members.data ?? []).filter((m) => m.status === 'ACTIVE');
  const server = Object.fromEntries((att.data ?? []).map((r) => [r.student, r.status]));
  const current = (sid: string) => marks[sid] ?? server[sid] ?? '';
  const save = useMutation({
    mutationFn: () => api.post(`/extracurricular/activities/${a.id}/attendance/`, { date, records: active.filter((m) => current(m.student)).map((m) => ({ student: m.student, status: current(m.student) })) }),
    onSuccess: () => { toast(t('common.saved'), 'ok'); setMarks({}); refresh(); },
  });
  return (
    <Drawer open onClose={onClose} width={620} title={a.name} subtitle={`${a.schedule_text || '—'} · ${a.advisor_name ?? '—'}`}>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'members', label: t('ek.members'), count: a.members }, { id: 'attendance', label: t('ek.attendance') }]} />
      <ApiErrorAlert error={add.error || setStatus.error || save.error} />
      {tab === 'members' ? (
        <div className="space-y-3">
          {a.can_manage && a.active && (
            <div className="flex gap-2 items-start">
              <div className="flex-1"><StudentSearchField value={student} onChange={setStudent} /></div>
              <Button variant="primary" icon={Plus} disabled={!student || add.isPending} onClick={() => add.mutate()}>{t('ek.addMember')}</Button>
            </div>
          )}
          {members.isPending ? <Skeleton rows={4} /> : (
            <Card pad={false}>
              <Table>
                <thead><tr><Th>{t('common.name')}</Th><Th>{t('ek.role')}</Th><Th>{t('student.admissionDate')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
                <tbody>{(members.data ?? []).map((m) => (
                  <Tr key={m.id}>
                    <Td><div className="font-medium">{m.student_name}</div><Mono className="text-xs text-ink2">{m.student_no}</Mono></Td>
                    <Td className="text-sm">{m.role || '—'}</Td>
                    <Td>{fmtDate(m.joined_at, locale)}{m.left_at && ` – ${fmtDate(m.left_at, locale)}`}</Td>
                    <Td><StatusPill status={m.status} /></Td>
                    <Td>{a.can_manage && (m.status === 'ACTIVE' || m.status === 'WAITLIST') && (
                      <div className="flex gap-1 justify-end">
                        {m.status === 'WAITLIST' && <Button size="sm" onClick={() => setStatus.mutate({ id: m.id, status: 'ACTIVE' })}>{t('ek.activate')}</Button>}
                        {m.status === 'ACTIVE' && <Button size="sm" onClick={() => setStatus.mutate({ id: m.id, status: 'COMPLETED' })}>{t('ek.complete')}</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: m.id, status: 'WITHDRAWN' })}>{t('ek.withdraw')}</Button>
                      </div>
                    )}</Td>
                  </Tr>
                ))}</tbody>
              </Table>
              {!members.data?.length && <EmptyState />}
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={t('gb.date')}><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setMarks({}); }} /></Field>
          <Card pad={false}>
            {active.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2 border-b border-line last:border-0">
                <span className="flex-1 text-sm">{m.student_name}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={m.student_name}>
                  {['PRESENT', 'PERMITTED', 'ABSENT'].map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={current(m.student) === s} disabled={!a.can_manage}
                      onClick={() => setMarks({ ...marks, [m.student]: s })}
                      className={cx('h-8 px-2.5 rounded-md border text-xs', current(m.student) === s ? (s === 'ABSENT' ? 'bg-bad text-white border-bad' : s === 'PRESENT' ? 'bg-ok text-white border-ok' : 'bg-warn text-white border-warn') : 'border-line bg-white')}>
                      {tx(`att.status.${s}`, s === 'PRESENT' ? 'Hadir' : s === 'ABSENT' ? 'Alpa' : 'Izin')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!active.length && <EmptyState />}
          </Card>
          {a.can_manage && <div className="flex justify-end"><Button variant="primary" disabled={save.isPending || !active.length} onClick={() => save.mutate()}>{t('ek.saveAttendance')}</Button></div>}
        </div>
      )}
    </Drawer>
  );
}

function ExtracurricularScreen() {
  const { t, tx } = useI18n();
  const [category, setCategory] = useState<'' | (typeof CATEGORIES)[number]>('');
  const { can } = useAuth();
  const qc = useQueryClient();
  const { year } = useSelectedYear();
  const [open, setOpen] = useState<Activity | null>(null);
  const [editing, setEditing] = useState<Activity | 'new' | null>(null);
  const list = useQuery({ queryKey: ['ekskul', 'activities', year?.id], queryFn: () => api.get<Activity[]>('/extracurricular/activities/', { academic_year_id: year?.id }), enabled: !!year });
  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      const body = { ...v, academic_year: year?.id, capacity: v.capacity === '' || v.capacity == null ? null : v.capacity, advisor_teacher: v.advisor_teacher || null };
      return editing === 'new' ? api.post('/extracurricular/activities/', body) : api.patch(`/extracurricular/activities/${(editing as Activity).id}/`, body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ekskul'] }); setEditing(null); },
  });
  return (
    <>
      <PageHeader title={t('nav.extracurricular')} actions={<><YearSelect />{can('extracurricular.manage') && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>{t('common.create')}</Button>}</>} />
      <Tabs value={category} onChange={setCategory} tabs={[{ id: '' as const, label: t('common.all'), count: list.data?.length }, ...CATEGORIES.filter((c) => list.data?.some((a) => a.category === c)).map((c) => ({ id: c, label: tx(`ek.cat.${c}`, c), count: list.data?.filter((a) => a.category === c).length }))]} />
      {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        list.data.filter((a) => !category || a.category === category).length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.data.filter((a) => !category || a.category === category).map((a) => (
              <Card key={a.id} className={cx(!a.active && 'opacity-60')}>
                <button type="button" className="w-full text-left" onClick={() => setOpen(a)}>
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="font-display font-semibold">{a.name}</div><div className="text-xs text-ink2">{tx(`ek.cat.${a.category}`, a.category)} · {a.schedule_text || '—'}</div></div>
                    {!a.active ? <Badge>Arsip</Badge> : a.can_manage && <Badge tone="info">{t('ek.mine')}</Badge>}
                  </div>
                  <div className="text-sm text-ink2 mt-2">{t('ek.advisor')}: {a.advisor_name ?? '—'}</div>
                  <div className="flex items-center gap-2 mt-3">
                    <Users className="w-4 h-4 text-ink2" aria-hidden />
                    <ProgressBar value={a.capacity ? (a.members / a.capacity) * 100 : 0} tone={a.capacity && a.members >= a.capacity ? 'warn' : 'ok'} label={t('ek.capacity')} />
                    <Mono className="text-xs whitespace-nowrap">{a.members}/{a.capacity ?? '∞'}{a.waitlist ? ` +${a.waitlist}` : ''}</Mono>
                  </div>
                </button>
                {can('extracurricular.manage') && <div className="mt-3 flex justify-end"><Button size="sm" onClick={() => setEditing(a)}>{t('common.edit')}</Button></div>}
              </Card>
            ))}
          </div>
        ) : <EmptyState />
      )}
      {open && <ActivityDrawer key={open.id} a={open} onClose={() => setOpen(null)} />}
      <Drawer open={editing !== null} onClose={() => setEditing(null)} width={480} title={editing === 'new' ? t('common.create') : t('common.edit')}
        footer={<><Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="ekskul-form" disabled={save.isPending}>{t('common.save')}</Button></>}>
        {editing !== null && (
          <ResourceForm key={editing === 'new' ? 'new' : editing.id} formId="ekskul-form" editing={editing !== 'new'} error={save.error} onSubmit={(v) => save.mutate(v)}
            initial={editing === 'new' ? { active: true, category: category || 'OTHER' } : { ...editing }}
            fields={[
              { name: 'name', label: 'ek.activity', required: true, span: 2 },
              { name: 'category', label: 'ek.category', type: 'select', required: true, options: CATEGORIES.map((c) => ({ value: c, label: tx(`ek.cat.${c}`, c) })) },
              { name: 'schedule_text', label: 'ek.schedule' },
              { name: 'capacity', label: 'ek.capacity', type: 'number' },
              { name: 'advisor_teacher', label: 'ek.advisor', type: 'select', optionsFrom: teacherOptions, allowEmpty: true, span: 2 },
              { name: 'description', label: 'ek.note', type: 'textarea', span: 2 },
              { name: 'active', label: 'common.status', type: 'checkbox' },
            ]} />
        )}
      </Drawer>
    </>
  );
}

export default function ExtracurricularPage() {
  return (
    <RequirePermission any={['extracurricular.view']}>
      <ExtracurricularScreen />
    </RequirePermission>
  );
}
