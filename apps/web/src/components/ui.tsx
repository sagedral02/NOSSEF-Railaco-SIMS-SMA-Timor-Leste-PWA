'use client';

// Design-system primitives ported 1:1 from the previous UI (look & feel unchanged), now i18n-keyed.
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, FolderOpen, Info, Lock, Search, WifiOff, X, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';

import { useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cx, initials } from '@/lib/format';

export { cx };

// ---------- Buttons ----------
type BtnVariant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger' | 'subtle';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border border-accent hover:border-accent-hover',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-hover',
  dark: 'bg-ink text-white border border-ink hover:bg-black',
  ghost: 'text-ink2 hover:bg-hover border border-transparent',
  danger: 'bg-white text-bad border border-bad/40 hover:bg-bad-bg',
  subtle: 'bg-canvas text-ink border border-line hover:bg-hover',
};
export function Button({
  variant = 'secondary', icon: Icon, size = 'md', className, children, type = 'button', ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: LucideIcon; size?: 'sm' | 'md' }) {
  return (
    <button
      type={type}
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        BTN[variant],
        className,
      )}
    >
      {Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} strokeWidth={1.5} aria-hidden />}
      {children}
    </button>
  );
}
export function IconButton({ icon: Icon, label, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button type="button" {...p} aria-label={label} title={label} className={cx('inline-flex items-center justify-center w-9 h-9 rounded-md text-ink2 hover:bg-hover hover:text-ink transition-colors', className)}>
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} aria-hidden />
    </button>
  );
}

// ---------- Badges ----------
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'dark';
const TONE: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', info: 'bg-selected text-accent',
  neutral: 'bg-canvas text-ink2 border border-line', dark: 'bg-ink text-white',
};
const DOT: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-accent', neutral: 'bg-muted', dark: 'bg-white' };
export function Badge({ tone = 'neutral', children, dot, mono, className }: { tone?: Tone; children: ReactNode; dot?: boolean; mono?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-xs font-medium whitespace-nowrap', TONE[tone], mono && 'font-mono', className)}>
      {dot && <span className={cx('w-1.5 h-1.5 rounded-full', DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}
const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'ok', VALID: 'ok', PAID: 'ok', PRESENT: 'ok', VERIFIED: 'ok', ACCEPTED: 'ok', PUBLISHED: 'ok', FINALIZED: 'ok', RESOLVED: 'ok',
  AVAILABLE: 'ok', COMPLETED: 'ok', RETURNED: 'ok', ENROLLED: 'ok', PROMOTED: 'ok', GRADUATED: 'ok', ELIGIBLE: 'ok',
  PENDING: 'warn', LATE: 'warn', PARTIALLY_PAID: 'warn', WAITING_LIST: 'warn', IN_PROGRESS: 'warn', MAINTENANCE: 'warn',
  PROCESSING: 'warn', QUEUED: 'warn', REOPENED: 'warn', GRADING: 'warn', SICK: 'warn', EXCUSED: 'info', VALIDATING: 'warn',
  SUBMITTED: 'info', REVIEWED: 'info', OPEN: 'info', ASSIGNED: 'info', RE_REGISTERED: 'info', CREATED: 'info', INVITED: 'info', READY: 'info',
  UNPAID: 'bad', OVERDUE: 'bad', ABSENT: 'bad', REJECTED: 'bad', FAILED: 'bad', DISABLED: 'bad', SUSPENDED: 'bad', REVERSED: 'bad',
  LOST: 'bad', REPEATED: 'bad', CANCELLED: 'bad', INVALID: 'bad', LOCKED: 'dark',
  DRAFT: 'neutral', CLOSED: 'neutral', VOID: 'neutral', RETIRED: 'neutral', TRANSFERRED: 'neutral',
};
/** Status is always shown with text + dot (color is never the sole carrier, PRD §35.6). */
export function StatusPill({ status, label }: { status: string | null | undefined; label?: string }) {
  const { tx } = useI18n();
  if (!status) return <span className="text-muted text-xs">—</span>;
  return <Badge tone={STATUS_TONE[status] || 'neutral'} dot>{label || tx(`status.${status}`, status.replace(/_/g, ' '))}</Badge>;
}
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  const sized = /(^|\s)text-(xs|sm|base|lg|xl|2xl|3xl|\[)/.test(className || '');
  return <span className={cx('font-mono', !sized && 'text-[0.8125rem]', className)}>{children}</span>;
}

// ---------- Layout ----------
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between pb-4">
      <div className="min-w-0 md:shrink-0 md:max-w-[50%]">
        {back && (
          <Link href={back} className="inline-flex items-center gap-1 text-xs text-ink2 hover:text-ink mb-1.5">
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden /> {t('common.back')}
          </Link>
        )}
        <h1 className="font-display text-xl md:text-2xl font-semibold text-ink tracking-tight truncate">{title}</h1>
        {subtitle && <div className="text-sm text-ink2 mt-0.5">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </div>
  );
}
export function Card({ children, className, title, actions, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx('bg-white border border-line rounded-lg', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-4 h-12 border-b border-line">
          <h2 className="font-display text-[0.95rem] font-semibold text-ink truncate">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('flex gap-1 border-b border-line overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 mb-4', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cx('relative inline-flex items-center gap-1.5 h-10 px-3 text-sm whitespace-nowrap transition-colors', value === tab.id ? 'text-ink font-semibold' : 'text-ink2 hover:text-ink')}
        >
          {tab.icon && <tab.icon className="w-4 h-4" strokeWidth={1.5} aria-hidden />}
          {tab.label}
          {tab.count != null && <span className={cx('font-mono text-[11px] px-1.5 rounded', value === tab.id ? 'bg-ink text-white' : 'bg-canvas text-ink2')}>{tab.count}</span>}
          {value === tab.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent rounded-full" />}
        </button>
      ))}
    </div>
  );
}
export function FilterPills<T extends string>({ options, value, onChange }: { options: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx('h-8 px-3 rounded-full text-xs font-medium border whitespace-nowrap transition-colors', value === o.id ? 'bg-ink text-white border-ink' : 'bg-white text-ink2 border-line hover:bg-hover')}
        >
          {o.label}
          {o.count != null && <span className="ml-1.5 font-mono opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Forms ----------
/** Base field classes; a caller-provided width/height replaces the defaults (cx does not merge Tailwind conflicts). */
function fieldCls(className?: string) {
  const c = className || '';
  return cx(/(^|\s)w-/.test(c) ? '' : 'w-full', /(^|\s)h-/.test(c) ? '' : 'h-10', inputCls);
}
const inputCls = 'px-3 rounded-md border border-line-strong bg-white text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-bad';
export function Input({ className, mono, ...p }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input {...p} className={cx(fieldCls(className), mono && 'font-mono', className)} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cx(fieldCls(className), 'pr-8 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2716%27%20height%3D%2716%27%20fill%3D%27none%27%20stroke%3D%27%23524A3E%27%20stroke-width%3D%271.5%27%3E%3Cpath%20d%3D%27M4%206l4%204%204-4%27/%3E%3C/svg%3E")] bg-no-repeat bg-[right_0.6rem_center]', className)}>
      {children}
    </select>
  );
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx('w-full', inputCls, 'h-auto min-h-[84px] py-2', className)} />;
}
/** Label is programmatically associated with its control (PRD §35.6). */
export function Field({ label, children, hint, error, required, className, right }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: string | null; required?: boolean; className?: string; right?: ReactNode }) {
  return (
    <label className={cx('block', className)}>
      <span className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-ink2">
          {label}
          {required && <span className="text-bad ml-0.5" aria-hidden>*</span>}
        </span>
        {right}
      </span>
      {children}
      {hint && !error && <span className="block text-xs text-muted mt-1">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-bad mt-1">{error}</span>}
    </label>
  );
}
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cx('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" strokeWidth={1.5} aria-hidden />
      <input type="search" aria-label={placeholder || t('common.search')} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || t('common.searchPlaceholder')} className={cx('w-full', inputCls, 'h-9 pl-9')} />
    </div>
  );
}
export function Checkbox({ checked, onChange, indeterminate, label }: { checked: boolean; onChange: (v: boolean) => void; indeterminate?: boolean; label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate;
      }}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-line-strong accent-[#0061FE] cursor-pointer"
    />
  );
}

// ---------- Alerts ----------
export function Alert({ tone = 'info', title, children, icon, action }: { tone?: 'info' | 'ok' | 'warn' | 'bad'; title?: ReactNode; children?: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  const Icon = icon || (tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle);
  const cls = { info: 'bg-selected border-accent/30 text-ink', ok: 'bg-ok-bg border-ok/30 text-ink', warn: 'bg-warn-bg border-warn/30 text-ink', bad: 'bg-bad-bg border-bad/40 text-ink' }[tone];
  const ic = { info: 'text-accent', ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex gap-3 border rounded-md px-3.5 py-3 text-sm', cls)}>
      <Icon className={cx('w-4 h-4 mt-0.5 shrink-0', ic)} strokeWidth={1.5} aria-hidden />
      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-ink2 text-[0.8125rem] mt-0.5">{children}</div>}
      </div>
      {action}
    </div>
  );
}
/** Error summary for a failed API call: translated code + server detail + request id. */
export function ApiErrorAlert({ error }: { error: unknown }) {
  const { tx } = useI18n();
  if (!error) return null;
  const e = error instanceof ApiError ? error : new ApiError(0, 'INTERNAL_ERROR', String(error));
  return (
    <Alert tone="bad" title={tx(`error.${e.code}`, e.message)}>
      {e.message !== tx(`error.${e.code}`, e.message) && <span>{e.message} </span>}
      <Mono className="text-[11px] text-muted">{e.code}{e.requestId ? ` · ${e.requestId.slice(0, 8)}` : ''}</Mono>
    </Alert>
  );
}

// ---------- Overlays ----------
function useEsc(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, active]);
}
/** Right inspector drawer on tablet/desktop; bottom sheet on mobile. */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 400 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const { t } = useI18n();
  const titleId = useId();
  useEsc(onClose, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-ink/25 anim-fade" onClick={onClose} />
      <aside
        style={{ ['--w' as string]: `${width}px` }}
        className="anim-drawer absolute bg-white border-line shadow-lg flex flex-col inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl border-t md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:rounded-none md:border-l md:w-[var(--w)] md:max-w-[92vw]"
      >
        <div className="md:hidden flex justify-center pt-2"><span className="w-10 h-1 rounded-full bg-line-strong" /></div>
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
          <div className="min-w-0">
            <h3 id={titleId} className="font-display text-lg font-semibold text-ink leading-tight">{title}</h3>
            {subtitle && <div className="text-xs text-ink2 mt-1">{subtitle}</div>}
          </div>
          <IconButton icon={X} label={t('common.close')} onClick={onClose} className="-mr-2 -mt-1" />
        </header>
        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line flex flex-wrap gap-2 justify-end bg-white pb-safe">{footer}</footer>}
      </aside>
    </div>
  );
}
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const { t } = useI18n();
  const titleId = useId();
  useEsc(onClose, open);
  if (!open) return null;
  const w = { sm: 'md:max-w-md', md: 'md:max-w-lg', lg: 'md:max-w-3xl', xl: 'md:max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-ink/30 anim-fade" onClick={onClose} />
      <div className={cx('anim-drawer relative bg-white w-full rounded-t-2xl md:rounded-lg border border-line shadow-lg flex flex-col max-h-[92vh]', w)}>
        <header className="flex items-center justify-between gap-3 px-5 h-14 border-b border-line shrink-0">
          <h3 id={titleId} className="font-display text-lg font-semibold text-ink truncate">{title}</h3>
          <IconButton icon={X} label={t('common.close')} onClick={onClose} className="-mr-2" />
        </header>
        <div className="overflow-y-auto scroll-thin px-5 py-4 flex-1">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line flex flex-wrap gap-2 justify-end shrink-0 pb-safe">{footer}</footer>}
      </div>
    </div>
  );
}
/** Confirmation that requires a reason (reverse, reopen, disable...). The reason goes to the Audit Log. */
export function ReasonDialog({ open, onClose, title, description, confirmLabel, onConfirm, danger, optional }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; confirmLabel: string; onConfirm: (reason: string) => Promise<unknown>; danger?: boolean; optional?: boolean }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason('');
      setError(null);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant={danger ? 'dark' : 'primary'}
            disabled={(!optional && !reason.trim()) || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm(reason.trim());
                onClose();
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-sm text-ink2 mb-3">{description}</div>}
      <Field label={t('common.reason')} required={!optional}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('common.reasonPlaceholder')} autoFocus />
      </Field>
      {error != null && <div className="mt-3"><ApiErrorAlert error={error} /></div>}
    </Modal>
  );
}

// ---------- States (PRD §35.3) ----------
export function EmptyState({ icon: Icon = FolderOpen, title, action }: { icon?: LucideIcon; title?: string; action?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <Icon className="w-8 h-8 text-muted mb-3" strokeWidth={1.5} aria-hidden />
      <p className="text-sm text-ink2 max-w-xs">{title || t('state.empty')}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Skeleton({ rows = 6 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div className="p-4 space-y-3" aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-line/60 animate-pulse" />
          <div className="h-3 rounded bg-line/60 animate-pulse" style={{ width: `${40 + ((i * 17) % 45)}%` }} />
          <div className="h-3 w-16 rounded bg-line/60 animate-pulse ml-auto" />
        </div>
      ))}
    </div>
  );
}
export function Denied({ code = 'PERMISSION_DENIED' }: { code?: string }) {
  const { t } = useI18n();
  return (
    <div className="bg-white border border-line rounded-lg flex flex-col items-center text-center py-16 px-6">
      <Lock className="w-8 h-8 text-ink2 mb-3" strokeWidth={1.5} aria-hidden />
      <h2 className="font-display text-lg font-semibold">{t('state.deniedTitle')}</h2>
      <p className="text-sm text-ink2 mt-1 max-w-sm">{t('state.deniedBody')}</p>
      <Mono className="text-xs text-muted mt-2">{code}</Mono>
      <Link href="/dashboard" className="mt-5 inline-flex items-center h-9 px-3.5 rounded-md border border-line-strong text-sm font-medium hover:bg-hover">{t('state.backHome')}</Link>
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, tx } = useI18n();
  if (error instanceof ApiError && error.status === 403) return <Denied code={error.code} />;
  const code = error instanceof ApiError ? error.code : 'NETWORK_ERROR';
  return (
    <div className="bg-white border border-line rounded-lg flex flex-col items-center text-center py-14 px-6">
      <WifiOff className="w-8 h-8 text-ink2 mb-3" strokeWidth={1.5} aria-hidden />
      <h2 className="font-display text-lg font-semibold">{t('state.networkTitle')}</h2>
      <p className="text-sm text-ink2 mt-1 max-w-sm">{tx(`error.${code}`, t('state.networkBody'))}</p>
      <Mono className="text-xs text-muted mt-2">{code}</Mono>
      {onRetry && <Button className="mt-5" onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  );
}

// ---------- Data display ----------
export function Avatar({ name, size = 32, tone = 'neutral' }: { name: string; size?: number; tone?: 'neutral' | 'dark' | 'blue' }) {
  const cls = { neutral: 'bg-canvas text-ink2 border border-line', dark: 'bg-ink text-white', blue: 'bg-selected text-accent' }[tone];
  return (
    <span aria-hidden className={cx('inline-flex items-center justify-center rounded-full font-semibold shrink-0', cls)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name) || name.slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}
export function Th({ children, className, align }: { children?: ReactNode; className?: string; align?: 'right' | 'center' }) {
  return (
    <th scope="col" className={cx('h-10 px-3 text-xs font-semibold uppercase tracking-wider text-ink2 bg-canvas border-b border-line whitespace-nowrap sticky top-0 z-[1]', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left', className)}>
      {children}
    </th>
  );
}
export function Td({ children, className, align, mono }: { children?: ReactNode; className?: string; align?: 'right' | 'center'; mono?: boolean }) {
  return <td className={cx('px-3 py-2.5 text-sm text-ink border-b border-line align-middle', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '', mono && 'font-mono text-[0.8125rem]', className)}>{children}</td>;
}
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto scroll-thin', className)}>
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}
export function Tr({ children, onClick, selected, className }: { children: ReactNode; onClick?: () => void; selected?: boolean; className?: string }) {
  return (
    <tr
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cx('transition-colors', onClick && 'cursor-pointer focus-visible:bg-hover', selected ? 'bg-selected' : 'hover:bg-hover', className)}
    >
      {children}
    </tr>
  );
}
/** Mobile list row (Dropbox mobile file row, 72px). */
export function MobileRow({ leading, title, subtitle, trailing, onClick }: { leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-4 min-h-[72px] py-3 border-b border-line text-left active:bg-hover">
      {leading}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink truncate">{title}</div>
        {subtitle && <div className="text-xs text-ink2 truncate mt-0.5">{subtitle}</div>}
      </div>
      {trailing}
      <ChevronRight className="w-4 h-4 text-muted shrink-0" strokeWidth={1.5} aria-hidden />
    </button>
  );
}
/** Server-side page-number pager (PRD §35.4). */
export function Pager({ page, totalPages, count, pageSize, onPage }: { page: number; totalPages: number; count: number; pageSize: number; onPage: (n: number) => void }) {
  const { t } = useI18n();
  const from = count ? (page - 1) * pageSize + 1 : 0;
  return (
    <div className="flex items-center justify-between px-4 h-12 border-t border-line text-xs text-ink2 bg-white sticky bottom-0">
      <span>
        <Mono>{from}–{Math.min(count, page * pageSize)}</Mono> {t('common.of')} <Mono>{count}</Mono>
      </span>
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} label={t('common.previous')} disabled={page <= 1} onClick={() => onPage(page - 1)} className="disabled:opacity-30 w-8 h-8" />
        <Mono>{page}/{Math.max(1, totalPages)}</Mono>
        <IconButton icon={ChevronRight} label={t('common.next')} disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="disabled:opacity-30 w-8 h-8" />
      </div>
    </div>
  );
}
export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'ok'; href?: string }) {
  const body = (
    <div className="px-4 py-4 h-full">
      <div className="text-xs text-ink2 font-medium">{label}</div>
      <div className={cx('font-display text-2xl font-semibold mt-1 tracking-tight', tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-ink')}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:bg-hover transition-colors">{body}</Link> : body;
}
export function KV({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-line last:border-0 text-sm">
      <span className="text-ink2 shrink-0">{k}</span>
      <span className={cx('text-ink text-right min-w-0 break-words', mono && 'font-mono text-[0.8125rem]')}>{v}</span>
    </div>
  );
}
export function ProgressBar({ value, tone = 'accent', label }: { value: number; tone?: 'accent' | 'ok' | 'warn' | 'bad'; label?: string }) {
  const c = { accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full flex-1 min-w-12 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full', c)} style={{ width: `${v}%` }} />
    </div>
  );
}
