import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../lib/api';

const MAX_PAGES = 15;

/**
 * Renders a PDF into canvases with PDF.js so the preview works in every browser,
 * including mobile browsers and desktops whose built-in viewer would download the file.
 */
export default function PdfView({ fileId, height }: { fileId: string; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; pages?: number }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => void } | null = null;
    const host = box.current;
    if (!host) return;
    host.replaceChildren();
    setState({ status: 'loading' });
    (async () => {
      try {
        const mod = await import('pdfjs-dist');
        // pdfjs-dist 3 ships as UMD; Vite exposes it under `default` in dev.
        const pdfjs = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        // Bytes arrive as JSON: download managers such as IDM intercept application/pdf
        // responses (iframe or fetch) and the browser would only get an empty body.
        const res = await api<{ base64: string }>('GET', `/api/files/${fileId}/preview`);
        const bin = atob(res.base64);
        const data = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
        if (cancelled) return;
        const loading = pdfjs.getDocument({ data });
        task = loading;
        const pdf = await loading.promise;
        if (cancelled) return;
        const width = Math.max(240, host.clientWidth - 16);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const count = Math.min(pdf.numPages, MAX_PAGES);
        for (let n = 1; n <= count; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.className = 'block mx-auto bg-white shadow-sm border border-line';
          host.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        }
        if (!cancelled) setState({ status: 'ready', pages: pdf.numPages });
      } catch (e) {
        console.warn('PDF preview failed: ' + String((e as Error)?.message ?? e));
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => { cancelled = true; task?.destroy(); };
  }, [fileId]);

  return (
    <div className="relative bg-canvas overflow-auto" style={{ height }}>
      <div ref={box} className="flex flex-col gap-2 p-2" />
      {state.status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-ink2"><Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />Memuat pratinjau PDF...</div>
      )}
      {state.status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink2 px-4 text-center">Pratinjau PDF gagal dimuat. Gunakan tombol Buka atau Unduh.</div>
      )}
      {state.status === 'ready' && state.pages! > MAX_PAGES && (
        <div className="text-xs text-muted text-center pb-2">Menampilkan {MAX_PAGES} dari {state.pages} halaman. Buka file untuk melihat semuanya.</div>
      )}
    </div>
  );
}
