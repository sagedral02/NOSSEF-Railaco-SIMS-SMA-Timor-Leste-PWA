'use client';

import { RequirePermission } from '@/components/guards';
import { ResourcePage, yesNo } from '@/components/resource';
import { Badge } from '@/components/ui';
import { useI18n } from '@/i18n';

const CATS = ['CORE', 'MAJOR', 'ELECTIVE', 'OTHER'];

export default function SubjectsPage() {
  const { t, tx } = useI18n();
  const catOptions = CATS.map((c) => ({ value: c, label: tx(`subject.cat.${c}`, c) }));
  return (
    <RequirePermission any={['academic.view']}>
      <ResourcePage
        title="nav.subjects"
        path="/subjects/"
        searchable
        managePermission="academic.manage_subject"
        rowTitle={(r) => `${r.code} — ${r.name}`}
        columns={[
          { header: 'common.code', cell: (r) => String(r.code), mono: true },
          { header: 'common.name', cell: (r) => String(r.name) },
          { header: 'subject.shortName', cell: (r) => String(r.short_name || '—') },
          { header: 'subject.category', cell: (r) => <Badge>{tx(`subject.cat.${r.category}`, String(r.category))}</Badge> },
          { header: 'common.active', cell: (r) => yesNo(r.active, t) },
        ]}
        fields={[
          { name: 'code', label: 'common.code', required: true, mono: true },
          { name: 'name', label: 'common.name', required: true },
          { name: 'short_name', label: 'subject.shortName' },
          { name: 'category', label: 'subject.category', type: 'select', required: true, options: catOptions, default: 'CORE' },
          { name: 'active', label: 'common.active', type: 'checkbox', default: true },
        ]}
      />
    </RequirePermission>
  );
}
