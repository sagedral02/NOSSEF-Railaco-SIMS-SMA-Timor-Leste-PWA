import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, FileText, Loader2, UploadCloud, X } from 'lucide-react';
import { fileUrl, fmtSize, uploadFile, type StoredFile } from '../lib/files';
import { ApiError } from '../lib/api';
import { cx, Mono } from './ui';

const PdfView = lazy(() => import('./PdfView'));

/** Upload control: uploads immediately, reports the stored file back to the form. */
export function FileField({ value, onChange, category, accept = '.pdf,.jpg,.jpeg,.png', maxMb = 5, publicUpload, label = 'Pilih file', hint }: {
  value: StoredFile | null; onChange: (f: StoredFile | null) => void; category: string; accept?: string; maxMb?: number; publicUpload?: boolean; label?: string; hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function pick(file: File) {
    setErr(null);
    if (file.size > maxMb * 1024 * 1024) { setErr(`Ukuran file maksimal ${maxMb} MB.`); return; }
    setBusy(true);
    try { onChange(await uploadFile(file, { category, publicUpload })); }
    catch (e) { setErr((e as ApiError).message); }
    finally { setBusy(false); }
  }
  return (
    <div>
      {value ? (
        <div className="flex items-center gap-3 h-11 px-3 rounded-md border border-ok/40 bg-ok-bg/40 text-sm">
          <CheckCircle2 className="w-4 h-4 text-ok shrink-0" strokeWidth={1.5} />
          <span className="truncate flex-1">{value.name}</span>
          <Mono className="text-xs text-muted">{fmtSize(value.size)}</Mono>
          <button type="button" onClick={() => onChange(null)} className="text-muted hover:text-ink" aria-label="Hapus"><X className="w-4 h-4" strokeWidth={1.5} /></button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} className={cx('w-full flex items-center gap-3 h-11 px-3 rounded-md border border-dashed text-sm text-left', err ? 'border-bad' : 'border-line-strong hover:bg-hover')}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin text-ink2" strokeWidth={1.5} /> : <UploadCloud className="w-4 h-4 text-ink2" strokeWidth={1.5} />}
          <span className="flex-1 text-ink2">{busy ? 'Mengunggah...' : label}</span>
          <span className="text-xs text-muted">{hint || `maks ${maxMb} MB`}</span>
        </button>
      )}
      {err && <div className="text-xs text-bad mt-1">{err}</div>}
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
    </div>
  );
}

/** Inline preview of a stored file (image or PDF), with open/download links. */
export function FilePreview({ id, name, mime, height = 420 }: { id: string; name?: string; mime?: string; height?: number }) {
  const [type, setType] = useState<string | null>(mime || null);
  useEffect(() => {
    if (mime) { setType(mime); return; }
    let alive = true;
    fetch(fileUrl(id), { method: 'HEAD' }).then((r) => alive && setType(r.ok ? r.headers.get('content-type') || '' : 'missing')).catch(() => alive && setType('missing'));
    return () => { alive = false; };
  }, [id, mime]);
  if (type === null) return <div className="border border-line rounded-md bg-canvas animate-pulse" style={{ height: 160 }} />;
  if (type === 'missing') return <div className="border border-line rounded-md bg-canvas p-4 text-sm text-ink2">File tidak ditemukan di penyimpanan.</div>;
  const isImg = type.startsWith('image/');
  const isPdf = type.startsWith('application/pdf');
  return (
    <div className="border border-line rounded-md overflow-hidden bg-canvas">
      {isImg ? (
        <img src={fileUrl(id)} alt={name} className="w-full object-contain bg-white" style={{ maxHeight: height }} />
      ) : isPdf ? (
        <Suspense fallback={<div className="bg-canvas animate-pulse" style={{ height }} />}><PdfView fileId={id} height={height} /></Suspense>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-ink2" style={{ height: 120 }}><FileText className="w-5 h-5" strokeWidth={1.5} />Pratinjau tidak tersedia untuk tipe file ini.</div>
      )}
      <div className="flex items-center gap-3 px-3 h-10 border-t border-line bg-white text-xs">
        <span className="truncate flex-1">{name}</span>
        <a href={fileUrl(id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent"><ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />Buka</a>
        <a href={fileUrl(id, true)} className="inline-flex items-center gap-1 text-accent"><Download className="w-3.5 h-3.5" strokeWidth={1.5} />Unduh</a>
      </div>
    </div>
  );
}
