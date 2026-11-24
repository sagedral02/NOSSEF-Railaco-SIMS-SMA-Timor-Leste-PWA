'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Bell, HeartHandshake, Plus } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import {
  Alert, ApiErrorAlert, Badge, Button, Drawer, EmptyState, ErrorState, Field, FilterPills, Input, KV, Mono, PageHeader, ReasonDialog, SearchInput, Select,
  Skeleton, StatusPill, Table, Td, Textarea, Th, Tr, Card,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { useAuth } from '@/features/auth/auth';
import { SEV_TONE } from '@/features/counseling/shared';
import { StudentSearchField } from '@/features/students/student-field';
import { useI18n } from '@/i18n';
import { api, fieldError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Incident {
  id: string; student: string; student_name: string; student_no: string; occurred_at: string; location: string; category: string; severity: string;
  description: string; reported_by_name: string; action_type: string; action_taken: string; status: string; void_reason: string;
  referred_case: string | null; referred_case_no: string | null; guardian_notice: string; guardian_notified_at: string | null; can_manage: boolean;
  guardian_contacts: { id: string; contacted_at: string; channel: string; summary: string; created_by_name: string }[];
}
const ACTIONS = ['NONE', 'WARNING', 'COUNSELING_REFERRAL', 'PARENT_MEETING', 'OTHER'];
const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function NewIncident({ onClose }: { onClose: () => void }) {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState({ student: null as string | null, occurred_at: localNow(), location: '', category: '', severity: 'LOW', description: '' });
  const m = useMutation({
    mutationFn: () => api.post('/discipline/incidents/', { ...f, occurred_at: new Date(f.occurred_at).toISOString() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['discipline'] }); onClose(); },
  });
  return (
    <Drawer open onClose={onClose} title={t('dis.new')} width={480}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={m.isPending} onClick={() => m.mutate()}>{t('common.save')}</Button></>}>
      <div className="space-y-3">
        <ApiErrorAlert error={m.error} />
        <Field label={t('common.name')} required error={fieldError(m.error, 'student')}><StudentSearchField value={f.student} onChange={(v) => setF({ ...f, student: v })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('dis.occurredAt')} required><Input type="datetime-local" value={f.occurred_at} onChange={(e) => setF({ ...f, occurred_at: e.target.value })} /></Field>
          <Field label={t('dis.location')}><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          <Field label={t('bk.category')} required error={fieldError(m.error, 'category')}><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <Field label={t('bk.severity')} required>
            <Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH'].map((s) => <option key={s} value={s}>{tx(`sev.${s}`, s)}</option>)}</Select>
          </Field>
        </div>
        <Field label={t('dis.description')} required error={fieldError(m.error, 'description')}><Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}

function IncidentDrawer({ inc, onClose }: { inc: Incident; onClose: () => void }) {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [voiding, setVoiding] = useState(false);
  const [action, setAction] = useState({ action_type: inc.action_type, action_taken: inc.action_taken, status: inc.status });
  const [notice, setNotice] = useState(inc.guardian_notice);
  const refresh = () => qc.invalidateQueries({ queryKey: ['discipline'] });
  const manage = inc.can_manage;
  const saveAction = useMutation({ mutationFn: () => api.patch(`/discipline/incidents/${inc.id}/`, action), onSuccess: () => { toast(t('common.saved'), 'ok'); refresh(); onClose(); } });
  const sendNotice = useMutation({ mutationFn: () => api.post(`/discipline/incidents/${inc.id}/notice/`, { notice }), onSuccess: () => { toast(t('dis.notified'), 'ok'); refresh(); onClose(); } });
  const refer = useMutation({ mutationFn: () => api.post(`/discipline/incidents/${inc.id}/refer/`), onSuccess: () => { refresh(); onClose(); } });
  const isVoid = inc.status === 'VOID';
  return (
    <Drawer open onClose={onClose} width={560} title={`${inc.category} · ${inc.student_name}`} subtitle={`${inc.student_no} · ${fmtDateTime(inc.occurred_at, locale)}`}
      footer={manage && !isVoid ? <>
        {can('counseling.manage') && !inc.referred_case && <Button icon={HeartHandshake} onClick={() => refer.mutate()}>{t('dis.refer')}</Button>}
        <Button variant="danger" icon={Ban} onClick={() => setVoiding(true)}>{t('dis.void')}</Button>
      </> : undefined}>
      <div className="space-y-4">
        <ApiErrorAlert error={saveAction.error || sendNotice.error || refer.error} />
        <div className="flex items-center gap-2"><StatusPill status={inc.status} /><Badge tone={SEV_TONE[inc.severity]} dot>{tx(`sev.${inc.severity}`, inc.severity)}</Badge>
          {inc.referred_case_no && <Badge tone="info">BK {inc.referred_case_no}</Badge>}</div>
        {isVoid && <Alert tone="warn" title="VOID">{inc.void_reason}</Alert>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <KV k={t('dis.location')} v={inc.location || '—'} />
          <KV k={t('dis.reporter')} v={inc.reported_by_name} mono />
        </div>
        <div><div className="text-xs font-semibold text-ink2 mb-1">{t('dis.description')}</div><p className="text-sm whitespace-pre-line">{inc.description}</p></div>
        {manage && !isVoid ? (
          <Card title={t('dis.action')}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select aria-label={t('dis.action')} value={action.action_type} onChange={(e) => setAction({ ...action, action_type: e.target.value })}>{ACTIONS.map((a) => <option key={a} value={a}>{tx(`action.${a}`, a)}</option>)}</Select>
                <Select aria-label={t('common.status')} value={action.status} onChange={(e) => setAction({ ...action, status: e.target.value })}>{['OPEN', 'RESOLVED'].map((s) => <option key={s} value={s}>{tx(`status.${s}`, s)}</option>)}</Select>
              </div>
              <Textarea rows={2} aria-label={t('dis.actionTaken')} placeholder={t('dis.actionTaken')} value={action.action_taken} onChange={(e) => setAction({ ...action, action_taken: e.target.value })} />
              <div className="flex justify-end"><Button size="sm" variant="primary" disabled={saveAction.isPending} onClick={() => saveAction.mutate()}>{t('common.save')}</Button></div>
            </div>
          </Card>
        ) : (
          <KV k={t('dis.action')} v={`${tx(`action.${inc.action_type}`, inc.action_type)}${inc.action_taken ? ` — ${inc.action_taken}` : ''}`} />
        )}
        {manage && !isVoid && (
          <Card title={t('dis.notice')}>
            <div className="space-y-2">
              <p className="text-xs text-ink2">{t('dis.noticeHint')}</p>
              {inc.guardian_notified_at && <Badge tone="ok" dot>{t('dis.notified')} {fmtDateTime(inc.guardian_notified_at, locale)}</Badge>}
              <Textarea rows={3} aria-label={t('dis.notice')} value={notice} onChange={(e) => setNotice(e.target.value)} />
              <div className="flex justify-end"><Button size="sm" icon={Bell} disabled={!notice.trim() || sendNotice.isPending} onClick={() => sendNotice.mutate()}>{t('dis.publishNotice')}</Button></div>
            </div>
          </Card>
        )}
        {inc.guardian_contacts.length > 0 && (
          <Card title={t('bk.contacts')} pad={false}>
            {inc.guardian_contacts.map((g) => <div key={g.id} className="px-4 py-2.5 border-b border-line last:border-0 text-sm"><span className="text-xs text-ink2">{fmtDateTime(g.contacted_at, locale)} · {tx(`channel.${g.channel}`, g.channel)}</span><div>{g.summary}</div></div>)}
          </Card>
        )}
      </div>
      <ReasonDialog open={voiding} onClose={() => setVoiding(false)} title={t('dis.void')} confirmLabel={t('dis.void')} danger
        onConfirm={async (reason) => { await api.post(`/discipline/incidents/${inc.id}/void/`, { reason }); await refresh(); onClose(); }} />
    </Drawer>
  );
}

function DisciplineScreen() {
  const { t, tx, locale } = useI18n();
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Incident | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['discipline', status, q], queryFn: () => api.page<Incident>('/discipline/incidents/', { status, q, page_size: 50 }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title={t('nav.discipline')} actions={can('discipline.manage') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{t('dis.new')}</Button>} />
      <div className="flex flex-wrap gap-3 items-center mb-3">
        <FilterPills value={status} onChange={setStatus} options={[{ id: '', label: t('common.all') }, ...['OPEN', 'RESOLVED', 'VOID'].map((x) => ({ id: x, label: tx(`status.${x}`, x) }))]} />
        <SearchInput className="md:ml-auto md:w-72" value={q} onChange={setQ} />
      </div>
      {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <Card pad={false}>
          <Table>
            <thead><tr><Th>{t('dis.occurredAt')}</Th><Th>{t('common.name')}</Th><Th>{t('bk.category')}</Th><Th>{t('bk.severity')}</Th><Th>{t('dis.action')}</Th><Th>{t('dis.reporter')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>{list.data.data.map((i) => (
              <Tr key={i.id} onClick={() => setOpen(i)}>
                <Td>{fmtDateTime(i.occurred_at, locale)}</Td>
                <Td><div className="font-medium">{i.student_name}</div><Mono className="text-xs text-ink2">{i.student_no}</Mono></Td>
                <Td>{i.category}{i.location && <div className="text-xs text-ink2">{i.location}</div>}</Td>
                <Td><Badge tone={SEV_TONE[i.severity]} dot>{tx(`sev.${i.severity}`, i.severity)}</Badge></Td>
                <Td className="text-sm">{tx(`action.${i.action_type}`, i.action_type)}{i.guardian_notified_at && <Bell className="inline w-3.5 h-3.5 ml-1 text-ok" aria-label={t('dis.notified')} />}</Td>
                <Td mono className="text-xs">{i.reported_by_name}</Td>
                <Td><StatusPill status={i.status} /></Td>
              </Tr>
            ))}</tbody>
          </Table>
          {!list.data.data.length && <EmptyState />}
        </Card>
      )}
      {open && <IncidentDrawer key={open.id} inc={open} onClose={() => setOpen(null)} />}
      {creating && <NewIncident onClose={() => setCreating(false)} />}
    </>
  );
}

export default function DisciplinePage() {
  return (
    <RequirePermission any={['discipline.view', 'discipline.manage']}>
      <DisciplineScreen />
    </RequirePermission>
  );
}
