'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Alert, Badge, Card, Mono, StatusPill } from '@/components/ui';
import { publicApi, useSavedRegistrations } from '@/features/admissions/public';
import { useI18n } from '@/i18n';
import { fmtDate, fmtDateTime } from '@/lib/format';

export default function AdmissionsLanding() {
  const { t, tx, locale } = useI18n();
  const periods = useQuery({ queryKey: ['public', 'periods'], queryFn: publicApi.periods });
  const saved = useSavedRegistrations();
  return (
    <div className="w-full max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Image src="/crest.svg" width={40} height={40} alt="NOSSEF" className="rounded-md" />
        <div>
          <h1 className="font-display text-xl md:text-2xl font-semibold">{t('ppdb.portalTitle')}</h1>
          <p className="text-sm text-ink2">{t('ppdb.portalSubtitle')}</p>
        </div>
      </div>
      {periods.data?.length === 0 && <Alert tone="warn">{t('ppdb.closedNow')}</Alert>}
      {periods.data?.map((p) => (
        <Card key={p.id}>
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <Badge tone="ok" dot>{t('ppdb.open')}</Badge>
              <h2 className="font-display text-lg font-semibold mt-2">{p.name}</h2>
              <p className="text-sm text-ink2">{t('common.year')} {p.academic_year_name} · {t('ppdb.until')} {fmtDateTime(p.registration_end, locale)}</p>
              <p className="text-xs text-muted mt-2">{t('adm.requiredDocs')}: {p.required_documents.map((d) => tx(`doc.${d}`, d)).join(', ')}</p>
            </div>
            <Link href={`/admissions/apply?period=${p.id}`} className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover">
              {t('ppdb.apply')} <ArrowRight className="w-4 h-4" strokeWidth={1.5} aria-hidden />
            </Link>
          </div>
        </Card>
      ))}
      <Link href="/admissions/status" className="flex items-center gap-3 bg-white border border-line rounded-lg px-4 h-14 hover:bg-hover">
        <Search className="w-4 h-4 text-ink2" strokeWidth={1.5} aria-hidden />
        <span className="flex-1 text-sm font-medium">{t('ppdb.checkStatus')}</span>
        <ArrowRight className="w-4 h-4 text-muted" strokeWidth={1.5} aria-hidden />
      </Link>
      {saved.length > 0 && (
        <Card title={t('ppdb.savedOnDevice')} pad={false}>
          {saved.map((r) => (
            <Link key={r.registration_no} href={`/admissions/apply?reg=${r.registration_no}`} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-hover">
              <div className="flex-1 min-w-0">
                <Mono className="text-sm font-semibold">{r.registration_no}</Mono>
                <div className="text-xs text-ink2 truncate">{r.full_name} · {fmtDate(r.birth_date, locale)}</div>
              </div>
              <StatusPill status={r.status} />
              <span className="text-xs text-accent">{t('ppdb.continue')}</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
