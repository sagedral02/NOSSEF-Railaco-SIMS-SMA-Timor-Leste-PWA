'use client';

import { RequirePermission } from '@/components/guards';
import { ResourcePage } from '@/components/resource';
import { Mono, StatusPill } from '@/components/ui';
import { userOptions } from '@/features/academics/options';
import { useI18n } from '@/i18n';

const EMPLOYMENT = ['ACTIVE', 'INACTIVE', 'LEAVE', 'ENDED'];

export default function StaffPage() {
  const { tx } = useI18n();
  const statusOptions = EMPLOYMENT.map((v) => ({ value: v, label: tx(`status.${v}`, v) }));
  return (
    <RequirePermission any={['staff.view']}>
      <ResourcePage
        title="nav.staff"
        path="/staff/staff/"
        paginated
        searchable
        managePermission="staff.manage"
        filters={[{ name: 'employment_status', label: 'teacher.status', options: statusOptions }]}
        rowTitle={(r) => String(r.full_name)}
        toPayload={(v) => ({ ...v, user: v.user || null })}
        columns={[
          { header: 'teacher.employeeNo', cell: (r) => <Mono>{String(r.employee_no ?? '—')}</Mono> },
          { header: 'common.name', cell: (r) => String(r.full_name) },
          { header: 'staff.position', cell: (r) => String(r.position) },
          { header: 'staff.department', cell: (r) => String(r.department || '—') },
          { header: 'common.account', cell: (r) => <Mono>{String(r.username ?? '—')}</Mono> },
          { header: 'teacher.status', cell: (r) => <StatusPill status={String(r.employment_status)} /> },
        ]}
        fields={[
          { name: 'full_name', label: 'common.name', required: true, span: 2 },
          { name: 'employee_no', label: 'teacher.employeeNo', mono: true },
          { name: 'position', label: 'staff.position', required: true },
          { name: 'department', label: 'staff.department' },
          { name: 'phone', label: 'common.phone' },
          { name: 'employment_status', label: 'teacher.status', type: 'select', required: true, options: statusOptions, default: 'ACTIVE' },
          { name: 'user', label: 'common.account', type: 'select', optionsFrom: userOptions, allowEmpty: true },
        ]}
      />
    </RequirePermission>
  );
}
