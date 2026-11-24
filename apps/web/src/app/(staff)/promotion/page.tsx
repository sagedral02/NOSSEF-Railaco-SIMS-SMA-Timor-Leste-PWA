'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import {
  Alert, ApiErrorAlert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Mono, PageHeader, Select, Skeleton, StatusPill, Table, Td, Th, Tr, cx,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { useClassrooms, useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { useAuth } from '@/features/auth/auth';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

interface PreviewRow {
  student_id: string; student_no: string; full_name: string; classroom: string; classroom_id: string; grade: string; major: string;
  failing_subjects_t3: number; missing_final_grades: string[]; suggestion: string; decision: string | null;
}
interface Preview { trimester_3_status: string | null; students: PreviewRow[] }
interface Choice { decision: string; target_classroom: string; reason: string; override: boolean; include: boolean }
interface Result { student_id: string; result: string; code?: string; message?: string }

const NEXT: Record<string, string> = { X: 'XI', XI: 'XII' };

function PromotionScreen() {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const { year, years } = useSelectedYear();
  const classes = useClassrooms(year?.id).data ?? [];
  const nextYear = years.filter((y) => year && y.start_date > year.start_date).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const nextClasses = useClassrooms(nextYear?.id).data ?? [];
  const [classId, setClassId] = useState('');
  const cls = classes.find((c) => c.id === classId) ?? classes[0];
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const preview = useQuery({
    queryKey: ['promotion', year?.id, cls?.id],
    queryFn: () => api.get<Preview>('/promotions/preview/', { academic_year_id: year!.id, classroom_id: cls!.id }),
    enabled: !!year && !!cls,
    placeholderData: keepPreviousData,
  });
  const targetsFor = (r: PreviewRow, decision: string) => {
    const grade = decision === 'PROMOTED' ? NEXT[r.grade] : r.grade;
    return nextClasses.filter((c) => c.grade_level_code === grade && c.major_code === r.major);
  };
  const choiceOf = (r: PreviewRow): Choice => {
    const c = choices[r.student_id];
    if (c) return c;
    const decision = r.decision ?? r.suggestion;
    return { decision, target_classroom: targetsFor(r, decision)[0]?.id ?? '', reason: '', override: false, include: !r.decision };
  };
  const setChoice = (r: PreviewRow, patch: Partial<Choice>) => {
    const cur = choiceOf(r);
    const next = { ...cur, ...patch };
    if (patch.decision && patch.decision !== cur.decision) next.target_classroom = targetsFor(r, patch.decision)[0]?.id ?? '';
    setChoices((s) => ({ ...s, [r.student_id]: next }));
  };
  const rows = preview.data?.students ?? [];
  const pending = rows.filter((r) => !r.decision && choiceOf(r).include);
  const execute = useMutation({
    mutationFn: () => api.post<{ results: Result[] }>('/promotions/execute/', {
      academic_year: year!.id,
      decisions: pending.map((r) => {
        const c = choiceOf(r);
        return { student: r.student_id, decision: c.decision, target_classroom: c.decision === 'GRADUATED' ? null : c.target_classroom || null, reason: c.reason, override_incomplete: c.override };
      }),
    }),
    onSuccess: (r) => {
      setResults(Object.fromEntries(r.results.map((x) => [x.student_id, x])));
      toast(t('promo.applied', { count: r.results.filter((x) => x.result === 'APPLIED').length }), 'ok');
      qc.invalidateQueries({ queryKey: ['promotion'] });
    },
  });
  const manage = can('report.publish');
  return (
    <>
      <PageHeader title={t('promo.title')} subtitle={cls ? `${cls.name} → ${nextYear?.name ?? '—'}` : undefined}
        actions={<>
          <YearSelect />
          <Select aria-label={t('student.classroom')} className="h-9 w-auto" value={cls?.id ?? ''} onChange={(e) => { setClassId(e.target.value); setResults({}); }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {manage && <Button variant="primary" icon={Play} disabled={!pending.length || execute.isPending} onClick={() => execute.mutate()}>{t('promo.execute')} ({pending.length})</Button>}
        </>} />
      <div className="space-y-3 mb-4">
        <ApiErrorAlert error={execute.error} />
        {!nextYear && <Alert tone="warn">{t('promo.nextYear')}: —</Alert>}
        {preview.data && preview.data.trimester_3_status !== 'GRADING' && preview.data.trimester_3_status !== 'CLOSED' && (
          <Alert tone="warn">Trimestre 3: <StatusPill status={preview.data.trimester_3_status} /></Alert>
        )}
      </div>
      {preview.isPending ? <Card pad={false}><Skeleton /></Card> : preview.error ? <ErrorState error={preview.error} onRetry={() => preview.refetch()} /> : (
        <Card pad={false} className="overflow-x-auto">
          <Table className="min-w-max">
            <thead><tr><Th className="w-10" /><Th>{t('common.name')}</Th><Th align="center">{t('promo.failing')}</Th><Th>{t('promo.suggestion')}</Th><Th>{t('promo.decision')}</Th><Th>{t('promo.target')}</Th><Th>{t('common.reason')}</Th><Th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const c = choiceOf(r);
                const done = !!r.decision;
                const res = results[r.student_id];
                return (
                  <Tr key={r.student_id}>
                    <Td>{!done && manage && <Checkbox label={r.full_name} checked={c.include} onChange={(v) => setChoice(r, { include: v })} />}</Td>
                    <Td><div className="font-medium">{r.full_name}</div><Mono className="text-xs text-ink2">{r.student_no} · {r.grade}-{r.major}</Mono>
                      {r.missing_final_grades.length > 0 && <div className="text-xs text-warn">{t('rc.missing')}: {r.missing_final_grades.join(', ')}</div>}
                    </Td>
                    <Td align="center" mono className={cx(r.failing_subjects_t3 > 3 && 'text-bad font-semibold')}>{r.failing_subjects_t3}</Td>
                    <Td><Badge>{tx(`decision.${r.suggestion}`, r.suggestion)}</Badge></Td>
                    <Td>{done ? <Badge tone="ok" dot>{tx(`decision.${r.decision}`, r.decision!)}</Badge> : (
                      <Select aria-label={t('promo.decision')} className="h-8 w-auto" value={c.decision} disabled={!manage} onChange={(e) => setChoice(r, { decision: e.target.value })}>
                        {(r.grade === 'XII' ? ['GRADUATED', 'REPEATED'] : ['PROMOTED', 'REPEATED']).map((d) => <option key={d} value={d}>{tx(`decision.${d}`, d)}</option>)}
                      </Select>
                    )}</Td>
                    <Td>{!done && c.decision !== 'GRADUATED' && (
                      <Select aria-label={t('promo.target')} className="h-8 w-auto" value={c.target_classroom} disabled={!manage} onChange={(e) => setChoice(r, { target_classroom: e.target.value })}>
                        <option value="">—</option>
                        {targetsFor(r, c.decision).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </Select>
                    )}</Td>
                    <Td>{!done && manage && (
                      <div className="space-y-1">
                        <Input className="h-8 w-48" value={c.reason} placeholder={c.decision === 'REPEATED' || c.override ? t('common.reasonPlaceholder') : t('common.optional')} onChange={(e) => setChoice(r, { reason: e.target.value })} />
                        {r.missing_final_grades.length > 0 && can('grade.reopen') && (
                          <label className="flex items-center gap-1.5 text-xs text-ink2"><Checkbox checked={c.override} onChange={(v) => setChoice(r, { override: v })} />{t('promo.override')}</label>
                        )}
                      </div>
                    )}</Td>
                    <Td>{res && (res.result === 'REJECTED' ? <span className="text-xs text-bad">{tx(`error.${res.code}`, res.message ?? '')}</span> : <StatusPill status={res.result === 'APPLIED' ? 'VALID' : res.result} label={res.result} />)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          {!rows.length && <EmptyState />}
        </Card>
      )}
    </>
  );
}

export default function PromotionPage() {
  return (
    <RequirePermission any={['report.view']}>
      <PromotionScreen />
    </RequirePermission>
  );
}
