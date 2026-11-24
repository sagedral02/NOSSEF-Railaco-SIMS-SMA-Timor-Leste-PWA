'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Mono, SearchInput } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

import type { StudentRow } from './api';

/** Search-as-you-type student selector holding the student id (for forms over the whole roster). */
export function StudentSearchField({ value, onChange, query }: { value: string | null; onChange: (id: string | null) => void; query?: Record<string, string | undefined> }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const selected = useQuery({ queryKey: ['students', 'detail', value], queryFn: () => api.get<StudentRow>(`/students/${value}/`), enabled: !!value, staleTime: 300_000 });
  const res = useQuery({
    queryKey: ['students', 'search', q, query],
    queryFn: () => api.page<StudentRow>('/students/', { q, page_size: 8, ...query }).then((r) => r.data),
    enabled: !value && q.trim().length >= 2,
  });
  if (value) {
    const s = selected.data;
    return (
      <div className="flex items-center justify-between rounded-md border border-line-strong px-3 h-10">
        <span className="text-sm truncate">{s ? <>{s.full_name} <Mono className="text-xs text-ink2">{s.student_no}</Mono></> : '…'}</span>
        <button type="button" className="text-xs text-accent underline shrink-0 ml-2" onClick={() => onChange(null)}>{t('common.edit')}</button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <SearchInput value={q} onChange={setQ} placeholder={t('fin.selectStudent')} />
      {(res.data ?? []).map((s) => (
        <button key={s.id} type="button" onClick={() => { onChange(s.id); setQ(''); }} className="w-full text-left px-3 py-1.5 rounded-md hover:bg-hover">
          <span className="text-sm">{s.full_name}</span> <Mono className="text-xs text-ink2">{s.student_no} · {s.current_enrollment?.classroom_name ?? ''}</Mono>
        </button>
      ))}
    </div>
  );
}
