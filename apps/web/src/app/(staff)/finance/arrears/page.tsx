'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { Card, Checkbox, Drawer, EmptyState, ErrorState, PageHeader, SearchInput, Select, Skeleton, Stat, Table, Td, Th, Tr } from '@/components/ui';
import { useClassrooms, useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { useAuth } from '@/features/auth/auth';
import { cents, fromCents } from '@/features/finance/api';
import { StatementView } from '@/features/finance/statement';
import { useI18n } from '@/i18n';
import { API_BASE, api } from '@/lib/api';
import { usd } from '@/lib/format';

interface Row { student_id: string; student_no: string; full_name: string; classroom: string; invoices: number; balance: string; overdue: string }

function ArrearsScreen() {
  const { t } = useI18n();
  const { can } = useAuth();
  const { year } = useSelectedYear();
  const classes = useClassrooms(year?.id).data ?? [];
  const [classroom, setClassroom] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const params = { academic_year_id: year?.id, overdue_only: overdueOnly ? 1 : undefined, classroom };
  const list = useQuery({ queryKey: ['finance', 'arrears', params], queryFn: () => api.get<Row[]>('/finance/reports/arrears/', params), enabled: !!year, placeholderData: keepPreviousData });
  const rows = (list.data ?? []).filter((r) => !q || `${r.full_name} ${r.student_no}`.toLowerCase().includes(q.toLowerCase()));
  const total = rows.reduce((a, r) => a + cents(r.balance), 0);
  const overdue = rows.reduce((a, r) => a + cents(r.overdue), 0);
  const csv = `${API_BASE}/finance/reports/arrears/?${new URLSearchParams(Object.entries({ ...params, export: 'csv' }).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`;
  return (
    <>
      <PageHeader title={t('nav.arrears')}
        actions={<>
          <YearSelect />
          <Select aria-label={t('student.classroom')} className="h-9 w-auto" value={classroom} onChange={(e) => setClassroom(e.target.value)}>
            <option value="">{t('student.classroom')}: {t('common.all')}</option>
            {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={overdueOnly} onChange={setOverdueOnly} />{t('fin.overdueOnly')}</label>
          {can('finance.export') && <a href={csv} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line bg-white text-sm hover:bg-hover"><Download className="w-4 h-4" aria-hidden />{t('fin.exportCsv')}</a>}
        </>} />
      <Card pad={false} className="mb-4">
        <div className="grid grid-cols-3 divide-x divide-line">
          <Stat label={t('nav.students')} value={rows.length} />
          <Stat label={t('fin.outstanding')} value={usd(fromCents(total))} />
          <Stat label={t('fin.overdue')} value={usd(fromCents(overdue))} tone={overdue ? 'bad' : undefined} />
        </div>
      </Card>
      <div className="mb-3"><SearchInput value={q} onChange={setQ} /></div>
      {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <Card pad={false}>
          <Table>
            <thead><tr><Th>{t('student.no')}</Th><Th>{t('common.name')}</Th><Th>{t('student.classroom')}</Th><Th align="right">{t('nav.invoices')}</Th><Th align="right">{t('fin.balance')}</Th><Th align="right">{t('fin.overdue')}</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.student_id} onClick={() => setOpen(r)}>
                  <Td mono>{r.student_no}</Td><Td className="font-medium">{r.full_name}</Td><Td>{r.classroom}</Td>
                  <Td align="right" mono>{r.invoices}</Td><Td align="right" mono>{usd(r.balance)}</Td>
                  <Td align="right" mono className={cents(r.overdue) ? 'text-bad font-semibold' : ''}>{usd(r.overdue)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {!rows.length && <EmptyState />}
        </Card>
      )}
      {open && (
        <Drawer open onClose={() => setOpen(null)} width={620} title={t('fin.statement')} subtitle={`${open.full_name} · ${open.student_no}`}>
          <StatementView studentId={open.student_id} />
        </Drawer>
      )}
    </>
  );
}

export default function ArrearsPage() {
  return (
    <RequirePermission any={['finance.view']}>
      <ArrearsScreen />
    </RequirePermission>
  );
}
