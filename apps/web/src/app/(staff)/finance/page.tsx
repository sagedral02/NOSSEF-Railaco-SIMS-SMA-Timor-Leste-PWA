'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { RequirePermission } from '@/components/guards';
import { Card, EmptyState, ErrorState, Mono, PageHeader, ProgressBar, Skeleton, Stat, Table, Td, Th, Tr } from '@/components/ui';
import { useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { cents } from '@/features/finance/api';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDate, usd } from '@/lib/format';

interface Summary {
  academic_year: string | null;
  totals: { billed: string; collected: string; outstanding: string; overdue: string; overdue_students: number };
  pending_verifications: number;
  periods: { billing_period: string; total: string; paid: string; balance: string; invoices: number; paid_count: number }[];
  by_method: { method: string; total: string; count: number }[];
  daily: { day: string; total: string; count: number }[];
  cashier_today: { user: string; method: string; total: string; count: number }[];
  discounts: { discounts_active: number; scholarships_active: number; discount_total: string };
}

function Dashboard() {
  const { t, tx, locale } = useI18n();
  const { year } = useSelectedYear();
  const q = useQuery({ queryKey: ['finance', 'summary', year?.id], queryFn: () => api.get<Summary>('/finance/reports/summary/', { academic_year_id: year?.id }), enabled: !!year });
  const s = q.data;
  const rate = s && cents(s.totals.billed) ? (cents(s.totals.collected) / cents(s.totals.billed)) * 100 : 0;
  const maxDay = Math.max(1, ...(s?.daily ?? []).map((d) => cents(d.total)));
  return (
    <>
      <PageHeader title={t('nav.finance')} subtitle={s?.academic_year ? `${t('common.year')} ${s.academic_year}` : undefined} actions={<YearSelect />} />
      {q.isPending ? <Card pad={false}><Skeleton /></Card> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : s && (
        <div className="space-y-4">
          <Card pad={false}>
            <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-line">
              <Stat label={t('fin.billed')} value={usd(s.totals.billed)} />
              <Stat label={t('fin.collected')} value={usd(s.totals.collected)} tone="ok" sub={`${rate.toFixed(1)}%`} />
              <Stat label={t('fin.outstanding')} value={usd(s.totals.outstanding)} href="/finance/arrears" />
              <Stat label={t('fin.overdue')} value={usd(s.totals.overdue)} tone={cents(s.totals.overdue) ? 'bad' : undefined} sub={`${s.totals.overdue_students} ${t('nav.students').toLowerCase()}`} href="/finance/arrears" />
              <Stat label={t('fin.pendingVerify')} value={s.pending_verifications} tone={s.pending_verifications ? 'bad' : 'ok'} href="/finance/payments?status=PENDING" />
            </div>
          </Card>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card title={t('fin.collectionRate')} pad={false} className="xl:col-span-2">
              <Table>
                <thead><tr><Th>{t('fin.period')}</Th><Th align="right">{t('fin.total')}</Th><Th align="right">{t('fin.paid')}</Th><Th align="right">{t('fin.balance')}</Th><Th className="w-48">{t('fin.collectionRate')}</Th></tr></thead>
                <tbody>
                  {s.periods.map((p) => {
                    const r = cents(p.total) ? (cents(p.paid) / cents(p.total)) * 100 : 0;
                    return (
                      <Tr key={p.billing_period}>
                        <Td mono><Link className="hover:underline" href={`/finance/invoices?billing_period=${p.billing_period}`}>{p.billing_period}</Link></Td>
                        <Td align="right" mono>{usd(p.total)}</Td><Td align="right" mono>{usd(p.paid)}</Td>
                        <Td align="right" mono className={cents(p.balance) ? 'text-bad' : ''}>{usd(p.balance)}</Td>
                        <Td><div className="flex items-center gap-2"><ProgressBar value={r} tone={r >= 90 ? 'ok' : r >= 60 ? 'warn' : 'bad'} label={t('fin.collectionRate')} /><Mono className="text-xs w-12 text-right">{r.toFixed(0)}%</Mono></div></Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
              {!s.periods.length && <EmptyState />}
            </Card>
            <div className="space-y-4">
              <Card title={t('fin.last14')}>
                <div className="flex items-end gap-1 h-28" role="img" aria-label={t('fin.last14')}>
                  {s.daily.map((d) => (
                    <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${fmtDate(d.day, locale)} · ${usd(d.total)}`}>
                      <div className="w-full rounded-t bg-accent/80" style={{ height: `${(cents(d.total) / maxDay) * 100}%` }} />
                    </div>
                  ))}
                </div>
                {!s.daily.length && <EmptyState />}
              </Card>
              <Card title={t('fin.byMethod')} pad={false}>
                {s.by_method.map((m) => (
                  <div key={m.method} className="flex justify-between px-4 py-2.5 border-b border-line last:border-0 text-sm">
                    <span>{tx(`method.${m.method}`, m.method)} <span className="text-ink2">· {m.count}</span></span><Mono>{usd(m.total)}</Mono>
                  </div>
                ))}
              </Card>
              <Card title={t('fin.cashierToday')} pad={false}>
                {s.cashier_today.length ? s.cashier_today.map((c) => (
                  <div key={`${c.user}-${c.method}`} className="flex justify-between px-4 py-2.5 border-b border-line last:border-0 text-sm">
                    <span><Mono className="text-xs">{c.user}</Mono> · {tx(`method.${c.method}`, c.method)} · {c.count}</span><Mono>{usd(c.total)}</Mono>
                  </div>
                )) : <EmptyState />}
              </Card>
              <Card title={t('nav.fees')}>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between"><span>{t('fin.discounts')}</span><Mono>{s.discounts.discounts_active}</Mono></div>
                  <div className="flex justify-between"><span>{t('fin.scholarships')}</span><Mono>{s.discounts.scholarships_active}</Mono></div>
                  <div className="flex justify-between"><span>{t('fin.discount')}</span><Mono>{usd(s.discounts.discount_total)}</Mono></div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function FinancePage() {
  return (
    <RequirePermission any={['finance.view']}>
      <Dashboard />
    </RequirePermission>
  );
}
