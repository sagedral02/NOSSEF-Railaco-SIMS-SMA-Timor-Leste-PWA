'use client';

import { RequirePermission } from '@/components/guards';
import { ResourcePage, yesNo } from '@/components/resource';
import { Badge, Mono } from '@/components/ui';
import { useGradeLevels, useMajors, useSelectedYear } from '@/features/academics/api';
import { gradeOptions, majorOptions, roomOptions, teacherOptions } from '@/features/academics/options';
import { YearSelect } from '@/features/academics/year-select';
import { useI18n } from '@/i18n';

export default function ClassesPage() {
  const { t } = useI18n();
  const { year } = useSelectedYear();
  const grades = useGradeLevels().data ?? [];
  const majors = useMajors().data ?? [];
  return (
    <RequirePermission any={['academic.view']}>
      <ResourcePage
        title="nav.classes"
        path="/classrooms/"
        query={{ academic_year_id: year?.id }}
        enabled={!!year}
        headerActions={<YearSelect />}
        managePermission="academic.manage_class"
        filters={[
          { name: 'grade_level_id', label: 'grade.level', options: grades.map((g) => ({ value: g.id, label: g.code })) },
          { name: 'major_id', label: 'major.label', options: majors.map((m) => ({ value: m.id, label: m.code })) },
        ]}
        rowTitle={(r) => String(r.name)}
        toPayload={(v) => ({ ...v, academic_year: year?.id })}
        columns={[
          { header: 'common.code', cell: (r) => String(r.code), mono: true },
          { header: 'class.name', cell: (r) => String(r.name) },
          { header: 'grade.level', cell: (r) => <Badge mono>{String(r.grade_level_code)}</Badge> },
          { header: 'major.label', cell: (r) => <Badge mono>{String(r.major_code)}</Badge> },
          { header: 'class.homeroom', cell: (r) => String(r.homeroom_teacher_name ?? '—') },
          { header: 'student.classPresident', cell: (r) => String(r.class_president_name ?? '—') },
          { header: 'class.room', cell: (r) => <Mono>{String(r.default_room_code ?? '—')}</Mono> },
          { header: 'common.capacity', cell: (r) => String(r.capacity ?? '—'), align: 'right', mono: true },
          { header: 'common.active', cell: (r) => yesNo(r.active, t) },
        ]}
        fields={[
          { name: 'code', label: 'common.code', required: true, mono: true },
          { name: 'name', label: 'class.name', required: true },
          { name: 'grade_level', label: 'grade.level', type: 'select', required: true, optionsFrom: gradeOptions },
          { name: 'major', label: 'major.label', type: 'select', required: true, optionsFrom: majorOptions },
          { name: 'homeroom_teacher', label: 'class.homeroom', type: 'select', optionsFrom: teacherOptions, allowEmpty: true },
          { name: 'default_room', label: 'class.room', type: 'select', optionsFrom: roomOptions, allowEmpty: true },
          { name: 'capacity', label: 'common.capacity', type: 'number', default: 36 },
          { name: 'active', label: 'common.active', type: 'checkbox', default: true },
        ]}
      />
    </RequirePermission>
  );
}
