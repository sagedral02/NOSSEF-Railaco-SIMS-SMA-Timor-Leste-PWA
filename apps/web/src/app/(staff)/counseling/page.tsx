'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import {
  Alert, ApiErrorAlert, Badge, Button, Card, Drawer, EmptyState, ErrorState, Field, FilterPills, Input, KV, Mono, PageHeader, ReasonDialog, SearchInput,
  Select, Skeleton, Stat, StatusPill, Table, Td, Textarea, Th, Tr,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth';
import { SEV_TONE } from '@/features/counseling/shared';
import { StudentSearchField } from '@/features/students/student-field';
import { useI18n } from '@/i18n';
import { api, fieldError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';


interface CaseRow {
  id: string; case_no: string; student: string; student_name: string; student_no: string; category: string; severity: string; summary: string;
  status: string; counselor_name: string | null; opened_at: string; closed_at: string | null; version: number;
}
interface CaseDetail extends CaseRow {
  details: string; reopen_reason: string;
  follow_ups: { id: string; follow_up_at: string; note: string; next_action_at: string | null; created_by_name: string }[];
  guardian_contacts: { id: string; contacted_at: string; channel: string; summary: string; created_by_name: string }[];
}

const NEXT: Record<string, string[]> = { OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'], IN_PROGRESS: ['RESOLVED', 'CLOSED'], RESOLVED: ['IN_PROGRESS', 'CLOSED'], CLOSED: ['OPEN'] };

function NewCase({ onClose }: { onClose: () => void }) {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState({ student: null as string | null, category: '', severity: 'MEDIUM', summary: '', details: '' });
  const m = useMutation({ mutationFn: () => api.post('/counseling/cases/', f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['counseling'] }); onClose(); } });
  return (
    <Drawer open onClose={onClose} title={t('bk.newCase')} width={480}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={m.isPending} onClick={() => m.mutate()}>{t('common.save')}</Button></>}>
      <div className="space-y-3">
        <ApiErrorAlert error={m.error} />
        <Field label={t('common.name')} required error={fieldError(m.error, 'student')}><StudentSearchField value={f.student} onChange={(v) => setF({ ...f, student: v })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('bk.category')} required error={fieldError(m.error, 'category')}><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <Field label={t('bk.severity')} required>
            <Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{tx(`sev.${s}`, s)}</option>)}</Select>
          </Field>
        </div>
        <Field label={t('bk.summary')} required error={fieldError(m.error, 'summary')}><Input maxLength={250} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
        <Field label={t('bk.details')} hint={t('bk.restrictedHint')}><Textarea rows={5} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}

function CaseDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['counseling', 'case', id], queryFn: () => api.get<CaseDetail>(`/counseling/cases/${id}/`) });
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [contact, setContact] = useState({ channel: 'PHONE', summary: '' });
  const [details, setDetails] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['counseling'] });
  const follow = useMutation({ mutationFn: () => api.post(`/counseling/cases/${id}/follow-ups/`, { note, next_action_at: next ? new Date(next).toISOString() : null }), onSuccess: () => { setNote(''); setNext(''); refresh(); } });
  const contactM = useMutation({ mutationFn: () => api.post(`/counseling/cases/${id}/guardian-contacts/`, contact), onSuccess: () => { setContact({ channel: 'PHONE', summary: '' }); refresh(); } });
  const saveDetails = useMutation({ mutationFn: () => api.patch(`/counseling/cases/${id}/`, { details, expected_version: q.data?.version }), onSuccess: () => { setDetails(null); refresh(); } });
  const c = q.data;
  const closed = c?.status === 'CLOSED';
  const manage = can('counseling.manage');
  return (
    <Drawer open onClose={onClose} width={620} title={c ? `${c.case_no} · ${c.student_name}` : '…'} subtitle={c ? `${c.category} · ${c.student_no}` : undefined}>
      {q.isPending ? <Skeleton rows={5} /> : q.error ? <ErrorState error={q.error} /> : c && (
        <div className="space-y-4">
          <Alert tone="warn" icon={Lock}>{t('bk.restrictedHint')}</Alert>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={c.status} /><Badge tone={SEV_TONE[c.severity]} dot>{tx(`sev.${c.severity}`, c.severity)}</Badge>
            <span className="text-xs text-ink2">{t('bk.opened')} {fmtDateTime(c.opened_at, locale)} · {c.counselor_name}</span>
            {manage && <div className="ml-auto flex gap-1">{(NEXT[c.status] ?? []).filter((s) => s !== 'OPEN' || can('counseling.reopen')).map((s) => (
              <Button key={s} size="sm" onClick={() => setTarget(s)}>{tx(`bk.to${s}`, s)}</Button>
            ))}</div>}
          </div>
          {c.reopen_reason && <Alert title={t('bk.toOPEN')}>{c.reopen_reason}</Alert>}
          <KV k={t('bk.summary')} v={c.summary} />
          <div>
            <div className="text-xs font-semibold text-ink2 mb-1">{t('bk.details')}</div>
            {details === null ? (
              <div className="flex gap-2 items-start">
                <p className="text-sm whitespace-pre-line flex-1">{c.details || '—'}</p>
                {manage && !closed && <Button size="sm" onClick={() => setDetails(c.details)}>{t('common.edit')}</Button>}
              </div>
            ) : (
              <div className="space-y-2">
                <ApiErrorAlert error={saveDetails.error} />
                <Textarea rows={5} value={details} onChange={(e) => setDetails(e.target.value)} />
                <div className="flex gap-2 justify-end"><Button size="sm" onClick={() => setDetails(null)}>{t('common.cancel')}</Button><Button size="sm" variant="primary" onClick={() => saveDetails.mutate()}>{t('common.save')}</Button></div>
              </div>
            )}
          </div>
          <Card title={t('bk.followUps')} pad={false}>
            {c.follow_ups.map((f) => (
              <div key={f.id} className="px-4 py-3 border-b border-line text-sm">
                <div className="text-xs text-ink2 mb-1">{fmtDateTime(f.follow_up_at, locale)} · {f.created_by_name}{f.next_action_at && ` · ${t('bk.nextAction')}: ${fmtDateTime(f.next_action_at, locale)}`}</div>
                <p className="whitespace-pre-line">{f.note}</p>
              </div>
            ))}
            {manage && !closed && (
              <div className="p-4 space-y-2">
                <ApiErrorAlert error={follow.error} />
                <Textarea rows={3} aria-label={t('bk.addFollowUp')} placeholder={t('bk.addFollowUp')} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2 items-end">
                  <Field label={t('bk.nextAction')} className="flex-1"><Input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
                  <Button variant="primary" disabled={!note.trim() || follow.isPending} onClick={() => follow.mutate()}>{t('common.add')}</Button>
                </div>
                <p className="text-[11px] text-muted">{t('bk.appendOnly')}</p>
              </div>
            )}
          </Card>
          <Card title={t('bk.contacts')} pad={false}>
            {c.guardian_contacts.map((g) => (
              <div key={g.id} className="px-4 py-2.5 border-b border-line text-sm">
                <span className="text-xs text-ink2">{fmtDateTime(g.contacted_at, locale)} · {tx(`channel.${g.channel}`, g.channel)} · {g.created_by_name}</span>
                <div>{g.summary}</div>
              </div>
            ))}
            {manage && !closed && (
              <div className="p-4 flex gap-2 items-end">
                <Select aria-label={t('bk.channel')} className="w-auto" value={contact.channel} onChange={(e) => setContact({ ...contact, channel: e.target.value })}>
                  {['PHONE', 'MEETING', 'LETTER', 'MESSAGE', 'OTHER'].map((ch) => <option key={ch} value={ch}>{tx(`channel.${ch}`, ch)}</option>)}
                </Select>
                <Input aria-label={t('bk.addContact')} placeholder={t('bk.addContact')} value={contact.summary} onChange={(e) => setContact({ ...contact, summary: e.target.value })} />
                <Button disabled={!contact.summary.trim() || contactM.isPending} onClick={() => contactM.mutate()}>{t('common.add')}</Button>
              </div>
            )}
          </Card>
        </div>
      )}
      <ReasonDialog open={!!target} onClose={() => setTarget(null)} title={`${c?.case_no ?? ''} → ${target ? tx(`bk.to${target}`, target) : ''}`} confirmLabel={t('common.confirm')}
        optional={c?.status !== 'CLOSED'} description={c?.status === 'CLOSED' ? t('bk.reopenHint') : undefined}
        onConfirm={async (reason) => { await api.post(`/counseling/cases/${id}/status/`, { status: target, reason }); await refresh(); }} />
    </Drawer>
  );
}

interface Summary { cases_by_status: Record<string, number>; open_cases_by_severity: Record<string, number>; incidents_by_status: Record<string, number> }

function CounselingScreen() {
  const { t, tx, locale } = useI18n();
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['counseling', 'cases', status, q], queryFn: () => api.page<CaseRow>('/counseling/cases/', { status, q, page_size: 50 }), placeholderData: keepPreviousData });
  const sum = useQuery({ queryKey: ['counseling', 'summary'], queryFn: () => api.get<Summary>('/counseling/summary/') });
  const s = sum.data;
  return (
    <>
      <PageHeader title={t('nav.counseling')} actions={can('counseling.manage') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{t('bk.newCase')}</Button>} />
      {s && (
        <Card pad={false} className="mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-line">
            <Stat label={t('status.OPEN')} value={(s.cases_by_status.OPEN ?? 0) + (s.cases_by_status.IN_PROGRESS ?? 0)} />
            <Stat label={tx('sev.HIGH', 'HIGH') + ' / ' + tx('sev.CRITICAL', 'CRITICAL')} value={(s.open_cases_by_severity.HIGH ?? 0) + (s.open_cases_by_severity.CRITICAL ?? 0)} tone={(s.open_cases_by_severity.CRITICAL ?? 0) ? 'bad' : undefined} />
            <Stat label={t('status.RESOLVED')} value={s.cases_by_status.RESOLVED ?? 0} tone="ok" />
            <Stat label={t('nav.discipline')} value={s.incidents_by_status.OPEN ?? 0} href="/discipline" />
          </div>
        </Card>
      )}
      <div className="flex flex-wrap gap-3 items-center mb-3">
        <FilterPills value={status} onChange={setStatus} options={[{ id: '', label: t('common.all') }, ...['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((x) => ({ id: x, label: tx(`status.${x}`, x) }))]} />
        <SearchInput className="md:ml-auto md:w-72" value={q} onChange={setQ} />
      </div>
      {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <Card pad={false}>
          <Table>
            <thead><tr><Th>{t('bk.caseNo')}</Th><Th>{t('common.name')}</Th><Th>{t('bk.category')}</Th><Th>{t('bk.summary')}</Th><Th>{t('bk.severity')}</Th><Th>{t('bk.opened')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>{list.data.data.map((c) => (
              <Tr key={c.id} onClick={() => setOpen(c.id)}>
                <Td mono>{c.case_no}</Td><Td><div className="font-medium">{c.student_name}</div><Mono className="text-xs text-ink2">{c.student_no}</Mono></Td>
                <Td>{c.category}</Td><Td className="text-sm text-ink2 max-w-72 truncate">{c.summary}</Td>
                <Td><Badge tone={SEV_TONE[c.severity]} dot>{tx(`sev.${c.severity}`, c.severity)}</Badge></Td>
                <Td>{fmtDateTime(c.opened_at, locale)}</Td><Td><StatusPill status={c.status} /></Td>
              </Tr>
            ))}</tbody>
          </Table>
          {!list.data.data.length && <EmptyState />}
        </Card>
      )}
      {open && <CaseDrawer key={open} id={open} onClose={() => setOpen(null)} />}
      {creating && <NewCase onClose={() => setCreating(false)} />}
    </>
  );
}

export default function CounselingPage() {
  return (
    <RequirePermission any={['counseling.view']}>
      <CounselingScreen />
    </RequirePermission>
  );
}
