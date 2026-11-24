'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { Alert, ApiErrorAlert, Button, Card, Field, Input, Mono, StatusPill } from '@/components/ui';
import { publicApi, useSavedRegistrations } from '@/features/admissions/public';
import { useI18n } from '@/i18n';
import { fmtDateTime } from '@/lib/format';

export default function StatusPage() {
  const { t, tx, locale } = useI18n();
  const saved = useSavedRegistrations();
  const [reg, setReg] = useState('');
  const [dob, setDob] = useState('');
  const [showRecover, setShowRecover] = useState(false);
  const [rec, setRec] = useState({ full_name: '', birth_date: '', guardian_phone: '' });
  const lookup = useMutation({ mutationFn: () => publicApi.status(reg, dob) });
  const recover = useMutation({ mutationFn: () => publicApi.recover(rec), onSuccess: (r) => setReg(r.registration_no) });
  const r = lookup.data;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    lookup.mutate();
  };
  return (
    <div className="w-full max-w-xl space-y-4">
      <h1 className="font-display text-xl font-semibold">{t('ppdb.statusTitle')}</h1>
      <p className="text-sm text-ink2">{t('ppdb.statusSubtitle')}</p>
      <Card>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label={t('ppdb.registrationNo')} required><Input mono value={reg} onChange={(e) => setReg(e.target.value.toUpperCase())} placeholder="PPDB-2027-XXXXXX" /></Field>
          <Field label={t('ppdb.birthDate')} required><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
          {saved.length > 0 && (
            <div className="sm:col-span-2 flex flex-wrap gap-1.5">
              {saved.map((s) => (
                <button key={s.registration_no} type="button" onClick={() => { setReg(s.registration_no); setDob(s.birth_date); }}
                  className="h-7 px-2 rounded-md border border-line text-xs hover:bg-hover"><Mono className="text-xs">{s.registration_no}</Mono></button>
              ))}
            </div>
          )}
          {lookup.error && <div className="sm:col-span-2"><ApiErrorAlert error={lookup.error} /></div>}
          <div className="sm:col-span-2 flex justify-between items-center">
            <button type="button" className="text-xs text-accent" onClick={() => setShowRecover(!showRecover)}>{t('ppdb.forgot')}</button>
            <Button variant="primary" type="submit" disabled={!reg || !dob || lookup.isPending}>{t('ppdb.search')}</Button>
          </div>
        </form>
      </Card>
      {r && (
        <Card>
          <div className="text-xs text-ink2">{r.period}</div>
          <div className="flex items-center justify-between gap-3 mt-1">
            <div>
              <Mono className="text-lg font-semibold">{r.registration_no}</Mono>
              <div className="text-sm">{r.full_name}</div>
            </div>
            <StatusPill status={r.status} />
          </div>
          {r.submitted_at && <div className="text-xs text-muted mt-2">{fmtDateTime(r.submitted_at, locale)}</div>}
          {!r.decision_published && r.status !== 'DRAFT' && <div className="mt-3"><Alert tone="info">{t('ppdb.decisionPending')}</Alert></div>}
          {r.missing_documents.length > 0 && (
            <div className="mt-3"><Alert tone="warn" title={t('ppdb.missingDocs')}>{r.missing_documents.map((d) => tx(`doc.${d}`, d)).join(', ')}</Alert></div>
          )}
          {r.invalid_documents.length > 0 && (
            <div className="mt-3"><Alert tone="bad" title={t('ppdb.invalidDocs')}>{r.invalid_documents.map((d) => `${tx(`doc.${d.document_type}`, d.document_type)}: ${d.note}`).join(' · ')}</Alert></div>
          )}
        </Card>
      )}
      {showRecover && (
        <Card title={t('ppdb.forgot')}>
          <p className="text-xs text-ink2 mb-3">{t('ppdb.forgotHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('ppdb.fullName')} className="sm:col-span-2"><Input value={rec.full_name} onChange={(e) => setRec({ ...rec, full_name: e.target.value })} /></Field>
            <Field label={t('ppdb.birthDate')}><Input type="date" value={rec.birth_date} onChange={(e) => setRec({ ...rec, birth_date: e.target.value })} /></Field>
            <Field label={t('ppdb.guardianPhone')}><Input value={rec.guardian_phone} onChange={(e) => setRec({ ...rec, guardian_phone: e.target.value })} /></Field>
          </div>
          {recover.error && <div className="mt-3"><ApiErrorAlert error={recover.error} /></div>}
          {recover.data && <div className="mt-3"><Alert tone="ok" title={t('ppdb.recovered')}><Mono className="text-base">{recover.data.registration_no}</Mono></Alert></div>}
          <div className="flex justify-end mt-3">
            <Button disabled={recover.isPending || !rec.full_name || !rec.birth_date || !rec.guardian_phone} onClick={() => recover.mutate()}>{t('ppdb.recover')}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
