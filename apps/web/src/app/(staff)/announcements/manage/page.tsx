'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import {
  ApiErrorAlert, Badge, Button, Card, Checkbox, Drawer, EmptyState, ErrorState, Field, FilterPills, Input, PageHeader, Select, Skeleton, StatusPill, Table, Td,
  Textarea, Th, Tr,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { useClassrooms, useGradeLevels, useMajors, useSelectedYear } from '@/features/academics/api';
import { StudentSearchField } from '@/features/students/student-field';
import { useI18n } from '@/i18n';
import { api, fieldError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Aud { role_code: string; grade_level: string | null; major: string | null; classroom: string | null; student: string | null; include_guardians: boolean; label?: string }
interface Ann { id: string; title: string; body: string; audience_type: string; priority: string; publish_at: string; expire_at: string | null; status: string; audiences: Aud[]; created_by_name: string }

const TYPES = ['ALL', 'STAFF', 'ROLE', 'GRADE', 'MAJOR', 'CLASS', 'STUDENT', 'GUARDIAN'];
const ROLES = ['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'GUARDIAN', 'FINANCE_ADMIN', 'COUNSELOR', 'LIBRARIAN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'CURRICULUM_ADMIN'];
const toLocal = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const blank: Aud = { role_code: '', grade_level: null, major: null, classroom: null, student: null, include_guardians: true };

function Editor({ item, onClose }: { item: Ann | null; onClose: () => void }) {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { year } = useSelectedYear();
  const grades = useGradeLevels().data ?? [];
  const majors = useMajors().data ?? [];
  const classes = useClassrooms(year?.id).data ?? [];
  const [f, setF] = useState({
    title: item?.title ?? '', body: item?.body ?? '', audience_type: item?.audience_type ?? 'ALL', priority: item?.priority ?? 'NORMAL',
    publish_at: toLocal(item?.publish_at ?? new Date().toISOString()), expire_at: toLocal(item?.expire_at),
  });
  const [auds, setAuds] = useState<Aud[]>(item?.audiences ?? []);
  const body = () => ({ ...f, publish_at: new Date(f.publish_at).toISOString(), expire_at: f.expire_at ? new Date(f.expire_at).toISOString() : null, audiences: ['ALL', 'STAFF'].includes(f.audience_type) ? [] : auds });
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const a = item ? await api.patch<Ann>(`/announcements/${item.id}/`, body()) : await api.post<Ann>('/announcements/', body());
      return publish ? api.post<Ann>(`/announcements/${a.id}/publish/`) : a;
    },
    onSuccess: (a) => { toast(tx(`status.${a.status}`, a.status), 'ok'); qc.invalidateQueries({ queryKey: ['announcements'] }); onClose(); },
  });
  const setAud = (i: number, patch: Partial<Aud>) => setAuds(auds.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const t_ = f.audience_type;
  return (
    <Drawer open onClose={onClose} width={560} title={item ? t('common.edit') : t('ann.new')}
      footer={<>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate(false)}>{t('common.save')}</Button>
        <Button variant="primary" icon={Send} disabled={save.isPending} onClick={() => save.mutate(true)}>{t('ann.publish')}</Button>
      </>}>
      <div className="space-y-3">
        <ApiErrorAlert error={save.error} />
        <Field label={t('ann.title')} required error={fieldError(save.error, 'title')}><Input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={t('ann.body')} required error={fieldError(save.error, 'body')}><Textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('ann.publishAt')} required><Input type="datetime-local" value={f.publish_at} onChange={(e) => setF({ ...f, publish_at: e.target.value })} /></Field>
          <Field label={t('ann.expireAt')} error={fieldError(save.error, 'expire_at')}><Input type="datetime-local" value={f.expire_at} onChange={(e) => setF({ ...f, expire_at: e.target.value })} /></Field>
          <Field label={t('ann.priority')}>
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{['NORMAL', 'IMPORTANT', 'URGENT'].map((p) => <option key={p} value={p}>{tx(`prio.${p}`, p)}</option>)}</Select>
          </Field>
          <Field label={t('ann.audience')}>
            <Select value={t_} onChange={(e) => { setF({ ...f, audience_type: e.target.value }); setAuds([]); }}>{TYPES.map((x) => <option key={x} value={x}>{tx(`aud.${x}`, x)}</option>)}</Select>
          </Field>
        </div>
        {!['ALL', 'STAFF'].includes(t_) && (
          <Card title={t('ann.audience')} actions={<Button size="sm" icon={Plus} onClick={() => setAuds([...auds, { ...blank }])}>{t('ann.addTarget')}</Button>}>
            <div className="space-y-2">
              <ApiErrorAlert error={fieldError(save.error, 'audiences') ? save.error : null} />
              {auds.map((a, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1">
                    {t_ === 'ROLE' && <Select aria-label={t('aud.ROLE')} value={a.role_code} onChange={(e) => setAud(i, { role_code: e.target.value })}><option value="">—</option>{ROLES.map((r) => <option key={r} value={r}>{tx(`role.${r}`, r)}</option>)}</Select>}
                    {(t_ === 'GRADE' || t_ === 'GUARDIAN') && <Select aria-label={t('aud.GRADE')} value={a.grade_level ?? ''} onChange={(e) => setAud(i, { grade_level: e.target.value || null })}><option value="">—</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}</Select>}
                    {t_ === 'MAJOR' && <Select aria-label={t('aud.MAJOR')} value={a.major ?? ''} onChange={(e) => setAud(i, { major: e.target.value || null })}><option value="">—</option>{majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}
                    {t_ === 'CLASS' && <Select aria-label={t('aud.CLASS')} value={a.classroom ?? ''} onChange={(e) => setAud(i, { classroom: e.target.value || null })}><option value="">—</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
                    {t_ === 'STUDENT' && <StudentSearchField value={a.student} onChange={(v) => setAud(i, { student: v })} />}
                    {['GRADE', 'MAJOR', 'CLASS', 'STUDENT'].includes(t_) && <label className="flex items-center gap-2 text-xs mt-1"><Checkbox checked={a.include_guardians} onChange={(v) => setAud(i, { include_guardians: v })} />{t('ann.includeGuardians')}</label>}
                  </div>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={t('common.remove')} onClick={() => setAuds(auds.filter((_, j) => j !== i))} />
                </div>
              ))}
              {!auds.length && <p className="text-xs text-ink2">{t('ann.addTarget')}</p>}
            </div>
          </Card>
        )}
      </div>
    </Drawer>
  );
}

function ManageScreen() {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState<Ann | 'new' | null>(null);
  const list = useQuery({ queryKey: ['announcements', 'manage', status], queryFn: () => api.page<Ann>('/announcements/', { status, page_size: 50 }), placeholderData: keepPreviousData });
  const archive = useMutation({ mutationFn: (id: string) => api.post(`/announcements/${id}/archive/`), onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }) });
  return (
    <>
      <PageHeader title={t('nav.announcementsManage')} actions={<Button variant="primary" icon={Plus} onClick={() => setEdit('new')}>{t('ann.new')}</Button>} />
      <div className="mb-3"><FilterPills value={status} onChange={setStatus} options={[{ id: '', label: t('common.all') }, ...['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'].map((s) => ({ id: s, label: tx(`status.${s}`, s) }))]} /></div>
      {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <Card pad={false}>
          <Table>
            <thead><tr><Th>{t('ann.title')}</Th><Th>{t('ann.audience')}</Th><Th>{t('ann.publishAt')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
            <tbody>{list.data.data.map((a) => (
              <Tr key={a.id} onClick={() => (a.status === 'DRAFT' || a.status === 'SCHEDULED') && setEdit(a)}>
                <Td><div className="font-medium">{a.title}</div>{a.priority !== 'NORMAL' && <Badge tone={a.priority === 'URGENT' ? 'bad' : 'warn'}>{tx(`prio.${a.priority}`, a.priority)}</Badge>}</Td>
                <Td className="text-sm">{tx(`aud.${a.audience_type}`, a.audience_type)}{a.audiences.length > 0 && <div className="text-xs text-ink2">{a.audiences.map((x) => x.label).join(', ')}</div>}</Td>
                <Td>{fmtDateTime(a.publish_at, locale)}</Td>
                <Td><StatusPill status={a.status} /></Td>
                <Td>{a.status === 'PUBLISHED' && <span onClick={(e) => e.stopPropagation()}><Button size="sm" icon={Archive} onClick={() => archive.mutate(a.id)}>{t('ann.archive')}</Button></span>}</Td>
              </Tr>
            ))}</tbody>
          </Table>
          {!list.data.data.length && <EmptyState />}
        </Card>
      )}
      {edit && <Editor key={edit === 'new' ? 'new' : edit.id} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

export default function ManageAnnouncementsPage() {
  return (
    <RequirePermission any={['announcement.publish']}>
      <ManageScreen />
    </RequirePermission>
  );
}
