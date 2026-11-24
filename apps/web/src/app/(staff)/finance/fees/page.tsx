'use client';

import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ResourcePage, type Row } from '@/components/resource';
import { Mono, StatusPill, Tabs } from '@/components/ui';
import { useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { gradeOptions, majorOptions } from '@/features/academics/options';
import { useI18n } from '@/i18n';
import { fmtDate, usd } from '@/lib/format';

type Tab = 'plans' | 'types' | 'discounts' | 'scholarships';
const feeTypeOptions = { path: '/finance/fee-types/', label: (r: Row) => `${r.code} — ${r.name}` };

export default function FeesPage() {
  const { t, tx, locale } = useI18n();
  const { year } = useSelectedYear();
  const [tab, setTab] = useState<Tab>('plans');
  const opts = (values: string[], prefix = 'status') => values.map((v) => ({ value: v, label: tx(`${prefix}.${v}`, v) }));
  const blankNull = (v: Record<string, unknown>, keys: string[]) => ({ ...v, ...Object.fromEntries(keys.map((k) => [k, v[k] === '' || v[k] === undefined ? null : v[k]])) });
  return (
    <RequirePermission any={['finance.view']}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'plans', label: t('fin.plans') }, { id: 'types', label: t('fin.feeTypes') },
        { id: 'discounts', label: t('fin.discounts') }, { id: 'scholarships', label: t('fin.scholarships') },
      ]} />
      {tab === 'plans' && (
        <ResourcePage key={`plans-${year?.id}`} title="fin.plans" path="/finance/fee-plans/" query={{ academic_year_id: year?.id }} enabled={!!year}
          managePermission="finance.manage_fee" headerActions={<YearSelect />}
          rowTitle={(r) => `${r.fee_type_code} ${r.grade_level_code ?? ''}`}
          toPayload={(v) => blankNull({ ...v, academic_year: year?.id }, ['grade_level', 'major', 'due_day'])}
          columns={[
            { header: 'fin.type', cell: (r) => <Mono>{String(r.fee_type_code)}</Mono> },
            { header: 'nav.classes', cell: (r) => (r.grade_level_code ? `${r.grade_level_code}${r.major_code ? ` ${r.major_code}` : ''}` : t('fin.allGrades')) },
            { header: 'fin.amount', cell: (r) => usd(String(r.amount)), align: 'right', mono: true },
            { header: 'fin.dueDay', cell: (r) => String(r.due_day ?? '—'), align: 'right', mono: true },
            { header: 'common.status', cell: (r) => <StatusPill status={String(r.status)} /> },
          ]}
          fields={[
            { name: 'fee_type', label: 'fin.type', type: 'select', required: true, optionsFrom: feeTypeOptions, span: 2 },
            { name: 'grade_level', label: 'nav.classes', type: 'select', optionsFrom: gradeOptions, allowEmpty: true },
            { name: 'major', label: 'major.label', type: 'select', optionsFrom: majorOptions, allowEmpty: true },
            { name: 'amount', label: 'fin.amount', required: true, mono: true },
            { name: 'due_day', label: 'fin.dueDay', type: 'number' },
            { name: 'status', label: 'common.status', type: 'select', required: true, options: opts(['DRAFT', 'ACTIVE', 'INACTIVE']), default: 'ACTIVE' },
          ]}
        />
      )}
      {tab === 'types' && (
        <ResourcePage title="fin.feeTypes" path="/finance/fee-types/" managePermission="finance.manage_fee" rowTitle={(r) => String(r.code)}
          columns={[
            { header: 'fin.code', cell: (r) => <Mono>{String(r.code)}</Mono> },
            { header: 'common.name', cell: (r) => String(r.name) },
            { header: 'fin.recurrence', cell: (r) => String(r.recurrence) },
            { header: 'common.status', cell: (r) => <StatusPill status={r.active ? 'ACTIVE' : 'INACTIVE'} /> },
          ]}
          fields={[
            { name: 'code', label: 'fin.code', required: true, mono: true },
            { name: 'name', label: 'common.name', required: true },
            { name: 'recurrence', label: 'fin.recurrence', type: 'select', required: true, options: ['MONTHLY', 'ONE_TIME', 'TRIMESTER', 'YEARLY', 'MANUAL'].map((v) => ({ value: v, label: v })) },
            { name: 'active', label: 'common.status', type: 'checkbox', default: true },
          ]}
        />
      )}
      {tab === 'discounts' && (
        <ResourcePage key={`disc-${year?.id}`} title="fin.discounts" path="/finance/discounts/" query={{ academic_year_id: year?.id }} enabled={!!year} paginated
          managePermission="finance.manage_fee" canDelete={false} headerActions={<YearSelect />} rowTitle={(r) => String(r.student_name)}
          toPayload={(v) => blankNull({ ...v, academic_year: year?.id }, ['fee_type', 'end_date'])}
          columns={[
            { header: 'common.name', cell: (r) => <><div>{String(r.student_name)}</div><Mono className="text-xs text-ink2">{String(r.student_no)}</Mono></> },
            { header: 'fin.type', cell: (r) => <Mono>{String(r.fee_type_code ?? '*')}</Mono> },
            { header: 'fin.value', cell: (r) => (r.discount_type === 'PERCENT' ? `${Number(r.value)}%` : usd(String(r.value))), align: 'right', mono: true },
            { header: 'fin.validFrom', cell: (r) => `${fmtDate(r.start_date as string, locale)} – ${r.end_date ? fmtDate(r.end_date as string, locale) : '…'}` },
            { header: 'common.reason', cell: (r) => <span className="text-sm text-ink2">{String(r.reason)}</span> },
            { header: 'common.status', cell: (r) => <StatusPill status={String(r.status)} /> },
          ]}
          fields={[
            { name: 'student', label: 'common.name', type: 'student', required: true, span: 2, createOnly: true },
            { name: 'fee_type', label: 'fin.feeTypes', type: 'select', optionsFrom: feeTypeOptions, allowEmpty: true },
            { name: 'discount_type', label: 'fin.type', type: 'select', required: true, options: [{ value: 'PERCENT', label: '%' }, { value: 'FIXED', label: 'USD' }], default: 'PERCENT' },
            { name: 'value', label: 'fin.value', required: true, mono: true },
            { name: 'status', label: 'common.status', type: 'select', required: true, options: opts(['ACTIVE', 'EXPIRED', 'REVOKED']), default: 'ACTIVE' },
            { name: 'start_date', label: 'fin.validFrom', type: 'date', required: true },
            { name: 'end_date', label: 'fin.validUntil', type: 'date' },
            { name: 'reason', label: 'common.reason', type: 'textarea', required: true, span: 2 },
          ]}
        />
      )}
      {tab === 'scholarships' && (
        <ResourcePage title="fin.scholarships" path="/finance/scholarships/" paginated managePermission="finance.manage_fee" canDelete={false} rowTitle={(r) => String(r.student_name)}
          toPayload={(v) => blankNull(v, ['value', 'valid_until'])}
          columns={[
            { header: 'common.name', cell: (r) => <><div>{String(r.student_name)}</div><Mono className="text-xs text-ink2">{String(r.student_no)}</Mono></> },
            { header: 'fin.scholarships', cell: (r) => String(r.name) },
            { header: 'fin.coverage', cell: (r) => (r.coverage_type === 'FULL' ? '100%' : r.coverage_type === 'PERCENT' ? `${Number(r.value)}%` : usd(String(r.value))), align: 'right', mono: true },
            { header: 'fin.validFrom', cell: (r) => `${fmtDate(r.valid_from as string, locale)} – ${r.valid_until ? fmtDate(r.valid_until as string, locale) : '…'}` },
            { header: 'common.status', cell: (r) => <StatusPill status={String(r.status)} /> },
          ]}
          fields={[
            { name: 'student', label: 'common.name', type: 'student', required: true, span: 2, createOnly: true },
            { name: 'name', label: 'common.name', required: true, span: 2 },
            { name: 'coverage_type', label: 'fin.coverage', type: 'select', required: true, options: [{ value: 'FULL', label: '100%' }, { value: 'PERCENT', label: '%' }, { value: 'FIXED', label: 'USD' }], default: 'FULL' },
            { name: 'value', label: 'fin.value', mono: true },
            { name: 'valid_from', label: 'fin.validFrom', type: 'date', required: true },
            { name: 'valid_until', label: 'fin.validUntil', type: 'date' },
            { name: 'status', label: 'common.status', type: 'select', required: true, options: opts(['ACTIVE', 'ENDED', 'REVOKED']), default: 'ACTIVE' },
            { name: 'note', label: 'common.reason', type: 'textarea', span: 2 },
          ]}
        />
      )}
    </RequirePermission>
  );
}
