'use client';

import { ResourcePage, yesNo } from '@/components/resource';
import { Badge } from '@/components/ui';
import { useSelectedYear } from '@/features/academics/api';
import { trimesterOptions } from '@/features/academics/options';
import { YearSelect } from '@/features/academics/year-select';
import { useI18n } from '@/i18n';
import { fmtDate } from '@/lib/format';

const TYPES = ['HOLIDAY', 'EXAM', 'EVENT', 'DEADLINE', 'OTHER'];

export default function CalendarPage() {
  const { t, tx, locale } = useI18n();
  const { year } = useSelectedYear();
  const typeOptions = TYPES.map((v) => ({ value: v, label: tx(`event.type.${v}`, v) }));
  return (
    <ResourcePage
      title="nav.calendar"
      path="/calendar-events/"
      paginated
      query={{ academic_year_id: year?.id }}
      enabled={!!year}
      headerActions={<YearSelect />}
      managePermission="academic.manage_year"
      rowTitle={(r) => String(r.title)}
      toPayload={(v) => ({ ...v, academic_year: year?.id, trimester: v.trimester || null })}
      columns={[
        { header: 'common.startDate', cell: (r) => fmtDate(r.start_at as string, locale) },
        { header: 'common.endDate', cell: (r) => fmtDate(r.end_at as string, locale) },
        { header: 'common.type', cell: (r) => <Badge tone={r.event_type === 'HOLIDAY' ? 'warn' : r.event_type === 'EXAM' ? 'info' : 'neutral'}>{tx(`event.type.${r.event_type}`, String(r.event_type))}</Badge> },
        { header: 'common.title', cell: (r) => String(r.title) },
        { header: 'event.affectsClasses', cell: (r) => yesNo(r.affects_classes, t) },
      ]}
      fields={[
        { name: 'title', label: 'common.title', required: true, span: 2 },
        { name: 'event_type', label: 'common.type', type: 'select', required: true, options: typeOptions, default: 'EVENT' },
        { name: 'trimester', label: 'common.trimester', type: 'select', optionsFrom: trimesterOptions(year?.id), allowEmpty: true },
        { name: 'start_at', label: 'common.startDate', type: 'date', required: true },
        { name: 'end_at', label: 'common.endDate', type: 'date', required: true },
        { name: 'affects_classes', label: 'event.affectsClasses', type: 'checkbox' },
        { name: 'notes', label: 'common.notes', type: 'textarea' },
      ]}
    />
  );
}
