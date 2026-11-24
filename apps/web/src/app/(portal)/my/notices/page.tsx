'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { ChildScope } from '@/features/portal/children';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Notice { id: string; student_name: string; occurred_at: string; category: string; notice: string; notified_at: string }

function Notices({ studentId }: { studentId: string }) {
  const { locale } = useI18n();
  const q = useQuery({ queryKey: ['notices', studentId], queryFn: () => api.get<Notice[]>('/discipline/notices/', { student_id: studentId }) });
  if (q.isPending) return <Card pad={false}><Skeleton rows={3} /></Card>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState />;
  return (
    <div className="space-y-3">
      {q.data.map((n) => (
        <Card key={n.id}>
          <div className="text-xs text-ink2 mb-1">{fmtDateTime(n.notified_at, locale)} · {n.category}</div>
          <p className="text-sm whitespace-pre-line">{n.notice}</p>
        </Card>
      ))}
    </div>
  );
}

export default function MyNoticesPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.myNotices')} />
      <ChildScope>{(c) => <Notices studentId={c.id} />}</ChildScope>
    </>
  );
}
