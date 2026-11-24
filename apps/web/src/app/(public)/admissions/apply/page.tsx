'use client';

// Public mobile-first application (PRD §16.3 /apply, F3-05). Draft is saved server-side after step 2.
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, FileText, Printer, Upload } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useRef, useState, type ReactNode } from 'react';

import { Alert, ApiErrorAlert, Badge, Button, Card, Field, Input, Mono, Select, StatusPill, Textarea } from '@/components/ui';
import { publicApi, rememberRegistration, useSavedRegistrations, type Applicant, type ApplicantGuardian } from '@/features/admissions/public';
import { useI18n, type MessageKey } from '@/i18n';
import { ApiError, fieldError } from '@/lib/api';
import { cx, fmtDateTime } from '@/lib/format';

const STEPS: MessageKey[] = ['ppdb.step.identity', 'ppdb.step.guardian', 'ppdb.step.documents', 'ppdb.step.review'];
const RELATIONS = ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'];

interface Identity { full_name: string; birth_place: string; birth_date: string; gender: string; previous_school: string; phone: string; email: string; address: string; desired_major: string }
const EMPTY_ID: Identity = { full_name: '', birth_place: '', birth_date: '', gender: '', previous_school: '', phone: '', email: '', address: '', desired_major: '' };
const EMPTY_G: ApplicantGuardian = { full_name: '', relationship: 'FATHER', phone: '', occupation: '', is_primary: true };

function Stepper({ step }: { step: number }) {
  const { t } = useI18n();
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-col gap-1.5">
          <span className={cx('h-1 rounded-full', i <= step ? 'bg-accent' : 'bg-line')} />
          <span className={cx('text-[11px] md:text-xs', i === step ? 'text-ink font-semibold' : 'text-ink2')}>{i + 1}. {t(s)}</span>
        </li>
      ))}
    </ol>
  );
}

function Proof({ applicant, token, onReupload }: { applicant: Applicant; token: string; onReupload?: () => void }) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const submitted = applicant.status !== 'DRAFT';
  return (
    <div className="space-y-4">
      <div className="print-area bg-white border border-line rounded-lg p-6">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <CheckCircle2 className="w-8 h-8 text-ok shrink-0" strokeWidth={1.5} aria-hidden />
          <div>
            <h2 className="font-display text-xl font-semibold">{submitted ? t('ppdb.submitted') : t('ppdb.draftSaved')}</h2>
            <div className="text-xs text-ink2">{t('ppdb.proofTitle')} · {applicant.period_name} · {fmtDateTime(applicant.submitted_at ?? applicant.created_at, locale)}</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <div className="text-xs text-ink2">{t('ppdb.registrationNo')}</div>
            <div className="font-mono text-2xl font-semibold">{applicant.registration_no}</div>
          </div>
          <div>
            <div className="text-xs text-ink2">{t('ppdb.accessCode')}</div>
            <div className="font-mono text-sm break-all">{token}</div>
          </div>
          <div className="text-sm"><span className="text-ink2">{t('common.name')}: </span>{applicant.full_name}</div>
          <div className="text-sm"><span className="text-ink2">{t('common.status')}: </span><StatusPill status={applicant.status} /></div>
        </div>
      </div>
      <Alert tone="warn" icon={AlertTriangle} title={t('ppdb.keepWarning')} />
      <div className="flex flex-wrap gap-2 no-print">
        <Button icon={Copy} onClick={async () => { await navigator.clipboard.writeText(`${applicant.registration_no} / ${token}`); setCopied(true); }}>
          {copied ? t('ppdb.copied') : t('ppdb.copy')}
        </Button>
        <Button icon={Printer} onClick={() => window.print()}>{t('ppdb.print')}</Button>
        {onReupload && <Button variant="primary" icon={Upload} onClick={onReupload}>{t('ppdb.invalidDocs')}</Button>}
        <Link href="/admissions/status" className="inline-flex items-center h-9 px-3.5 rounded-md border border-line-strong text-sm font-medium hover:bg-hover">{t('ppdb.checkStatus')}</Link>
      </div>
    </div>
  );
}

function ApplyWizard() {
  const { t, tx } = useI18n();
  const params = useSearchParams();
  const saved = useSavedRegistrations();
  const periods = useQuery({ queryKey: ['public', 'periods'], queryFn: publicApi.periods });
  const resume = useMemo(() => saved.find((r) => r.registration_no === params.get('reg')), [saved, params]);
  const [session, setSession] = useState<{ reg: string; token: string } | null>(null);
  const active = session ?? (resume ? { reg: resume.registration_no, token: resume.access_token } : null);
  const existing = useQuery({
    queryKey: ['public', 'applicant', active?.reg],
    queryFn: () => publicApi.get(active!.reg, active!.token),
    enabled: !!active,
  });
  const [step, setStep] = useState(0);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [guardian, setGuardian] = useState<ApplicantGuardian | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const applicant = existing.data;
  const periodId = applicant?.admission_period ?? params.get('period') ?? periods.data?.[0]?.id;
  const period = periods.data?.find((p) => p.id === periodId);
  const id: Identity = identity ?? (applicant
    ? { full_name: applicant.full_name, birth_place: applicant.birth_place, birth_date: applicant.birth_date, gender: applicant.gender,
        previous_school: applicant.previous_school, phone: applicant.phone, email: applicant.email, address: applicant.address, desired_major: applicant.desired_major ?? '' }
    : EMPTY_ID);
  const g: ApplicantGuardian = guardian ?? applicant?.guardians[0] ?? EMPTY_G;
  const required = applicant?.required_documents ?? period?.required_documents ?? [];
  const editable = !applicant || applicant.status === 'DRAFT';

  const remember = (a: Applicant, token: string) =>
    rememberRegistration({ registration_no: a.registration_no, access_token: token, full_name: a.full_name, birth_date: a.birth_date, status: a.status,
      at: new Date().toISOString() }, saved);

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      const body = { ...id, desired_major: id.desired_major || null, guardians: [{ ...g, is_primary: true }] };
      if (!active) {
        const r = await publicApi.create({ ...body, admission_period: periodId });
        setSession({ reg: r.registration_no, token: r.access_token });
        remember(r.applicant, r.access_token);
      } else if (editable) {
        const a = await publicApi.update(active.reg, active.token, body);
        remember(a, active.token);
      }
      await existing.refetch();
      setStep(2);
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && Object.keys(e.fields).some((f) => f in EMPTY_ID)) setStep(0);
    } finally {
      setBusy(false);
    }
  }

  async function upload(type: string, file: File) {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await publicApi.upload(active.reg, active.token, type, file);
      await existing.refetch();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const a = await publicApi.submit(active.reg, active.token);
      remember(a, active.token);
      await existing.refetch();
      setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (active && existing.data && (done || existing.data.status !== 'DRAFT') && !(existing.data.status === 'SUBMITTED' && step === 2)) {
    const invalid = existing.data.status === 'SUBMITTED' && existing.data.documents.some((d) => d.verification_status === 'INVALID');
    return (
      <div className="w-full max-w-2xl">
        <Proof applicant={existing.data} token={active.token} onReupload={invalid ? () => { setDone(false); setStep(2); } : undefined} />
      </div>
    );
  }
  if (!period && !applicant) {
    return periods.isPending ? null : <div className="w-full max-w-2xl"><Alert tone="warn">{t('ppdb.closedNow')}</Alert></div>;
  }

  const docs = applicant?.documents ?? [];
  const docOf = (type: string) => docs.find((d) => d.document_type === type);
  const missing = required.filter((r) => !docOf(r));
  const setId = (k: keyof Identity) => (e: { target: { value: string } }) => setIdentity({ ...id, [k]: e.target.value });
  const setG = (k: keyof ApplicantGuardian) => (e: { target: { value: string } }) => setGuardian({ ...g, [k]: e.target.value });
  const section = (children: ReactNode) => <Card>{children}</Card>;

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold">{t('ppdb.portalTitle')}</h1>
        <p className="text-sm text-ink2">{period?.name ?? applicant?.period_name} {active && <>· <Mono>{active.reg}</Mono></>}</p>
      </div>
      <Stepper step={step} />
      {step === 0 && section(
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('ppdb.fullName')} required className="md:col-span-2" error={fieldError(error, 'full_name')}><Input value={id.full_name} onChange={setId('full_name')} disabled={!editable} /></Field>
          <Field label={t('ppdb.birthPlace')}><Input value={id.birth_place} onChange={setId('birth_place')} disabled={!editable} /></Field>
          <Field label={t('ppdb.birthDate')} required error={fieldError(error, 'birth_date')}><Input type="date" value={id.birth_date} onChange={setId('birth_date')} disabled={!editable} /></Field>
          <Field label={t('common.gender')}>
            <Select value={id.gender} onChange={setId('gender')} disabled={!editable}>
              <option value="">—</option><option value="M">{t('gender.M')}</option><option value="F">{t('gender.F')}</option>
            </Select>
          </Field>
          <Field label={t('ppdb.desiredMajor')} hint={t('ppdb.desiredMajorHint')}>
            <Select value={id.desired_major} onChange={setId('desired_major')} disabled={!editable}>
              <option value="">—</option>
              {(period?.majors ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label={t('ppdb.previousSchool')} className="md:col-span-2"><Input value={id.previous_school} onChange={setId('previous_school')} disabled={!editable} /></Field>
          <Field label={t('common.phone')}><Input value={id.phone} onChange={setId('phone')} disabled={!editable} inputMode="tel" /></Field>
          <Field label={t('common.email')} error={fieldError(error, 'email')}><Input type="email" value={id.email} onChange={setId('email')} disabled={!editable} /></Field>
          <Field label={t('ppdb.address')} className="md:col-span-2"><Textarea value={id.address} onChange={setId('address')} disabled={!editable} /></Field>
          <div className="md:col-span-2 flex justify-end">
            <Button variant="primary" disabled={!id.full_name || !id.birth_date} onClick={() => setStep(1)}>{t('ppdb.next')}</Button>
          </div>
        </div>,
      )}
      {step === 1 && section(
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('ppdb.guardianName')} required className="md:col-span-2"><Input value={g.full_name} onChange={setG('full_name')} disabled={!editable} /></Field>
          <Field label={t('ppdb.relationship')} required>
            <Select value={g.relationship} onChange={setG('relationship')} disabled={!editable}>
              {RELATIONS.map((r) => <option key={r} value={r}>{tx(`rel.${r}`, r)}</option>)}
            </Select>
          </Field>
          <Field label={t('ppdb.guardianPhone')} required><Input value={g.phone} onChange={setG('phone')} disabled={!editable} inputMode="tel" /></Field>
          <Field label={t('ppdb.occupation')} className="md:col-span-2"><Input value={g.occupation ?? ''} onChange={setG('occupation')} disabled={!editable} /></Field>
          {error != null && <div className="md:col-span-2"><ApiErrorAlert error={error} /></div>}
          <div className="md:col-span-2 flex justify-between">
            <Button onClick={() => setStep(0)}>{t('ppdb.back')}</Button>
            <Button variant="primary" disabled={busy || !g.full_name || !g.phone} onClick={saveDraft}>{busy ? t('common.processing') : t('ppdb.saveDraft')}</Button>
          </div>
        </div>,
      )}
      {step === 2 && section(
        <div className="space-y-3">
          <p className="text-xs text-muted">{t('ppdb.fileHint')}</p>
          {required.concat(Object.keys(period?.document_labels ?? {}).filter((d) => !required.includes(d) && docOf(d))).map((type) => {
            const d = docOf(type);
            const canUpload = editable || (applicant?.status === 'SUBMITTED' && (!d || d.verification_status === 'INVALID'));
            return (
              <div key={type} className="flex flex-wrap items-center gap-3 border border-line rounded-md px-3 py-2.5">
                <FileText className="w-4 h-4 text-ink2" strokeWidth={1.5} aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{tx(`doc.${type}`, type)} {required.includes(type) && <Badge tone="warn" className="ml-1">{t('ppdb.required')}</Badge>}</div>
                  {d && <div className="text-xs text-ink2 truncate">{d.original_name} · <StatusPill status={d.verification_status} />{d.note && <> · {d.note}</>}</div>}
                </div>
                {canUpload && (
                  <>
                    <input ref={(el) => { fileInputs.current[type] = el; }} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(type, f); e.target.value = ''; }} />
                    <Button size="sm" icon={Upload} disabled={busy} onClick={() => fileInputs.current[type]?.click()}>{d ? t('ppdb.replace') : t('ppdb.upload')}</Button>
                  </>
                )}
              </div>
            );
          })}
          {error != null && <ApiErrorAlert error={error} />}
          <div className="flex justify-between pt-2">
            <Button onClick={() => setStep(1)} disabled={!editable}>{t('ppdb.back')}</Button>
            {applicant?.status === 'SUBMITTED'
              ? <Button variant="primary" onClick={() => setDone(true)}>{t('common.close')}</Button>
              : <Button variant="primary" disabled={missing.length > 0} onClick={() => setStep(3)}>{t('ppdb.next')}</Button>}
          </div>
        </div>,
      )}
      {step === 3 && applicant && section(
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <span className="text-ink2">{t('ppdb.fullName')}</span><span>{applicant.full_name}</span>
            <span className="text-ink2">{t('ppdb.birthDate')}</span><span>{applicant.birth_date}</span>
            <span className="text-ink2">{t('ppdb.previousSchool')}</span><span>{applicant.previous_school || '—'}</span>
            <span className="text-ink2">{t('ppdb.desiredMajor')}</span><span>{applicant.desired_major_code ?? '—'}</span>
            <span className="text-ink2">{t('ppdb.guardianName')}</span><span>{applicant.guardians[0]?.full_name} ({applicant.guardians[0]?.phone})</span>
            <span className="text-ink2">{t('adm.documents')}</span><span>{applicant.documents.length}</span>
          </div>
          <Alert tone="warn" title={t('ppdb.submitWarning')} />
          {error != null && <ApiErrorAlert error={error} />}
          <div className="flex justify-between">
            <Button onClick={() => setStep(2)}>{t('ppdb.back')}</Button>
            <Button variant="primary" disabled={busy} onClick={submit}>{busy ? t('common.processing') : t('ppdb.submit')}</Button>
          </div>
        </div>,
      )}
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense>
      <ApplyWizard />
    </Suspense>
  );
}
