'use client';

// App chrome ported from the previous UI: sidebar (desktop), rail (tablet), bottom tabs (mobile),
// command palette (Ctrl+K), language + zoom + connection status + user menu.
import { Check, Cloud, CloudOff, LayoutGrid, LogOut, Menu, Minus, Plus, RefreshCw, Search, User as UserIcon, WifiOff, X, ZoomIn } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useZoom } from '@/components/zoom';
import { useSelectedYear } from '@/features/academics/api';
import { NotificationBell } from '@/features/communications/bell';
import { useAuth } from '@/features/auth/auth';
import { LOCALES, useI18n } from '@/i18n';
import { cx } from '@/lib/format';
import { useOffline } from '@/lib/offline/provider';

import { Avatar, Badge, Button, Modal, Mono } from '../ui';
import { GROUPS, bottomTabs, isActive, visibleNav, type NavItem } from './nav';

function Crest({ size = 32 }: { size?: number }) {
  return <Image src="/crest.svg" alt="NOSSEF" width={size} height={size} className="rounded-md shrink-0" priority />;
}

function useVisibleNav() {
  const { can, hasRole } = useAuth();
  return useMemo(() => visibleNav(can, hasRole), [can, hasRole]);
}

/** Academic context picker (ui.md §2.1): selected year + its active trimestre/CAU. Shared with every page's YearSelect. */
function PeriodContext() {
  const { t, tx } = useI18n();
  const { year, years, setYear, activeTrimester } = useSelectedYear();
  if (!years.length) return null;
  return (
    <div className="mx-3 mb-2 rounded-md border border-line bg-white px-2.5 py-2">
      <label className="block">
        <span className="sr-only">{t('common.year')}</span>
        <select value={year?.id ?? ''} onChange={(e) => setYear(e.target.value)}
          className="w-full bg-transparent text-sm font-medium text-ink focus:outline-none cursor-pointer">
          {years.map((y) => <option key={y.id} value={y.id}>{t('common.year')} {y.name}</option>)}
        </select>
      </label>
      <div className="text-[11px] text-ink2 mt-0.5 truncate">
        {activeTrimester ? <>{activeTrimester.name} · <Mono className="text-[11px]">CAU {activeTrimester.cau_number}</Mono></> : year ? tx(`status.${year.status}`, year.status) : '—'}
      </div>
    </div>
  );
}

function Sidebar({ rail, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const items = useVisibleNav();
  const pathname = usePathname();
  const { online, pending } = useOffline();
  const { can } = useAuth();
  return (
    <div className="h-full flex flex-col bg-canvas">
      <div className={cx('flex items-center gap-2.5 h-14 shrink-0', rail ? 'justify-center' : 'px-4')}>
        <Crest />
        {!rail && (
          <div className="min-w-0 leading-tight">
            <div className="font-display font-semibold text-[0.95rem] text-ink">NOSSEF Railaco</div>
            <div className="text-[11px] text-ink2 truncate">SIMS SMA Timor-Leste</div>
          </div>
        )}
      </div>
      {!rail && can('academic.view') && <PeriodContext />}
      <nav aria-label={t('nav.menu')} className="flex-1 overflow-y-auto scroll-thin px-2 pb-3">
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="mt-2">
              {!rail && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t(`nav.group.${g}`)}</div>}
              {rail && <div className="mx-3 my-2 border-t border-line" />}
              {list.map((n) => {
                const active = isActive(n, pathname);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={onNavigate}
                    title={rail ? t(n.key) : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex items-center gap-3 rounded-md text-sm transition-colors',
                      rail ? 'justify-center h-11 w-11 mx-auto' : 'h-9 px-3',
                      active ? 'bg-selected text-accent font-semibold' : 'text-ink2 hover:bg-hover hover:text-ink',
                    )}
                  >
                    <n.icon className="w-5 h-5 shrink-0" strokeWidth={1.5} aria-hidden />
                    {rail ? <span className="sr-only">{t(n.key)}</span> : <span className="truncate">{t(n.key)}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className={cx('border-t border-line py-3 text-xs', rail ? 'flex justify-center' : 'px-4')}>
        <span className="inline-flex items-center gap-2 text-ink2">
          <span className={cx('w-1.5 h-1.5 rounded-full', online ? 'bg-ok' : 'bg-warn')} aria-hidden />
          {!rail && (online ? t('common.online') : t('common.offline'))}
          {!rail && pending > 0 && <Mono className="text-[11px]">· {t('offline.pendingShort', { count: pending })}</Mono>}
        </span>
      </div>
    </div>
  );
}

/** Mounted only while open, so the query starts empty each time. */
function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const { t } = useI18n();
  const items = useVisibleNav();
  const router = useRouter();
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => !s || t(i.key).toLowerCase().includes(s)).slice(0, 10);
  }, [q, items, t]);
  const go = (n: NavItem) => {
    router.push(n.href);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label={t('top.search')}>
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-lg border border-line shadow-lg overflow-hidden anim-fade">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search className="w-4 h-4 text-muted" strokeWidth={1.5} aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('top.search')}
            aria-label={t('top.search')}
            className="flex-1 bg-transparent outline-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) go(results[0]);
              if (e.key === 'Escape') onClose();
            }}
          />
          <kbd className="text-[11px] font-mono text-muted border border-line rounded px-1.5">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto scroll-thin py-1">
          {results.map((r) => (
            <button key={r.href} type="button" onClick={() => go(r)} className="w-full flex items-center gap-3 px-4 h-11 hover:bg-hover text-left">
              <r.icon className="w-4 h-4 text-muted" strokeWidth={1.5} aria-hidden />
              <span className="text-sm text-ink flex-1 truncate">{t(r.key)}</span>
              <Mono className="text-xs text-muted">{r.href}</Mono>
            </button>
          ))}
          {!results.length && <div className="px-4 py-6 text-sm text-ink2">{t('state.noResults')}</div>}
        </div>
      </div>
    </div>
  );
}

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const id = setTimeout(() => document.addEventListener('mousedown', h));
    document.addEventListener('keydown', k);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className={cx('absolute right-0 top-11 z-50 bg-white border border-line rounded-lg shadow-lg anim-fade', className)}>{children}</div>;
}

function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { t, tx, locale, setLocale } = useI18n();
  const { zoom, setZoom } = useZoom();
  const { user, logout } = useAuth();
  const { online, pending, conflicts, syncing, sync, wipe } = useOffline();
  const router = useRouter();
  const [pop, setPop] = useState<null | 'sync' | 'lang' | 'zoom' | 'user'>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const doLogout = async () => {
    setConfirmLogout(false);
    await logout();
    await wipe(); // PRD §34.4: logout clears user-scoped offline data
    router.replace('/login');
  };
  const close = () => setPop(null);
  if (!user) return null;
  const displayName = user.full_name || user.username;
  return (
    <header className="h-14 shrink-0 bg-white border-b border-line flex items-center gap-2 px-3 md:px-4">
      <button type="button" onClick={onMenu} className="lg:hidden hidden md:inline-flex w-9 h-9 items-center justify-center rounded-md hover:bg-hover" aria-label={t('nav.menu')}>
        <Menu className="w-5 h-5" strokeWidth={1.5} />
      </button>
      <div className="md:hidden flex items-center gap-2 min-w-0">
        <Crest size={28} />
        <span className="font-display font-semibold text-ink truncate">NOSSEF</span>
      </div>
      <button type="button" onClick={onSearch} className="hidden md:flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-canvas text-sm text-muted hover:border-line-strong flex-1 max-w-md">
        <Search className="w-4 h-4" strokeWidth={1.5} aria-hidden />
        <span className="truncate flex-1 text-left">{t('top.search')}</span>
        <kbd className="text-[11px] font-mono border border-line rounded px-1.5 bg-white">Ctrl+K</kbd>
      </button>
      <div className="flex-1" />
      <button type="button" onClick={onSearch} className="md:hidden w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-hover" aria-label={t('common.search')}>
        <Search className="w-5 h-5" strokeWidth={1.5} />
      </button>

      <div className="relative">
        <button type="button" onClick={() => setPop(pop === 'sync' ? null : 'sync')} className={cx('inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border', online ? 'border-line text-ok bg-white' : 'border-warn/30 bg-warn-bg text-warn')}>
          {online ? <Cloud className="w-4 h-4" strokeWidth={1.5} aria-hidden /> : <CloudOff className="w-4 h-4" strokeWidth={1.5} aria-hidden />}
          <span className="hidden sm:inline">{online ? t('common.online') : t('common.offline')}</span>
          {pending + conflicts.length > 0 && <Mono className="text-[11px]">{pending + conflicts.length}</Mono>}
        </button>
        <Popover open={pop === 'sync'} onClose={close} className="w-80 p-4">
          <div className="text-sm font-semibold">{online ? t('common.online') : t('common.offline')}</div>
          <div className="text-xs text-ink2 mt-1">{online ? t('top.connected') : t('offline.queuedHint')}</div>
          <div className="mt-3 flex items-center justify-between text-xs"><span className="text-ink2">{t('offline.queue')}</span><Mono>{pending}</Mono></div>
          {conflicts.length > 0 && <div className="mt-1 flex items-center justify-between text-xs text-bad"><span>{t('offline.conflicts')}</span><Mono>{conflicts.length}</Mono></div>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" icon={RefreshCw} disabled={!online || syncing || pending === 0} onClick={() => void sync()}>{t('offline.syncNow')}</Button>
            {conflicts.length > 0 && <Link href="/attendance/today" onClick={close} className="text-xs text-accent self-center">{t('offline.resolve')}</Link>}
          </div>
        </Popover>
      </div>

      <NotificationBell />

      <div className="relative hidden md:block">
        <button type="button" onClick={() => setPop(pop === 'lang' ? null : 'lang')} aria-label={t('common.language')} className="h-8 px-2 rounded-md text-xs font-semibold text-ink2 hover:bg-hover border border-line">
          {LOCALES.find((l) => l.code === locale)?.short}
        </button>
        <Popover open={pop === 'lang'} onClose={close} className="w-48 py-1">
          {LOCALES.map((l) => (
            <button key={l.code} type="button" onClick={() => { setLocale(l.code); close(); }} className="w-full flex items-center justify-between px-3 h-9 text-sm hover:bg-hover">
              <span><Mono className="text-xs text-muted mr-2">{l.short}</Mono>{l.name}</span>
              {locale === l.code && <Check className="w-4 h-4 text-accent" strokeWidth={1.5} aria-hidden />}
            </button>
          ))}
        </Popover>
      </div>

      <div className="relative hidden lg:block">
        <button type="button" onClick={() => setPop(pop === 'zoom' ? null : 'zoom')} className="h-8 px-2 rounded-md text-xs text-ink2 hover:bg-hover border border-line inline-flex items-center gap-1">
          <ZoomIn className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden /><Mono>{zoom}%</Mono>
        </button>
        <Popover open={pop === 'zoom'} onClose={close} className="w-56 p-3">
          <div className="text-xs text-ink2 mb-2">{t('top.zoom')}</div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="-" className="w-8 h-8 border border-line rounded-md inline-flex items-center justify-center hover:bg-hover" onClick={() => setZoom(zoom - 5)}><Minus className="w-4 h-4" strokeWidth={1.5} /></button>
            <input type="range" aria-label={t('top.zoom')} min={85} max={160} step={5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[#0061FE]" />
            <button type="button" aria-label="+" className="w-8 h-8 border border-line rounded-md inline-flex items-center justify-center hover:bg-hover" onClick={() => setZoom(zoom + 5)}><Plus className="w-4 h-4" strokeWidth={1.5} /></button>
          </div>
          <button type="button" onClick={() => setZoom(100)} className="mt-2 text-xs text-accent">{t('top.zoomReset')}</button>
        </Popover>
      </div>

      <div className="relative">
        <button type="button" onClick={() => setPop(pop === 'user' ? null : 'user')} className="flex items-center gap-2 h-9 pl-1 pr-1 md:pr-2 rounded-md hover:bg-hover" aria-haspopup="menu" aria-expanded={pop === 'user'}>
          <Avatar name={displayName} size={28} tone="dark" />
          <span className="hidden xl:block text-left leading-tight max-w-[160px]">
            <span className="block text-xs font-semibold text-ink truncate">{displayName}</span>
            <span className="block text-[11px] text-ink2 truncate">{user.roles[0] ? tx(`role.${user.roles[0]}`, user.roles[0]) : user.username}</span>
          </span>
        </button>
        <Popover open={pop === 'user'} onClose={close} className="w-64 py-1">
          <div className="px-4 py-3 border-b border-line">
            <div className="text-sm font-semibold">{displayName}</div>
            <Mono className="text-xs text-ink2">{user.username}</Mono>
            <div className="flex flex-wrap gap-1 mt-2">{user.roles.map((r) => <Badge key={r} mono>{r}</Badge>)}</div>
          </div>
          <div className="md:hidden px-4 py-2 border-b border-line flex gap-1">
            {LOCALES.map((l) => (
              <button key={l.code} type="button" onClick={() => setLocale(l.code)} className={cx('flex-1 h-8 rounded text-xs font-semibold', locale === l.code ? 'bg-ink text-white' : 'bg-canvas text-ink2')}>{l.short}</button>
            ))}
          </div>
          <Link href="/profile" onClick={close} className="w-full flex items-center gap-2 px-4 h-10 text-sm hover:bg-hover">
            <UserIcon className="w-4 h-4" strokeWidth={1.5} aria-hidden /> {t('nav.profile')}
          </Link>
          <button
            type="button"
            onClick={async () => {
              close();
              if (pending + conflicts.length > 0) setConfirmLogout(true);
              else await doLogout();
            }}
            className="w-full flex items-center gap-2 px-4 h-10 text-sm text-bad hover:bg-hover"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.5} aria-hidden /> {t('top.logout')}
          </button>
        </Popover>
      </div>
      <Modal open={confirmLogout} onClose={() => setConfirmLogout(false)} title={t('offline.logoutTitle')} size="sm"
        footer={<>
          <Button onClick={() => setConfirmLogout(false)}>{t('common.cancel')}</Button>
          {online && <Button variant="primary" disabled={syncing} onClick={async () => { await sync(); }}>{t('offline.syncNow')}</Button>}
          <Button variant="danger" onClick={doLogout}>{t('offline.logoutDiscard')}</Button>
        </>}>
        <p className="text-sm text-ink2">{t('offline.logoutBody', { count: pending + conflicts.length })}</p>
      </Modal>
    </header>
  );
}

function OfflineStrip() {
  const { t } = useI18n();
  const { online, pending, syncing, sync } = useOffline();
  if (online && !pending) return null;
  return (
    <div className="bg-warn-bg text-warn border-b border-line px-4 py-2 text-xs font-medium flex items-center justify-between gap-3" role="status">
      <span className="flex items-center gap-2">
        <WifiOff className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
        {online ? t('offline.pendingLong', { count: pending }) : t('offline.offlineLong', { count: pending })}
      </span>
      {online && pending > 0 && (
        <button type="button" onClick={() => void sync()} className="inline-flex items-center gap-1 underline underline-offset-2">
          <RefreshCw className={cx('w-3.5 h-3.5', syncing && 'animate-spin')} strokeWidth={1.5} aria-hidden /> {t('offline.syncNow')}
        </button>
      )}
    </div>
  );
}

function BottomTabs({ onMenu }: { onMenu: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const tabs = bottomTabs(useVisibleNav());
  return (
    <nav aria-label={t('nav.menu')} className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line pb-safe">
      <div className="flex h-16">
        {tabs.map((tb) => {
          const active = isActive(tb, pathname);
          return (
            <Link key={tb.href} href={tb.href} aria-current={active ? 'page' : undefined} className={cx('flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-accent' : 'text-ink2')}>
              <tb.icon className="w-5 h-5" strokeWidth={1.5} aria-hidden />
              <span className="truncate max-w-[72px]">{t(tb.key)}</span>
            </Link>
          );
        })}
        <button type="button" onClick={onMenu} className="flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink2">
          <LayoutGrid className="w-5 h-5" strokeWidth={1.5} aria-hidden />
          {t('nav.menu')}
        </button>
      </div>
    </nav>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const items = useVisibleNav();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col md:hidden anim-fade" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-line">
        <span className="font-display text-lg font-semibold">{t('nav.menu')}</span>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-hover"><X className="w-5 h-5" strokeWidth={1.5} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted py-2">{t(`nav.group.${g}`)}</div>
              <div className="grid grid-cols-3 gap-2">
                {list.map((n) => (
                  <Link key={n.href} href={n.href} onClick={onClose} className="flex flex-col items-center justify-center gap-2 h-24 rounded-lg border border-line text-center px-2 active:bg-hover">
                    <n.icon className="w-6 h-6 text-ink" strokeWidth={1.5} aria-hidden />
                    <span className="text-xs text-ink2 leading-tight">{t(n.key)}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [railOpen, setRailOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    // Close overlays when navigation happens (state adjusted during render, not in an effect).
    setLastPath(pathname);
    setRailOpen(false);
    setMobileMenu(false);
  }
  return (
    <div className="h-dvh flex bg-canvas">
      <aside className="hidden lg:block w-60 shrink-0 border-r border-line"><Sidebar /></aside>
      <aside className="hidden md:block lg:hidden w-16 shrink-0 border-r border-line"><Sidebar rail /></aside>
      {railOpen && (
        <div className="fixed inset-0 z-50 lg:hidden hidden md:block">
          <div className="absolute inset-0 bg-ink/25" onClick={() => setRailOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-60 border-r border-line shadow-lg anim-fade"><Sidebar onNavigate={() => setRailOpen(false)} /></aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar onMenu={() => setRailOpen(true)} onSearch={() => setPalette(true)} />
        <OfflineStrip />
        <main id="main" className="flex-1 overflow-y-auto scroll-thin bg-white md:bg-canvas">
          <div className="max-w-[1480px] mx-auto px-4 md:px-6 py-5 pb-28 md:pb-10">{children}</div>
        </main>
      </div>
      <BottomTabs onMenu={() => setMobileMenu(true)} />
      <MobileMenu open={mobileMenu} onClose={() => setMobileMenu(false)} />
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}
