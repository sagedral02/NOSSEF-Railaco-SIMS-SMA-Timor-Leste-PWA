'use client';

import { useQuery } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, EmptyState, ErrorState, FilterPills, Skeleton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { setPreference, usePreference } from '@/lib/storage';
import { useQueryParam } from '@/lib/url';

export interface Child { id: string; student_no: string; full_name: string; status: string; is_self: boolean; classroom: string | null; academic_year: string | null;
  homeroom_teacher: { name: string; phone: string; email: string } | null;
}

export function useChildren() {
  return useQuery({ queryKey: ['portal', 'children'], queryFn: () => api.get<Child[]>('/portal/children/'), staleTime: 300_000 });
}

/** Guardian child switcher (PRD F4-06); students see only themselves. Renders `children(child)` for the selection. */
export function ChildScope({ children }: { children: (child: Child) => ReactNode }) {
  const { t } = useI18n();
  const q = useChildren();
  const saved = usePreference('nossef.child', '');
  useQueryParam('child', (v) => setPreference('nossef.child', v));
  if (q.isPending) return <Card pad={false}><Skeleton /></Card>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const list = q.data;
  if (!list.length) return <EmptyState title={t('portal.noChildren')} />;
  const child = list.find((c) => c.id === saved) ?? list[0];
  return (
    <>
      {list.length > 1 && (
        <div className="mb-4">
          <FilterPills value={child.id} onChange={(v) => setPreference('nossef.child', v)} options={list.map((c) => ({ id: c.id, label: c.is_self ? t('portal.self') : c.full_name }))} />
        </div>
      )}
      <div key={child.id}>{children(child)}</div>
    </>
  );
}

/** Official class contact (ui.md SCREEN-22): the child's homeroom teacher (Profesor da Turma). */
export function HomeroomCard({ child }: { child: Child }) {
  const { t } = useI18n();
  const hr = child.homeroom_teacher;
  return (
    <Card title={t('portal.homeroomContact')}>
      {hr ? (
        <div className="text-sm space-y-1.5">
          <div className="font-medium">{hr.name}</div>
          <div className="text-ink2">{child.classroom} · {child.academic_year}</div>
          {hr.phone && <div className="flex items-center gap-1.5 text-ink2"><Phone size={14} strokeWidth={1.5} aria-hidden /><a className="font-mono text-ink hover:underline" href={`tel:${hr.phone}`}>{hr.phone}</a></div>}
          {hr.email && <div className="flex items-center gap-1.5 text-ink2"><Mail size={14} strokeWidth={1.5} aria-hidden /><a className="hover:underline" href={`mailto:${hr.email}`}>{hr.email}</a></div>}
        </div>
      ) : <p className="text-sm text-ink2">—</p>}
    </Card>
  );
}
