'use client';

import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ResourcePage, yesNo } from '@/components/resource';
import { Tabs } from '@/components/ui';
import { useI18n } from '@/i18n';

const ROOM_TYPES = ['CLASSROOM', 'LAB', 'LIBRARY', 'HALL', 'OTHER'];

export default function RoomsPage() {
  const { t, tx } = useI18n();
  const [tab, setTab] = useState<'rooms' | 'bells'>('rooms');
  const tabs = <Tabs tabs={[{ id: 'rooms', label: t('nav.rooms') }, { id: 'bells', label: t('bell.title') }]} value={tab} onChange={setTab} />;
  return (
    <RequirePermission any={['academic.view']}>
      {tab === 'rooms' ? (
        <ResourcePage
          title="nav.rooms"
          path="/rooms/"
          managePermission="academic.manage_class"
          rowTitle={(r) => `${r.code} — ${r.name}`}
          columns={[
            { header: 'common.code', cell: (r) => String(r.code), mono: true },
            { header: 'common.name', cell: (r) => String(r.name) },
            { header: 'common.type', cell: (r) => tx(`room.type.${r.room_type}`, String(r.room_type)) },
            { header: 'common.capacity', cell: (r) => String(r.capacity ?? '—'), align: 'right', mono: true },
            { header: 'common.active', cell: (r) => yesNo(r.active, t) },
          ]}
          fields={[
            { name: 'code', label: 'common.code', required: true, mono: true },
            { name: 'name', label: 'common.name', required: true },
            { name: 'room_type', label: 'common.type', type: 'select', required: true, default: 'CLASSROOM', options: ROOM_TYPES.map((v) => ({ value: v, label: tx(`room.type.${v}`, v) })) },
            { name: 'capacity', label: 'common.capacity', type: 'number' },
            { name: 'active', label: 'common.active', type: 'checkbox', default: true },
          ]}
        >
          {tabs}
        </ResourcePage>
      ) : (
        <ResourcePage
          title="bell.title"
          path="/bell-periods/"
          managePermission="academic.manage_class"
          rowTitle={(r) => String(r.name)}
          columns={[
            { header: 'common.sequence', cell: (r) => String(r.sequence), mono: true },
            { header: 'common.name', cell: (r) => String(r.name) },
            { header: 'bell.start', cell: (r) => String(r.start_time).slice(0, 5), mono: true },
            { header: 'bell.end', cell: (r) => String(r.end_time).slice(0, 5), mono: true },
            { header: 'common.active', cell: (r) => yesNo(r.active, t) },
          ]}
          fields={[
            { name: 'name', label: 'common.name', required: true },
            { name: 'sequence', label: 'common.sequence', type: 'number', required: true },
            { name: 'start_time', label: 'bell.start', type: 'time', required: true },
            { name: 'end_time', label: 'bell.end', type: 'time', required: true },
            { name: 'active', label: 'common.active', type: 'checkbox', default: true },
          ]}
        >
          {tabs}
        </ResourcePage>
      )}
    </RequirePermission>
  );
}
