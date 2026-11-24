'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { RequirePermission } from '@/components/guards';
import { ResourcePage } from '@/components/resource';
import { useToast } from '@/components/toast';
import { Badge, Button, Mono, StatusPill } from '@/components/ui';
import { useAuth } from '@/features/auth/auth';
import { useI18n, type MessageKey } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

const DOCS = ['BIRTH_CERTIFICATE', 'PREVIOUS_CERTIFICATE', 'REPORT_CARD', 'ID_PHOTO', 'BAPTISM_CERTIFICATE', 'GUARDIAN_ID'];
const NEXT: Record<string, [string, MessageKey, string]> = {
  DRAFT: ['open', 'adm.openPeriod', 'admission.create'],
  OPEN: ['close', 'adm.closePeriod', 'admission.create'],
  CLOSED: ['publish', 'adm.publish', 'admission.decide'],
  DECISION: ['complete', 'adm.complete', 'admission.create'],
};

function toIso(v: unknown) {
  return typeof v === 'string' && v.length === 16 ? new Date(v).toISOString() : v;
}
function toLocal(v: unknown) {
  if (typeof v !== 'string') return v;
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PeriodsPage() {
  const { t, tx, locale } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api.post(`/admissions/periods/${id}/${action}/`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['resource', '/admissions/periods/'] }); toast(t('common.saved')); },
    onError: (e) => toast(e instanceof ApiError ? tx(`error.${e.code}`, e.message) : String(e), 'error'),
  });
  return (
    <RequirePermission any={['admission.view']}>
      <ResourcePage
        title="adm.periods"
        path="/admissions/periods/"
        managePermission="admission.create"
        canDelete={false}
        rowTitle={(r) => String(r.name)}
        toPayload={(v) => ({
          ...v, registration_start: toIso(v.registration_start), registration_end: toIso(v.registration_end),
          required_documents: DOCS.filter((d) => v[`doc_${d}`]),
        })}
        rowActions={(r) => {
          const next = NEXT[String(r.status)];
          return next && can(next[2]) ? (
            <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ id: r.id, action: next[0] })}>{t(next[1])}</Button>
          ) : null;
        }}
        columns={[
          { header: 'adm.periodName', cell: (r) => String(r.name) },
          { header: 'common.year', cell: (r) => <Mono>{String(r.academic_year_name)}</Mono> },
          { header: 'adm.registrationStart', cell: (r) => fmtDateTime(r.registration_start as string, locale) },
          { header: 'adm.registrationEnd', cell: (r) => fmtDateTime(r.registration_end as string, locale) },
          { header: 'adm.requiredDocs', cell: (r) => <span className="inline-flex flex-wrap gap-1">{(r.required_documents as string[]).map((d) => <Badge key={d}>{tx(`doc.${d}`, d)}</Badge>)}</span> },
          { header: 'adm.applicants', cell: (r) => `${r.applicant_count}${r.capacity_total ? ` / ${r.capacity_total}` : ''}`, align: 'right', mono: true },
          { header: 'common.status', cell: (r) => <StatusPill status={String(r.status)} /> },
        ]}
        fields={[
          { name: 'name', label: 'adm.periodName', required: true, span: 2 },
          { name: 'academic_year', label: 'common.year', type: 'select', required: true, optionsFrom: { path: '/academic-years/', label: (r) => String(r.name) } },
          { name: 'capacity_total', label: 'adm.capacity', type: 'number' },
          { name: 'registration_start', label: 'adm.registrationStart', type: 'datetime', required: true },
          { name: 'registration_end', label: 'adm.registrationEnd', type: 'datetime', required: true },
          ...DOCS.map((d) => ({ name: `doc_${d}`, label: `doc.${d}` as MessageKey, type: 'checkbox' as const, default: ['BIRTH_CERTIFICATE', 'PREVIOUS_CERTIFICATE', 'ID_PHOTO'].includes(d) })),
        ]}
        initialFromRow={(r) => ({
          ...r, registration_start: toLocal(r.registration_start), registration_end: toLocal(r.registration_end),
          ...Object.fromEntries(DOCS.map((d) => [`doc_${d}`, (r.required_documents as string[]).includes(d)])),
        })}
      />
    </RequirePermission>
  );
}
