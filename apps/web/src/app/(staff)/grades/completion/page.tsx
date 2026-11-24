'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ApiErrorAlert, Badge, Button, Card, EmptyState, ErrorState, Mono, PageHeader, ProgressBar, SearchInput, Select, Skeleton, Stat, Table, Td, Th, Tr } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { useAuth } from '@/features/auth/auth';
import { defaultTrimester } from '@/features/grades/api';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { setPreference } from '@/lib/storage';

interface Row { teaching_assignment_id: string; classroom: string; classroom_id: string; subject_code: string; subject_name: string; teacher: string; expected: number; finalized: number; has_scheme: boolean; assessments: number }

function CompletionScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const { year } = useSelectedYear();
  const [trimId, setTrimId] = useState('');
  const [q, setQ] = useState('');
  const trimesters = year?.trimesters ?? [];
  const tr = trimesters.find((x) => x.id === trimId) ?? defaultTrimester(trimesters);
  const rows = useQuery({
    queryKey: ['grades', 'completion', tr?.id],
    queryFn: () => api.get<Row[]>('/grades/completion/', { trimester_id: tr!.id }),
    enabled: !!tr,
    placeholderData: keepPreviousData,
  });
  const generate = useMutation({
    mutationFn: () => api.post<{ created: number }>('/grading-schemes/generate/', { trimester: tr!.id }),
    onSuccess: (r) => { toast(t('comp.generated', { count: r.created }), 'ok'); qc.invalidateQueries({ queryKey: ['grades'] }); },
  });
  const data = (rows.data ?? []).filter((r) => !q || `${r.classroom} ${r.subject_code} ${r.subject_name} ${r.teacher}`.toLowerCase().includes(q.toLowerCase()));
  const expected = data.reduce((a, r) => a + r.expected, 0);
  const done = data.reduce((a, r) => a + r.finalized, 0);
  const missingScheme = data.filter((r) => !r.has_scheme).length;
  return (
    <>
      <PageHeader title={t('comp.title')} subtitle={tr?.name}
        actions={<>
          <YearSelect />
          <Select aria-label={t('common.trimester')} className="h-9 w-auto" value={tr?.id ?? ''} onChange={(e) => setTrimId(e.target.value)}>
            {trimesters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          {can('assessment.create') && <Button icon={Wand2} disabled={!tr || generate.isPending} onClick={() => generate.mutate()}>{t('comp.generateSchemes')}</Button>}
        </>} />
      <ApiErrorAlert error={generate.error} />
      {rows.isPending ? <Card pad={false}><Skeleton /></Card> : rows.error ? <ErrorState error={rows.error} onRetry={() => rows.refetch()} /> : (
        <>
          <Card pad={false} className="mb-4">
            <div className="grid grid-cols-3 divide-x divide-line">
              <Stat label={t('comp.progress')} value={`${expected ? ((done / expected) * 100).toFixed(1) : '0'}%`} tone={done === expected && expected ? 'ok' : undefined} />
              <Stat label={t('comp.finalized')} value={`${done}/${expected}`} />
              <Stat label={t('nav.schemes')} value={missingScheme} tone={missingScheme ? 'bad' : 'ok'} />
            </div>
          </Card>
          <div className="mb-3"><SearchInput value={q} onChange={setQ} /></div>
          <Card pad={false}>
            <Table>
              <thead><tr><Th>{t('student.classroom')}</Th><Th>{t('gb.assignment')}</Th><Th>{t('nav.teachers')}</Th><Th align="right">{t('nav.gradebook')}</Th><Th>{t('nav.schemes')}</Th><Th className="w-56">{t('comp.progress')}</Th></tr></thead>
              <tbody>
                {data.map((r) => {
                  const pct = r.expected ? (r.finalized / r.expected) * 100 : 0;
                  return (
                    <Tr key={r.teaching_assignment_id} onClick={() => { setPreference('nossef.gb.ta', r.teaching_assignment_id); router.push('/grades/gradebook'); }}>
                      <Td className="font-medium">{r.classroom}</Td>
                      <Td><Mono className="text-xs mr-2">{r.subject_code}</Mono>{r.subject_name}</Td>
                      <Td>{r.teacher}</Td>
                      <Td align="right" mono>{r.assessments}</Td>
                      <Td>{r.has_scheme ? <Badge tone="ok" dot>OK</Badge> : <Badge tone="bad" dot>—</Badge>}</Td>
                      <Td><div className="flex items-center gap-2"><ProgressBar value={pct} tone={pct === 100 ? 'ok' : pct > 0 ? 'warn' : 'bad'} label={t('comp.progress')} /><Mono className="text-xs whitespace-nowrap">{r.finalized}/{r.expected}</Mono></div></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            {!data.length && <EmptyState />}
          </Card>
        </>
      )}
    </>
  );
}

export default function CompletionPage() {
  return (
    <RequirePermission any={['assessment.view']}>
      <CompletionScreen />
    </RequirePermission>
  );
}
