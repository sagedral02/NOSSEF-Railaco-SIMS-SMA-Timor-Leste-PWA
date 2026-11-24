'use client';

import { RequirePermission } from '@/components/guards';
import { ResourcePage, type Row } from '@/components/resource';
import { Alert, Mono, StatusPill } from '@/components/ui';
import { useGradeLevels, useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import { useI18n } from '@/i18n';
import { fmtDate } from '@/lib/format';

const STATUSES = ['REGISTERED', 'ATTENDED', 'ABSENT', 'PASSED', 'FAILED', 'PENDING'];

export default function NationalExamsPage() {
  const { t, tx, locale } = useI18n();
  const { year } = useSelectedYear();
  const xii = useGradeLevels().data?.find((g) => g.code === 'XII');
  const statusOptions = STATUSES.map((v) => ({ value: v, label: tx(`status.${v}`, v) }));
  return (
    <RequirePermission any={['report.view', 'student.view']}>
      <ResourcePage
        key={year?.id}
        title="ne.title"
        path="/national-exams/"
        query={{ academic_year_id: year?.id }}
        enabled={!!year}
        paginated
        managePermission={['report.publish', 'student.update']}
        canDelete={false}
        filters={[{ name: 'status', label: 'common.status', options: statusOptions }]}
        headerActions={<YearSelect />}
        rowTitle={(r) => String(r.student_name)}
        toPayload={(v) => ({ ...v, academic_year: year?.id, overall_score: v.overall_score === '' ? null : v.overall_score, result_date: v.result_date || null })}
        columns={[
          { header: 'student.no', cell: (r) => <Mono>{String(r.student_no)}</Mono> },
          { header: 'common.name', cell: (r) => String(r.student_name) },
          { header: 'ne.examName', cell: (r) => String(r.exam_name) },
          { header: 'ne.candidateNo', cell: (r) => <Mono>{String(r.candidate_no || '—')}</Mono> },
          { header: 'ne.score', cell: (r) => (r.overall_score != null ? String(r.overall_score) : '—'), align: 'right', mono: true },
          { header: 'ne.resultDate', cell: (r) => fmtDate(r.result_date as string | null, locale) },
          { header: 'ne.certificateNo', cell: (r) => <Mono>{String(r.certificate_no || '—')}</Mono> },
          { header: 'common.status', cell: (r) => <StatusPill status={String(r.status)} /> },
        ]}
        fields={[
          {
            name: 'student', label: 'common.name', type: 'select', required: true, span: 2, createOnly: true,
            optionsFrom: { path: '/students/', query: { academic_year_id: year?.id, grade_level_id: xii?.id, status: 'ACTIVE' }, label: (r: Row) => `${r.student_no} — ${r.full_name}` },
          },
          { name: 'exam_name', label: 'ne.examName', required: true, default: 'Exame Nacional do Ensino Secundário', span: 2 },
          { name: 'candidate_no', label: 'ne.candidateNo', mono: true },
          { name: 'status', label: 'common.status', type: 'select', required: true, options: statusOptions, default: 'REGISTERED' },
          { name: 'overall_score', label: 'ne.score', type: 'number' },
          { name: 'result_date', label: 'ne.resultDate', type: 'date' },
          { name: 'certificate_no', label: 'ne.certificateNo', mono: true },
        ]}
      >
        <div className="mb-4"><Alert>{t('ne.note')}</Alert></div>
      </ResourcePage>
    </RequirePermission>
  );
}
