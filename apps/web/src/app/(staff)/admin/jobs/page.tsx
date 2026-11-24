'use client';

// Background job monitor (PRD §64 /admin/jobs, ui.md SCREEN-19). Metadata only; result files download for the requester.
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { Badge, Button, Card, EmptyState, ErrorState, FilterPills, Mono, PageHeader, ProgressBar, Skeleton, StatusPill, Table, Td, Th, Tr } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, fileUrl } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface MonitorJob {
  kind: 'REPORT' | 'IMPORT'; id: string; code: string; title: string; status: string; progress_percent: number; row_count: number;
  requested_by: string; error_code: string; created_at: string; finished_at: string | null; result_file: string | null;
}

type Kind = '' | 'REPORT' | 'IMPORT';
const RUNNING = new Set(['QUEUED', 'RUNNING', 'UPLOADED', 'VALIDATING', 'IMPORTING']);
const FAILED = new Set(['FAILED']);

function JobsScreen() {
  const { t, tx, locale } = useI18n();
  const [kind, setKind] = useState<Kind>('');
  const q = useQuery({
    queryKey: ['admin', 'jobs', kind],
    queryFn: () => api.get<MonitorJob[]>('/admin/jobs/', kind ? { kind } : undefined),
    refetchInterval: (query) => (query.state.data?.some((j) => RUNNING.has(j.status)) ? 4000 : false),
  });
  return (
    <>
      <PageHeader title={t('jobs.title')} subtitle={t('jobs.subtitle')}
        actions={<Button icon={RefreshCw} onClick={() => q.refetch()} disabled={q.isFetching}>{t('jobs.refresh')}</Button>} />
      <div className="mb-3">
        <FilterPills<Kind> value={kind} onChange={setKind}
          options={[{ id: '', label: t('jobs.all') }, { id: 'REPORT', label: t('jobs.reports') }, { id: 'IMPORT', label: t('jobs.imports') }]} />
      </div>
      <Card pad={false}>
        {q.isPending ? <Skeleton /> : q.error ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !q.data.length ? <EmptyState title={t('jobs.empty')} /> : (
          <Table>
            <thead><tr><Th>{t('jobs.job')}</Th><Th>{t('jobs.requestedBy')}</Th><Th>{t('common.status')}</Th><Th>{t('jobs.progress')}</Th><Th align="right">{t('gb.rows')}</Th><Th>{t('jobs.created')}</Th><Th align="right">{t('jobs.result')}</Th></tr></thead>
            <tbody>
              {q.data.map((j) => (
                <Tr key={`${j.kind}-${j.id}`}>
                  <Td>
                    <div className="flex items-center gap-2"><Badge mono>{j.kind === 'REPORT' ? j.code : 'IMP'}</Badge><span className="text-sm">{j.kind === 'IMPORT' ? tx(`impType.${j.code}`, j.title) : j.title}</span></div>
                    {j.error_code && <Mono className="text-[11px] text-bad">{j.error_code}</Mono>}
                  </Td>
                  <Td><Mono className="text-xs">{j.requested_by}</Mono></Td>
                  <Td><StatusPill status={j.status} /></Td>
                  <Td className="min-w-[120px]"><ProgressBar value={j.progress_percent} tone={FAILED.has(j.status) ? 'bad' : RUNNING.has(j.status) ? 'accent' : 'ok'} label={`${j.progress_percent}%`} /></Td>
                  <Td align="right" mono>{j.row_count}</Td>
                  <Td className="text-xs">{fmtDateTime(j.created_at, locale)}</Td>
                  <Td align="right">
                    {j.result_file
                      ? <a href={fileUrl(j.result_file)} className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"><Download size={14} strokeWidth={1.5} />{t('jobs.download')}</a>
                      : <span className="text-muted text-xs">—</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted mt-2">{t('jobs.note')}</p>
    </>
  );
}

export default function JobsPage() {
  return <RequirePermission any={['system.view_jobs']}><JobsScreen /></RequirePermission>;
}
