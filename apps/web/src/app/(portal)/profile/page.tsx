'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { useToast } from '@/components/toast';
import { ApiErrorAlert, Badge, Button, Card, Field, Input, KV, Mono, PageHeader, Select, StatusPill } from '@/components/ui';
import { ME_KEY, useAuth, type Me } from '@/features/auth/auth';
import { LOCALES, useI18n } from '@/i18n';
import { api, fieldError } from '@/lib/api';

export default function ProfilePage() {
  const { t, tx, setLocale } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const prefs = useMutation({
    mutationFn: (preferred_locale: string) => api.patch<Me>('/auth/me/', { preferred_locale }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
      toast(t('common.saved'));
    },
  });
  const password = useMutation({
    mutationFn: () => api.post('/auth/password/change/', { current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      toast(t('profile.passwordChanged'));
    },
  });

  if (!user) return null;
  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    password.mutate();
  };

  return (
    <>
      <PageHeader title={t('profile.title')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('profile.account')}>
          <KV k={t('users.username')} v={<Mono>{user.username}</Mono>} />
          <KV k={t('users.fullName')} v={user.full_name || '—'} />
          <KV k={t('common.email')} v={user.email || '—'} />
          <KV k={t('common.status')} v={<StatusPill status={user.account_status} />} />
          <KV k={t('users.roles')} v={<span className="inline-flex flex-wrap gap-1 justify-end">{user.roles.map((r) => <Badge key={r}>{tx(`role.${r}`, r)}</Badge>)}</span>} />
        </Card>
        <div className="space-y-4">
          <Card title={t('profile.preferences')}>
            <Field label={t('profile.locale')}>
              <Select
                value={user.preferred_locale}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'id' || v === 'tet' || v === 'pt') setLocale(v);
                  prefs.mutate(v);
                }}
              >
                <option value="">{t('profile.localeDefault')}</option>
                {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </Select>
            </Field>
            {prefs.error && <div className="mt-3"><ApiErrorAlert error={prefs.error} /></div>}
          </Card>
          <Card title={t('profile.changePassword')}>
            <form onSubmit={submitPassword} className="space-y-4">
              <Field label={t('profile.currentPassword')} required error={fieldError(password.error, 'current_password')}>
                <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
              </Field>
              <Field label={t('reset.newPassword')} required hint={t('reset.hint')} error={fieldError(password.error, 'new_password')}>
                <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
              </Field>
              {password.error && !fieldError(password.error, 'current_password') && !fieldError(password.error, 'new_password') && (
                <ApiErrorAlert error={password.error} />
              )}
              <div className="flex justify-end">
                <Button variant="primary" type="submit" disabled={password.isPending || !current || !next}>
                  {password.isPending ? t('common.processing') : t('reset.submit')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
