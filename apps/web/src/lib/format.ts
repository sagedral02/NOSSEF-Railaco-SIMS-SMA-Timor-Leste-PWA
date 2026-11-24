// Shared display utilities. Timestamps from the API are UTC; display uses the school timezone (PRD §2, §35.2).
import type { Locale } from '@/i18n/types';

export const SCHOOL_TIMEZONE = 'Asia/Dili';

const INTL_LOCALE: Record<Locale, string> = { id: 'id-ID', tet: 'pt-TL', pt: 'pt-PT' };

export function fmtDate(value: string | null | undefined, locale: Locale = 'id') {
  if (!value) return '—';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: dateOnly ? 'UTC' : SCHOOL_TIMEZONE,
  }).format(date);
}

export function fmtDateTime(value: string | null | undefined, locale: Locale = 'id') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: SCHOOL_TIMEZONE,
  }).format(date);
}

/** Money arrives as a decimal string (PRD §35.2) and is only formatted, never recomputed. */
export function usd(value: string | null | undefined) {
  if (value == null || value === '') return '—';
  const [int, frac = ''] = value.split('.');
  const neg = int.startsWith('-');
  const digits = (neg ? int.slice(1) : int).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${digits}.${(frac + '00').slice(0, 2)}`;
}

export function initials(name: string) {
  return name
    .replace(/^(Prof\.ª|Prof\.|Ir\.|Pe\.|Sr\.|Sra\.|Dra\.)\s*/g, '')
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/** Today's date (YYYY-MM-DD) in the school timezone — never the browser's UTC date (PRD §46.8). */
export function schoolToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
