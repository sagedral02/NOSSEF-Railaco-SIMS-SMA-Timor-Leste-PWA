'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, FilePlus2, Wand2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { RequirePermission } from '@/components/guards';
import {
  Alert, ApiErrorAlert, Badge, Button, Card, Checkbox, Drawer, EmptyState, ErrorState, Field, Input, KV, Modal, Mono, PageHeader, Pager, ReasonDialog,
  SearchInput, Select, Skeleton, StatusPill, Table, Td, Th, Tr, FilterPills,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { useAuth } from '@/features/auth/auth';
import { StudentPicker, type Invoice, type InvoiceDetail } from '@/features/finance/api';
import type { StudentRow } from '@/features/students/api';
import { useI18n } from '@/i18n';
import { api, fieldError } from '@/lib/api';
import { fmtDate, fmtDateTime, usd, schoolToday } from '@/lib/format';

interface Preview {
  period: string; totals: { create: number; skip_existing: number; no_plan: number; amount: string };
  rows: { student_id: string; student_no: string; full_name: string; classroom: string; action: string; amount?: string; discount?: string; total?: string; notes?: string[] }[];
}

function GenerateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { year } = useSelectedYear();
  const [period, setPeriod] = useState(() => schoolToday().slice(0, 7));
  const body = { academic_year: year?.id, period, fee_type: 'SPP' };
  const preview = useMutation({ mutationFn: () => api.post<Preview>('/finance/invoices/generate-preview/', body) });
  const run = useMutation({
    mutationFn: () => api.post<{ created: number; skipped: number }>('/finance/invoices/generate/', body),
    onSuccess: (r) => { toast(t('fin.generated', { created: r.created, skipped: r.skipped }), 'ok'); qc.invalidateQueries({ queryKey: ['finance'] }); preview.reset(); onClose(); },
  });
  const p = preview.data;
  return (
    <Modal open={open} onClose={onClose} size="lg" title={t('fin.generate')}
      footer={<>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button icon={Wand2} disabled={!year || preview.isPending} onClick={() => preview.mutate()}>{t('fin.preview')}</Button>
        {p && <Button variant="primary" disabled={!p.totals.create || run.isPending} onClick={() => run.mutate()}>{t('fin.execute', { count: p.totals.create })}</Button>}
      </>}>
      <div className="space-y-3">
        <ApiErrorAlert error={preview.error || run.error} />
        <Field label={t('fin.period')} required error={fieldError(preview.error, 'period')}>
          <Input type="month" value={period} onChange={(e) => { setPeriod(e.target.value); preview.reset(); }} />
        </Field>
        {p && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge tone="ok">{t('fin.toCreate')}: {p.totals.create}</Badge>
              <Badge>{t('fin.exists')}: {p.totals.skip_existing}</Badge>
              <Badge tone={p.totals.no_plan ? 'bad' : 'neutral'}>{t('fin.noPlan')}: {p.totals.no_plan}</Badge>
              <Badge tone="info">{t('fin.total')}: {usd(p.totals.amount)}</Badge>
            </div>
            <Card pad={false} className="max-h-80 overflow-auto">
              <Table>
                <thead><tr><Th>{t('common.name')}</Th><Th>{t('student.classroom')}</Th><Th align="right">{t('fin.discount')}</Th><Th align="right">{t('fin.total')}</Th><Th /></tr></thead>
                <tbody>{p.rows.map((r) => (
                  <Tr key={r.student_id}>
                    <Td><div>{r.full_name}</div><Mono className="text-xs text-ink2">{r.student_no}</Mono></Td><Td>{r.classroom}</Td>
                    <Td align="right" mono>{r.discount && r.discount !== '0.00' ? usd(r.discount) : ''}</Td><Td align="right" mono>{usd(r.total)}</Td>
                    <Td><Badge tone={r.action === 'CREATE' ? 'ok' : r.action === 'NO_PLAN' ? 'bad' : 'neutral'}>{r.action === 'CREATE' ? t('fin.toCreate') : r.action === 'NO_PLAN' ? t('fin.noPlan') : t('fin.exists')}</Badge></Td>
                  </Tr>
                ))}</tbody>
              </Table>
            </Card>
          </>
        )}
      </div>
    </Modal>
  );
}

function ManualInvoice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { year } = useSelectedYear();
  const [student, setStudent] = useState<StudentRow | null>(null);
  const types = useQuery({ queryKey: ['finance', 'fee-types'], queryFn: () => api.get<{ id: string; code: string; name: string; active: boolean }[]>('/finance/fee-types/') });
  const [form, setForm] = useState({ fee_type: '', description: '', unit_amount: '', due_date: schoolToday() });
  const feeType = form.fee_type || types.data?.find((x) => x.code !== 'SPP')?.id || '';
  const m = useMutation({
    mutationFn: () => api.post('/finance/invoices/', {
      student: student?.id, academic_year: year?.id, fee_type: feeType, due_date: form.due_date,
      items: [{ description: form.description || types.data?.find((x) => x.id === feeType)?.name, unit_amount: form.unit_amount }],
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance'] }); onClose(); },
  });
  return (
    <Drawer open={open} onClose={onClose} title={t('fin.newInvoice')} width={460}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={!student || !form.unit_amount || m.isPending} onClick={() => m.mutate()}>{t('common.save')}</Button></>}>
      <div className="space-y-3">
        <ApiErrorAlert error={m.error} />
        <Field label={t('common.name')} required><StudentPicker value={student} onChange={setStudent} /></Field>
        <Field label={t('fin.type')} required>
          <Select value={feeType} onChange={(e) => setForm({ ...form, fee_type: e.target.value })}>
            {(types.data ?? []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}
          </Select>
        </Field>
        <Field label={t('fin.items')}><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fin.amount')} required error={fieldError(m.error, 'items')}><Input inputMode="decimal" value={form.unit_amount} onChange={(e) => setForm({ ...form, unit_amount: e.target.value })} /></Field>
          <Field label={t('fin.dueDate')} required><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        </div>
      </div>
    </Drawer>
  );
}

function InvoiceDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [voiding, setVoiding] = useState(false);
  const q = useQuery({ queryKey: ['finance', 'invoice', id], queryFn: () => api.get<InvoiceDetail>(`/finance/invoices/${id}/`) });
  const inv = q.data;
  return (
    <Drawer open onClose={onClose} width={520} title={inv?.invoice_no ?? '…'} subtitle={inv ? `${inv.student_name} · ${inv.student_no}` : undefined}
      footer={inv && can('finance.generate_invoice') && inv.status === 'UNPAID' ? <Button variant="danger" icon={Ban} onClick={() => setVoiding(true)}>{t('fin.void')}</Button> : undefined}>
      {q.isPending ? <Skeleton rows={4} /> : q.error ? <ErrorState error={q.error} /> : inv && (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><StatusPill status={inv.status} />{inv.overdue && <Badge tone="bad" dot>{t('fin.overdue')}</Badge>}</div>
          {inv.void_reason && <Alert tone="warn">{inv.void_reason}</Alert>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <KV k={t('fin.period')} v={inv.billing_period || '—'} mono />
            <KV k={t('fin.dueDate')} v={fmtDate(inv.due_date, locale)} />
            <KV k={t('fin.total')} v={usd(inv.total)} mono />
            <KV k={t('fin.paid')} v={usd(inv.paid_amount)} mono />
            <KV k={t('fin.discount')} v={usd(inv.discount_total)} mono />
            <KV k={t('fin.balance')} v={usd(inv.balance)} mono />
          </div>
          <Card title={t('fin.items')} pad={false}>
            <Table><tbody>{inv.items.map((it) => (
              <Tr key={it.id}><Td><Mono className="text-xs mr-2">{it.fee_type_code}</Mono>{it.description}</Td><Td align="right" mono>{usd(it.line_total)}</Td></Tr>
            ))}</tbody></Table>
          </Card>
          <Card title={t('fin.allocations')} pad={false}>
            {inv.allocations.length ? <Table><tbody>{inv.allocations.map((a) => (
              <Tr key={a.id}><Td><Mono className="text-xs">{a.payment_no}</Mono><div className="text-xs text-ink2">{fmtDateTime(a.date, locale)} · {tx(`method.${a.method}`, a.method)}</div></Td>
                <Td><StatusPill status={a.payment_status} /></Td><Td align="right" mono className={a.payment_status === 'REVERSED' ? 'line-through text-ink2' : ''}>{usd(a.amount)}</Td></Tr>
            ))}</tbody></Table> : <EmptyState />}
          </Card>
        </div>
      )}
      <ReasonDialog open={voiding} onClose={() => setVoiding(false)} title={t('fin.void')} confirmLabel={t('fin.void')} danger
        onConfirm={async (reason) => { await api.post(`/finance/invoices/${id}/void/`, { reason }); await qc.invalidateQueries({ queryKey: ['finance'] }); }} />
    </Drawer>
  );
}

function InvoicesScreen() {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const sp = useSearchParams();
  const { year } = useSelectedYear();
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState(sp.get('billing_period') ?? '');
  const [q, setQ] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  const [manual, setManual] = useState(false);
  const params = { academic_year_id: year?.id, status, billing_period: period, q, overdue: overdue ? 1 : undefined, page };
  const list = useQuery({
    queryKey: ['finance', 'invoices', params],
    queryFn: ({ signal }) => api.page<Invoice>('/finance/invoices/', params, signal),
    enabled: !!year,
    placeholderData: keepPreviousData,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };
  return (
    <>
      <PageHeader title={t('nav.invoices')}
        actions={<>
          <YearSelect />
          {can('finance.generate_invoice') && <>
            <Button icon={FilePlus2} onClick={() => setManual(true)}>{t('fin.newInvoice')}</Button>
            <Button variant="primary" icon={Wand2} onClick={() => setGen(true)}>{t('fin.generate')}</Button>
          </>}
        </>} />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <FilterPills value={status} onChange={reset(setStatus)} options={[
          { id: '', label: t('common.all') }, { id: 'UNPAID', label: t('status.UNPAID') }, { id: 'PARTIALLY_PAID', label: t('status.PARTIALLY_PAID') },
          { id: 'PAID', label: t('status.PAID') }, { id: 'VOID', label: t('status.VOID') },
        ]} />
        <Input type="month" aria-label={t('fin.period')} className="h-9 w-auto" value={period} onChange={(e) => reset(setPeriod)(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={overdue} onChange={reset(setOverdue)} />{t('fin.overdueOnly')}</label>
        <SearchInput className="md:ml-auto md:w-72" value={q} onChange={reset(setQ)} />
      </div>
      {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <Card pad={false}>
          <Table>
            <thead><tr><Th>{t('fin.invoiceNo')}</Th><Th>{t('common.name')}</Th><Th>{t('fin.period')}</Th><Th>{t('fin.dueDate')}</Th><Th align="right">{t('fin.total')}</Th><Th align="right">{t('fin.balance')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>
              {list.data.data.map((i) => (
                <Tr key={i.id} onClick={() => setOpen(i.id)}>
                  <Td mono>{i.invoice_no}</Td>
                  <Td><div className="font-medium">{i.student_name}</div><Mono className="text-xs text-ink2">{i.student_no}</Mono></Td>
                  <Td mono>{i.billing_period || '—'}</Td>
                  <Td className={i.overdue ? 'text-bad' : ''}>{fmtDate(i.due_date, locale)}</Td>
                  <Td align="right" mono>{usd(i.total)}</Td>
                  <Td align="right" mono className={i.balance !== '0.00' && i.status !== 'VOID' ? 'font-semibold' : 'text-ink2'}>{usd(i.balance)}</Td>
                  <Td><StatusPill status={i.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {!list.data.data.length && <EmptyState />}
          <Pager page={list.data.meta.page} totalPages={list.data.meta.total_pages} count={list.data.meta.count} pageSize={list.data.meta.page_size} onPage={setPage} />
        </Card>
      )}
      {open && <InvoiceDrawer key={open} id={open} onClose={() => setOpen(null)} />}
      {gen && <GenerateDialog open onClose={() => setGen(false)} />}
      {manual && <ManualInvoice open onClose={() => setManual(false)} />}
    </>
  );
}

export default function InvoicesPage() {
  return (
    <RequirePermission any={['finance.view']}>
      <Suspense><InvoicesScreen /></Suspense>
    </RequirePermission>
  );
}
