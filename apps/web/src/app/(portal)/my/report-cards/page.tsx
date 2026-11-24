'use client';

import { PageHeader } from '@/components/ui';
import { ChildScope } from '@/features/portal/children';
import { StudentGradesTab } from '@/features/students/academic-tabs';
import { useI18n } from '@/i18n';

export default function MyReportCardsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.myReports')} />
      <ChildScope>{(c) => <StudentGradesTab studentId={c.id} />}</ChildScope>
    </>
  );
}
