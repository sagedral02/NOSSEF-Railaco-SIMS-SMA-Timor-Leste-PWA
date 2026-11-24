'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { Alert, ApiErrorAlert, Button, Field, Input } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/password-reset/request/', { identifier });
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[400px] md:bg-white md:border md:border-line md:rounded-lg md:p-8">
      <Image src="/crest.svg" width={40} height={40} alt="NOSSEF" className="rounded-md" />
      <h1 className="font-display text-xl font-semibold mt-5">{t('forgot.title')}</h1>
      <p className="text-sm text-ink2 mt-1">{t('forgot.subtitle')}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label={t('forgot.identifier')} required>
          <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        {error != null && <ApiErrorAlert error={error} />}
        {sent && <Alert tone="ok">{t('forgot.sent')}</Alert>}
        <Button variant="primary" type="submit" disabled={busy || !identifier.trim()} className="w-full h-11 md:h-10">
          {busy ? t('common.processing') : t('forgot.submit')}
        </Button>
        <Link href="/login" className="block text-center text-sm text-accent">{t('forgot.backToLogin')}</Link>
      </form>
    </div>
  );
}
