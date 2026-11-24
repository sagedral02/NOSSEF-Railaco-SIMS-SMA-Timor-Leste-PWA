'use client';

import { RequirePermission } from '@/components/guards';
import { ResourcePage, yesNo } from '@/components/resource';
import { Badge, Mono } from '@/components/ui';
import { useGradeLevels, useMajors, useSelectedYear } from '@/features/academics/api';
import { gradeOptions, majorOptions, subjectOptions } from '@/features/academics/options';
import { YearSelect } from '@/features/academics/year-select';
import { useI18n } from '@/i18n';

export default function OfferingsPage() {
  const { t } = useI18n();
  const { year } = useSelectedYear();
  const grades = useGradeLevels().data ?? [];
  const majors = useMajors().data ?? [];
  return (
    <RequirePermission any={['academic.view']}>
      <ResourcePage
        title="nav.offerings"
        path="/subject-offerings/"
        query={{ academic_year_id: year?.id }}
        enabled={!!year}
        headerActions={<YearSelect />}
        managePermission="academic.manage_subject"
        filters={[
          { name: 'grade_level_id', label: 'grade.level', options: grades.map((g) => ({ value: g.id, label: g.code })) },
          { name: 'major_id', label: 'major.label', options: majors.map((m) => ({ value: m.id, label: m.code })) },
        ]}
        rowTitle={(r) => `${r.subject_code} ${r.grade_level_code}`}
        toPayload={(v) => ({ ...v, academic_year: year?.id })}
        columns={[
          { header: 'subject.label', cell: (r) => <><Mono>{String(r.subject_code)}</Mono> {String(r.subject_name)}</> },
          { header: 'grade.level', cell: (r) => <Badge mono>{String(r.grade_level_code)}</Badge> },
          { header: 'major.label', cell: (r) => (r.major_code ? <Badge mono>{String(r.major_code)}</Badge> : t('major.all')) },
          { header: 'offering.weekly', cell: (r) => String(r.weekly_periods), align: 'right', mono: true },
          { header: 'offering.required', cell: (r) => yesNo(r.is_required, t) },
          { header: 'common.active', cell: (r) => yesNo(r.active, t) },
        ]}
        fields={[
          { name: 'subject', label: 'subject.label', type: 'select', required: true, optionsFrom: subjectOptions, span: 2 },
          { name: 'grade_level', label: 'grade.level', type: 'select', required: true, optionsFrom: gradeOptions },
          { name: 'major', label: 'major.label', type: 'select', optionsFrom: majorOptions, allowEmpty: true },
          { name: 'weekly_periods', label: 'offering.weekly', type: 'number', required: true, default: 2 },
          { name: 'is_required', label: 'offering.required', type: 'checkbox', default: true },
          { name: 'active', label: 'common.active', type: 'checkbox', default: true },
        ]}
      />
    </RequirePermission>
  );
}
