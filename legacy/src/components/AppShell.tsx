import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Check, ChevronDown, Cloud, CloudOff, FileSpreadsheet, LayoutGrid, LogOut, Menu, Minus, Plus, RefreshCw, Search, X, ZoomIn,
} from 'lucide-react';
import { useAuth, useData, useI18n, useOffline, useToast, useZoom } from '../context/AppContexts';
import { LANGS } from '../lib/i18n';
import { relTime } from '../lib/format';
import { api } from '../lib/api';
import { GROUPS, NAV, ROLE_LABEL, bottomTabs, type NavItem } from './nav';
import { Avatar, Badge, Button, cx, Mono, OfflineStrip } from './ui';
import UploadValorExcel, { type UploadValorOptions } from './UploadValorExcel';
import ConflictModal from './ConflictModal';

// ---------- Upload Valor Excel global trigger ----------
const UploadCtx = createContext<(o?: UploadValorOptions) => void>(() => {});
export const useUploadValor = () => useContext(UploadCtx);

function Crest({ size = 32 }: { size?: number }) {
  return <img src="/crest.svg" alt="NOSSEF" width={size} height={size} className="rounded-md shrink-0" />;
}

function useVisibleNav() {
  const { can, hasRole } = useAuth();
  return NAV.filter((n) => (n.roles ? hasRole(...n.roles) : true) && (!n.perm || n.perm.some((p) => can(p))) && !(n.key === 'nav.dashboard' && hasRole('STUDENT', 'GUARDIAN')));
}
function isActive(item: NavItem, path: string) {
  const m = item.match || item.to.split('?')[0];
  return path === m || path.startsWith(m.endsWith('/') ? m : m + '/') || path.startsWith(m);
}

function Sidebar({ rail, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { db } = useData();
  const items = useVisibleNav();
  const { pathname } = useLocation();
  const { online, queue } = useOffline();
  const tri = db?.trimesters.find((x) => x.status === 'ACTIVE');
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
      {!rail && tri && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-md border border-line bg-white flex items-center justify-between">
          <div>
            <div className="text-[11px] text-muted">{t('common.year')}</div>
            <div className="text-xs font-semibold text-ink"><Mono>2026</Mono> — {tri.number}º Trimestre <span className="text-ink2 font-normal">(CAU {tri.cau})</span></div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted" strokeWidth={1.5} />
        </div>
      )}
      <nav className="flex-1 overflow-y-auto scroll-thin px-2 pb-3">
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
                    key={n.to}
                    to={n.to}
                    onClick={onNavigate}
                    title={rail ? t(n.key) : undefined}
                    className={cx(
                      'flex items-center gap-3 rounded-md text-sm transition-colors',
                      rail ? 'justify-center h-11 w-11 mx-auto' : 'h-9 px-3',
                      active ? 'bg-selected text-accent font-semibold' : 'text-ink2 hover:bg-hover hover:text-ink'
                    )}
                  >
                    <n.icon className="w-5 h-5 shrink-0" strokeWidth={1.5} />
                    {!rail && <span className="truncate">{t(n.key)}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className={cx('border-t border-line py-3 text-xs', rail ? 'flex justify-center' : 'px-4')}>
        <span className="inline-flex items-center gap-2 text-ink2">
          <span className={cx('w-1.5 h-1.5 rounded-full', online ? 'bg-ok' : 'bg-warn')} />
          {!rail && (online ? (queue.length ? `Online — ${queue.length} antrean` : 'Online — tersinkron') : `Offline — ${queue.length} antrean`)}
        </span>
      </div>
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const { db } = useData();
  const { t } = useI18n();
  const items = useVisibleNav();
  const nav = useNavigate();
  const { can } = useAuth();
  useEffect(() => { if (open) setQ(''); }, [open]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const menu = items.filter((i) => !s || t(i.key).toLowerCase().includes(s)).map((i) => ({ kind: 'Menu', label: t(i.key), sub: i.to, to: i.to }));
    if (!s || !db) return menu.slice(0, 8);
    const stu = can('student.view') ? db.students.filter((x) => x.name.toLowerCase().includes(s) || x.studentNo.toLowerCase().includes(s)).slice(0, 6).map((x) => ({ kind: 'Siswa', label: x.name, sub: x.studentNo, to: `/students/${x.id}` })) : [];
    const inv = can('finance.view') ? db.invoices.filter((x) => x.invoiceNo.toLowerCase().includes(s)).slice(0, 4).map((x) => ({ kind: 'Invoice', label: x.invoiceNo, sub: x.period, to: `/finance?tab=invoices&q=${x.invoiceNo}` })) : [];
    const tch = can('staff.view') ? db.teachers.filter((x) => x.name.toLowerCase().includes(s)).slice(0, 4).map((x) => ({ kind: 'Guru', label: x.name, sub: x.employeeNo, to: `/staff?q=${encodeURIComponent(x.name)}` })) : [];
    return [...menu.slice(0, 4), ...stu, ...inv, ...tch];
  }, [q, db, items, t, can]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-lg border border-line shadow-lg overflow-hidden anim-fade">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search className="w-4 h-4 text-muted" strokeWidth={1.5} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('top.search')} className="flex-1 bg-transparent outline-none text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { nav(results[0].to); onClose(); } if (e.key === 'Escape') onClose(); }} />
          <kbd className="text-[11px] font-mono text-muted border border-line rounded px-1.5">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto scroll-thin py-1">
          {results.map((r, i) => (
            <button key={i} onClick={() => { nav(r.to); onClose(); }} className="w-full flex items-center gap-3 px-4 h-11 hover:bg-hover text-left">
              <span className="text-[11px] w-14 text-muted uppercase tracking-wide">{r.kind}</span>
              <span className="text-sm text-ink flex-1 truncate">{r.label}</span>
              <Mono className="text-xs text-muted">{r.sub}</Mono>
            </button>
          ))}
          {!results.length && <div className="px-4 py-6 text-sm text-ink2">Tidak ada hasil.</div>}
        </div>
      </div>
    </div>
  );
}

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h));
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className={cx('absolute right-0 top-11 z-50 bg-white border border-line rounded-lg shadow-lg anim-fade', className)}>{children}</div>;
}

function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { zoom, setZoom } = useZoom();
  const { user, logout, hasRole } = useAuth();
  const { online, queue, simulatedOffline, setSimulatedOffline, sync, syncing } = useOffline();
  const { db, reload } = useData();
  const openUpload = useUploadValor();
  const nav = useNavigate();
  const [pop, setPop] = useState<null | 'sync' | 'lang' | 'zoom' | 'bell' | 'user'>(null);
  const close = () => setPop(null);
  const unread = db?.notifications.filter((n) => !n.read).length || 0;
  const isTeacher = hasRole('TEACHER', 'HOMEROOM_TEACHER');
  return (
    <header className="h-14 shrink-0 bg-white border-b border-line flex items-center gap-2 px-3 md:px-4">
      <button onClick={onMenu} className="lg:hidden hidden md:inline-flex w-9 h-9 items-center justify-center rounded-md hover:bg-hover" aria-label="Menu">
        <Menu className="w-5 h-5" strokeWidth={1.5} />
      </button>
      <div className="md:hidden flex items-center gap-2 min-w-0">
        <Crest size={28} />
        <span className="font-display font-semibold text-ink truncate">NOSSEF</span>
      </div>
      <button onClick={onSearch} className="hidden md:flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-canvas text-sm text-muted hover:border-line-strong flex-1 max-w-md">
        <Search className="w-4 h-4" strokeWidth={1.5} />
        <span className="truncate flex-1 text-left">{t('top.search')}</span>
        <kbd className="text-[11px] font-mono border border-line rounded px-1.5 bg-white">Ctrl+K</kbd>
      </button>
      <div className="flex-1" />
      {isTeacher && (
        <span className="hidden sm:block">
          <Button variant="primary" icon={FileSpreadsheet} onClick={() => openUpload()}>{t('top.uploadValor')}</Button>
        </span>
      )}
      <button onClick={onSearch} className="md:hidden w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-hover" aria-label="Cari"><Search className="w-5 h-5" strokeWidth={1.5} /></button>

      <div className="relative">
        <button onClick={() => setPop(pop === 'sync' ? null : 'sync')} className={cx('inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border', online ? 'border-line text-ok bg-white' : 'border-warn/30 bg-warn-bg text-warn')}>
          {online ? <Cloud className="w-4 h-4" strokeWidth={1.5} /> : <CloudOff className="w-4 h-4" strokeWidth={1.5} />}
          <span className="hidden sm:inline">{online ? t('top.online') : t('top.offline')}</span>
          {queue.length > 0 && <Mono className="text-[11px]">{queue.length}</Mono>}
        </button>
        <Popover open={pop === 'sync'} onClose={close} className="w-72 p-4">
          <div className="text-sm font-semibold">Status PWA & Sinkronisasi</div>
          <div className="text-xs text-ink2 mt-1">{online ? 'Terhubung ke server. Semua perubahan langsung tersimpan.' : 'Perubahan presensi disimpan di perangkat dan dikirim saat koneksi pulih.'}</div>
          <div className="mt-3 flex items-center justify-between text-xs"><span className="text-ink2">Antrean mutasi</span><Mono>{queue.length}</Mono></div>
          <label className="mt-3 flex items-center justify-between text-xs cursor-pointer">
            <span className="text-ink2">Simulasikan mode offline</span>
            <input type="checkbox" checked={simulatedOffline} onChange={(e) => setSimulatedOffline(e.target.checked)} className="accent-[#0061FE]" />
          </label>
          <div className="mt-3 flex gap-2">
            <Button size="sm" icon={RefreshCw} disabled={!online || !queue.length || syncing} onClick={sync}>Sinkronkan Sekarang</Button>
            <Button size="sm" variant="ghost" onClick={() => reload()}>Muat Ulang Data</Button>
          </div>
        </Popover>
      </div>

      <div className="relative hidden md:block">
        <button onClick={() => setPop(pop === 'lang' ? null : 'lang')} className="h-8 px-2 rounded-md text-xs font-semibold text-ink2 hover:bg-hover border border-line">
          {LANGS.find((l) => l.code === lang)?.short}
        </button>
        <Popover open={pop === 'lang'} onClose={close} className="w-44 py-1">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => { setLang(l.code); close(); }} className="w-full flex items-center justify-between px-3 h-9 text-sm hover:bg-hover">
              <span><Mono className="text-xs text-muted mr-2">{l.short}</Mono>{l.name}</span>
              {lang === l.code && <Check className="w-4 h-4 text-accent" strokeWidth={1.5} />}
            </button>
          ))}
        </Popover>
      </div>

      <div className="relative hidden lg:block">
        <button onClick={() => setPop(pop === 'zoom' ? null : 'zoom')} className="h-8 px-2 rounded-md text-xs text-ink2 hover:bg-hover border border-line inline-flex items-center gap-1">
          <ZoomIn className="w-3.5 h-3.5" strokeWidth={1.5} /><Mono>{zoom}%</Mono>
        </button>
        <Popover open={pop === 'zoom'} onClose={close} className="w-56 p-3">
          <div className="text-xs text-ink2 mb-2">Skala tampilan (85% – 160%)</div>
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 border border-line rounded-md inline-flex items-center justify-center hover:bg-hover" onClick={() => setZoom(zoom - 5)}><Minus className="w-4 h-4" strokeWidth={1.5} /></button>
            <input type="range" min={85} max={160} step={5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[#0061FE]" />
            <button className="w-8 h-8 border border-line rounded-md inline-flex items-center justify-center hover:bg-hover" onClick={() => setZoom(zoom + 5)}><Plus className="w-4 h-4" strokeWidth={1.5} /></button>
          </div>
          <button onClick={() => setZoom(100)} className="mt-2 text-xs text-accent">Reset 100%</button>
        </Popover>
      </div>

      <div className="relative">
        <button onClick={() => setPop(pop === 'bell' ? null : 'bell')} className="relative w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-hover" aria-label={t('top.notifications')}>
          <Bell className="w-5 h-5 text-ink2" strokeWidth={1.5} />
          {unread > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] font-mono leading-4 text-center">{unread}</span>}
        </button>
        <Popover open={pop === 'bell'} onClose={close} className="w-[min(360px,92vw)] -right-12 sm:right-0">
          <div className="flex items-center justify-between px-4 h-11 border-b border-line">
            <span className="text-sm font-semibold">{t('top.notifications')}</span>
            <button className="text-xs text-accent" onClick={async () => { await api('POST', '/api/notifications/read', {}); reload(); }}>{t('top.markAllRead')}</button>
          </div>
          <div className="max-h-80 overflow-y-auto scroll-thin">
            {db?.notifications.slice(0, 8).map((n) => (
              <button key={n.id} onClick={() => { close(); nav(n.link); }} className="w-full flex gap-3 px-4 py-3 border-b border-line text-left hover:bg-hover">
                <span className={cx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', n.read ? 'bg-transparent' : 'bg-accent')} />
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{n.title}</span>
                  <span className="block text-xs text-ink2 truncate">{n.body}</span>
                  <span className="block text-[11px] text-muted mt-0.5"><Mono className="text-[11px]">{n.event}</Mono> · {relTime(n.at)}</span>
                </span>
              </button>
            ))}
            {!db?.notifications.length && <div className="px-4 py-6 text-sm text-ink2">Tidak ada notifikasi.</div>}
          </div>
          <Link to="/notifications" onClick={close} className="block text-center text-xs text-accent py-2.5">Lihat semua</Link>
        </Popover>
      </div>

      <div className="relative">
        <button onClick={() => setPop(pop === 'user' ? null : 'user')} className="flex items-center gap-2 h-9 pl-1 pr-1 md:pr-2 rounded-md hover:bg-hover">
          <Avatar name={user!.name} size={28} tone="dark" />
          <span className="hidden xl:block text-left leading-tight max-w-[160px]">
            <span className="block text-xs font-semibold text-ink truncate">{user!.name}</span>
            <span className="block text-[11px] text-ink2 truncate">{ROLE_LABEL[user!.roles[0]]}</span>
          </span>
        </button>
        <Popover open={pop === 'user'} onClose={close} className="w-64 py-1">
          <div className="px-4 py-3 border-b border-line">
            <div className="text-sm font-semibold">{user!.name}</div>
            <Mono className="text-xs text-ink2">{user!.username}</Mono>
            <div className="flex flex-wrap gap-1 mt-2">{user!.roles.map((r) => <Badge key={r} mono>{r}</Badge>)}</div>
          </div>
          <div className="md:hidden px-4 py-2 border-b border-line flex gap-1">
            {LANGS.map((l) => <button key={l.code} onClick={() => setLang(l.code)} className={cx('flex-1 h-8 rounded text-xs font-semibold', lang === l.code ? 'bg-ink text-white' : 'bg-canvas text-ink2')}>{l.short}</button>)}
          </div>
          <button onClick={() => { logout(); nav('/login'); }} className="w-full flex items-center gap-2 px-4 h-10 text-sm text-bad hover:bg-hover">
            <LogOut className="w-4 h-4" strokeWidth={1.5} /> {t('top.logout')}
          </button>
        </Popover>
      </div>
    </header>
  );
}

function BottomTabs({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const tabs = bottomTabs(user!.roles);
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line pb-safe">
      <div className="flex h-16">
        {tabs.map((tb) => {
          const [p, q] = tb.to.split('?');
          const active = pathname === p && (!q || search.includes(q)) || (pathname.startsWith(p) && p !== '/dashboard' && !q);
          return (
            <NavLink key={tb.to} to={tb.to} className={cx('flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-accent' : 'text-ink2')}>
              <tb.icon className="w-5 h-5" strokeWidth={1.5} />
              {tb.label}
            </NavLink>
          );
        })}
        {tabs.length < 5 && (
          <button onClick={onMenu} className="flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink2">
            <LayoutGrid className="w-5 h-5" strokeWidth={1.5} />
            Menu
          </button>
        )}
      </div>
    </nav>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const items = useVisibleNav();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col md:hidden anim-fade">
      <div className="h-14 flex items-center justify-between px-4 border-b border-line">
        <span className="font-display text-lg font-semibold">Menu</span>
        <button onClick={onClose} className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-hover"><X className="w-5 h-5" strokeWidth={1.5} /></button>
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
                  <Link key={n.to} to={n.to} onClick={onClose} className="flex flex-col items-center justify-center gap-2 h-24 rounded-lg border border-line text-center px-2 active:bg-hover">
                    <n.icon className="w-6 h-6 text-ink" strokeWidth={1.5} />
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

function Toasts() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed z-[70] bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 flex flex-col gap-2 w-[min(92vw,400px)]">
      {toasts.map((t) => (
        <div key={t.id} className={cx('anim-drawer flex items-start gap-3 px-4 py-3 rounded-md shadow-lg border text-sm', t.kind === 'error' ? 'bg-white border-bad/40 text-ink' : 'bg-ink border-ink text-white')}>
          <span className={cx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', t.kind === 'error' ? 'bg-bad' : t.kind === 'info' ? 'bg-accent' : 'bg-[#6FCF8E]')} />
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100"><X className="w-4 h-4" strokeWidth={1.5} /></button>
        </div>
      ))}
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [railOpen, setRailOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [upload, setUpload] = useState<{ open: boolean; opts?: UploadValorOptions }>({ open: false });
  const { pathname } = useLocation();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { setRailOpen(false); setMobileMenu(false); }, [pathname]);
  return (
    <UploadCtx.Provider value={(opts) => setUpload({ open: true, opts })}>
      <div className="h-dvh flex bg-canvas">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-60 shrink-0 border-r border-line"><Sidebar /></aside>
        {/* Tablet rail */}
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
          <main className="flex-1 overflow-y-auto scroll-thin bg-white md:bg-canvas">
            <div className="max-w-[1480px] mx-auto px-4 md:px-6 py-5 pb-28 md:pb-10">{children}</div>
          </main>
        </div>
        <BottomTabs onMenu={() => setMobileMenu(true)} />
        <MobileMenu open={mobileMenu} onClose={() => setMobileMenu(false)} />
        <CommandPalette open={palette} onClose={() => setPalette(false)} />
        <UploadValorExcel open={upload.open} options={upload.opts} onClose={() => setUpload({ open: false })} />
        <ConflictModal />
      </div>
    </UploadCtx.Provider>
  );
}
export { Toasts };
