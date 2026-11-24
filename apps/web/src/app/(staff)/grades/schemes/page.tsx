'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ApiErrorAlert, Button, Card, EmptyState, ErrorState, Mono, PageHeader, Select, Skeleton, StatusPill, Table, Td, Th, Tr } from '@/components/ui';
import { useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { useAuth } from '@/features/auth/auth';
import { defaultTrimester, passRule, type Scheme } from '@/features/grades/api';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

function SchemesScreen() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { can } = useAuth();
  const { year } = useSelectedYear();
  const [trimId, setTrimId] = useState('');
  const trimesters = year?.trimesters ?? [];
  const tr = trimesters.find((x) => x.id === trimId) ?? defaultTrimester(trimesters);
  const schemes = useQuery({
    queryKey: ['grades', 'schemes', tr?.id],
    queryFn: () => api.get<Scheme[]>('/grading-schemes/', { trimester_id: tr!.id, page_size: 500 }),
    enabled: !!tr,
    placeholderData: keepPreviousData,
  });
  const activate = useMutation({
    mutationFn: (id: string) => api.post(`/grading-schemes/${id}/activate/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grades'] }),
  });
  return (
    <>
      <PageHeader title={t('nav.schemes')} subtitle={tr?.name}
        actions={<>
          <YearSelect />
          <Select aria-label={t('common.trimester')} className="h-9 w-auto" value={tr?.id ?? ''} onChange={(e) => setTrimId(e.target.value)}>
            {trimesters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </>} />
      <ApiErrorAlert error={activate.error} />
      {schemes.isPending ? <Card pad={false}><Skeleton /></Card> : schemes.error ? <ErrorState error={schemes.error} onRetry={() => schemes.refetch()} /> : (
        <Card pad={false}>
          <Table>
            <thead><tr><Th>{t('gb.assignment')}</Th><Th>{t('gb.weights')}</Th><Th>{t('gb.scale')}</Th><Th>{t('gb.pass')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
            <tbody>
              {(schemes.data ?? []).map((s) => (
                <Tr key={s.id}>
                  <Td><Mono className="text-xs mr-2">{s.grade_level_code}{s.major_code ? `-${s.major_code}` : ''}</Mono><span className="font-medium">{s.subject_code}</span></Td>
                  <Td className="text-sm">{s.components.map((c) => `${c.name} ${Number(c.weight_percent)}%`).join(' · ')}</Td>
                  <Td mono>0–{Number(s.scale_max)}</Td>
                  <Td mono>{passRule(s)}</Td>
                  <Td><StatusPill status={s.status} /></Td>
                  <Td>{s.status === 'DRAFT' && can('assessment.update') && <Button size="sm" onClick={() => activate.mutate(s.id)}>{t('year.activate')}</Button>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {!schemes.data?.length && <EmptyState />}
        </Card>
      )}
    </>
  );
}

export default function SchemesPage() {
  return (
    <RequirePermission any={['assessment.view']}>
      <SchemesScreen />
    </RequirePermission>
  );
}
