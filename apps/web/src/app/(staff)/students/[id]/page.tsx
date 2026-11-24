'use client';

// Student 360 (PRD §17.4). Sections appear only for roles allowed to see them; the API enforces scope.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, CreditCard, Download, Link2, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { ResourceForm, type FieldDef } from '@/components/resource';
import { useToast } from '@/components/toast';
import {
  Avatar, Badge, Button, Card, Drawer, EmptyState, ErrorState, KV, Mono, PageHeader, Skeleton, StatusPill, Table, Tabs, Td, Th, Tr,
} from '@/components/ui';
import { useSelectedYear } from '@/features/academics/api';
import { classOptions } from '@/features/academics/options';
import { useAuth } from '@/features/auth/auth';
import { StatementView } from '@/features/finance/statement';
import { StudentAttendanceTab, StudentGradesTab } from '@/features/students/academic-tabs';
import { IdCardModal } from '@/features/students/id-card';
import { studentKeys, type Enrollment, type GuardianLink, type StatusHistory, type StudentDetail, type StudentDocument, type TransferRecord } from '@/features/students/api';
import { useI18n, type MessageKey } from '@/i18n';
import { api, fileUrl } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useQueryParam } from '@/lib/url';

type Panel = null | 'enroll' | 'move' | 'status' | 'guardian' | 'portal';
const TABS = ['overview', 'enrollments', 'guardians', 'grades', 'attendance', 'finance', 'documents', 'history'] as const;
type Tab = (typeof TABS)[number];

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const { t, tx, locale } = useI18n();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { year } = useSelectedYear();
  const [tab, setTab] = useState<Tab>('overview');
  useQueryParam('tab', (v) => setTab(v as Tab), TABS);
  const [panel, setPanel] = useState<Panel>(null);
  const [card, setCard] = useState(false);
  const detail = useQuery({ queryKey: studentKeys.detail(id), queryFn: () => api.get<StudentDetail>(`/students/${id}/`) });
  const enrollments = useQuery({ queryKey: studentKeys.sub(id, 'enrollments'), queryFn: () => api.get<Enrollment[]>(`/students/${id}/enrollments/`) });
  const showGuardians = can('guardian.view') || !!user?.roles.some((r) => r === 'GUARDIAN' || r === 'STUDENT');
  const guardians = useQuery({ queryKey: studentKeys.sub(id, 'guardians'), queryFn: () => api.get<GuardianLink[]>(`/students/${id}/guardians/`), enabled: showGuardians });
  const history = useQuery({ queryKey: studentKeys.sub(id, 'history'), queryFn: () => api.get<StatusHistory[]>(`/students/${id}/status-history/`), enabled: tab === 'history' });
  const transfers = useQuery({ queryKey: studentKeys.sub(id, 'transfers'), queryFn: () => api.get<TransferRecord[]>(`/students/${id}/transfers/`), enabled: tab === 'history' });
  const showFinance = can('finance.view') || !!user?.roles.some((r) => r === 'GUARDIAN' || r === 'STUDENT');
  const documents = useQuery({ queryKey: studentKeys.sub(id, 'documents'), queryFn: () => api.get<StudentDocument[]>(`/students/${id}/documents/`), enabled: tab === 'documents' });
  const action = useMutation({
    mutationFn: ({ path, body, method = 'post' }: { path: string; body?: unknown; method?: 'post' | 'delete' }) =>
      method === 'delete' ? api.delete(`/students/${id}/${path}/`) : api.post(`/students/${id}/${path}/`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); toast(t('common.saved')); setPanel(null); },
  });

  if (detail.isPending) return <Card pad={false}><Skeleton /></Card>;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const s = detail.data;
  const enr = s.current_enrollment;
  const active = s.status === 'ACTIVE';

  const panels: Record<Exclude<Panel, null>, { title: MessageKey; fields: FieldDef[]; submit: (v: Record<string, unknown>) => void }> = {
    enroll: {
      title: 'student.enroll',
      fields: [{ name: 'classroom', label: 'student.classroom', type: 'select', required: true, optionsFrom: classOptions(year?.id) },
        { name: 'start_date', label: 'common.startDate', type: 'date' }],
      submit: (v) => action.mutate({ path: 'enroll', body: { ...v, start_date: v.start_date || undefined } }),
    },
    move: {
      title: 'student.move',
      fields: [{ name: 'classroom', label: 'student.classroom', type: 'select', required: true, optionsFrom: classOptions(enr?.academic_year ?? year?.id) },
        { name: 'effective_date', label: 'student.effectiveDate', type: 'date' },
        { name: 'reason', label: 'common.reason', type: 'textarea', hint: 'student.moveReasonHint' }],
      submit: (v) => action.mutate({ path: 'transfer', body: { ...v, effective_date: v.effective_date || undefined, reason: v.reason ?? '' } }),
    },
    status: {
      title: 'student.changeStatus',
      fields: [{ name: 'to_status', label: 'common.status', type: 'select', required: true,
        options: ['ACTIVE', 'TRANSFERRED', 'LEFT', 'INACTIVE', 'GRADUATED'].filter((x) => x !== s.status).map((x) => ({ value: x, label: tx(`status.${x}`, x) })) },
        { name: 'effective_date', label: 'student.effectiveDate', type: 'date' },
        { name: 'destination', label: 'student.destination' },
        { name: 'reason', label: 'common.reason', type: 'textarea' }],
      submit: (v) => action.mutate({ path: 'status', body: { ...v, effective_date: v.effective_date || undefined, reason: v.reason ?? '', destination: v.destination ?? '' } }),
    },
    guardian: {
      title: 'student.addGuardian',
      fields: [
        { name: 'full_name', label: 'ppdb.guardianName', required: true, span: 2 },
        { name: 'relationship', label: 'ppdb.relationship', type: 'select', required: true, default: 'FATHER',
          options: ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'].map((x) => ({ value: x, label: tx(`rel.${x}`, x) })) },
        { name: 'phone', label: 'common.phone' },
        { name: 'occupation', label: 'ppdb.occupation' },
        { name: 'email', label: 'common.email', type: 'email' },
        { name: 'is_primary', label: 'student.primary', type: 'checkbox' },
        { name: 'financial_contact', label: 'student.financialContact', type: 'checkbox' },
      ],
      submit: (v) => action.mutate({ path: 'guardians', body: {
        relationship: v.relationship, is_primary: !!v.is_primary, financial_contact: !!v.financial_contact,
        guardian: { full_name: v.full_name, phone: v.phone ?? '', occupation: v.occupation ?? '', email: v.email ?? '' } } }),
    },
    portal: {
      title: 'student.portalAccount',
      fields: [{ name: 'username', label: 'users.username', required: true, mono: true }, { name: 'password', label: 'users.initialPassword', required: true }],
      submit: (v) => action.mutate({ path: 'portal-account', body: v }),
    },
  };
  const tabs: { id: Tab; label: ReactNode }[] = [
    { id: 'overview', label: t('student.overview') },
    { id: 'enrollments', label: t('student.enrollmentHistory') },
    ...(showGuardians ? [{ id: 'guardians' as const, label: t('student.guardians') }] : []),
    { id: 'grades', label: t('nav.reportCards') },
    { id: 'attendance', label: t('rc.attendance') },
    ...(showFinance ? [{ id: 'finance' as const, label: t('student.finance') }] : []),
    { id: 'documents', label: t('student.documents') },
    { id: 'history', label: t('student.history') },
  ];

  return (
    <>
      <PageHeader
        back={can('student.view') ? '/students' : undefined}
        title={<span className="inline-flex items-center gap-3">{s.photo_file ? <Image unoptimized src={fileUrl(s.photo_file, true)} alt="" width={40} height={40} className="w-10 h-10 rounded-full object-cover" /> : <Avatar name={s.full_name} size={40} tone="blue" />}{s.full_name}</span>}
        subtitle={<><Mono>{s.student_no}</Mono>{enr && <> · {enr.classroom_name} · {enr.academic_year_name}</>}</>}
        actions={
          <>
            <StatusPill status={s.status} />
            <Button icon={CreditCard} onClick={() => setCard(true)}>{t('card.show')}</Button>
            {can('student.update') && active && !enr && <Button icon={Plus} onClick={() => { action.reset(); setPanel('enroll'); }}>{t('student.enroll')}</Button>}
            {can('student.update') && active && enr && <Button icon={ArrowRightLeft} onClick={() => { action.reset(); setPanel('move'); }}>{t('student.move')}</Button>}
            {can('student.change_status') && <Button icon={ShieldCheck} onClick={() => { action.reset(); setPanel('status'); }}>{t('student.changeStatus')}</Button>}
            {can('user.create') && !s.username && <Button icon={UserPlus} onClick={() => { action.reset(); setPanel('portal'); }}>{t('student.portalAccount')}</Button>}
          </>
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('ppdb.step.identity')}>
            <KV k={t('student.no')} v={s.student_no} mono />
            {s.national_student_no !== undefined && <KV k={t('student.nationalNo')} v={s.national_student_no || '—'} mono />}
            <KV k={t('ppdb.birthDate')} v={`${s.birth_place ? `${s.birth_place}, ` : ''}${fmtDate(s.birth_date, locale)}`} />
            <KV k={t('common.gender')} v={s.gender ? tx(`gender.${s.gender}`, s.gender) : '—'} />
            {s.phone !== undefined && <KV k={t('common.phone')} v={s.phone || '—'} />}
            {s.address !== undefined && <KV k={t('ppdb.address')} v={s.address || '—'} />}
            <KV k={t('student.admissionDate')} v={fmtDate(s.admission_date, locale)} />
            <KV k={t('common.account')} v={s.username ? <Mono>{s.username}</Mono> : '—'} />
          </Card>
          <Card title={t('student.currentEnrollment')}>
            {enr ? (
              <>
                <KV k={t('common.year')} v={enr.academic_year_name} />
                <KV k={t('student.classroom')} v={enr.classroom_name} />
                <KV k={t('grade.level')} v={<Badge mono>{enr.grade_level_code}</Badge>} />
                <KV k={t('major.label')} v={<Badge mono>{enr.major_code}</Badge>} />
                <KV k={t('common.startDate')} v={fmtDate(enr.start_date, locale)} />
                <KV k={t('common.type')} v={tx(`source.${enr.source}`, enr.source)} />
              </>
            ) : <EmptyState title={t('student.noEnrollment')} />}
          </Card>
        </div>
      )}
      {tab === 'enrollments' && (
        <Card pad={false}>
          {enrollments.data?.length ? (
            <Table>
              <thead><tr><Th>{t('common.year')}</Th><Th>{t('student.classroom')}</Th><Th>{t('grade.level')}</Th><Th>{t('major.label')}</Th><Th>{t('common.startDate')}</Th><Th>{t('common.endDate')}</Th><Th>{t('common.type')}</Th><Th>{t('common.status')}</Th></tr></thead>
              <tbody>
                {enrollments.data.map((e) => (
                  <Tr key={e.id}>
                    <Td mono>{e.academic_year_name}</Td><Td>{e.classroom_name}</Td><Td mono>{e.grade_level_code}</Td><Td mono>{e.major_code}</Td>
                    <Td className="text-xs">{fmtDate(e.start_date, locale)}</Td><Td className="text-xs">{fmtDate(e.end_date, locale)}</Td>
                    <Td className="text-xs">{tx(`source.${e.source}`, e.source)}</Td><Td><StatusPill status={e.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState />}
        </Card>
      )}
      {tab === 'guardians' && (
        <Card pad={false} title={t('student.guardians')} actions={can('guardian.update') && <Button size="sm" icon={Link2} onClick={() => { action.reset(); setPanel('guardian'); }}>{t('student.addGuardian')}</Button>}>
          {guardians.data?.length ? guardians.data.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line last:border-0">
              <Avatar name={l.guardian.full_name} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{l.guardian.full_name} {l.is_primary && <Badge tone="info">{t('student.primary')}</Badge>} {l.financial_contact && <Badge>{t('student.financialContact')}</Badge>}</div>
                <div className="text-xs text-ink2">{tx(`rel.${l.relationship}`, l.relationship)} · {l.guardian.phone || '—'} · {l.guardian.occupation || '—'} {l.guardian.username && <>· <Mono className="text-[11px]">{l.guardian.username}</Mono></>}</div>
              </div>
              {can('guardian.update') && <Button size="sm" variant="ghost" icon={Trash2} aria-label={t('common.remove')} onClick={() => action.mutate({ path: `guardians/${l.id}`, method: 'delete' })} />}
            </div>
          )) : <EmptyState />}
        </Card>
      )}
      {tab === 'grades' && <StudentGradesTab studentId={id} />}
      {tab === 'attendance' && <StudentAttendanceTab studentId={id} />}
      {tab === 'finance' && <StatementView studentId={id} />}
      {tab === 'documents' && (
        <Card pad={false}>
          {documents.isPending ? <Skeleton rows={4} /> : documents.error ? <ErrorState error={documents.error} onRetry={() => documents.refetch()} /> : documents.data.length ? (
            <Table>
              <thead><tr><Th>{t('student.docCategory')}</Th><Th>{t('student.docTitle')}</Th><Th>{t('student.docRef')}</Th><Th>{t('student.docDate')}</Th><Th align="right">{t('student.docOpen')}</Th></tr></thead>
              <tbody>
                {documents.data.map((d) => (
                  <Tr key={`${d.category}-${d.file.id}`}>
                    <Td><Badge>{tx(`doccat.${d.category}`, d.category)}</Badge></Td>
                    <Td><div className="text-sm">{d.category === 'TRANSFER' ? tx(`transfer.${d.title}`, d.title) : d.title}</div><div className="text-[11px] text-muted">{d.file.original_name} · {Math.max(1, Math.round(d.file.size_bytes / 1024))} KB</div></Td>
                    <Td mono className="text-xs">{d.reference || '—'}</Td>
                    <Td className="text-xs">{fmtDate(d.date, locale)}</Td>
                    <Td align="right"><a href={fileUrl(d.file.id, true)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"><Download size={14} strokeWidth={1.5} />{t('student.docOpen')}</a></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState />}
        </Card>
      )}
      {tab === 'history' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('common.status')} pad={false}>
            {(history.data ?? []).map((h) => (
              <div key={h.id} className="px-4 py-3 border-b border-line last:border-0 text-sm">
                <div className="flex items-center gap-2">{h.from_status && <><StatusPill status={h.from_status} />→</>}<StatusPill status={h.to_status} /><span className="text-xs text-ink2 ml-auto">{fmtDate(h.effective_date, locale)}</span></div>
                {h.reason && <div className="text-xs text-ink2 mt-1">{h.reason}</div>}
                <div className="text-[11px] text-muted mt-0.5">{h.changed_by_username ?? '—'} · {fmtDateTime(h.created_at, locale)}</div>
              </div>
            ))}
          </Card>
          <Card title={t('student.history')} pad={false}>
            {(transfers.data ?? []).length ? transfers.data!.map((tr) => (
              <div key={tr.id} className="px-4 py-3 border-b border-line last:border-0 text-sm">
                <div className="flex items-center gap-2"><Badge>{tx(`transfer.${tr.transfer_type}`, tr.transfer_type)}</Badge><span className="text-xs text-ink2 ml-auto">{fmtDate(tr.effective_date, locale)}</span></div>
                <div className="text-xs text-ink2 mt-1">{tr.from_detail?.classroom ?? ''} {tr.to_detail?.classroom ? `→ ${tr.to_detail.classroom}` : tr.to_detail?.destination ? `→ ${tr.to_detail.destination}` : ''}</div>
                {tr.reason && <div className="text-xs mt-1">{tr.reason}</div>}
              </div>
            )) : <EmptyState />}
          </Card>
        </div>
      )}
      {card && <IdCardModal onClose={() => setCard(false)} students={[{ id: s.id, full_name: s.full_name, student_no: s.student_no, classroom: enr?.classroom_name, academic_year: enr?.academic_year_name, photo_file: s.photo_file }]} />}
      <Drawer open={panel !== null} onClose={() => setPanel(null)} title={panel ? t(panels[panel].title) : ''} width={480}
        footer={<><Button onClick={() => setPanel(null)}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="student-action" disabled={action.isPending}>{t('common.save')}</Button></>}>
        {panel && <ResourceForm key={panel} formId="student-action" fields={panels[panel].fields} editing={false} initial={{ relationship: 'FATHER' }} error={action.error} onSubmit={panels[panel].submit} />}
      </Drawer>
    </>
  );
}
