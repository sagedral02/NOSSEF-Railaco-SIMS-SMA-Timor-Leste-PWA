'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Archive, Undo2, UserCheck, Wrench } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { ResourcePage, type Row } from '@/components/resource';
import {
  ApiErrorAlert, Button, Card, Checkbox, Drawer, EmptyState, ErrorState, FilterPills, Input, KV, Mono, ReasonDialog, Select, Skeleton, StatusPill, Table,
  Td, Tr,
} from '@/components/ui';
import { roomOptions, teacherOptions } from '@/features/academics/options';
import { useAuth } from '@/features/auth/auth';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, usd } from '@/lib/format';

interface Assignment { id: string; assigned_to_type: string; target_name: string; assigned_at: string; returned_at: string | null; condition_after: string; note: string; assigned_by_name: string }
interface AssetDetail {
  id: string; asset_no: string; name: string; category: string; serial_no: string; purchase_date: string | null; purchase_cost: string | null;
  location_room: string | null; location_room_code: string | null; condition: string; status: string; retire_reason: string; current_assignment: Assignment | null;
  assignments: Assignment[]; maintenance: { id: string; started_at: string; completed_at: string | null; description: string; cost: string | null; vendor: string; status: string }[];
  movements: { id: string; from_room_code: string | null; to_room_code: string | null; moved_at: string; moved_by_name: string; note: string }[];
}

function useOptionRows(opt: typeof roomOptions) {
  return useQuery({ queryKey: ['options', opt!.path, opt!.query], queryFn: () => api.get<Row[]>(opt!.path, { page_size: 100, ...opt!.query }), staleTime: 60_000 }).data ?? [];
}

function AssetDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['assets', id], queryFn: () => api.get<AssetDetail>(`/assets/${id}/`) });
  const rooms = useOptionRows(roomOptions);
  const teachers = useOptionRows(teacherOptions);
  const staff = useQuery({ queryKey: ['options', 'staff'], queryFn: () => api.get<Row[]>('/staff/staff/', { page_size: 100 }) }).data ?? [];
  const [panel, setPanel] = useState<'assign' | 'return' | 'maint' | 'transfer' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ target_type: 'TEACHER', condition_after: 'GOOD' });
  const [dialog, setDialog] = useState<'retire' | 'restore' | null>(null);
  const [lost, setLost] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['assets'] }); qc.invalidateQueries({ queryKey: ['resource'] }); };
  const run = useMutation({
    mutationFn: () => {
      if (panel === 'assign') return api.post(`/assets/${id}/assign/`, { target_type: form.target_type, teacher: form.target_type === 'TEACHER' ? form.target : null, staff: form.target_type === 'STAFF' ? form.target : null, room: form.target_type === 'ROOM' ? form.target : null, note: form.note ?? '' });
      if (panel === 'return') return api.post(`/assets/${id}/return/`, { condition_after: form.condition_after, note: form.note ?? '' });
      if (panel === 'maint') return api.post(`/assets/${id}/maintenance/`, { description: form.description, vendor: form.vendor ?? '' });
      return api.post(`/assets/${id}/transfer/`, { to_room: form.to_room, note: form.note ?? '' });
    },
    onSuccess: () => { setPanel(null); setForm({ target_type: 'TEACHER', condition_after: 'GOOD' }); refresh(); },
  });
  const complete = useMutation({ mutationFn: (m: string) => api.post(`/assets/${id}/maintenance/complete/`, { maintenance: m, cost: form.cost || null }), onSuccess: refresh });
  const a = q.data;
  const targets = form.target_type === 'TEACHER' ? teachers : form.target_type === 'STAFF' ? staff : rooms;
  const busy = a && (a.status === 'RETIRED' || a.status === 'LOST');
  return (
    <Drawer open onClose={onClose} width={600} title={a ? `${a.asset_no} · ${a.name}` : '…'} subtitle={a?.category}
      footer={a && can('asset.assign', 'asset.manage') ? <>
        {a.status === 'AVAILABLE' && can('asset.assign') && <Button icon={UserCheck} onClick={() => setPanel('assign')}>{t('asset.assign')}</Button>}
        {a.current_assignment && can('asset.assign') && <Button icon={Undo2} onClick={() => setPanel('return')}>{t('asset.return')}</Button>}
        {!busy && can('asset.manage') && <Button icon={Wrench} onClick={() => setPanel('maint')}>{t('asset.startMaintenance')}</Button>}
        {!busy && <Button icon={ArrowRightLeft} onClick={() => setPanel('transfer')}>{t('asset.transfer')}</Button>}
        {!busy && !a.current_assignment && can('asset.manage') && <Button variant="danger" icon={Archive} onClick={() => setDialog('retire')}>{t('asset.retire')}</Button>}
        {busy && can('asset.manage') && <Button onClick={() => setDialog('restore')}>{t('asset.restore')}</Button>}
      </> : undefined}>
      {q.isPending ? <Skeleton rows={5} /> : q.error ? <ErrorState error={q.error} /> : a && (
        <div className="space-y-4">
          <ApiErrorAlert error={run.error || complete.error} />
          <div className="flex gap-2"><StatusPill status={a.status} /><StatusPill status={a.condition} label={tx(`cond.${a.condition}`, a.condition)} /></div>
          {a.retire_reason && <p className="text-sm text-ink2">{a.retire_reason}</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <KV k={t('asset.serial')} v={a.serial_no || '—'} mono />
            <KV k={t('asset.purchaseDate')} v={fmtDate(a.purchase_date, locale)} />
            <KV k={t('asset.cost')} v={a.purchase_cost ? usd(a.purchase_cost) : '—'} mono />
            <KV k={t('asset.location')} v={a.location_room_code ?? '—'} />
            <KV k={t('asset.holder')} v={a.current_assignment ? `${a.current_assignment.target_name} (${tx(`target.${a.current_assignment.assigned_to_type}`, a.current_assignment.assigned_to_type)})` : '—'} />
          </div>
          {panel && (
            <Card>
              <div className="space-y-3">
                {panel === 'assign' && <>
                  <FilterPills value={form.target_type} onChange={(v) => setForm({ ...form, target_type: v, target: '' })} options={['TEACHER', 'STAFF', 'ROOM'].map((x) => ({ id: x, label: tx(`target.${x}`, x) }))} />
                  <Select aria-label={t('asset.holder')} value={form.target ?? ''} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                    <option value="">—</option>{targets.map((r) => <option key={r.id} value={r.id}>{String(r.full_name ?? `${r.code} — ${r.name}`)}</option>)}
                  </Select>
                </>}
                {panel === 'return' && (
                  <Select aria-label={t('lib.condition')} value={form.condition_after} onChange={(e) => setForm({ ...form, condition_after: e.target.value })}>
                    {['GOOD', 'FAIR', 'DAMAGED', 'REPAIR', 'LOST'].map((c) => <option key={c} value={c}>{tx(`cond.${c}`, c)}</option>)}
                  </Select>
                )}
                {panel === 'maint' && <>
                  <Input aria-label={t('common.reason')} placeholder={t('asset.maintenance')} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <Input aria-label={t('asset.vendor')} placeholder={t('asset.vendor')} value={form.vendor ?? ''} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                </>}
                {panel === 'transfer' && (
                  <Select aria-label={t('asset.location')} value={form.to_room ?? ''} onChange={(e) => setForm({ ...form, to_room: e.target.value })}>
                    <option value="">—</option>{rooms.map((r) => <option key={r.id} value={r.id}>{`${r.code} — ${r.name}`}</option>)}
                  </Select>
                )}
                {panel !== 'maint' && <Input aria-label="note" placeholder={t('common.optional')} value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />}
                <div className="flex justify-end gap-2"><Button onClick={() => setPanel(null)}>{t('common.cancel')}</Button><Button variant="primary" disabled={run.isPending} onClick={() => run.mutate()}>{t('common.save')}</Button></div>
              </div>
            </Card>
          )}
          <Card title={t('asset.history')} pad={false}>
            {a.assignments.length ? <Table><tbody>{a.assignments.map((s) => (
              <Tr key={s.id}><Td>{s.target_name} <span className="text-xs text-ink2">({tx(`target.${s.assigned_to_type}`, s.assigned_to_type)})</span></Td>
                <Td className="text-xs">{fmtDateTime(s.assigned_at, locale)} → {s.returned_at ? fmtDateTime(s.returned_at, locale) : '…'}</Td>
                <Td>{s.condition_after && tx(`cond.${s.condition_after}`, s.condition_after)}</Td></Tr>
            ))}</tbody></Table> : <EmptyState />}
          </Card>
          <Card title={t('asset.maintenance')} pad={false}>
            {a.maintenance.length ? <Table><tbody>{a.maintenance.map((m) => (
              <Tr key={m.id}><Td>{m.description}<div className="text-xs text-ink2">{m.vendor} · {fmtDate(m.started_at, locale)}{m.completed_at && ` → ${fmtDate(m.completed_at, locale)}`}</div></Td>
                <Td align="right" mono>{m.cost ? usd(m.cost) : ''}</Td><Td><StatusPill status={m.status} /></Td>
                <Td>{m.status === 'OPEN' && can('asset.manage') && <div className="flex gap-1"><Input aria-label={t('asset.cost')} className="h-8 w-20" placeholder="USD" value={form.cost ?? ''} onChange={(e) => setForm({ ...form, cost: e.target.value })} /><Button size="sm" onClick={() => complete.mutate(m.id)}>{t('asset.completeMaintenance')}</Button></div>}</Td></Tr>
            ))}</tbody></Table> : <EmptyState />}
          </Card>
          {a.movements.length > 0 && (
            <Card title={t('asset.transfer')} pad={false}>
              <Table><tbody>{a.movements.map((m) => <Tr key={m.id}><Td mono>{m.from_room_code ?? '—'} → {m.to_room_code ?? '—'}</Td><Td className="text-xs">{fmtDateTime(m.moved_at, locale)} · {m.moved_by_name}</Td><Td className="text-xs">{m.note}</Td></Tr>)}</tbody></Table>
            </Card>
          )}
        </div>
      )}
      <ReasonDialog open={dialog === 'retire'} onClose={() => setDialog(null)} title={t('asset.retire')} confirmLabel={t('asset.retire')} danger
        description={<label className="flex items-center gap-2 text-sm"><Checkbox checked={lost} onChange={setLost} />{t('asset.lostFlag')}</label>}
        onConfirm={async (reason) => { await api.post(`/assets/${id}/retire/`, { reason, lost }); refresh(); }} />
      <ReasonDialog open={dialog === 'restore'} onClose={() => setDialog(null)} title={t('asset.restore')} confirmLabel={t('asset.restore')}
        onConfirm={async (reason) => { await api.post(`/assets/${id}/restore/`, { reason }); refresh(); }} />
    </Drawer>
  );
}

export default function AssetsPage() {
  const { t, tx } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const statuses = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'].map((v) => ({ value: v, label: tx(`status.${v}`, v) }));
  return (
    <RequirePermission any={['asset.view']}>
      <ResourcePage title="nav.assets" path="/assets/" paginated searchable managePermission="asset.manage" rowTitle={(r) => String(r.asset_no)}
        filters={[{ name: 'status', label: 'common.status', options: statuses }]}
        toPayload={(v) => ({ ...v, purchase_cost: v.purchase_cost || null, purchase_date: v.purchase_date || null, location_room: v.location_room || null })}
        rowActions={(r) => <Button size="sm" onClick={() => setOpen(String(r.id))}>{t('asset.history')}</Button>}
        columns={[
          { header: 'asset.no', cell: (r) => <Mono>{String(r.asset_no)}</Mono> },
          { header: 'asset.name', cell: (r) => <><div className="font-medium">{String(r.name)}</div><div className="text-xs text-ink2">{String(r.category)}</div></> },
          { header: 'asset.location', cell: (r) => String(r.location_room_code ?? '—') },
          { header: 'asset.holder', cell: (r) => { const c = r.current_assignment as Assignment | null; return c ? c.target_name : '—'; } },
          { header: 'lib.condition', cell: (r) => tx(`cond.${r.condition}`, String(r.condition)) },
          { header: 'common.status', cell: (r) => <StatusPill status={String(r.status)} /> },
        ]}
        fields={[
          { name: 'asset_no', label: 'asset.no', required: true, mono: true },
          { name: 'name', label: 'asset.name', required: true },
          { name: 'category', label: 'asset.category', required: true },
          { name: 'serial_no', label: 'asset.serial', mono: true },
          { name: 'purchase_date', label: 'asset.purchaseDate', type: 'date' },
          { name: 'purchase_cost', label: 'asset.cost', mono: true },
          { name: 'location_room', label: 'asset.location', type: 'select', optionsFrom: roomOptions, allowEmpty: true },
          { name: 'condition', label: 'lib.condition', type: 'select', required: true, default: 'GOOD', options: ['GOOD', 'FAIR', 'DAMAGED', 'REPAIR'].map((v) => ({ value: v, label: tx(`cond.${v}`, v) })) },
        ]}
      />
      {open && <AssetDrawer key={open} id={open} onClose={() => setOpen(null)} />}
    </RequirePermission>
  );
}
