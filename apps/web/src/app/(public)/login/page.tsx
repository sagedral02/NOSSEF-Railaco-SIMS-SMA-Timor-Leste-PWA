'use client';

import { ArrowUpRight, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';

import { ApiErrorAlert, Button, Input, Mono } from '@/components/ui';
import { useAuth } from '@/features/auth/auth';
import { useI18n } from '@/i18n';

// Synthetic local-only accounts created by `seed_demo_school`; hidden in production builds.
const DEMO = [
  ['admin', 'SUPER_ADMIN'], ['sekretaria', 'SCHOOL_ADMIN'], ['cristina.amaral', 'PRINCIPAL'], ['maria.martins', 'CURRICULUM_ADMIN'],
  ['antonio.soares', 'HOMEROOM_TEACHER'], ['agostinho.freitas', 'TEACHER'], ['finansas', 'FINANCE_ADMIN'], ['admisaun', 'ADMISSION_OFFICER'],
  ['konselora', 'COUNSELOR'], ['biblioteka', 'LIBRARIAN'], ['patrimoniu', 'ASSET_OFFICER'], ['estudante', 'STUDENT'], ['inan-aman', 'GUARDIAN'],
] as const;
const SHOW_DEMO = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === 'true';

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

function LoginForm() {
  const { t, tx } = useI18n();
  const { user, login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(safeNext(params.get('next')));
  }, [user, router, params]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="w-full max-w-[400px] md:bg-white md:border md:border-line md:rounded-lg md:p-8">
        <Image src="/crest.svg" width={40} height={40} alt="NOSSEF" className="rounded-md" priority />
        <h1 className="font-display text-xl font-semibold mt-5">{t('login.title')}</h1>
        <p className="text-sm text-ink2 mt-1">{t('login.subtitle')}</p>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <label className="block">
            <span className="text-xs font-semibold text-ink2">{t('login.username')}</span>
            <Input className="mt-1.5" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <div>
            {/* Explicit label so the field's accessible name is only "password", not the link/button text. */}
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-xs font-semibold text-ink2">{t('login.password')}</label>
              <Link href="/forgot-password" className="text-xs text-accent hover:underline">{t('login.forgot')}</Link>
            </div>
            <div className="relative mt-1.5">
              <Input id="login-password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-10" required />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center text-ink2 hover:text-ink" aria-label={t('common.showPassword')} aria-pressed={show}>
                {show ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
              </button>
            </div>
          </div>
          {error != null && <ApiErrorAlert error={error} />}
          <Button variant="primary" type="submit" disabled={busy || !username || !password} className="w-full h-11 md:h-10">
            {busy ? t('common.processing') : t('login.submit')}
          </Button>
        </form>
        <div className="mt-6 pt-5 border-t border-line space-y-2">
          <Link href="/admissions/apply" className="flex items-center justify-between text-sm text-ink hover:text-accent">{t('login.admissions')}<ArrowUpRight className="w-4 h-4" strokeWidth={1.5} aria-hidden /></Link>
          <Link href="/admissions/status" className="flex items-center justify-between text-sm text-ink hover:text-accent">{t('login.admissionStatus')}<ArrowUpRight className="w-4 h-4" strokeWidth={1.5} aria-hidden /></Link>
        </div>
      </div>
      {SHOW_DEMO && (
        <div className="w-full max-w-[400px] lg:max-w-[340px] border border-line rounded-lg bg-white">
          <div className="px-4 h-11 flex items-center border-b border-line text-sm font-semibold">
            {t('login.demoAccounts')}
            <span className="ml-auto text-xs font-normal text-ink2">{t('login.demoPassword')}: <Mono>nossef2026</Mono></span>
          </div>
          <div className="max-h-[420px] overflow-y-auto scroll-thin">
            {DEMO.map(([u, r]) => (
              <button
                key={u}
                type="button"
                onClick={() => { setUsername(u); setPassword('nossef2026'); setError(null); }}
                className="w-full flex items-center justify-between gap-2 px-4 h-11 border-b border-line last:border-0 hover:bg-hover text-left"
              >
                <Mono className="text-xs text-ink">{u}</Mono>
                <span className="text-xs text-ink2">{tx(`role.${r}`, r)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
