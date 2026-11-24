'use client';

import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { cx } from '@/lib/format';

type Kind = 'ok' | 'error' | 'info';
interface Toast { id: number; kind: Kind; text: string }

const ToastCtx = createContext<{ toast: (text: string, kind?: Kind) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, kind: Kind = 'ok') => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, text }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div aria-live="polite" className="fixed z-[70] bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 flex flex-col gap-2 w-[min(92vw,400px)]">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={cx('anim-drawer flex items-start gap-3 px-4 py-3 rounded-md shadow-lg border text-sm', t.kind === 'error' ? 'bg-white border-bad/40 text-ink' : 'bg-ink border-ink text-white')}>
            <span className={cx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', t.kind === 'error' ? 'bg-bad' : t.kind === 'info' ? 'bg-accent' : 'bg-[#6FCF8E]')} />
            <span className="flex-1">{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100" aria-label="×">
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.toast;
}
