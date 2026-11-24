'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import {
  Badge, Card, EmptyState, ErrorState, FilterPills, Mono, Pager, PageHeader, SearchInput, Select, Skeleton, Stat, StatusPill, Table, Td, Th, Tr,
} from '@/components/ui';
import type { Applicant } from '@/features/admissions/public';
import { useI18n } from '@/i18n';
import { api, API_BASE } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface Period { id: string; name: string; status: string; academic_year_name: string; applicant_count: number; capacity_total: number | null }
const STATUS_FILTERS = ['', 'SUBMITTED', 'VERIFIED', 'ELIGIBLE', 'ACCEPTED,WAITING_LIST', 'RE_REGISTERED', 'ENROLLED', 'REJECTED', 'DRAFT'];

function ApplicantsScreen() {
  const { t, tx, locale } = useI18n();
  const router = useRouter();
  const periods = useQuery({ queryKey: ['adm', 'periods'], queryFn: () => api.get<Period[]>('/admissions/periods/') });
  const [periodId, setPeriodId] = useState('');
  const period = periods.data?.find((p) => p.id === periodId) ?? periods.data?.[0];
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [ranked, setRanked] = useState(false);
  const params = { admission_period_id: period?.id, status, q, page, ordering: ranked ? 'rank' : undefined };
  const list = useQuery({
    queryKey: ['adm', 'applicants', params],
    queryFn: ({ signal }) => api.page<Applicant>('/admissions/applicants/', params, signal),
    enabled: !!period,
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({
    queryKey: ['adm', 'stats', period?.id],
    queryFn: () => api.get<{ total: number; by_status: Record<string, number>; by_major: Record<string, number> }>(`/admissions/periods/${period!.id}/statistics/`),
    enabled: !!period,
  });
  const exportUrl = `${API_BASE}/admissions/applicants/export/?admission_period_id=${period?.id ?? ''}${status ? `&status=${status}` : ''}`;
  return (
    <>
      <PageHeader
        title={t('adm.queue')}
        subtitle={period ? `${period.name} · ${tx(`status.${period.status}`, period.status)}` : undefined}
        actions={
          <>
            <Select aria-label={t('adm.periods')} className="h-9 w-auto" value={period?.id ?? ''} onChange={(e) => { setPeriodId(e.target.value); setPage(1); }}>
              {(periods.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <a href={exportUrl} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-line-strong bg-white text-sm font-medium hover:bg-hover">
              <Download className="w-4 h-4" strokeWidth={1.5} aria-hidden /> {t('adm.export')}
            </a>
          </>
        }
      />
      {stats.data && (
        <Card pad={false} className="mb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-line">
            <Stat label={t('adm.total')} value={stats.data.total} sub={period?.capacity_total ? `${t('adm.capacity')} ${period.capacity_total}` : undefined} />
            <Stat label={tx('status.SUBMITTED', 'SUBMITTED')} value={stats.data.by_status.SUBMITTED ?? 0} />
            <Stat label={tx('status.VERIFIED', 'VERIFIED')} value={(stats.data.by_status.VERIFIED ?? 0) + (stats.data.by_status.ELIGIBLE ?? 0)} />
            <Stat label={tx('status.ACCEPTED', 'ACCEPTED')} value={(stats.data.by_status.ACCEPTED ?? 0) + (stats.data.by_status.RE_REGISTERED ?? 0)} tone="ok" />
            <Stat label={tx('status.ENROLLED', 'ENROLLED')} value={stats.data.by_status.ENROLLED ?? 0} />
          </div>
        </Card>
      )}
      <Card pad={false}>
        <div className="flex flex-col gap-2 p-3 border-b border-line">
          <div className="flex flex-col md:flex-row gap-2">
            <form className="flex-1" onSubmit={(e) => { e.preventDefault(); setQ(search); setPage(1); }}><SearchInput value={search} onChange={setSearch} /></form>
            <label className="inline-flex items-center gap-2 text-xs text-ink2"><input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} className="accent-[#0061FE]" />{t('adm.byRank')}</label>
          </div>
          <FilterPills
            options={STATUS_FILTERS.map((s) => ({ id: s, label: s ? s.split(',').map((x) => tx(`status.${x}`, x)).join(' / ') : t('common.all') }))}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
          />
        </div>
        {!period ? <EmptyState /> : list.isPending ? <Skeleton /> : list.error ? <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div> : list.data.data.length === 0 ? <EmptyState title={t('state.noResults')} /> : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t('ppdb.registrationNo')}</Th><Th>{t('common.name')}</Th><Th>{t('ppdb.birthDate')}</Th><Th>{t('ppdb.previousSchool')}</Th>
                  <Th>{t('ppdb.desiredMajor')}</Th><Th align="right">{t('adm.score')}</Th><Th align="right">{t('adm.rank')}</Th><Th>{t('common.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((a) => (
                  <Tr key={a.id} onClick={() => router.push(`/admissions/applicants/${a.id}`)}>
                    <Td mono>{a.registration_no}</Td>
                    <Td>{a.full_name}</Td>
                    <Td className="text-xs">{fmtDate(a.birth_date, locale)}</Td>
                    <Td className="text-xs text-ink2">{a.previous_school || '—'}</Td>
                    <Td>{a.desired_major_code ? <Badge mono>{a.desired_major_code}</Badge> : '—'}</Td>
                    <Td align="right" mono>{a.decision_score ?? '—'}</Td>
                    <Td align="right" mono>{a.decision_rank ?? '—'}</Td>
                    <Td><StatusPill status={a.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pager page={list.data.meta.page} totalPages={list.data.meta.total_pages} count={list.data.meta.count} pageSize={list.data.meta.page_size} onPage={setPage} />
          </>
        )}
      </Card>
      <p className="text-[11px] text-muted mt-2"><Mono className="text-[11px]">DRAFT → SUBMITTED → VERIFIED → ELIGIBLE → ACCEPTED/WAITING_LIST/REJECTED → RE_REGISTERED → ENROLLED</Mono></p>
    </>
  );
}

export default function ApplicantsPage() {
  return (
    <RequirePermission any={['admission.view']}>
      <ApplicantsScreen />
    </RequirePermission>
  );
}
