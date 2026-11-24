'use client';

import { useQuery } from '@tanstack/react-query';
import { Megaphone, Paperclip } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, cx } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, fileUrl } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Item { id: string; title: string; body: string; priority: string; publish_at: string; expire_at: string | null; attachment: string | null; created_by_name: string }

function Feed() {
  const { t, tx, locale } = useI18n();
  const focus = useSearchParams().get('id');
  const q = useQuery({ queryKey: ['announcements', 'feed'], queryFn: () => api.get<Item[]>('/announcements/feed/') });
  return (
    <>
      <PageHeader title={t('nav.announcements')} />
      {q.isPending ? <Card pad={false}><Skeleton /></Card> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.length ? (
        <div className="space-y-3 max-w-3xl">
          {q.data.map((a) => (
            <Card key={a.id} className={cx(focus === a.id && 'ring-2 ring-accent/40', a.priority === 'URGENT' && 'border-bad/40')}>
              <div className="flex items-start gap-3">
                <Megaphone className={cx('w-5 h-5 mt-0.5 shrink-0', a.priority === 'NORMAL' ? 'text-ink2' : 'text-bad')} strokeWidth={1.5} aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display font-semibold">{a.title}</h2>
                    {a.priority !== 'NORMAL' && <Badge tone={a.priority === 'URGENT' ? 'bad' : 'warn'} dot>{tx(`prio.${a.priority}`, a.priority)}</Badge>}
                  </div>
                  <div className="text-xs text-ink2 mb-2">{fmtDateTime(a.publish_at, locale)}</div>
                  <p className="text-sm whitespace-pre-line break-words">{a.body}</p>
                  {a.attachment && <a href={fileUrl(a.attachment, true)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent underline mt-2"><Paperclip className="w-4 h-4" aria-hidden />PDF</a>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : <EmptyState icon={Megaphone} title={t('ann.empty')} />}
    </>
  );
}

export default function AnnouncementsPage() {
  return <Suspense><Feed /></Suspense>;
}
