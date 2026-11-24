'use client';

import { RequirePermission } from '@/components/guards';
import { ResourcePage, yesNo } from '@/components/resource';
import { Mono } from '@/components/ui';
import { useClassrooms, useSelectedYear } from '@/features/academics/api';
import { classOptions, offeringOptions, teacherOptions } from '@/features/academics/options';
import { YearSelect } from '@/features/academics/year-select';
import { useI18n } from '@/i18n';
import { fmtDate } from '@/lib/format';

export default function TeachingAssignmentsPage() {
  const { t, locale } = useI18n();
  const { year } = useSelectedYear();
  const classes = useClassrooms(year?.id).data ?? [];
  return (
    <RequirePermission any={['academic.view']}>
      <ResourcePage
        title="nav.assignments"
        path="/teaching-assignments/"
        paginated
        query={{ academic_year_id: year?.id }}
        enabled={!!year}
        headerActions={<YearSelect />}
        managePermission="academic.manage_class"
        filters={[{ name: 'classroom_id', label: 'assignment.classroom', options: classes.map((c) => ({ value: c.id, label: c.name })) }]}
        rowTitle={(r) => `${r.teacher_name} → ${r.classroom_name} ${r.subject_code}`}
        toPayload={(v) => ({ ...v, valid_from: v.valid_from || null, valid_until: v.valid_until || null })}
        columns={[
          { header: 'assignment.classroom', cell: (r) => String(r.classroom_name) },
          { header: 'subject.label', cell: (r) => <><Mono>{String(r.subject_code)}</Mono> {String(r.subject_name)}</> },
          { header: 'assignment.teacher', cell: (r) => String(r.teacher_name) },
          { header: 'assignment.validFrom', cell: (r) => fmtDate(r.valid_from as string | null, locale) },
          { header: 'assignment.validUntil', cell: (r) => fmtDate(r.valid_until as string | null, locale) },
          { header: 'common.active', cell: (r) => yesNo(r.active, t) },
        ]}
        fields={[
          { name: 'classroom', label: 'assignment.classroom', type: 'select', required: true, optionsFrom: classOptions(year?.id) },
          { name: 'subject_offering', label: 'assignment.offering', type: 'select', required: true, optionsFrom: offeringOptions(year?.id) },
          { name: 'teacher', label: 'assignment.teacher', type: 'select', required: true, optionsFrom: teacherOptions, span: 2 },
          { name: 'valid_from', label: 'assignment.validFrom', type: 'date' },
          { name: 'valid_until', label: 'assignment.validUntil', type: 'date' },
          { name: 'active', label: 'common.active', type: 'checkbox', default: true },
        ]}
      />
    </RequirePermission>
  );
}
