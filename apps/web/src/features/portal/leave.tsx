'use client';

// Portal leave request (ui.md SCREEN-22 "Ajukan Surat Izin/Sakit"); the homeroom teacher/admin reviews it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { useState } from 'react';

import { useToast } from '@/components/toast';
import { ApiErrorAlert, Button, Card, EmptyState, Field, Input, Modal, Select, Skeleton, StatusPill, Textarea } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDate, schoolToday } from '@/lib/format';

interface Leave { id: string; start_date: string; end_date: string; leave_type: string; reason: string; status: string; review_note: string }

export function LeavePanel({ studentId }: { studentId: string }) {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const today = schoolToday();
  const [f, setF] = useState({ start_date: today, end_date: today, leave_type: 'SICK', reason: '' });
  const [file, setFile] = useState<File | null>(null);
  const list = useQuery({ queryKey: ['leave', 'portal', studentId], queryFn: () => api.get<Leave[]>('/leave-requests/', { student_id: studentId }) });
  const submit = useMutation({
    mutationFn: async () => {
      const supporting_file = file ? (await api.upload(file, 'LEAVE_EVIDENCE')).id : undefined;
      return api.post('/leave-requests/', { ...f, student: studentId, supporting_file });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave'] });
      toast(t('common.saved'));
      setOpen(false);
      setFile(null);
      setF({ ...f, reason: '' });
    },
  });
  return (
    <Card pad={false} title={t('leave.title')} actions={<Button size="sm" icon={FilePlus2} onClick={() => { submit.reset(); setOpen(true); }}>{t('leave.new')}</Button>}>
      {list.isPending ? <Skeleton rows={2} /> : !list.data?.length ? <EmptyState /> : list.data.slice(0, 5).map((l) => (
        <div key={l.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 text-sm">
          <div className="flex-1 min-w-0">
            <div className="font-medium">{tx(`leave.type.${l.leave_type}`, l.leave_type)} · {fmtDate(l.start_date, locale)}{l.end_date !== l.start_date && ` – ${fmtDate(l.end_date, locale)}`}</div>
            <div className="text-xs text-ink2 truncate">{l.review_note || l.reason}</div>
          </div>
          <StatusPill status={l.status} />
        </div>
      ))}
      <Modal open={open} onClose={() => setOpen(false)} title={t('leave.new')} size="sm"
        footer={<><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" disabled={submit.isPending || !f.reason.trim()} onClick={() => submit.mutate()}>{t('common.save')}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.startDate')} required><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label={t('common.endDate')} required><Input type="date" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
          <Field label={t('common.type')} className="sm:col-span-2">
            <Select value={f.leave_type} onChange={(e) => setF({ ...f, leave_type: e.target.value })}>
              {['SICK', 'PERMITTED', 'OTHER'].map((x) => <option key={x} value={x}>{tx(`leave.type.${x}`, x)}</option>)}
            </Select>
          </Field>
          <Field label={t('common.reason')} required className="sm:col-span-2"><Textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <Field label={t('leave.evidence')} className="sm:col-span-2"><Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        </div>
        {submit.error && <div className="mt-3"><ApiErrorAlert error={submit.error} /></div>}
      </Modal>
    </Card>
  );
}
