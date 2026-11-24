'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { Button, Card, Drawer, EmptyState, ErrorState, Field, Input, KV, Mono, PageHeader, Select, Skeleton, Table, Td, Th, Tr } from '@/components/ui';
import { adminKeys, AUDIT_EVENTS, type AuditLog } from '@/features/admin/api';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

function Json({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted">—</span>;
  return <pre className="font-mono text-[11px] bg-canvas border border-line rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>;
}

function AuditScreen() {
  const { t, locale } = useI18n();
  const [filters, setFilters] = useState({ event_type: '', date_from: '', date_to: '', resource_id: '' });
  const [applied, setApplied] = useState(filters);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const feed = useInfiniteQuery({
    queryKey: adminKeys.audit(applied),
    queryFn: ({ pageParam, signal }) => api.feed<AuditLog>('/audit-logs/', { ...applied, cursor: pageParam }, signal),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.meta.next_cursor ?? undefined,
  });
  const rows = feed.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
      <Card pad={false}>
        <form
          className="grid gap-2 p-3 border-b border-line md:grid-cols-5 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(filters);
          }}
        >
          <Field label={t('audit.event')}>
            <Select value={filters.event_type} onChange={(e) => setFilters({ ...filters, event_type: e.target.value })} className="h-9">
              <option value="">{t('audit.allEvents')}</option>
              {AUDIT_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            </Select>
          </Field>
          <Field label={t('audit.resource')}>
            <Input mono className="h-9" value={filters.resource_id} onChange={(e) => setFilters({ ...filters, resource_id: e.target.value })} />
          </Field>
          <Field label={t('audit.dateFrom')}>
            <Input type="date" className="h-9" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
          </Field>
          <Field label={t('audit.dateTo')}>
            <Input type="date" className="h-9" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
          </Field>
          <Button type="submit" variant="dark">{t('common.search')}</Button>
        </form>
        {feed.isPending ? (
          <Skeleton />
        ) : feed.error ? (
          <div className="p-4"><ErrorState error={feed.error} onRetry={() => feed.refetch()} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('state.noResults')} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t('audit.time')}</Th>
                  <Th>{t('audit.event')}</Th>
                  <Th>{t('audit.actor')}</Th>
                  <Th>{t('audit.resource')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id} onClick={() => setSelected(r)} selected={selected?.id === r.id}>
                    <Td className="text-xs text-ink2 whitespace-nowrap">{fmtDateTime(r.created_at, locale)}</Td>
                    <Td mono>{r.event_type}</Td>
                    <Td mono>{r.actor_username || t('audit.system')}</Td>
                    <Td className="text-xs"><Mono className="text-[11px] text-ink2">{r.resource_type}</Mono> <Mono className="text-[11px]">{r.resource_id.slice(0, 8)}</Mono></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {feed.hasNextPage && (
              <div className="p-3 flex justify-center border-t border-line">
                <Button onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>{t('common.loadMore')}</Button>
              </div>
            )}
          </>
        )}
      </Card>
      <Drawer open={!!selected} onClose={() => setSelected(null)} title={t('audit.detail')} subtitle={selected && <Mono>{selected.event_type}</Mono>} width={520}>
        {selected && (
          <div className="space-y-4">
            <div>
              <KV k={t('audit.time')} v={fmtDateTime(selected.created_at, locale)} />
              <KV k={t('audit.actor')} v={selected.actor_username || t('audit.system')} mono />
              <KV k={t('audit.resource')} v={`${selected.resource_type} ${selected.resource_id}`} mono />
              <KV k="request_id" v={selected.request_id || '—'} mono />
              <KV k="IP" v={selected.ip_address || '—'} mono />
            </div>
            <div><div className="text-xs font-semibold text-ink2 mb-1">before</div><Json value={selected.before} /></div>
            <div><div className="text-xs font-semibold text-ink2 mb-1">after</div><Json value={selected.after} /></div>
            <div><div className="text-xs font-semibold text-ink2 mb-1">metadata</div><Json value={selected.metadata} /></div>
          </div>
        )}
      </Drawer>
    </>
  );
}

export default function AuditPage() {
  return (
    <RequirePermission any={['audit.view']}>
      <AuditScreen />
    </RequirePermission>
  );
}
