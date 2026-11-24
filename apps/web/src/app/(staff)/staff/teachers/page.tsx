'use client';

import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ResourcePage } from '@/components/resource';
import { Mono, StatusPill, Tabs } from '@/components/ui';
import { userOptions } from '@/features/academics/options';
import { YearSelect } from '@/features/academics/year-select';
import { HomeroomPanel } from '@/features/staff/homeroom-panel';
import { useI18n } from '@/i18n';
import { fmtDate } from '@/lib/format';

const EMPLOYMENT = ['ACTIVE', 'INACTIVE', 'LEAVE', 'ENDED'];

export default function TeachersPage() {
  const { t, tx, locale } = useI18n();
  const statusOptions = EMPLOYMENT.map((v) => ({ value: v, label: tx(`status.${v}`, v) }));
  const [tab, setTab] = useState<'teachers' | 'homeroom'>('teachers');
  return (
    <RequirePermission any={['staff.view']}>
      <Tabs tabs={[{ id: 'teachers', label: t('homeroom.allTeachers') }, { id: 'homeroom', label: t('homeroom.tab') }]} value={tab} onChange={setTab} />
      {tab === 'homeroom' ? (
        <>
          <div className="flex items-center justify-between gap-3 mb-4"><h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight">{t('homeroom.tab')}</h1><YearSelect /></div>
          <HomeroomPanel />
        </>
      ) : (
      <ResourcePage
        title="nav.teachers"
        path="/staff/teachers/"
        paginated
        searchable
        managePermission="staff.manage"
        filters={[{ name: 'employment_status', label: 'teacher.status', options: statusOptions }]}
        rowTitle={(r) => String(r.full_name)}
        toPayload={(v) => ({ ...v, user: v.user || null, join_date: v.join_date || null, leave_date: v.leave_date || null })}
        columns={[
          { header: 'teacher.employeeNo', cell: (r) => <Mono>{String(r.employee_no ?? '—')}</Mono> },
          { header: 'common.name', cell: (r) => String(r.full_name) },
          { header: 'common.gender', cell: (r) => (r.gender ? tx(`gender.${r.gender}`, String(r.gender)) : '—') },
          { header: 'common.phone', cell: (r) => String(r.phone || '—') },
          { header: 'common.account', cell: (r) => <Mono>{String(r.username ?? '—')}</Mono> },
          { header: 'teacher.joinDate', cell: (r) => fmtDate(r.join_date as string | null, locale) },
          { header: 'teacher.status', cell: (r) => <StatusPill status={String(r.employment_status)} /> },
        ]}
        fields={[
          { name: 'full_name', label: 'common.name', required: true, span: 2 },
          { name: 'employee_no', label: 'teacher.employeeNo', mono: true },
          { name: 'gender', label: 'common.gender', type: 'select', options: [{ value: 'M', label: t('gender.M') }, { value: 'F', label: t('gender.F') }] },
          { name: 'phone', label: 'common.phone' },
          { name: 'email', label: 'common.email', type: 'email' },
          { name: 'employment_status', label: 'teacher.status', type: 'select', required: true, options: statusOptions, default: 'ACTIVE' },
          { name: 'user', label: 'common.account', type: 'select', optionsFrom: userOptions, allowEmpty: true },
          { name: 'join_date', label: 'teacher.joinDate', type: 'date' },
          { name: 'leave_date', label: 'teacher.leaveDate', type: 'date' },
        ]}
      />
      )}
    </RequirePermission>
  );
}
