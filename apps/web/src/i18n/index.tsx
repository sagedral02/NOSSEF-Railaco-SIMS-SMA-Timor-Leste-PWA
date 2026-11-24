'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { setPreference, usePreference } from '@/lib/storage';

import { messages, type MessageKey } from './messages';
import { FALLBACK_LOCALE, LOCALE_INDEX, LOCALES, type Locale } from './types';

export { LOCALES, type Locale, type MessageKey };

type Vars = Record<string, string | number>;

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const row = (messages as Record<string, readonly [string, string, string]>)[key];
  let text = row ? row[LOCALE_INDEX[locale]] || row[LOCALE_INDEX[FALLBACK_LOCALE]] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

export function hasMessage(key: string): boolean {
  return key in messages;
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Translate a dynamic key (status/role/error code) with a fallback when the key is unknown. */
  tx: (key: string, fallback?: string, vars?: Vars) => string;
}

const I18nCtx = createContext<I18nValue | null>(null);
const KEY = 'nossef.locale';

function isLocale(v: unknown): v is Locale {
  return v === 'id' || v === 'tet' || v === 'pt';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const saved = usePreference(KEY, FALLBACK_LOCALE);
  const locale: Locale = isLocale(saved) ? saved : FALLBACK_LOCALE;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((l: Locale) => setPreference(KEY, l), []);
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      tx: (key, fallback, vars) => (hasMessage(key) ? translate(locale, key, vars) : (fallback ?? key)),
    }),
    [locale, setLocale],
  );
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export function isSupportedLocale(v: unknown): v is Locale {
  return isLocale(v) && LOCALES.some((l) => l.code === v);
}
