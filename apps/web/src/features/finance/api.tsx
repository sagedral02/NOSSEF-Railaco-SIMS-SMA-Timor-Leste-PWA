'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Mono, SearchInput } from '@/components/ui';
import type { StudentRow } from '@/features/students/api';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

export interface Invoice {
  id: string; invoice_no: string; student: string; student_name: string; student_no: string; academic_year: string; trimester: string | null;
  billing_period: string; issue_date: string; due_date: string; subtotal: string; discount_total: string; total: string; paid_amount: string;
  balance: string; status: string; void_reason: string; overdue: boolean;
}
export interface Allocation { id: string; payment: string; payment_no: string; payment_status: string; method: string; date: string; invoice: string; invoice_no: string; amount: string }
export interface InvoiceDetail extends Invoice {
  items: { id: string; fee_type_code: string; description: string; quantity: string; unit_amount: string; discount_amount: string; line_total: string }[];
  allocations: Allocation[];
}
export interface Payment {
  id: string; payment_no: string; student: string; student_name: string; student_no: string; payment_date: string; amount: string; method: string;
  reference_no: string; status: string; proof_file: string | null; received_by_name: string | null; verified_by_name: string | null; verified_at: string | null;
  intended_invoices: string[]; note: string; rejection_reason: string; reversal_reason: string | null; allocations: Allocation[];
  receipt: { id: string; receipt_no: string; pdf_file: string | null } | null;
}
export interface Statement {
  student_id: string; student_no: string; full_name: string; total_billed: string; total_paid: string; outstanding: string; overdue: string;
  entries: { date: string; type: string; ref: string; description: string; debit: string; credit: string; balance: string }[];
}

/** Money as integer cents (never float arithmetic on amounts). */
export const cents = (v: string | number | null | undefined) => {
  const s = String(v ?? '0').trim().replace(',', '.');
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return NaN;
  const [i, f = ''] = s.replace('-', '').split('.');
  const n = Number(i || '0') * 100 + Number((f + '00').slice(0, 2));
  return s.startsWith('-') ? -n : n;
};
export const fromCents = (n: number) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`;

export function receiptUrl(id: string) {
  return `/api/v1/finance/receipts/${id}/download/`;
}

export function useOpenInvoices(studentId?: string) {
  return useQuery({
    queryKey: ['finance', 'open-invoices', studentId],
    queryFn: () => api.page<Invoice>('/finance/invoices/', { student_id: studentId, open: 1, page_size: 100 }).then((r) => r.data),
    enabled: !!studentId,
  });
}

/** Debounced student search for cashier flows. */
export function StudentPicker({ value, onChange }: { value: StudentRow | null; onChange: (s: StudentRow | null) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const res = useQuery({
    queryKey: ['finance', 'student-search', q],
    queryFn: () => api.page<StudentRow>('/students/', { q, status: 'ACTIVE', page_size: 8 }).then((r) => r.data),
    enabled: q.trim().length >= 2,
  });
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-line px-3 py-2">
        <div><div className="text-sm font-medium">{value.full_name}</div><Mono className="text-xs text-ink2">{value.student_no} · {value.current_enrollment?.classroom_name ?? '—'}</Mono></div>
        <button type="button" className="text-xs text-accent underline" onClick={() => onChange(null)}>{t('common.edit')}</button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <SearchInput value={q} onChange={setQ} placeholder={t('fin.selectStudent')} />
      {(res.data ?? []).map((s) => (
        <button key={s.id} type="button" onClick={() => onChange(s)} className="w-full text-left px-3 py-2 rounded-md hover:bg-hover border border-transparent hover:border-line">
          <span className="text-sm">{s.full_name}</span> <Mono className="text-xs text-ink2">{s.student_no} · {s.current_enrollment?.classroom_name ?? ''}</Mono>
        </button>
      ))}
    </div>
  );
}
