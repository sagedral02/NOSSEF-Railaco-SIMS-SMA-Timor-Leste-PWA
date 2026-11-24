'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CreditCard, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { NAV } from '@/components/shell/nav';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Mono, PageHeader, ProgressBar, Skeleton, cx } from '@/components/ui';
import { useAuth } from '@/features/auth/auth';
import { IdCardModal, type CardStudent } from '@/features/students/id-card';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDateTime, usd } from '@/lib/format';
import { setPreference } from '@/lib/storage';

interface Widget { key: string; value: string | number; href: string | null; sub: string | null; tone: 'ok' | 'bad' | null; context: string | null }
interface Dash {
  academic_year: string | null; trimester: string | null; generated_at: string;
  sections: { key: string; widgets: Widget[] }[];
  children: { id: string; full_name: string; student_no: string; classroom: string | null; attendance_rate: number | null; outstanding: string; latest_report: { id: string; label: string; average: string | null } | null }[];
}
interface Ann { id: string; title: string; priority: string; publish_at: string }

function WidgetCard({ w }: { w: Widget }) {
  const { tx } = useI18n();
  const body = (
    <div className="px-4 py-3 h-full">
      <div className="text-xs text-ink2 flex items-center justify-between gap-2">
        <span>{tx(w.key, w.key)}</span>
        {w.context && <Mono className="text-[10px] text-muted">{w.context}</Mono>}
      </div>
      <div className={cx('font-display text-2xl font-semibold mt-1', w.tone === 'bad' && 'text-bad', w.tone === 'ok' && 'text-ok')}>{w.value}</div>
      {w.sub && <div className="text-xs text-ink2 mt-0.5">{w.sub}</div>}
    </div>
  );
  return w.href ? <Link href={w.href} className="block hover:bg-hover">{body}</Link> : body;
}

export default function DashboardPage() {
  const { t, tx, locale } = useI18n();
  const { user, can, hasRole } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dash>('/dashboard/'), staleTime: 30_000 });
  const [card, setCard] = useState<CardStudent | null>(null);
  const news = useQuery({ queryKey: ['announcements', 'feed'], queryFn: () => api.get<Ann[]>('/announcements/feed/') });
  if (!user) return null;
  const links = NAV.filter((n) => n.href !== '/dashboard' && ((!n.perm && !n.roles) || (n.perm && can(...n.perm)) || (n.roles && hasRole(...n.roles)))).slice(0, 10);
  const d = q.data;
  return (
    <>
      <PageHeader title={t('dash.welcome', { name: user.full_name || user.username })}
        subtitle={d ? [d.academic_year && `${t('common.year')} ${d.academic_year}`, d.trimester].filter(Boolean).join(' · ') : t('dash.subtitle')}
        actions={<div className="flex flex-wrap gap-1.5">{user.roles.map((r) => <Badge key={r} tone="info">{tx(`role.${r}`, r)}</Badge>)}</div>} />
      {q.isPending ? <Card pad={false}><Skeleton /></Card> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d && (
        <div className="space-y-4">
          {d.children.length > 0 && (
            <Card title={t('dash.children')} pad={false}>
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line">
                {d.children.map((c) => (
                  <div key={c.id} className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.full_name} size={36} tone="blue" />
                      <div className="flex-1 min-w-0"><div className="font-medium">{c.full_name}</div><Mono className="text-xs text-ink2">{c.student_no} · {c.classroom ?? '—'}</Mono></div>
                      <Button size="sm" icon={CreditCard} onClick={() => setCard({ id: c.id, full_name: c.full_name, student_no: c.student_no, classroom: c.classroom, academic_year: d.academic_year })}>{t('card.show')}</Button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <Link href="/my/attendance" onClick={() => setPreference('nossef.child', c.id)} className="hover:underline">
                        <div className="text-xs text-ink2">{t('dash.attendanceRate')}</div>
                        <div className="font-semibold">{c.attendance_rate != null ? `${c.attendance_rate}%` : '—'}</div>
                        <ProgressBar value={c.attendance_rate ?? 0} tone={(c.attendance_rate ?? 0) >= 90 ? 'ok' : 'warn'} />
                      </Link>
                      <Link href="/my/finance" className="hover:underline">
                        <div className="text-xs text-ink2">{t('fin.outstanding')}</div>
                        <div className={cx('font-semibold', Number(c.outstanding) > 0 && 'text-bad')}>{usd(c.outstanding)}</div>
                      </Link>
                      <Link href="/my/report-cards" onClick={() => setPreference('nossef.child', c.id)} className="hover:underline">
                        <div className="text-xs text-ink2">{t('dash.latestReport')}</div>
                        <div className="font-semibold">{c.latest_report ? `${c.latest_report.label} · ${c.latest_report.average ?? '—'}` : '—'}</div>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {d.sections.map((s) => (
            <Card key={s.key} title={tx(s.key, s.key)} pad={false}>
              <div className={cx('grid divide-x divide-y md:divide-y-0 divide-line', s.widgets.length >= 4 ? 'grid-cols-2 md:grid-cols-4 xl:grid-cols-5' : 'grid-cols-2 md:grid-cols-3')}>
                {s.widgets.map((w) => <WidgetCard key={w.key} w={w} />)}
              </div>
            </Card>
          ))}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t('dash.latestNews')} actions={<Link href="/announcements" className="text-xs text-accent underline">{t('nav.announcements')}</Link>} pad={false}>
              {news.data?.length ? news.data.slice(0, 5).map((a) => (
                <Link key={a.id} href={`/announcements?id=${a.id}`} className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0 hover:bg-hover">
                  <Megaphone className={cx('w-4 h-4', a.priority === 'NORMAL' ? 'text-ink2' : 'text-bad')} strokeWidth={1.5} aria-hidden />
                  <span className="flex-1 text-sm truncate">{a.title}</span>
                  <span className="text-xs text-muted">{fmtDateTime(a.publish_at, locale)}</span>
                </Link>
              )) : <EmptyState icon={Megaphone} title={t('ann.empty')} />}
            </Card>
            <Card title={t('dash.quickLinks')} pad={false}>
              {links.map((n) => (
                <Link key={n.href} href={n.href} className="flex items-center gap-3 px-4 h-11 border-b border-line last:border-0 hover:bg-hover text-sm">
                  <n.icon className="w-4 h-4 text-ink2" strokeWidth={1.5} aria-hidden />
                  <span className="flex-1">{t(n.key)}</span>
                  <ArrowUpRight className="w-4 h-4 text-muted" strokeWidth={1.5} aria-hidden />
                </Link>
              ))}
            </Card>
          </div>
        </div>
      )}
      {card && <IdCardModal students={[card]} onClose={() => setCard(null)} />}
    </>
  );
}
