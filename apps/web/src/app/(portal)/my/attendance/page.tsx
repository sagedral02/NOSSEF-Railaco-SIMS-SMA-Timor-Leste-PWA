'use client';

import { PageHeader } from '@/components/ui';
import { ChildScope, HomeroomCard } from '@/features/portal/children';
import { LeavePanel } from '@/features/portal/leave';
import { StudentAttendanceTab } from '@/features/students/academic-tabs';
import { useI18n } from '@/i18n';

export default function MyAttendancePage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.myAttendance')} />
      <ChildScope>
        {(c) => (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <HomeroomCard child={c} />
              <LeavePanel studentId={c.id} />
            </div>
            <StudentAttendanceTab studentId={c.id} />
          </div>
        )}
      </ChildScope>
    </>
  );
}
