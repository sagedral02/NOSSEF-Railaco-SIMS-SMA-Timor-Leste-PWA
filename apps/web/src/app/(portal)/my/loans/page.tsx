'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusPill, Table, Td, Th, Tr, cx } from '@/components/ui';
import { ChildScope } from '@/features/portal/children';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDate, usd } from '@/lib/format';

interface Loan { id: string; barcode: string; book_title: string; borrowed_at: string; due_at: string; returned_at: string | null; status: string; fine_amount: string; overdue: boolean }

function Loans({ studentId }: { studentId: string }) {
  const { t, locale } = useI18n();
  const q = useQuery({ queryKey: ['library', 'portal', studentId], queryFn: () => api.page<Loan>('/library/loans/', { student_id: studentId, page_size: 50 }).then((r) => r.data) });
  if (q.isPending) return <Card pad={false}><Skeleton rows={3} /></Card>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <Card pad={false}>
      <Table>
        <thead><tr><Th>{t('lib.title')}</Th><Th>{t('lib.borrowed')}</Th><Th>{t('lib.due')}</Th><Th>{t('common.status')}</Th></tr></thead>
        <tbody>{q.data.map((l) => (
          <Tr key={l.id}>
            <Td>{l.book_title}<div className="text-xs text-ink2 font-mono">{l.barcode}</div></Td>
            <Td>{fmtDate(l.borrowed_at, locale)}</Td>
            <Td className={cx(l.overdue && 'text-bad font-semibold')}>{fmtDate(l.due_at, locale)}</Td>
            <Td><StatusPill status={l.status} />{Number(l.fine_amount) > 0 && <div className="text-xs text-bad">{t('lib.fine')} {usd(l.fine_amount)}</div>}</Td>
          </Tr>
        ))}</tbody>
      </Table>
      {!q.data.length && <EmptyState />}
    </Card>
  );
}

export default function MyLoansPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.myLoans')} />
      <ChildScope>{(c) => <Loans studentId={c.id} />}</ChildScope>
    </>
  );
}
