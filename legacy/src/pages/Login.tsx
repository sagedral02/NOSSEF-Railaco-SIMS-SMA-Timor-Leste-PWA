import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuth, useI18n, useOffline } from '../context/AppContexts';
import { api, ApiError } from '../lib/api';
import { LANGS } from '../lib/i18n';
import { Button, cx, Input, Mono } from '../components/ui';
import { ROLE_LABEL } from '../components/nav';

const DEMO = [
  ['cristina.amaral', 'PRINCIPAL'], ['maria.martins', 'CURRICULUM_ADMIN'], ['antonio.soares', 'HOMEROOM_TEACHER'], ['agostinho.freitas', 'TEACHER'],
  ['finansas', 'FINANCE_ADMIN'], ['sekretaria', 'SCHOOL_ADMIN'], ['admisaun', 'ADMISSION_OFFICER'], ['konselora', 'COUNSELOR'],
  ['biblioteka', 'LIBRARIAN'], ['patrimoniu', 'ASSET_OFFICER'], ['estudante', 'STUDENT'], ['inan-aman', 'GUARDIAN'], ['admin', 'SUPER_ADMIN'],
];

export function PublicTopStrip() {
  const { lang, setLang } = useI18n();
  const { online } = useOffline();
  return (
    <div className="h-11 bg-white border-b border-line flex items-center justify-between px-4 text-xs">
      <span className="text-ink2 truncate hidden sm:block">Escola Secundária Católica Nossa Senhora de Fátima (NOSSEF) Railaco</span>
      <span className="text-ink2 sm:hidden font-semibold">NOSSEF Railaco</span>
      <div className="flex items-center gap-3">
        <div className="flex rounded-md border border-line overflow-hidden">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} className={cx('h-7 px-2 font-semibold', lang === l.code ? 'bg-ink text-white' : 'text-ink2 hover:bg-hover')}>{l.short}</button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-ink2"><span className={cx('w-1.5 h-1.5 rounded-full', online ? 'bg-ok' : 'bg-warn')} />{online ? 'Online' : 'Offline'}</span>
      </div>
    </div>
  );
}

export default function Login({ mode = 'login' }: { mode?: 'login' | 'forgot' }) {
  const { t } = useI18n();
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (user && mode === 'login') return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === 'forgot') { await api('POST', '/api/auth/forgot', { email: username }); setSent(true); }
      else { await login(username, password); nav('/', { replace: true }); }
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white md:bg-canvas">
      <PublicTopStrip />
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 px-4 py-8">
        <div className="w-full max-w-[400px] md:bg-white md:border md:border-line md:rounded-lg md:p-8">
          <img src="/crest.svg" width={40} height={40} alt="NOSSEF" className="rounded-md" />
          <h1 className="font-display text-xl font-semibold mt-5">{mode === 'forgot' ? 'Pulihkan Kata Sandi' : t('login.title')}</h1>
          <p className="text-sm text-ink2 mt-1">{mode === 'forgot' ? 'Masukkan email atau username. Tautan reset akan dikirim jika akun terdaftar.' : t('login.subtitle')}</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-ink2">{t('login.username')}</span>
              <Input className="mt-1.5" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
            </label>
            {mode === 'login' && (
              <label className="block">
                <span className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink2">{t('login.password')}</span>
                  <Link to="/forgot-password" className="text-xs text-accent hover:underline">{t('login.forgot')}</Link>
                </span>
                <div className="relative mt-1.5">
                  <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-10" required />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center text-ink2 hover:text-ink" aria-label="Tampilkan sandi">
                    {show ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                  </button>
                </div>
              </label>
            )}
            {err && (
              <div className="flex gap-2.5 bg-bad-bg border border-bad rounded-md px-3 py-2.5 text-sm">
                <AlertCircle className="w-4 h-4 text-bad shrink-0 mt-0.5" strokeWidth={1.5} />
                <div><Mono className="text-xs text-bad font-semibold">{err.code}</Mono><div className="text-ink2 text-[0.8125rem]">{err.message}</div></div>
              </div>
            )}
            {sent && (
              <div className="flex gap-2.5 bg-ok-bg border border-ok/40 rounded-md px-3 py-2.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-ok shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="text-ink2 text-[0.8125rem]">Jika akun terdaftar, instruksi reset telah dikirim ke email resmi sekolah.</div>
              </div>
            )}
            <Button variant="primary" type="submit" disabled={busy} className="w-full h-11 md:h-10">{busy ? 'Memproses...' : mode === 'forgot' ? 'Kirim Tautan Reset' : t('login.submit')}</Button>
            {mode === 'forgot' && <Link to="/login" className="block text-center text-sm text-accent">Kembali ke halaman masuk</Link>}
          </form>
          <div className="mt-6 pt-5 border-t border-line space-y-2">
            <Link to="/ppdb/apply" className="flex items-center justify-between text-sm text-ink hover:text-accent">{t('login.ppdb')}<ArrowUpRight className="w-4 h-4" strokeWidth={1.5} /></Link>
            <Link to="/ppdb/status" className="flex items-center justify-between text-sm text-ink hover:text-accent">{t('login.ppdbStatus')}<ArrowUpRight className="w-4 h-4" strokeWidth={1.5} /></Link>
          </div>
        </div>
        {mode === 'login' && (
          <div className="w-full max-w-[400px] lg:max-w-[340px] border border-line rounded-lg bg-white">
            <div className="px-4 h-11 flex items-center border-b border-line text-sm font-semibold">Akun Demo <span className="ml-auto text-xs font-normal text-ink2">sandi: <Mono>nossef2026</Mono></span></div>
            <div className="max-h-[420px] overflow-y-auto scroll-thin">
              {DEMO.map(([u, r]) => (
                <button key={u} onClick={() => { setUsername(u); setPassword('nossef2026'); setErr(null); }} className="w-full flex items-center justify-between gap-2 px-4 h-11 border-b border-line last:border-0 hover:bg-hover text-left">
                  <Mono className="text-xs text-ink">{u}</Mono>
                  <span className="text-xs text-ink2">{ROLE_LABEL[r]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
