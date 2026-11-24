'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, EmptyState, ErrorState, Mono, Skeleton, Stat, Table, Td, Th, Tr, cx } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDate, usd } from '@/lib/format';

import { cents, type Statement } from './api';

/** Student finance ledger (PRD §25.8 student statement). */
export function StatementView({ studentId }: { studentId: string }) {
  const { t, locale } = useI18n();
  const q = useQuery({ queryKey: ['finance', 'statement', studentId], queryFn: () => api.get<Statement>(`/finance/students/${studentId}/statement/`) });
  if (q.isPending) return <Skeleton rows={4} />;
  if (q.error) return <ErrorState error={q.error} />;
  const s = q.data;
  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-line">
          <Stat label={t('fin.billed')} value={usd(s.total_billed)} />
          <Stat label={t('fin.paid')} value={usd(s.total_paid)} tone="ok" />
          <Stat label={t('fin.outstanding')} value={usd(s.outstanding)} />
          <Stat label={t('fin.overdue')} value={usd(s.overdue)} tone={cents(s.overdue) ? 'bad' : undefined} />
        </div>
      </Card>
      <Card pad={false}>
        <Table>
          <thead><tr><Th>{t('gb.date')}</Th><Th>Ref</Th><Th align="right">{t('fin.total')}</Th><Th align="right">{t('fin.paid')}</Th><Th align="right">{t('fin.balance')}</Th></tr></thead>
          <tbody>
            {s.entries.map((e, i) => (
              <Tr key={i}>
                <Td>{fmtDate(e.date, locale)}</Td>
                <Td><Mono className="text-xs">{e.ref}</Mono><div className={cx('text-xs', e.type === 'REVERSAL' ? 'text-bad' : 'text-ink2')}>{e.type} {e.description}</div></Td>
                <Td align="right" mono>{e.debit !== '0.00' ? usd(e.debit) : ''}</Td>
                <Td align="right" mono>{e.credit !== '0.00' ? usd(e.credit) : ''}</Td>
                <Td align="right" mono>{usd(e.balance)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {!s.entries.length && <EmptyState />}
      </Card>
    </div>
  );
}
