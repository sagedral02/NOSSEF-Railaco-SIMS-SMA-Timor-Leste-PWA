'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ResourceForm, type FieldDef } from '@/components/resource';
import { useToast } from '@/components/toast';
import { Alert, ApiErrorAlert, Badge, Button, Card, Drawer, ErrorState, Mono, PageHeader, Skeleton, StatusPill } from '@/components/ui';
import { academicKeys, useYears, type AcademicYear, type Trimester } from '@/features/academics/api';
import { useAuth } from '@/features/auth/auth';
import { useI18n, type MessageKey } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

const YEAR_FIELDS: FieldDef[] = [
  { name: 'name', label: 'year.name', required: true, mono: true },
  { name: 'start_date', label: 'common.startDate', type: 'date', required: true },
  { name: 'end_date', label: 'common.endDate', type: 'date', required: true },
];
const TRIMESTER_FIELDS: FieldDef[] = [
  { name: 'number', label: 'trimester.number', type: 'select', required: true, createOnly: true, options: [1, 2, 3].map((n) => ({ value: String(n), label: `Trimestre ${n} · CAU ${n}` })) },
  { name: 'start_date', label: 'common.startDate', type: 'date', required: true },
  { name: 'end_date', label: 'common.endDate', type: 'date', required: true },
  { name: 'grade_entry_start', label: 'trimester.gradeEntryStart', type: 'datetime' },
  { name: 'grade_entry_end', label: 'trimester.gradeEntryEnd', type: 'datetime' },
];
const NEXT: Record<string, string> = { DRAFT: 'ACTIVE', ACTIVE: 'GRADING', GRADING: 'CLOSED' };

function toIso(v: unknown) {
  return typeof v === 'string' && v.length === 16 ? new Date(v).toISOString() : v || null;
}

function Readiness({ year }: { year: AcademicYear }) {
  const { tx } = useI18n();
  const q = useQuery({
    queryKey: ['academic', 'readiness', year.id, year.trimesters.length],
    queryFn: () => api.get<{ code: string; ok: boolean; detail: string }[]>(`/academic-years/${year.id}/readiness/`),
  });
  if (!q.data) return null;
  return (
    <ul className="space-y-1.5">
      {q.data.map((c) => (
        <li key={c.code} className="flex items-start gap-2 text-sm">
          {c.ok ? <CheckCircle2 className="w-4 h-4 text-ok mt-0.5 shrink-0" strokeWidth={1.5} aria-label="OK" /> : <CircleAlert className="w-4 h-4 text-bad mt-0.5 shrink-0" strokeWidth={1.5} aria-label="FAIL" />}
          <span className="flex-1">{tx(`check.${c.code}`, c.code)} <span className="text-xs text-muted">· {c.detail}</span></span>
        </li>
      ))}
    </ul>
  );
}

function YearCard({ year, onEditYear, onEditTrimester }: { year: AcademicYear; onEditYear: () => void; onEditTrimester: (t: Trimester | 'new') => void }) {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: ['academic'] });
  const act = useMutation({
    mutationFn: (path: string) => api.post(`/academic-years/${year.id}/${path}/`),
    onSuccess: (_, path) => { refresh(); toast(t(path === 'activate' ? 'year.activated' : path === 'close' ? 'year.closed' : 'common.saved')); },
  });
  const advance = useMutation({
    mutationFn: (tr: Trimester) => api.post(`/trimestres/${tr.id}/transition/`, { target: NEXT[tr.status] }),
    onSuccess: () => { refresh(); toast(t('common.saved')); },
    onError: (e) => toast((e as ApiError).message, 'error'),
  });
  const manageYear = can('academic.manage_year');
  const manageTri = can('academic.manage_trimester');
  const readinessFailed = act.error instanceof ApiError ? (act.error.details.checks as { code: string; ok: boolean }[] | undefined) : undefined;
  return (
    <Card
      title={<span className="inline-flex items-center gap-2">{t('common.year')} <Mono className="text-base">{year.name}</Mono>{year.is_current && <Badge tone="info">{t('year.current')}</Badge>}</span>}
      actions={
        <>
          <StatusPill status={year.status} />
          {manageYear && year.status !== 'CLOSED' && <Button size="sm" variant="ghost" icon={Pencil} aria-label={t('common.edit')} onClick={onEditYear} />}
        </>
      }
    >
      <div className="text-xs text-ink2 mb-3">{fmtDate(year.start_date, locale)} — {fmtDate(year.end_date, locale)}</div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{t('year.trimesters')}</h3>
        {manageTri && year.status !== 'CLOSED' && year.trimesters.length < 3 && (
          <Button size="sm" icon={Plus} onClick={() => onEditTrimester('new')}>{t('year.addTrimester')}</Button>
        )}
      </div>
      <div className="border border-line rounded-md divide-y divide-line">
        {year.trimesters.map((tr) => (
          <div key={tr.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{tr.name} <Badge mono className="ml-1">CAU {tr.cau_number}</Badge></div>
              <div className="text-xs text-ink2">{fmtDate(tr.start_date, locale)} — {fmtDate(tr.end_date, locale)}
                {tr.grade_entry_start && <> · {t('trimester.gradeEntryStart')}: {fmtDateTime(tr.grade_entry_start, locale)}</>}
              </div>
            </div>
            <StatusPill status={tr.status} />
            {manageTri && tr.status !== 'CLOSED' && (
              <Button size="sm" variant="ghost" icon={Pencil} aria-label={t('common.edit')} onClick={() => onEditTrimester(tr)} />
            )}
            {manageTri && NEXT[tr.status] && year.status === 'ACTIVE' && (
              <Button size="sm" disabled={advance.isPending} onClick={() => advance.mutate(tr)}>{t(`trimester.to${NEXT[tr.status]}` as MessageKey)}</Button>
            )}
          </div>
        ))}
        {!year.trimesters.length && <div className="px-3 py-4 text-sm text-muted">—</div>}
      </div>
      <p className="text-[11px] text-muted mt-2">{t('year.cauNote')}</p>
      {year.status === 'DRAFT' && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">{t('year.readiness')}</h3>
          <Readiness year={year} />
        </div>
      )}
      {act.error && !readinessFailed && <div className="mt-3"><ApiErrorAlert error={act.error} /></div>}
      {readinessFailed && <div className="mt-3"><Alert tone="bad" title={t('error.ACADEMIC_YEAR_NOT_READY')} /></div>}
      {manageYear && (
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-line">
          {year.status === 'DRAFT' && <Button variant="primary" disabled={act.isPending} onClick={() => act.mutate('activate')}>{t('year.activate')}</Button>}
          {year.status === 'ACTIVE' && <Button variant="danger" disabled={act.isPending} onClick={() => act.mutate('close')}>{t('year.close')}</Button>}
          {!year.is_current && year.status !== 'CLOSED' && <Button disabled={act.isPending} onClick={() => act.mutate('make-current')}>{t('year.makeCurrent')}</Button>}
        </div>
      )}
    </Card>
  );
}

function YearsScreen() {
  const { t } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const years = useYears();
  const [editYear, setEditYear] = useState<AcademicYear | 'new' | null>(null);
  const [editTri, setEditTri] = useState<{ year: AcademicYear; tr: Trimester | 'new' } | null>(null);
  const saveYear = useMutation({
    mutationFn: (v: Record<string, unknown>) => (editYear && editYear !== 'new' ? api.patch(`/academic-years/${editYear.id}/`, v) : api.post('/academic-years/', v)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: academicKeys.years }); setEditYear(null); toast(t('common.saved')); },
  });
  const saveTri = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      const body = { ...v, number: v.number ? Number(v.number) : undefined, grade_entry_start: toIso(v.grade_entry_start), grade_entry_end: toIso(v.grade_entry_end) };
      return editTri && editTri.tr !== 'new' ? api.patch(`/trimestres/${editTri.tr.id}/`, body) : api.post('/trimestres/', { ...body, academic_year: editTri?.year.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['academic'] }); setEditTri(null); toast(t('common.saved')); },
  });
  return (
    <>
      <PageHeader
        title={t('nav.years')}
        actions={can('academic.manage_year') && <Button variant="primary" icon={Plus} onClick={() => { saveYear.reset(); setEditYear('new'); }}>{t('common.add')}</Button>}
      />
      {years.isPending ? <Card pad={false}><Skeleton /></Card> : years.error ? <ErrorState error={years.error} onRetry={() => years.refetch()} /> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {years.data.map((y) => (
            <YearCard key={y.id} year={y} onEditYear={() => { saveYear.reset(); setEditYear(y); }} onEditTrimester={(tr) => { saveTri.reset(); setEditTri({ year: y, tr }); }} />
          ))}
        </div>
      )}
      <Drawer open={editYear !== null} onClose={() => setEditYear(null)} title={t('nav.years')}
        footer={<><Button onClick={() => setEditYear(null)}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="year-form" disabled={saveYear.isPending}>{t('common.save')}</Button></>}>
        {editYear !== null && (
          <ResourceForm key={editYear === 'new' ? 'new' : editYear.id} formId="year-form" fields={YEAR_FIELDS} editing={editYear !== 'new'}
            initial={editYear === 'new' ? {} : { name: editYear.name, start_date: editYear.start_date, end_date: editYear.end_date }}
            error={saveYear.error} onSubmit={(v) => saveYear.mutate(v)} />
        )}
      </Drawer>
      <Drawer open={editTri !== null} onClose={() => setEditTri(null)} title={editTri?.tr === 'new' ? t('year.addTrimester') : editTri?.tr.name ?? ''}
        footer={<><Button onClick={() => setEditTri(null)}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="tri-form" disabled={saveTri.isPending}>{t('common.save')}</Button></>}>
        {editTri !== null && (
          <>
            <ResourceForm key={editTri.tr === 'new' ? 'new' : editTri.tr.id} formId="tri-form" fields={TRIMESTER_FIELDS} editing={editTri.tr !== 'new'}
              initial={editTri.tr === 'new' ? {} : { ...editTri.tr, grade_entry_start: editTri.tr.grade_entry_start ? toLocal(editTri.tr.grade_entry_start) : null, grade_entry_end: editTri.tr.grade_entry_end ? toLocal(editTri.tr.grade_entry_end) : null }}
              error={saveTri.error} onSubmit={(v) => saveTri.mutate(v)} />
            <p className="text-xs text-muted mt-3">{t('year.cauNote')}</p>
          </>
        )}
      </Drawer>
    </>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function YearsPage() {
  return (
    <RequirePermission any={['academic.view']}>
      <YearsScreen />
    </RequirePermission>
  );
}
