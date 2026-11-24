'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Award, CreditCard, Crown, Download, Plus, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ResourceForm, type FieldDef } from '@/components/resource';
import { useToast } from '@/components/toast';
import {
  Avatar, Badge, Button, Card, Drawer, EmptyState, ErrorState, MobileRow, Mono, Pager, PageHeader, SearchInput, Select, Skeleton, StatusPill,
  Table, Tabs, Td, Th, Tr,
} from '@/components/ui';
import { useClassrooms, useGradeLevels, useMajors, useSelectedYear } from '@/features/academics/api';
import { classOptions } from '@/features/academics/options';
import { YearSelect } from '@/features/academics/year-select';
import { useAuth } from '@/features/auth/auth';
import { studentKeys, type StudentDetail, type StudentRow } from '@/features/students/api';
import { IdCardModal } from '@/features/students/id-card';
import { useI18n } from '@/i18n';
import { api, API_BASE } from '@/lib/api';
import { fmtDate } from '@/lib/format';

const STATUSES = ['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'LEFT', 'INACTIVE'];
const ARCHIVED = ['GRADUATED', 'TRANSFERRED', 'LEFT', 'INACTIVE'];

// Directory views (ui.md SCREEN-05); the API filters by `view`.
type View = 'active' | 'scholarship' | 'president' | 'archive';

function StudentsScreen() {
  const { t, tx, locale } = useI18n();
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { year } = useSelectedYear();
  const classes = useClassrooms(year?.id).data ?? [];
  const grades = useGradeLevels().data ?? [];
  const majors = useMajors().data ?? [];
  const [f, setF] = useState({ classroom_id: '', grade_level_id: '', major_id: '', status: 'ACTIVE' });
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>('active');
  // Bulk selection (ui.md §2.1 contextual action bar); ids are re-authorized server-side.
  const [selected, setSelected] = useState<Map<string, StudentRow>>(new Map());
  const [cards, setCards] = useState(false);
  const [creating, setCreating] = useState(false);
  const params = { ...f, q, page, view: view === 'active' ? undefined : view, academic_year_id: f.status === 'ACTIVE' ? year?.id : undefined };
  const views: { id: View; label: string; icon: typeof Users }[] = [
    { id: 'active', label: t('student.view.active'), icon: Users },
    ...(can('finance.view') || can('student.export') ? [{ id: 'scholarship' as const, label: t('student.view.scholarship'), icon: Award }] : []),
    { id: 'president', label: t('student.view.president'), icon: Crown },
    { id: 'archive', label: t('student.view.archive'), icon: Archive },
  ];
  const changeView = (v: View) => { setView(v); setPage(1); setF({ ...f, status: v === 'archive' ? '' : 'ACTIVE' }); };
  const list = useQuery({
    queryKey: studentKeys.list(params),
    queryFn: ({ signal }) => api.page<StudentRow>('/students/', params, signal),
    placeholderData: keepPreviousData,
  });
  const toggle = (r: StudentRow) => setSelected((m) => { const n = new Map(m); if (n.has(r.id)) n.delete(r.id); else n.set(r.id, r); return n; });
  const pageRows = list.data?.data ?? [];
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const togglePage = () => setSelected((m) => { const n = new Map(m); pageRows.forEach((r) => (allOnPage ? n.delete(r.id) : n.set(r.id, r))); return n; });
  const bulkExportUrl = `${API_BASE}/students/export/?ids=${[...selected.keys()].join(',')}`;
  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.post<StudentDetail>('/students/', { ...v, classroom: v.classroom || null, admission_date: v.admission_date || undefined }),
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ['students'] }); toast(t('common.saved')); setCreating(false); router.push(`/students/${s.id}`); },
  });
  const fields: FieldDef[] = [
    { name: 'full_name', label: 'common.name', required: true, span: 2 },
    { name: 'birth_place', label: 'ppdb.birthPlace' },
    { name: 'birth_date', label: 'ppdb.birthDate', type: 'date', required: true },
    { name: 'gender', label: 'common.gender', type: 'select', options: [{ value: 'M', label: t('gender.M') }, { value: 'F', label: t('gender.F') }] },
    { name: 'national_student_no', label: 'student.nationalNo', mono: true },
    { name: 'phone', label: 'common.phone' },
    { name: 'email', label: 'common.email', type: 'email' },
    { name: 'address', label: 'ppdb.address', type: 'textarea' },
    { name: 'admission_date', label: 'student.admissionDate', type: 'date' },
    { name: 'classroom', label: 'student.classroom', type: 'select', optionsFrom: classOptions(year?.id), allowEmpty: true },
  ];
  const setFilter = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const exportUrl = `${API_BASE}/students/export/?${new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== 'page') as [string, string][])}`;
  return (
    <>
      <PageHeader
        title={t('student.directory')}
        actions={
          <>
            <YearSelect />
            {can('student.export') && <a href={exportUrl} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-line-strong bg-white text-sm font-medium hover:bg-hover"><Download className="w-4 h-4" strokeWidth={1.5} aria-hidden />CSV</a>}
            {can('student.create') && <Button variant="primary" icon={Plus} onClick={() => { create.reset(); setCreating(true); }}>{t('student.new')}</Button>}
          </>
        }
      />
      <Tabs tabs={views} value={view} onChange={changeView} />
      <Card pad={false}>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-selected border-b border-line" role="region" aria-label={t('bulk.selected', { count: selected.size })}>
            <span className="text-sm font-semibold text-accent mr-auto">{t('bulk.selected', { count: selected.size })}</span>
            <Button size="sm" icon={CreditCard} onClick={() => setCards(true)}>{t('card.print')}</Button>
            {can('student.export') && <a href={bulkExportUrl} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-strong bg-white text-xs font-medium hover:bg-hover"><Download className="w-4 h-4" strokeWidth={1.5} aria-hidden />{t('bulk.export')}</a>}
            <Button size="sm" variant="ghost" icon={X} onClick={() => setSelected(new Map())}>{t('bulk.clear')}</Button>
          </div>
        )}
        <div className="grid gap-2 p-3 border-b border-line md:grid-cols-[1fr_repeat(4,auto)]">
          <form onSubmit={(e) => { e.preventDefault(); setQ(search); setPage(1); }}><SearchInput value={search} onChange={setSearch} /></form>
          <Select aria-label={t('student.classroom')} className="h-9" value={f.classroom_id} onChange={setFilter('classroom_id')}>
            <option value="">{t('student.classroom')}: {t('common.all')}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label={t('grade.level')} className="h-9" value={f.grade_level_id} onChange={setFilter('grade_level_id')}>
            <option value="">{t('grade.level')}: {t('common.all')}</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
          </Select>
          <Select aria-label={t('major.label')} className="h-9" value={f.major_id} onChange={setFilter('major_id')}>
            <option value="">{t('major.label')}: {t('common.all')}</option>
            {majors.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
          </Select>
          <Select aria-label={t('common.status')} className="h-9" value={f.status} onChange={setFilter('status')}>
            <option value="">{t('common.status')}: {t('common.all')}</option>
            {(view === 'archive' ? ARCHIVED : STATUSES).map((s) => <option key={s} value={s}>{tx(`status.${s}`, s)}</option>)}
          </Select>
        </div>
        {list.isPending ? <Skeleton /> : list.error ? <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div> : list.data.data.length === 0 ? <EmptyState title={t('state.noResults')} /> : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead><tr><Th className="w-10"><input type="checkbox" className="w-4 h-4 accent-accent" checked={allOnPage} onChange={togglePage} aria-label={t('bulk.selectAll')} /></Th><Th>{t('student.no')}</Th><Th>{t('common.name')}</Th><Th>{t('common.gender')}</Th><Th>{t('ppdb.birthDate')}</Th><Th>{t('student.classroom')}</Th><Th>{t('common.status')}</Th></tr></thead>
                <tbody>
                  {list.data.data.map((s) => (
                    <Tr key={s.id} onClick={() => router.push(`/students/${s.id}`)} selected={selected.has(s.id)}>
                      <Td><input onClick={(e) => e.stopPropagation()} type="checkbox" className="w-4 h-4 accent-accent" checked={selected.has(s.id)} onChange={() => toggle(s)} aria-label={t('bulk.selectRow', { name: s.full_name })} /></Td>
                      <Td mono>{s.student_no}</Td>
                      <Td><span className="inline-flex items-center gap-2"><Avatar name={s.full_name} size={26} />{s.full_name}</span></Td>
                      <Td>{s.gender || '—'}</Td>
                      <Td className="text-xs">{fmtDate(s.birth_date, locale)}</Td>
                      <Td>{s.current_enrollment ? <span className="inline-flex gap-1 items-center">{s.current_enrollment.classroom_name} <Badge mono>{s.current_enrollment.major_code}</Badge></span> : '—'}</Td>
                      <Td><StatusPill status={s.status} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="md:hidden">
              {list.data.data.map((s) => (
                <MobileRow key={s.id} onClick={() => router.push(`/students/${s.id}`)} leading={<Avatar name={s.full_name} />} title={s.full_name}
                  subtitle={<><Mono className="text-[11px]">{s.student_no}</Mono> · {s.current_enrollment?.classroom_name ?? '—'}</>} trailing={<StatusPill status={s.status} />} />
              ))}
            </div>
            <Pager page={list.data.meta.page} totalPages={list.data.meta.total_pages} count={list.data.meta.count} pageSize={list.data.meta.page_size} onPage={setPage} />
          </>
        )}
      </Card>
      {cards && <IdCardModal onClose={() => setCards(false)} students={[...selected.values()].map((r) => ({ id: r.id, full_name: r.full_name, student_no: r.student_no, classroom: r.current_enrollment?.classroom_name, academic_year: r.current_enrollment?.academic_year_name }))} />}
      <Drawer open={creating} onClose={() => setCreating(false)} title={t('student.new')} width={560}
        footer={<><Button onClick={() => setCreating(false)}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="student-form" disabled={create.isPending}>{t('common.save')}</Button></>}>
        {creating && <ResourceForm formId="student-form" fields={fields} editing={false} initial={{}} error={create.error} onSubmit={(v) => create.mutate(v)} />}
      </Drawer>
    </>
  );
}

export default function StudentsPage() {
  return (
    <RequirePermission any={['student.view']}>
      <StudentsScreen />
    </RequirePermission>
  );
}
