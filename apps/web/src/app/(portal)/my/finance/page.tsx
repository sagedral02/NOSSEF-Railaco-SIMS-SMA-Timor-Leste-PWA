'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useState } from 'react';

import {
  Alert, ApiErrorAlert, Button, Card, Checkbox, Drawer, EmptyState, ErrorState, Field, Input, Mono, PageHeader, Skeleton, StatusPill, Table, Tabs, Td, Th, Tr, cx,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { cents, fromCents, receiptUrl, useOpenInvoices, type Payment } from '@/features/finance/api';
import { StatementView } from '@/features/finance/statement';
import { useI18n } from '@/i18n';
import { api, fieldError, idempotencyKey } from '@/lib/api';
import { fmtDate, fmtDateTime, usd } from '@/lib/format';

interface Child { student_id: string; student_no: string; full_name: string; outstanding: string; overdue: string; open_invoices: number; pending_payments: number }

function ProofForm({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const open = useOpenInvoices(studentId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [key] = useState(idempotencyKey);
  const rows = [...(open.data ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const amount = rows.filter((r) => picked.has(r.id)).reduce((s, r) => s + cents(r.balance), 0);
  const m = useMutation({
    mutationFn: async () => {
      const stored = await api.upload(file!, 'PAYMENT_PROOF');
      return api.post<Payment>('/finance/payments/', {
        student: studentId, amount: fromCents(amount), method: 'BANK_TRANSFER', reference_no: reference, proof_file: stored.id, invoice_ids: [...picked],
      }, { idempotencyKey: key });
    },
    onSuccess: () => { toast(t('fin.proofSent'), 'ok'); qc.invalidateQueries({ queryKey: ['finance'] }); onClose(); },
  });
  return (
    <Drawer open onClose={onClose} width={480} title={t('fin.uploadProof')}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" icon={Upload} disabled={!file || amount <= 0 || m.isPending} onClick={() => m.mutate()}>{t('fin.uploadProof')} · {usd(fromCents(amount))}</Button></>}>
      <div className="space-y-3">
        <Alert>{t('fin.proofNote')}</Alert>
        <ApiErrorAlert error={m.error} />
        {open.isPending ? <Skeleton rows={3} /> : rows.length ? (
          <Card pad={false}>
            {rows.map((r) => (
              <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0 cursor-pointer">
                <Checkbox label={r.invoice_no} checked={picked.has(r.id)} onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; })} />
                <div className="flex-1"><Mono className="text-xs">{r.invoice_no}</Mono><div className={cx('text-xs', r.overdue ? 'text-bad' : 'text-ink2')}>{r.billing_period || '—'} · {fmtDate(r.due_date, locale)}</div></div>
                <Mono>{usd(r.balance)}</Mono>
              </label>
            ))}
          </Card>
        ) : <Alert>{t('fin.noOpen')}</Alert>}
        <Field label={t('fin.reference')}><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label={t('fin.proof')} required hint="PDF / JPG / PNG ≤ 5 MB" error={fieldError(m.error, 'proof_file')}>
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </div>
    </Drawer>
  );
}

function ChildFinance({ child }: { child: Child }) {
  const { t, tx, locale } = useI18n();
  const [tab, setTab] = useState<'statement' | 'payments'>('statement');
  const [uploading, setUploading] = useState(false);
  const payments = useQuery({
    queryKey: ['finance', 'payments', 'portal', child.student_id],
    queryFn: () => api.page<Payment>('/finance/payments/', { student_id: child.student_id, page_size: 50 }).then((r) => r.data),
    enabled: tab === 'payments',
  });
  return (
    <Card title={<span>{child.full_name} <Mono className="text-xs text-ink2 font-normal">{child.student_no}</Mono></span>}
      actions={<Button size="sm" variant="primary" icon={Upload} disabled={!child.open_invoices} onClick={() => setUploading(true)}>{t('fin.uploadProof')}</Button>}>
      {child.pending_payments > 0 && <div className="mb-3"><Alert tone="warn">{t('fin.pendingVerify')}: {child.pending_payments}</Alert></div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'statement', label: t('fin.statement') }, { id: 'payments', label: t('nav.payments') }]} />
      {tab === 'statement' ? <StatementView studentId={child.student_id} /> : payments.isPending ? <Skeleton rows={3} /> : payments.error ? <ErrorState error={payments.error} /> : (
        payments.data.length ? (
          <Table>
            <thead><tr><Th>{t('fin.payNo')}</Th><Th>{t('gb.date')}</Th><Th>{t('fin.method')}</Th><Th align="right">{t('fin.amount')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
            <tbody>{payments.data.map((p) => (
              <Tr key={p.id}>
                <Td mono>{p.payment_no}</Td><Td>{fmtDateTime(p.payment_date, locale)}</Td><Td>{tx(`method.${p.method}`, p.method)}</Td>
                <Td align="right" mono>{usd(p.amount)}</Td>
                <Td><StatusPill status={p.status} />{p.rejection_reason && <div className="text-xs text-bad mt-0.5">{p.rejection_reason}</div>}</Td>
                <Td>{p.receipt && p.status === 'VERIFIED' && <a className="text-xs text-accent underline" href={receiptUrl(p.receipt.id)}>{t('fin.receipt')}</a>}</Td>
              </Tr>
            ))}</tbody>
          </Table>
        ) : <EmptyState />
      )}
      {uploading && <ProofForm studentId={child.student_id} onClose={() => setUploading(false)} />}
    </Card>
  );
}

export default function MyFinancePage() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['finance', 'my'], queryFn: () => api.get<Child[]>('/finance/my/') });
  return (
    <>
      <PageHeader title={t('nav.myFinance')} />
      {q.isPending ? <Card pad={false}><Skeleton /></Card> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.length ? (
        <div className="space-y-4">{q.data.map((c) => <ChildFinance key={c.student_id} child={c} />)}</div>
      ) : <EmptyState />}
    </>
  );
}
