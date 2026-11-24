'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import { Alert, ApiErrorAlert, Button, Field, Input } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, fieldError } from '@/lib/api';

function ResetForm() {
  const { t } = useI18n();
  const params = useSearchParams();
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/password-reset/confirm/', { uid, token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[400px] md:bg-white md:border md:border-line md:rounded-lg md:p-8">
      <Image src="/crest.svg" width={40} height={40} alt="NOSSEF" className="rounded-md" />
      <h1 className="font-display text-xl font-semibold mt-5">{t('reset.title')}</h1>
      {!uid || !token ? (
        <div className="mt-6"><Alert tone="bad">{t('reset.invalidLink')}</Alert></div>
      ) : done ? (
        <div className="mt-6 space-y-4">
          <Alert tone="ok">{t('reset.done')}</Alert>
          <Link href="/login" className="block text-center text-sm text-accent">{t('forgot.backToLogin')}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label={t('reset.newPassword')} required hint={t('reset.hint')} error={fieldError(error, 'new_password')}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label={t('reset.confirmPassword')} required error={mismatch ? t('reset.mismatch') : null}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
          {error != null && !fieldError(error, 'new_password') && <ApiErrorAlert error={error} />}
          <Button variant="primary" type="submit" disabled={busy || !password || mismatch} className="w-full h-11 md:h-10">
            {busy ? t('common.processing') : t('reset.submit')}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
