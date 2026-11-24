'use client';

import type { ReactNode } from 'react';

import { LOCALES, useI18n } from '@/i18n';
import { cx } from '@/lib/format';

function PublicTopStrip() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="h-11 bg-white border-b border-line flex items-center justify-between px-4 text-xs">
      <span className="text-ink2 truncate hidden sm:block">Escola Secundária Católica Nossa Senhora de Fátima (NOSSEF) Railaco</span>
      <span className="text-ink2 sm:hidden font-semibold">NOSSEF Railaco</span>
      <div className="flex rounded-md border border-line overflow-hidden" role="group" aria-label={t('common.language')}>
        {LOCALES.map((l) => (
          <button
            key={l.code}
            type="button"
            aria-pressed={locale === l.code}
            onClick={() => setLocale(l.code)}
            className={cx('h-7 px-2 font-semibold', locale === l.code ? 'bg-ink text-white' : 'text-ink2 hover:bg-hover')}
          >
            {l.short}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col bg-white md:bg-canvas">
      <PublicTopStrip />
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 px-4 py-8">{children}</div>
    </div>
  );
}
