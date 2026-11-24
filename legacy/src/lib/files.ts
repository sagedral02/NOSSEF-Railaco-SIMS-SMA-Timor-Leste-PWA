import { api, tokenStore } from './api';

export interface StoredFile { id: string; name: string; mime: string; size: number }

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Upload a file; its content is stored in the SQLite `files` table on the server. */
export async function uploadFile(file: File, opts: { category: string; publicUpload?: boolean }): Promise<StoredFile> {
  const dataBase64 = await toBase64(file);
  const mime = file.type || (/\.csv$/i.test(file.name) ? 'text/csv' : /\.xlsx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream');
  return api<StoredFile>('POST', opts.publicUpload ? '/api/public/files' : '/api/files', { name: file.name, mime, dataBase64, category: opts.category });
}

/** URL for viewing/downloading a stored file (token passed as query so <img>/<iframe> can load it). */
export function fileUrl(id: string, download = false) {
  return `/api/files/${id}?t=${encodeURIComponent(tokenStore.get() || '')}${download ? '&download=1' : ''}`;
}
export function jobDownloadUrl(id: string) {
  return `/api/jobs/${id}/download?t=${encodeURIComponent(tokenStore.get() || '')}`;
}
export const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
