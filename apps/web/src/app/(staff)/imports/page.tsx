'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Download, Upload } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { Alert, ApiErrorAlert, Badge, Button, Card, EmptyState, Field, FilterPills, Input, Mono, PageHeader, Skeleton, StatusPill, Table, Td, Th, Tr } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useAuth } from '@/features/auth/auth';
import { useI18n } from '@/i18n';
import { API_BASE, api, fileUrl, idempotencyKey } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Job {
  id: string; import_type: string; status: string; total_rows: number; valid_rows: number; invalid_rows: number; source_name: string; error_code: string; created_at: string;
  preview: (Record<string, unknown> & { row: number; action?: string; message?: string })[];
  result: { created?: number; updated?: number; skipped?: number; errors?: number; same_file_as?: string };
  result_file: string | null;
  row_errors: { row_number: number; field_name: string; error_code: string; message: string; raw_value: string }[];
}

const TYPES: { id: string; perm: string }[] = [
  { id: 'STUDENTS', perm: 'student.create' }, { id: 'TEACHERS', perm: 'staff.manage' }, { id: 'SUBJECTS', perm: 'academic.manage_subject' },
  { id: 'LIBRARY', perm: 'library.manage_catalog' }, { id: 'ASSETS', perm: 'asset.manage' },
];

function JobView({ job, onChange }: { job: Job; onChange: (j: Job) => void }) {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useMutation({
    mutationFn: () => api.post<Job>(`/imports/${job.id}/confirm/`),
    onSuccess: (j) => { onChange(j); toast(tx(`status.${j.status}`, j.status), j.status === 'COMPLETED' ? 'ok' : 'error'); qc.invalidateQueries({ queryKey: ['imports'] }); },
  });
  const cols = Object.keys(job.preview[0] ?? {}).filter((k) => !['row', 'action', 'message'].includes(k));
  return (
    <Card title={<span>{tx(`impType.${job.import_type}`, job.import_type)} · <span className="text-ink2 font-normal">{job.source_name}</span></span>}
      actions={job.status === 'READY' && <Button variant="primary" icon={CheckCheck} disabled={confirm.isPending} onClick={() => confirm.mutate()}>{t('imp.confirm')}</Button>}>
      <div className="space-y-3">
        <ApiErrorAlert error={confirm.error} />
        <div className="flex flex-wrap gap-2 items-center">
          <StatusPill status={job.status} />
          <Badge>{t('gb.rows')}: {job.total_rows}</Badge><Badge tone="ok">{t('gb.valid')}: {job.valid_rows}</Badge><Badge tone={job.invalid_rows ? 'bad' : 'neutral'}>{t('gb.invalid')}: {job.invalid_rows}</Badge>
          {(['CREATE', 'UPDATE', 'SKIP'] as const).map((a) => { const n = job.preview.filter((r) => r.action === a).length; return n ? <Badge key={a} tone="info">{tx(`status.${a}`, a)}: {n}</Badge> : null; })}
        </div>
        {job.result.same_file_as && <Alert tone="warn">{t('imp.sameFile')}</Alert>}
        {(job.status === 'COMPLETED' || job.status === 'COMPLETED_WITH_ERRORS') && (
          <Alert tone={job.result.errors ? 'warn' : 'ok'} title={t('imp.result')} action={job.result_file ? <a className="underline" href={fileUrl(job.result_file)}>CSV</a> : undefined}>
            {t('status.CREATE')}: {job.result.created ?? 0} · {t('status.UPDATE')}: {job.result.updated ?? 0} · {t('status.SKIP')}: {job.result.skipped ?? 0} · Error: {job.result.errors ?? 0}
          </Alert>
        )}
        {job.row_errors.length > 0 && (
          <Card pad={false} className="max-h-72 overflow-auto"><Table>
            <thead><tr><Th>{t('gb.rows')}</Th><Th>Kolom</Th><Th>Error</Th><Th>Nilai</Th></tr></thead>
            <tbody>{job.row_errors.map((e, i) => <Tr key={i}><Td mono>{e.row_number}</Td><Td mono className="text-xs">{e.field_name}</Td><Td className="text-bad text-sm">{e.message} <Mono className="text-[10px] text-muted">{e.error_code}</Mono></Td><Td mono className="text-xs">{e.raw_value}</Td></Tr>)}</tbody>
          </Table></Card>
        )}
        {job.preview.length > 0 && (
          <Card pad={false} className="max-h-96 overflow-auto"><Table className="min-w-max">
            <thead><tr><Th>{t('gb.rows')}</Th><Th>{t('imp.action')}</Th>{cols.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
            <tbody>{job.preview.map((r) => (
              <Tr key={r.row}><Td mono>{r.row}</Td><Td><StatusPill status={String(r.action ?? 'CREATE')} label={tx(`status.${r.action ?? 'CREATE'}`, String(r.action))} />{r.message && <div className="text-[11px] text-ink2">{r.message}</div>}</Td>
                {cols.map((c) => <Td key={c} className="text-sm whitespace-nowrap">{r[c] == null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c])}</Td>)}</Tr>
            ))}</tbody>
          </Table></Card>
        )}
      </div>
    </Card>
  );
}

function ImportsScreen() {
  const { t, tx, locale } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const types = TYPES.filter((x) => can(x.perm, 'system.import'));
  const [type, setType] = useState(types[0]?.id ?? 'STUDENTS');
  const [job, setJob] = useState<Job | null>(null);
  const [key] = useState(idempotencyKey);
  const history = useQuery({ queryKey: ['imports', 'history'], queryFn: () => api.page<Job>('/imports/', { page_size: 20 }).then((r) => r.data) });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('import_type', type);
      form.append('file', file);
      return api.post<Job>('/imports/', form, { idempotencyKey: `${key}-${file.name}-${file.size}-${file.lastModified}` });
    },
    onSuccess: (j) => { setJob(j); qc.invalidateQueries({ queryKey: ['imports'] }); },
  });
  return (
    <>
      <PageHeader title={t('nav.imports')} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4">
          <Card title={t('imp.type')}>
            <div className="space-y-3">
              <FilterPills value={type} onChange={(v) => { setType(v); setJob(null); upload.reset(); }} options={types.map((x) => ({ id: x.id, label: tx(`impType.${x.id}`, x.id) }))} />
              <a className="inline-flex items-center gap-1.5 text-sm text-accent underline" href={`${API_BASE}/imports/template/?import_type=${type}`}><Download className="w-4 h-4" aria-hidden />{t('imp.template')}</a>
              <ApiErrorAlert error={upload.error} />
              <Field label={t('imp.upload')} hint="XLSX / CSV ≤ 15 MB">
                <Input key={type} type="file" accept=".xlsx,.csv" disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); }} />
              </Field>
              <Alert icon={Upload}>{t('imp.never')}</Alert>
            </div>
          </Card>
          <Card title={t('imp.history')} pad={false}>
            {history.isPending ? <Skeleton rows={3} /> : (history.data ?? []).length ? (history.data ?? []).map((j) => (
              <button key={j.id} type="button" onClick={() => setJob(j)} className="w-full text-left flex items-center gap-2 px-4 py-2.5 border-b border-line last:border-0 hover:bg-hover">
                <div className="flex-1 min-w-0"><div className="text-sm truncate">{tx(`impType.${j.import_type}`, j.import_type)} · {j.source_name}</div><div className="text-[11px] text-muted">{fmtDateTime(j.created_at, locale)}</div></div>
                <StatusPill status={j.status} />
              </button>
            )) : <EmptyState />}
          </Card>
        </div>
        <div className="xl:col-span-2">{job ? <JobView key={job.id} job={job} onChange={setJob} /> : <Card><p className="text-sm text-ink2">{t('imp.never')}</p></Card>}</div>
      </div>
    </>
  );
}

export default function ImportsPage() {
  return (
    <RequirePermission any={['system.import', 'student.create', 'staff.manage', 'academic.manage_subject', 'library.manage_catalog', 'asset.manage']}>
      <ImportsScreen />
    </RequirePermission>
  );
}
