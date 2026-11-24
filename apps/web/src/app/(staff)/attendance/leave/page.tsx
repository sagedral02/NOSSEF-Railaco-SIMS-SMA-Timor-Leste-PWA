'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';

import { useToast } from '@/components/toast';
import { Card, EmptyState, FilterPills, PageHeader, ReasonDialog, Skeleton, StatusPill, Table, Td, Th, Tr, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth';
import { useI18n } from '@/i18n';
import { api, fileUrl } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface Leave { id: string; student: string; student_name: string; start_date: string; end_date: string; leave_type: string; reason: string; supporting_file: string | null; status: string; review_note: string }

export default function LeavePage() {
  const { t, tx, locale } = useI18n();
  const { can, hasRole } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('PENDING');
  const [rejecting, setRejecting] = useState<Leave | null>(null);
  const list = useQuery({ queryKey: ['leave', status], queryFn: () => api.get<Leave[]>('/leave-requests/', { status, page_size: 100 }) });
  const canReview = can('attendance.approve') || hasRole('HOMEROOM_TEACHER');
  const review = useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) => api.post(`/leave-requests/${id}/review/`, { approve, note: note ?? '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave'] }); toast(t('common.saved')); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <>
      <PageHeader title={t('leave.title')} />
      <Card pad={false}>
        <div className="p-3 border-b border-line">
          <FilterPills options={['PENDING', 'APPROVED', 'REJECTED', ''].map((s) => ({ id: s, label: s ? tx(`status.${s}`, s) : t('common.all') }))} value={status} onChange={setStatus} />
        </div>
        {list.isPending ? <Skeleton /> : !list.data?.length ? <EmptyState /> : (
          <Table>
            <thead><tr><Th>{t('leave.student')}</Th><Th>{t('common.startDate')}</Th><Th>{t('common.endDate')}</Th><Th>{t('common.type')}</Th><Th>{t('common.reason')}</Th><Th>{t('common.status')}</Th>{canReview && <Th align="right">{t('common.actions')}</Th>}</tr></thead>
            <tbody>
              {list.data.map((l) => (
                <Tr key={l.id}>
                  <Td>{l.student_name}</Td><Td className="text-xs">{fmtDate(l.start_date, locale)}</Td><Td className="text-xs">{fmtDate(l.end_date, locale)}</Td>
                  <Td>{tx(`leave.type.${l.leave_type}`, l.leave_type)}</Td>
                  <Td className="text-xs text-ink2 max-w-xs">{l.reason} {l.supporting_file && <a className="inline-flex items-center gap-1 text-accent ml-1" href={fileUrl(l.supporting_file, true)} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3" strokeWidth={1.5} aria-hidden />PDF</a>}</Td>
                  <Td><StatusPill status={l.status} /></Td>
                  {canReview && <Td align="right">{l.status === 'PENDING' && <span className="inline-flex gap-1">
                    <Button size="sm" icon={Check} onClick={() => review.mutate({ id: l.id, approve: true })}>{t('leave.approve')}</Button>
                    <Button size="sm" variant="danger" icon={X} onClick={() => setRejecting(l)}>{t('leave.reject')}</Button>
                  </span>}</Td>}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <ReasonDialog open={!!rejecting} onClose={() => setRejecting(null)} title={t('leave.reject')} confirmLabel={t('leave.reject')} danger
        onConfirm={(note) => review.mutateAsync({ id: rejecting!.id, approve: false, note })} />
    </>
  );
}
