'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { RequirePermission } from '@/components/guards';
import { useToast } from '@/components/toast';
import { Alert, ApiErrorAlert, Button, Card, ErrorState, Field, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { adminKeys, type SchoolProfile } from '@/features/admin/api';
import { useAuth } from '@/features/auth/auth';
import { LOCALES, useI18n } from '@/i18n';
import { api, fieldError } from '@/lib/api';

type Form = Pick<SchoolProfile, 'name' | 'code' | 'address' | 'municipality' | 'phone' | 'email' | 'timezone' | 'default_locale'>;

function SchoolForm({ profile, editable }: { profile: SchoolProfile; editable: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Form>(() => {
    const { name, code, address, municipality, phone, email, timezone, default_locale } = profile;
    return { name, code, address, municipality, phone, email, timezone, default_locale };
  });
  const save = useMutation({
    mutationFn: (body: Form) => api.patch<SchoolProfile>('/school/profile/', body),
    onSuccess: (data) => {
      qc.setQueryData(adminKeys.school, data);
      toast(t('common.saved'));
    },
  });
  const bind = (k: keyof Form) => ({
    value: (form[k] as string) ?? '',
    disabled: !editable,
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };
  return (
    <form onSubmit={submit}>
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('school.name')} required className="md:col-span-2" error={fieldError(save.error, 'name')}><Input {...bind('name')} /></Field>
          <Field label={t('school.code')} error={fieldError(save.error, 'code')}><Input mono {...bind('code')} /></Field>
          <Field label={t('school.municipality')} error={fieldError(save.error, 'municipality')}><Input {...bind('municipality')} /></Field>
          <Field label={t('school.address')} className="md:col-span-2" error={fieldError(save.error, 'address')}><Textarea {...bind('address')} /></Field>
          <Field label={t('school.phone')} error={fieldError(save.error, 'phone')}><Input {...bind('phone')} /></Field>
          <Field label={t('common.email')} error={fieldError(save.error, 'email')}><Input type="email" {...bind('email')} /></Field>
          <Field label={t('school.timezone')} error={fieldError(save.error, 'timezone')}><Input mono {...bind('timezone')} /></Field>
          <Field label={t('school.currency')}><Input mono value={profile.currency} disabled /></Field>
          <Field label={t('school.defaultLocale')} error={fieldError(save.error, 'default_locale')}>
            <Select {...bind('default_locale')}>
              {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </Select>
          </Field>
        </div>
        {save.error && !Object.keys((save.error as { fields?: object }).fields ?? {}).length && <div className="mt-4"><ApiErrorAlert error={save.error} /></div>}
        {editable && (
          <div className="flex justify-end mt-4">
            <Button variant="primary" type="submit" disabled={save.isPending}>{save.isPending ? t('common.processing') : t('common.save')}</Button>
          </div>
        )}
      </Card>
    </form>
  );
}

function SchoolScreen() {
  const { t } = useI18n();
  const { can } = useAuth();
  const editable = can('school.manage_settings');
  const profile = useQuery({ queryKey: adminKeys.school, queryFn: () => api.get<SchoolProfile>('/school/profile/') });
  return (
    <>
      <PageHeader title={t('school.title')} subtitle={t('school.subtitle')} />
      {!editable && <div className="mb-4"><Alert tone="info">{t('school.readOnly')}</Alert></div>}
      {profile.data ? (
        <SchoolForm key={profile.data.updated_at} profile={profile.data} editable={editable} />
      ) : profile.error ? (
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      ) : (
        <Card pad={false}><Skeleton rows={5} /></Card>
      )}
    </>
  );
}

export default function SchoolPage() {
  return (
    <RequirePermission any={['school.view', 'school.manage_settings']}>
      <SchoolScreen />
    </RequirePermission>
  );
}
