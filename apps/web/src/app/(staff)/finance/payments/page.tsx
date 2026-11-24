'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, FileImage, Plus, Undo2, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { RequirePermission } from '@/components/guards';
import {
  Alert, ApiErrorAlert, Button, Card, Drawer, EmptyState, ErrorState, Field, FilterPills, Input, KV, Mono, PageHeader, Pager, ReasonDialog, SearchInput,
  Select, Skeleton, StatusPill, Table, Td, Th, Tr, cx,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { useAuth } from '@/features/auth/auth';
import { StudentPicker, cents, fromCents, receiptUrl, useOpenInvoices, type Payment } from '@/features/finance/api';
import type { StudentRow } from '@/features/students/api';
import { useI18n } from '@/i18n';
import { api, fileUrl, idempotencyKey } from '@/lib/api';
import { fmtDate, fmtDateTime, usd } from '@/lib/format';

/** Allocation editor shared by cash entry and verification: one amount per open invoice, oldest first. */
function AllocationEditor({ studentId, alloc, setAlloc }: { studentId: string; alloc: Record<string, string>; setAlloc: (a: Record<string, string>) => void }) {
  const { t, locale } = useI18n();
  const open = useOpenInvoices(studentId);
  const rows = [...(open.data ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (open.isPending) return <Skeleton rows={3} />;
  if (!rows.length) return <Alert>{t('fin.noOpen')}</Alert>;
  return (
    <Card pad={false}>
      <div className="flex justify-between items-center px-4 h-10 border-b border-line">
        <span className="text-xs font-semibold text-ink2">{t('fin.openInvoices')}</span>
        <button type="button" className="text-xs text-accent underline" onClick={() => setAlloc(Object.fromEntries(rows.map((r) => [r.id, r.balance])))}>{t('fin.payAll')}</button>
      </div>
      <Table>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td><Mono className="text-xs">{r.invoice_no}</Mono><div className={cx('text-xs', r.overdue ? 'text-bad' : 'text-ink2')}>{r.billing_period || '—'} · {fmtDate(r.due_date, locale)}</div></Td>
              <Td align="right" mono>{usd(r.balance)}</Td>
              <Td align="right"><Input aria-label={`${t('fin.amount')} ${r.invoice_no}`} inputMode="decimal" className="h-8 w-24 text-right font-mono" value={alloc[r.id] ?? ''}
                onChange={(e) => setAlloc({ ...alloc, [r.id]: e.target.value })} placeholder="0.00" /></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

const toAllocations = (alloc: Record<string, string>) =>
  Object.entries(alloc).filter(([, v]) => cents(v) > 0).map(([invoice, v]) => ({ invoice, amount: fromCents(cents(v)) }));
const allocTotal = (alloc: Record<string, string>) => Object.values(alloc).reduce((s, v) => s + (cents(v) > 0 ? cents(v) : 0), 0);

function RecordPayment({ onClose }: { onClose: () => void }) {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [key] = useState(idempotencyKey);
  const total = allocTotal(alloc);
  const m = useMutation({
    mutationFn: () => api.post<Payment>('/finance/payments/', { student: student!.id, amount: fromCents(total), method, reference_no: reference, allocations: toAllocations(alloc) }, { idempotencyKey: key }),
    onSuccess: () => {
      toast(t('fin.saved'), 'ok');
      qc.invalidateQueries({ queryKey: ['finance'] });
      onClose();
    },
  });
  return (
    <Drawer open onClose={onClose} width={520} title={t('fin.recordPayment')}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={!student || total <= 0 || m.isPending} onClick={() => m.mutate()}>{t('common.save')} · {usd(fromCents(total))}</Button></>}>
      <div className="space-y-3">
        <ApiErrorAlert error={m.error} />
        <Field label={t('common.name')} required><StudentPicker value={student} onChange={(s) => { setStudent(s); setAlloc({}); }} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fin.method')} required>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>{['CASH', 'BANK_TRANSFER', 'OTHER'].map((x) => <option key={x} value={x}>{tx(`method.${x}`, x)}</option>)}</Select>
          </Field>
          <Field label={t('fin.reference')}><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        </div>
        {student && <AllocationEditor studentId={student.id} alloc={alloc} setAlloc={setAlloc} />}
        <div className="flex justify-between text-sm font-semibold"><span>{t('fin.allocTotal')}</span><Mono>{usd(fromCents(total))}</Mono></div>
      </div>
    </Drawer>
  );
}

function PaymentDrawer({ p, onClose }: { p: Payment; onClose: () => void }) {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<'reject' | 'reverse' | null>(null);
  const pending = p.status === 'PENDING';
  const suggest = useQuery({ queryKey: ['finance', 'suggest', p.id], queryFn: () => api.get<{ allocations: { invoice: string; amount: string }[] }>(`/finance/payments/${p.id}/suggest/`), enabled: pending && can('finance.verify_payment') });
  const [alloc, setAlloc] = useState<Record<string, string> | null>(null);
  const current = alloc ?? Object.fromEntries((suggest.data?.allocations ?? []).map((a) => [a.invoice, a.amount]));
  const total = allocTotal(current);
  const verify = useMutation({
    mutationFn: () => api.post(`/finance/payments/${p.id}/verify/`, { allocations: toAllocations(current) }),
    onSuccess: () => { toast(t('status.VERIFIED'), 'ok'); qc.invalidateQueries({ queryKey: ['finance'] }); onClose(); },
  });
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['finance'] }); onClose(); };
  return (
    <Drawer open onClose={onClose} width={540} title={p.payment_no} subtitle={`${p.student_name} · ${p.student_no}`}
      footer={<>
        {p.receipt && <a className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line text-sm hover:bg-hover" href={receiptUrl(p.receipt.id)}><Download className="w-4 h-4" aria-hidden />{t('fin.receipt')}</a>}
        {pending && can('finance.verify_payment') && <>
          <Button icon={X} onClick={() => setDialog('reject')}>{t('fin.reject')}</Button>
          <Button variant="primary" icon={Check} disabled={verify.isPending || total !== cents(p.amount)} onClick={() => verify.mutate()}>{t('fin.verify')}</Button>
        </>}
        {p.status === 'VERIFIED' && can('finance.reverse_payment') && <Button variant="danger" icon={Undo2} onClick={() => setDialog('reverse')}>{t('fin.reverse')}</Button>}
      </>}>
      <div className="space-y-4">
        <ApiErrorAlert error={verify.error} />
        <StatusPill status={p.status} />
        {p.rejection_reason && <Alert tone="bad" title={t('fin.reject')}>{p.rejection_reason}</Alert>}
        {p.reversal_reason && <Alert tone="warn" title={t('fin.reverse')}>{p.reversal_reason}</Alert>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <KV k={t('fin.amount')} v={usd(p.amount)} mono />
          <KV k={t('fin.method')} v={tx(`method.${p.method}`, p.method)} />
          <KV k={t('gb.date')} v={fmtDateTime(p.payment_date, locale)} />
          <KV k={t('fin.reference')} v={p.reference_no || '—'} mono />
          <KV k={t('status.VERIFIED')} v={p.verified_by_name ? `${p.verified_by_name} · ${fmtDateTime(p.verified_at, locale)}` : '—'} />
          <KV k={t('fin.receipt')} v={p.receipt?.receipt_no ?? '—'} mono />
        </div>
        {p.note && <p className="text-sm text-ink2">{p.note}</p>}
        {p.proof_file && <a className="inline-flex items-center gap-1.5 text-sm text-accent underline" href={fileUrl(p.proof_file, true)} target="_blank" rel="noreferrer"><FileImage className="w-4 h-4" aria-hidden />{t('fin.proof')}</a>}
        {pending && can('finance.verify_payment') ? (
          <>
            <AllocationEditor studentId={p.student} alloc={current} setAlloc={setAlloc} />
            <div className={cx('flex justify-between text-sm font-semibold', total !== cents(p.amount) && 'text-bad')}><span>{t('fin.allocTotal')}</span><Mono>{usd(fromCents(total))} / {usd(p.amount)}</Mono></div>
            {total !== cents(p.amount) && <p className="text-xs text-bad">{t('fin.allocMismatch')}</p>}
          </>
        ) : (
          <Card title={t('fin.allocations')} pad={false}>
            {p.allocations.length ? <Table><tbody>{p.allocations.map((a) => <Tr key={a.id}><Td mono>{a.invoice_no}</Td><Td align="right" mono>{usd(a.amount)}</Td></Tr>)}</tbody></Table> : <EmptyState />}
          </Card>
        )}
      </div>
      <ReasonDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title={t('fin.reject')} confirmLabel={t('fin.reject')} danger
        onConfirm={async (reason) => { await api.post(`/finance/payments/${p.id}/reject/`, { reason }); await refresh(); }} />
      <ReasonDialog open={dialog === 'reverse'} onClose={() => setDialog(null)} title={t('fin.reverse')} description={t('fin.reverseHint')} confirmLabel={t('fin.reverse')} danger
        onConfirm={async (reason) => { await api.post(`/finance/payments/${p.id}/reverse/`, { reason }); await refresh(); }} />
    </Drawer>
  );
}

function PaymentsScreen() {
  const { t, tx, locale } = useI18n();
  const { can } = useAuth();
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [method, setMethod] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Payment | null>(null);
  const [recording, setRecording] = useState(false);
  const params = { status, method, q, page };
  const list = useQuery({
    queryKey: ['finance', 'payments', params],
    queryFn: ({ signal }) => api.page<Payment>('/finance/payments/', params, signal),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title={t('nav.payments')} actions={can('finance.receive_payment') && <Button variant="primary" icon={Plus} onClick={() => setRecording(true)}>{t('fin.recordPayment')}</Button>} />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <FilterPills value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { id: '', label: t('common.all') }, { id: 'PENDING', label: t('fin.pendingVerify') }, { id: 'VERIFIED', label: t('status.VERIFIED') },
          { id: 'REJECTED', label: t('status.REJECTED') }, { id: 'REVERSED', label: t('status.REVERSED') },
        ]} />
        <Select aria-label={t('fin.method')} className="h-9 w-auto" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}>
          <option value="">{t('fin.method')}: {t('common.all')}</option>
          {['CASH', 'BANK_TRANSFER', 'OTHER'].map((x) => <option key={x} value={x}>{tx(`method.${x}`, x)}</option>)}
        </Select>
        <SearchInput className="md:ml-auto md:w-72" value={q} onChange={(v) => { setQ(v); setPage(1); }} />
      </div>
      {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <Card pad={false}>
          <Table>
            <thead><tr><Th>{t('fin.payNo')}</Th><Th>{t('common.name')}</Th><Th>{t('gb.date')}</Th><Th>{t('fin.method')}</Th><Th align="right">{t('fin.amount')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>
              {list.data.data.map((p) => (
                <Tr key={p.id} onClick={() => setOpen(p)}>
                  <Td mono>{p.payment_no}</Td>
                  <Td><div className="font-medium">{p.student_name}</div><Mono className="text-xs text-ink2">{p.student_no}</Mono></Td>
                  <Td>{fmtDateTime(p.payment_date, locale)}</Td>
                  <Td>{tx(`method.${p.method}`, p.method)}{p.reference_no && <Mono className="text-xs text-ink2 ml-1">{p.reference_no}</Mono>}</Td>
                  <Td align="right" mono className={p.status === 'REVERSED' ? 'line-through text-ink2' : ''}>{usd(p.amount)}</Td>
                  <Td><StatusPill status={p.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {!list.data.data.length && <EmptyState />}
          <Pager page={list.data.meta.page} totalPages={list.data.meta.total_pages} count={list.data.meta.count} pageSize={list.data.meta.page_size} onPage={setPage} />
        </Card>
      )}
      {open && <PaymentDrawer key={open.id} p={open} onClose={() => setOpen(null)} />}
      {recording && <RecordPayment onClose={() => setRecording(false)} />}
    </>
  );
}

export default function PaymentsPage() {
  return (
    <RequirePermission any={['finance.view']}>
      <Suspense><PaymentsScreen /></Suspense>
    </RequirePermission>
  );
}
