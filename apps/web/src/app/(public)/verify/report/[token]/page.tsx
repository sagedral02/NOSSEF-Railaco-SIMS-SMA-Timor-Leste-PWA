'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';

import { Alert, ApiErrorAlert, Card, KV, Skeleton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Verification {
  valid: boolean; superseded: boolean; school: string | null; student_name: string | null; student_no: string | null;
  academic_year: string; trimester: number; revision: number; published_at: string | null;
}

/** Public QR verification (PRD §23.1): authenticity only, never grades. */
export default function VerifyReportPage() {
  const { t, locale } = useI18n();
  const { token } = useParams<{ token: string }>();
  const q = useQuery({ queryKey: ['verify', token], queryFn: () => api.get<Verification>(`/report-cards/verify/${encodeURIComponent(token)}/`), retry: false });
  const v = q.data;
  return (
    <div className="w-full max-w-md space-y-4">
      <h1 className="font-display text-xl font-semibold">{t('rc.verifyTitle')}</h1>
      {q.isPending ? <Card><Skeleton rows={4} /></Card> : q.error ? <ApiErrorAlert error={q.error} /> : v && (
        <>
          {v.valid
            ? <Alert tone="ok" icon={ShieldCheck}>{t('rc.verifyValid')}</Alert>
            : <Alert tone="warn" icon={ShieldAlert}>{t('rc.verifySuperseded')}</Alert>}
          <Card>
            <div className="space-y-2">
              <KV k={t('nav.school')} v={v.school ?? '—'} />
              <KV k={t('common.name')} v={v.student_name ?? '—'} />
              <KV k={t('student.no')} v={v.student_no ?? '—'} mono />
              <KV k={t('common.year')} v={v.academic_year} />
              <KV k={t('common.trimester')} v={v.trimester} />
              <KV k={t('rc.revision')} v={v.revision} mono />
              <KV k={t('status.PUBLISHED')} v={fmtDateTime(v.published_at, locale)} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
