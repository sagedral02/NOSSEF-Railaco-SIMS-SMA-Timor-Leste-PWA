'use client';

// Applicant profile + verification workspace + decision + re-registration + atomic enrollment (PRD §16.3).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { useToast } from '@/components/toast';
import {
  Alert, ApiErrorAlert, Badge, Button, Card, ErrorState, Field, Input, KV, Modal, Mono, PageHeader, ReasonDialog, Select, Skeleton, StatusPill, Textarea,
} from '@/components/ui';
import { useClassrooms } from '@/features/academics/api';
import type { Applicant } from '@/features/admissions/public';
import { useAuth } from '@/features/auth/auth';
import { useI18n } from '@/i18n';
import { api, fileUrl } from '@/lib/api';
import { cx, fmtDate, fmtDateTime } from '@/lib/format';

const FLOW = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'ELIGIBLE', 'ACCEPTED', 'RE_REGISTERED', 'ENROLLED'];

function Timeline({ status }: { status: string }) {
  const { tx } = useI18n();
  const idx = FLOW.indexOf(status === 'WAITING_LIST' || status === 'REJECTED' ? 'ACCEPTED' : status);
  return (
    <ol className="flex flex-wrap gap-1.5">
      {FLOW.map((s, i) => (
        <li key={s} className={cx('h-7 px-2.5 rounded-full text-xs font-medium inline-flex items-center border',
          i < idx ? 'bg-ok-bg text-ok border-ok/20' : i === idx ? 'bg-ink text-white border-ink' : 'bg-white text-muted border-line')}>
          {i === idx && (status === 'WAITING_LIST' || status === 'REJECTED') ? tx(`status.${status}`, status) : tx(`status.${s}`, s)}
        </li>
      ))}
    </ol>
  );
}

function ApplicantScreen() {
  const { id } = useParams<{ id: string }>();
  const { t, tx, locale } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['adm', 'applicant', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<Applicant & { period_name: string }>(`/admissions/applicants/${id}/`) });
  const a = q.data;
  const [rejectDoc, setRejectDoc] = useState<string | null>(null);
  const [decideOpen, setDecideOpen] = useState(false);
  const [decision, setDecision] = useState({ decision: 'ACCEPTED', score: '', rank: '', note: '' });
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [classroom, setClassroom] = useState('');
  const periodYear = useQuery({
    queryKey: ['adm', 'period-year', a?.admission_period],
    queryFn: () => api.get<{ academic_year: string }>(`/admissions/periods/${a!.admission_period}/`),
    enabled: !!a,
  });
  const classes = useClassrooms(periodYear.data?.academic_year).data ?? [];
  const refresh = (data: Applicant) => { qc.setQueryData(key, data); qc.invalidateQueries({ queryKey: ['adm', 'applicants'] }); };
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<Applicant>(`/admissions/applicants/${id}/${path}/`, body),
    onSuccess: (data, v) => { refresh(data); toast(v.path === 'enroll' ? t('adm.enrolled') : t('common.saved')); setDecideOpen(false); setEnrollOpen(false); },
  });
  if (q.isPending) return <Card pad={false}><Skeleton /></Card>;
  if (q.error || !a) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const docs = new Map(a.documents.map((d) => [d.document_type, d]));
  const docTypes = [...new Set([...a.required_documents, ...a.documents.map((d) => d.document_type)])];
  const eligibleClasses = classes.filter((c) => c.active);

  return (
    <>
      <PageHeader back="/admissions/applicants" title={a.full_name} subtitle={<><Mono>{a.registration_no}</Mono> · {a.period_name}</>} actions={<StatusPill status={a.status} />} />
      <div className="mb-4"><Timeline status={a.status} /></div>
      {act.error && <div className="mb-4"><ApiErrorAlert error={act.error} /></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t('ppdb.step.identity')}>
            <div className="grid md:grid-cols-2 gap-x-6">
              <KV k={t('ppdb.birthPlace')} v={a.birth_place || '—'} />
              <KV k={t('ppdb.birthDate')} v={fmtDate(a.birth_date, locale)} />
              <KV k={t('common.gender')} v={a.gender ? tx(`gender.${a.gender}`, a.gender) : '—'} />
              <KV k={t('ppdb.desiredMajor')} v={a.desired_major_code ?? '—'} />
              <KV k={t('ppdb.previousSchool')} v={a.previous_school || '—'} />
              <KV k={t('common.phone')} v={a.phone || '—'} />
              <KV k={t('ppdb.address')} v={a.address || '—'} />
              <KV k={t('adm.submittedAt')} v={a.submitted_at ? fmtDateTime(a.submitted_at, locale) : '—'} />
            </div>
          </Card>
          <Card title={t('adm.documents')} pad={false}>
            {docTypes.map((type) => {
              const d = docs.get(type);
              return (
                <div key={type} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{tx(`doc.${type}`, type)} {a.required_documents.includes(type) && <Badge tone="warn">{t('ppdb.required')}</Badge>}</div>
                    {d ? <div className="text-xs text-ink2">{d.original_name} {d.note && <>· {d.note}</>}</div> : <div className="text-xs text-bad">{t('ppdb.missingDocs')}</div>}
                  </div>
                  {d && <StatusPill status={d.verification_status} />}
                  {d && <a href={fileUrl(d.file, true)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent"><ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />{t('adm.view')}</a>}
                  {d && can('admission.verify') && ['SUBMITTED', 'DRAFT'].includes(a.status) && (
                    <span className="inline-flex gap-1">
                      <Button size="sm" icon={Check} disabled={act.isPending} onClick={() => act.mutate({ path: `documents/${d.id}/verify`, body: { verification_status: 'VALID' } })}>{t('adm.verifyDoc')}</Button>
                      <Button size="sm" variant="danger" icon={X} onClick={() => setRejectDoc(d.id)}>{t('adm.rejectDoc')}</Button>
                    </span>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title={t('student.guardians')}>
            {a.guardians.map((g) => (
              <div key={g.id ?? g.full_name} className="text-sm py-1.5">
                <div className="font-medium">{g.full_name} {g.is_primary && <Badge tone="info">{t('student.primary')}</Badge>}</div>
                <div className="text-xs text-ink2">{tx(`rel.${g.relationship}`, g.relationship)} · {g.phone || '—'} · {g.occupation || '—'}</div>
              </div>
            ))}
          </Card>
          {a.decision && (
            <Card title={t('adm.decide')}>
              <KV k={t('common.status')} v={<StatusPill status={a.decision.decision} />} />
              <KV k={t('adm.score')} v={a.decision.score ?? '—'} mono />
              <KV k={t('adm.rank')} v={a.decision.rank ?? '—'} mono />
              <KV k={t('adm.decisionNote')} v={a.decision.note || '—'} />
            </Card>
          )}
          {a.student && (
            <Card>
              <Alert tone="ok" title={t('adm.enrolled')}>
                <Link href={`/students/${a.student}`} className="text-accent"><Mono>{a.student_no}</Mono></Link>
              </Alert>
            </Card>
          )}
          <Card title={t('common.actions')}>
            <div className="flex flex-col gap-2">
              {a.status === 'DRAFT' && can('admission.create') && <Button onClick={() => act.mutate({ path: 'submit' })}>{t('ppdb.submit')}</Button>}
              {a.status === 'SUBMITTED' && can('admission.verify') && <Button variant="primary" onClick={() => act.mutate({ path: 'verify', body: {} })}>{t('adm.verify')}</Button>}
              {a.status === 'VERIFIED' && can('admission.verify') && <Button variant="primary" onClick={() => act.mutate({ path: 'eligible', body: {} })}>{t('adm.eligible')}</Button>}
              {['ELIGIBLE', 'WAITING_LIST', 'ACCEPTED', 'REJECTED'].includes(a.status) && can('admission.decide') && <Button variant={a.status === 'ELIGIBLE' ? 'primary' : 'secondary'} onClick={() => { act.reset(); setDecideOpen(true); }}>{t('adm.decide')}</Button>}
              {a.status === 'ACCEPTED' && can('admission.enroll') && <Button variant="primary" onClick={() => act.mutate({ path: 're-register' })}>{t('adm.reRegister')}</Button>}
              {a.status === 'RE_REGISTERED' && can('admission.enroll') && <Button variant="primary" onClick={() => { act.reset(); setEnrollOpen(true); }}>{t('adm.enroll')}</Button>}
            </div>
          </Card>
        </div>
      </div>
      <ReasonDialog open={!!rejectDoc} onClose={() => setRejectDoc(null)} title={t('adm.rejectDoc')} confirmLabel={t('adm.rejectDoc')} danger
        onConfirm={async (note) => { refresh(await api.post<Applicant>(`/admissions/applicants/${id}/documents/${rejectDoc}/verify/`, { verification_status: 'INVALID', note })); }} />
      <Modal open={decideOpen} onClose={() => setDecideOpen(false)} title={t('adm.decide')} size="sm"
        footer={<><Button onClick={() => setDecideOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" disabled={act.isPending} onClick={() => act.mutate({ path: 'decision', body: { decision: decision.decision, score: decision.score || null, rank: decision.rank ? Number(decision.rank) : null, note: decision.note } })}>{t('common.save')}</Button></>}>
        <div className="grid gap-3 grid-cols-2">
          <Field label={t('common.status')} className="col-span-2">
            <Select value={decision.decision} onChange={(e) => setDecision({ ...decision, decision: e.target.value })}>
              {['ACCEPTED', 'WAITING_LIST', 'REJECTED'].map((d) => <option key={d} value={d}>{tx(`status.${d}`, d)}</option>)}
            </Select>
          </Field>
          <Field label={t('adm.score')}><Input type="number" step="0.01" value={decision.score} onChange={(e) => setDecision({ ...decision, score: e.target.value })} /></Field>
          <Field label={t('adm.rank')}><Input type="number" min={1} value={decision.rank} onChange={(e) => setDecision({ ...decision, rank: e.target.value })} /></Field>
          <Field label={t('adm.decisionNote')} className="col-span-2" required={decision.decision === 'REJECTED'}><Textarea value={decision.note} onChange={(e) => setDecision({ ...decision, note: e.target.value })} /></Field>
        </div>
        {act.error && <div className="mt-3"><ApiErrorAlert error={act.error} /></div>}
      </Modal>
      <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)} title={t('adm.enroll')} size="sm"
        footer={<><Button onClick={() => setEnrollOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" disabled={!classroom || act.isPending} onClick={() => act.mutate({ path: 'enroll', body: { classroom } })}>{t('adm.enroll')}</Button></>}>
        <p className="text-sm text-ink2 mb-3">{t('adm.enrollHint')}</p>
        <Field label={t('student.classroom')} required>
          <Select value={classroom} onChange={(e) => setClassroom(e.target.value)}>
            <option value="">—</option>
            {eligibleClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.major_code === a.desired_major_code ? ` — ${t('ppdb.desiredMajor')}` : ''}</option>)}
          </Select>
        </Field>
        {act.error && <div className="mt-3"><ApiErrorAlert error={act.error} /></div>}
      </Modal>
    </>
  );
}

export default function ApplicantDetailPage() {
  return (
    <RequirePermission any={['admission.view']}>
      <ApplicantScreen />
    </RequirePermission>
  );
}
