'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileBarChart2, Play, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { Alert, ApiErrorAlert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, FilterPills, Input, Mono, PageHeader, Select, Skeleton, StatusPill, Table, Td, Th, Tr, cx } from '@/components/ui';
import { useClassrooms, useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { useMyAssignments } from '@/features/grades/api';
import { StudentSearchField } from '@/features/students/student-field';
import { useI18n } from '@/i18n';
import { api, fileUrl } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Rep { code: string; title: string; domain: string; params: string[]; formats: string[]; pii: boolean }
interface Job { id: string; report_type: string; title: string; format: string; status: string; row_count: number; result_file: string | null; error_code: string; created_at: string; finished_at: string | null }

function ParamInput({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const { tx } = useI18n();
  const { year } = useSelectedYear();
  const classes = useClassrooms(year?.id).data ?? [];
  const tas = useMyAssignments(year?.id).data ?? [];
  const teachers = useQuery({ queryKey: ['options', 'teachers-rep'], queryFn: () => api.get<{ id: string; full_name: string }[]>('/staff/teachers/', { employment_status: 'ACTIVE', page_size: 100 }), enabled: name === 'teacher_id' }).data ?? [];
  const periods = useQuery({ queryKey: ['options', 'adm-periods'], queryFn: () => api.get<{ id: string; name: string }[]>('/admissions/periods/', { page_size: 100 }), enabled: name === 'admission_period_id' }).data ?? [];
  const label = tx(`param.${name}`, name);
  if (name === 'academic_year_id') return null; // taken from the year selector in the header
  const sel = (opts: { value: string; label: string }[]) => (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
  );
  let control;
  switch (name) {
    case 'classroom_id': control = sel(classes.map((c) => ({ value: c.id, label: c.name }))); break;
    case 'trimester_id': control = sel((year?.trimesters ?? []).map((x) => ({ value: x.id, label: x.name }))); break;
    case 'teacher_id': control = sel(teachers.map((x) => ({ value: x.id, label: x.full_name }))); break;
    case 'teaching_assignment_id': control = sel(tas.map((x) => ({ value: x.id, label: `${x.classroom} · ${x.subject_code}` }))); break;
    case 'admission_period_id': control = sel(periods.map((x) => ({ value: x.id, label: x.name }))); break;
    case 'student_id': control = <StudentSearchField value={value || null} onChange={(v) => onChange(v ?? '')} />; break;
    case 'date': case 'date_from': case 'date_to': control = <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />; break;
    case 'overdue_only': return <label className="flex items-center gap-2 text-sm h-10 mt-5"><Checkbox checked={value === 'true'} onChange={(v) => onChange(v ? 'true' : '')} />{label}</label>;
    case 'method': control = sel(['CASH', 'BANK_TRANSFER', 'OTHER'].map((m) => ({ value: m, label: tx(`method.${m}`, m) }))); break;
    default: control = <Input value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return <Field label={label}>{control}</Field>;
}

function Runner({ rep, onDone }: { rep: Rep; onDone: () => void }) {
  const { t } = useI18n();
  const { year } = useSelectedYear();
  const [params, setParams] = useState<Record<string, string>>({});
  const [format, setFormat] = useState(rep.formats.includes('XLSX') ? 'XLSX' : rep.formats[0]);
  const run = useMutation({
    mutationFn: () => api.post<Job>('/reports/jobs/', { report_type: rep.code, format, parameters: { ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), academic_year_id: year?.id } }),
    onSuccess: onDone,
  });
  return (
    <Card title={<span><Mono className="text-xs mr-2">{rep.code}</Mono>{rep.title}</span>}>
      <div className="space-y-3">
        <ApiErrorAlert error={run.error} />
        {rep.pii && <Alert tone="warn" icon={ShieldAlert}>{t('rep.pii')}</Alert>}
        <div className="grid gap-3 md:grid-cols-2">
          {rep.params.map((p) => <ParamInput key={p} name={p} value={params[p] ?? ''} onChange={(v) => setParams({ ...params, [p]: v })} />)}
        </div>
        <div className="flex items-end gap-3">
          <Field label={t('rep.format')} className="w-40">
            <Select value={format} onChange={(e) => setFormat(e.target.value)}>{rep.formats.map((f) => <option key={f} value={f}>{f}</option>)}</Select>
          </Field>
          <Button variant="primary" icon={Play} disabled={run.isPending} onClick={() => run.mutate()}>{t('rep.run')}</Button>
        </div>
      </div>
    </Card>
  );
}

function ReportsScreen() {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const [domain, setDomain] = useState('');
  const [pick, setPick] = useState<Rep | null>(null);
  const catalog = useQuery({ queryKey: ['reports', 'catalog'], queryFn: () => api.get<Rep[]>('/reports/catalog/') });
  const jobs = useQuery({
    queryKey: ['reports', 'jobs'],
    queryFn: () => api.page<Job>('/reports/jobs/', { page_size: 20 }).then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING') ? 2000 : false),
  });
  const reps = (catalog.data ?? []).filter((r) => !domain || r.domain === domain);
  const domains = [...new Set((catalog.data ?? []).map((r) => r.domain))];
  return (
    <>
      <PageHeader title={t('nav.reports')} actions={<YearSelect />} />
      {catalog.isPending ? <Card pad={false}><Skeleton /></Card> : catalog.error ? <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} /> : (
        <div className="grid gap-4 xl:grid-cols-5">
          <div className="xl:col-span-2 space-y-3">
            <FilterPills value={domain} onChange={setDomain} options={[{ id: '', label: t('common.all') }, ...domains.map((d) => ({ id: d, label: d }))]} />
            <Card pad={false}>
              {reps.map((r) => (
                <button key={r.code} type="button" onClick={() => setPick(r)} className={cx('w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0 hover:bg-hover', pick?.code === r.code && 'bg-selected')}>
                  <FileBarChart2 className="w-4 h-4 text-ink2" strokeWidth={1.5} aria-hidden />
                  <Mono className="text-xs w-14">{r.code}</Mono>
                  <span className="flex-1 text-sm">{r.title}</span>
                  {r.pii && <Badge tone="warn">PII</Badge>}
                </button>
              ))}
              {!reps.length && <EmptyState />}
            </Card>
          </div>
          <div className="xl:col-span-3 space-y-4">
            {pick ? <Runner key={pick.code} rep={pick} onDone={() => qc.invalidateQueries({ queryKey: ['reports', 'jobs'] })} /> : <Card><p className="text-sm text-ink2">{t('rep.catalog')}: {catalog.data.length}</p></Card>}
            <Card title={t('rep.jobs')} pad={false}>
              <Table>
                <thead><tr><Th>{t('common.name')}</Th><Th>{t('rep.format')}</Th><Th align="right">{t('rep.rows')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
                <tbody>{(jobs.data ?? []).map((j) => (
                  <Tr key={j.id}>
                    <Td><Mono className="text-xs mr-2">{j.report_type}</Mono>{j.title}<div className="text-[11px] text-muted">{fmtDateTime(j.created_at, locale)}</div></Td>
                    <Td mono>{j.format}</Td>
                    <Td align="right" mono>{j.row_count}</Td>
                    <Td><StatusPill status={j.status} />{j.error_code && <div className="text-xs text-bad">{tx(`error.${j.error_code}`, j.error_code)}</div>}</Td>
                    <Td>{j.result_file && <a href={fileUrl(j.result_file)} className="inline-flex items-center gap-1 text-sm text-accent underline"><Download className="w-4 h-4" aria-hidden />{j.format}</a>}</Td>
                  </Tr>
                ))}</tbody>
              </Table>
              {!jobs.data?.length && <EmptyState />}
              <p className="px-4 py-2 text-[11px] text-muted">{t('rep.expiresHint')}</p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

export default function ReportsPage() {
  return (
    <RequirePermission any={['report.view', 'student.view', 'attendance.view', 'finance.view', 'academic.view', 'assessment.view', 'library.view', 'asset.view', 'admission.view', 'counseling.view', 'extracurricular.view']}>
      <ReportsScreen />
    </RequirePermission>
  );
}
