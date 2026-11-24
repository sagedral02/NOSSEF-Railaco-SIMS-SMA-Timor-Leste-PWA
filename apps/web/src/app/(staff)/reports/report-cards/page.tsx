'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileCheck2, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import {
  Alert, ApiErrorAlert, Button, Card, Checkbox, Drawer, EmptyState, ErrorState, PageHeader, ProgressBar, ReasonDialog, Select, Skeleton,
  StatusPill, Table, Td, Textarea, Th, Tr,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { useClassrooms, useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { useAuth } from '@/features/auth/auth';
import { defaultTrimester } from '@/features/grades/api';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { ReportSnapshot, reportPdfUrl, type Readiness, type ReportCard } from '@/features/reports/report-card';
import { fmtDateTime } from '@/lib/format';

function ReviewDrawer({ r, onClose, canEdit }: { r: ReportCard; onClose: () => void; canEdit: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [note, setNote] = useState(r.homeroom_note);
  const save = useMutation({
    mutationFn: () => api.post(`/report-cards/${r.id}/review/`, { homeroom_note: note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }); onClose(); },
  });
  const editable = canEdit && (r.status === 'DRAFT' || r.status === 'REVIEWED');
  return (
    <Drawer open onClose={onClose} width={560} title={r.student_name} subtitle={`${r.student_no} · ${r.classroom} · T${r.trimester_number} · ${t('rc.revision')} ${r.revision_no}`}
      footer={editable ? <><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>{t('rc.reviewSave')}</Button></> : undefined}>
      <div className="space-y-4">
        <ApiErrorAlert error={save.error} />
        {r.missing.length > 0 && <Alert tone="warn" title={t('rc.missing')}>{r.missing.join(', ')}</Alert>}
        {r.reopen_reason && <Alert tone="info" title={t('rc.reopen')}>{r.reopen_reason}</Alert>}
        <ReportSnapshot r={r} />
        <label className="block">
          <span className="text-xs font-semibold text-ink2">{t('rc.review')}</span>
          <Textarea className="mt-1.5" rows={4} value={note} disabled={!editable} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </Drawer>
  );
}

function ReportCardsScreen() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const { year } = useSelectedYear();
  const classes = useClassrooms(year?.id).data ?? [];
  const [classId, setClassId] = useState('');
  const [trimId, setTrimId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<ReportCard | null>(null);
  const [reopen, setReopen] = useState<ReportCard | null>(null);
  const cls = classes.find((c) => c.id === classId) ?? classes[0];
  const trimesters = year?.trimesters ?? [];
  const tr = trimesters.find((x) => x.id === trimId) ?? defaultTrimester(trimesters);
  const params = { classroom_id: cls?.id, trimester_id: tr?.id };
  const list = useQuery({
    queryKey: ['reports', 'list', cls?.id, tr?.id],
    queryFn: () => api.get<ReportCard[]>('/report-cards/', params),
    enabled: !!cls && !!tr,
    placeholderData: keepPreviousData,
  });
  const ready = useQuery({
    queryKey: ['reports', 'readiness', cls?.id, tr?.id],
    queryFn: () => api.get<Readiness>('/report-cards/readiness/', params),
    enabled: !!cls && !!tr && can('report.view'),
  });
  const generate = useMutation({
    mutationFn: () => api.post('/report-cards/generate/', { classroom: cls!.id, trimester: tr!.id }),
    onSuccess: () => { toast(t('rc.generated'), 'ok'); qc.invalidateQueries({ queryKey: ['reports'] }); },
  });
  const publish = useMutation({
    mutationFn: (ids: string[]) => api.post<{ published: number }>('/report-cards/publish/', { ids }),
    onSuccess: (r) => { toast(t('rc.published', { count: r.published ?? selected.size }), 'ok'); setSelected(new Set()); qc.invalidateQueries({ queryKey: ['reports'] }); },
  });
  const rows = list.data ?? [];
  const publishable = rows.filter((r) => (r.status === 'DRAFT' || r.status === 'REVIEWED') && !r.missing.length);
  const toggle = (id: string, v: boolean) => setSelected((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });
  return (
    <>
      <PageHeader title={t('rc.title')} subtitle={cls ? `${cls.name} · ${tr?.name ?? ''}` : undefined}
        actions={<>
          <YearSelect />
          <Select aria-label={t('student.classroom')} className="h-9 w-auto" value={cls?.id ?? ''} onChange={(e) => { setClassId(e.target.value); setSelected(new Set()); }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label={t('common.trimester')} className="h-9 w-auto" value={tr?.id ?? ''} onChange={(e) => { setTrimId(e.target.value); setSelected(new Set()); }}>
            {trimesters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          {can('report.generate') && <Button icon={RefreshCw} disabled={generate.isPending || !cls} onClick={() => generate.mutate()}>{t('rc.generate')}</Button>}
          {can('report.publish') && <Button variant="primary" icon={Send} disabled={!selected.size || publish.isPending} onClick={() => publish.mutate([...selected])}>{t('rc.publishSelected')} ({selected.size})</Button>}
        </>} />
      <div className="space-y-3 mb-4">
        <ApiErrorAlert error={generate.error || publish.error} />
        {ready.data && (
          <Card>
            <div className="flex items-center gap-4">
              <FileCheck2 className="w-5 h-5 text-ink2" aria-hidden />
              <div className="flex-1">
                <div className="text-sm mb-1.5">{t('rc.readiness', { ready: ready.data.ready, total: ready.data.students })}</div>
                <ProgressBar value={ready.data.students ? (ready.data.ready / ready.data.students) * 100 : 0} tone={ready.data.ready === ready.data.students ? 'ok' : 'warn'} />
              </div>
            </div>
          </Card>
        )}
      </div>
      {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <Card pad={false}>
          <Table>
            <thead>
              <tr>
                <Th className="w-10">{can('report.publish') && <Checkbox label={t('common.all')} checked={!!publishable.length && publishable.every((r) => selected.has(r.id))} indeterminate={selected.size > 0 && selected.size < publishable.length}
                  onChange={(v) => setSelected(v ? new Set(publishable.map((r) => r.id)) : new Set())} />}</Th>
                <Th>{t('student.no')}</Th><Th>{t('common.name')}</Th><Th align="right">{t('rc.average')}</Th><Th>{t('common.status')}</Th><Th>{t('rc.revision')}</Th><Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canPick = publishable.includes(r);
                return (
                  <Tr key={r.id} onClick={() => setOpen(r)} selected={selected.has(r.id)}>
                    <Td>{can('report.publish') && canPick && <span onClick={(e) => e.stopPropagation()}><Checkbox label={r.student_name} checked={selected.has(r.id)} onChange={(v) => toggle(r.id, v)} /></span>}</Td>
                    <Td mono>{r.student_no}</Td>
                    <Td><div className="font-medium">{r.student_name}</div>{r.missing.length > 0 && <div className="text-xs text-warn">{t('rc.missing')}: {r.missing.length}</div>}</Td>
                    <Td align="right" mono>{r.snapshot.average ?? '—'}</Td>
                    <Td><StatusPill status={r.status} />{r.published_at && <div className="text-[11px] text-ink2 mt-0.5">{fmtDateTime(r.published_at, locale)}</div>}</Td>
                    <Td mono>{r.revision_no}</Td>
                    <Td>
                      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        {r.status === 'PUBLISHED' && <a className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-line text-xs hover:bg-hover" href={reportPdfUrl(r.id)}><Download className="w-3.5 h-3.5" aria-hidden />{t('rc.download')}</a>}
                        {r.status === 'PUBLISHED' && can('report.reopen') && <Button size="sm" icon={RotateCcw} onClick={() => setReopen(r)}>{t('rc.reopen')}</Button>}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          {!rows.length && <EmptyState title={can('report.generate') ? t('rc.generate') : undefined} />}
        </Card>
      )}
      {open && <ReviewDrawer key={open.id} r={open} onClose={() => setOpen(null)} canEdit={can('report.generate')} />}
      <ReasonDialog open={!!reopen} onClose={() => setReopen(null)} title={t('rc.reopen')} confirmLabel={t('rc.reopen')} danger
        onConfirm={async (reason) => { await api.post(`/report-cards/${reopen!.id}/reopen/`, { reason }); await qc.invalidateQueries({ queryKey: ['reports'] }); }} />
    </>
  );
}

export default function ReportCardsPage() {
  return (
    <RequirePermission any={['report.view', 'report.generate']}>
      <ReportCardsScreen />
    </RequirePermission>
  );
}
