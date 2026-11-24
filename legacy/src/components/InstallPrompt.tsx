import { useEffect, useState } from 'react';
import { Download, MoreVertical, Share, SquarePlus, X } from 'lucide-react';
import { Button } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const DISMISS_KEY = 'nossef.install.dismissedAt';
const SNOOZE_MS = 3 * 24 * 3600 * 1000;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function snoozed() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < SNOOZE_MS; } catch { return false; }
}

/**
 * PWA install popup.
 * - Chromium (Android/desktop, secure context): uses the native beforeinstallprompt flow.
 * - iOS Safari / browsers without the event (e.g. plain HTTP on LAN): shows manual "Add to Home Screen" steps.
 */
export default function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState<null | 'ios' | 'android' | 'desktop'>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (isStandalone() || snoozed()) return;
    let gotPrompt = false;
    const onPrompt = (e: Event) => { e.preventDefault(); gotPrompt = true; setEvt(e as BeforeInstallPromptEvent); setManual(null); setOpen(true); };
    const onInstalled = () => { setOpen(false); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // No native prompt (iOS, Firefox, insecure origin): offer manual instructions after a short delay.
    const t = setTimeout(() => {
      if (gotPrompt) return;
      const ua = navigator.userAgent;
      setManual(/iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop');
      setOpen(true);
    }, 4000);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); clearTimeout(t); };
  }, []);

  if (!open) return null;
  const dismiss = () => { setOpen(false); try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } };
  return (
    <div className="fixed z-[65] inset-x-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-[380px] anim-drawer no-print" role="dialog" aria-label="Instal aplikasi">
      <div className="bg-white border border-line rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <img src="/icon-192.png" width={44} height={44} alt="" className="rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-display font-semibold text-ink">Instal aplikasi SIMS NOSSEF</div>
            <div className="text-xs text-ink2 mt-0.5">Buka lebih cepat dari layar utama, layar penuh seperti aplikasi, dan tetap bisa mencatat presensi saat offline.</div>
          </div>
          <button onClick={dismiss} className="text-muted hover:text-ink -mr-1 -mt-1 p-1" aria-label="Tutup"><X className="w-4 h-4" strokeWidth={1.5} /></button>
        </div>
        {evt ? (
          <div className="flex justify-end gap-2 mt-4">
            <Button size="sm" variant="ghost" onClick={dismiss}>Nanti</Button>
            <Button size="sm" variant="primary" icon={Download} onClick={async () => { await evt.prompt(); const c = await evt.userChoice; if (c.outcome === 'accepted') setOpen(false); else dismiss(); setEvt(null); }}>Instal Aplikasi</Button>
          </div>
        ) : (
          <div className="mt-3 border-t border-line pt-3 text-xs text-ink2 space-y-1.5">
            {manual === 'ios' && (
              <>
                <div className="flex items-center gap-2"><span className="font-mono text-ink">1</span>Ketuk <Share className="w-4 h-4 text-accent" strokeWidth={1.5} /> <b>Bagikan</b> di Safari</div>
                <div className="flex items-center gap-2"><span className="font-mono text-ink">2</span>Pilih <SquarePlus className="w-4 h-4 text-accent" strokeWidth={1.5} /> <b>Tambah ke Layar Utama</b></div>
              </>
            )}
            {manual === 'android' && (
              <>
                <div className="flex items-center gap-2"><span className="font-mono text-ink">1</span>Ketuk menu <MoreVertical className="w-4 h-4 text-accent" strokeWidth={1.5} /> di Chrome</div>
                <div className="flex items-center gap-2"><span className="font-mono text-ink">2</span>Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b></div>
              </>
            )}
            {manual === 'desktop' && <div>Klik ikon instal di ujung kanan bilah alamat browser (Chrome/Edge), atau menu ⋮ → <b>Instal SIMS NOSSEF</b>.</div>}
            {!window.isSecureContext && <div className="text-warn">Instalasi penuh memerlukan HTTPS. Melalui alamat jaringan lokal (http://IP), browser hanya membuat pintasan.</div>}
            <div className="flex justify-end pt-1"><Button size="sm" variant="ghost" onClick={dismiss}>Mengerti</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}
