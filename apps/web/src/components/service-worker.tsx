'use client';

// Registers the versioned service worker and offers a safe reload when a new version is waiting (PRD §34.6).
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useI18n } from '@/i18n';

export function ServiceWorker() {
  const { t } = useI18n();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let reloading = false;
    // Reload only after the user accepted an update; the first install's clients.claim() must not reload
    // (that would wipe forms being filled, e.g. login or attendance).
    const onController = () => {
      if (!reloading && sessionStorage.getItem('nossef.sw-update') === '1') {
        reloading = true;
        sessionStorage.removeItem('nossef.sw-update');
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onController);
    navigator.serviceWorker
      .register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'}`, { scope: '/' })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
      })
      .catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onController);
  }, []);
  if (!waiting) return null;
  return (
    <div role="status" className="fixed z-[80] bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-ink text-white rounded-md shadow-lg px-4 py-3 text-sm">
      {t('offline.updateReady')}
      <button type="button" className="inline-flex items-center gap-1 underline underline-offset-2" onClick={() => { sessionStorage.setItem('nossef.sw-update', '1'); waiting.postMessage({ type: 'SKIP_WAITING' }); }}>
        <RefreshCw className="w-4 h-4" strokeWidth={1.5} aria-hidden /> {t('offline.reload')}
      </button>
    </div>
  );
}
