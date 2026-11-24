export const usd = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num2 = (n: number | null | undefined) => (n == null ? '—' : Number(n).toFixed(2));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const isDateOnly = s.length <= 10;
  const d = new Date(isDateOnly ? s + 'T00:00:00Z' : s);
  if (Number.isNaN(d.getTime())) return s;
  const dili = new Date(d.getTime() + (isDateOnly ? 0 : 9 * 3600 * 1000)); // Asia/Dili UTC+9
  return `${dili.getUTCDate()} ${MONTHS[dili.getUTCMonth()]} ${dili.getUTCFullYear()}`;
};
export const fmtDateTime = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(new Date(s).getTime() + 9 * 3600 * 1000);
  return `${fmtDate(d.toISOString().slice(0, 10))} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
export const relTime = (s: string) => {
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} hari lalu`;
  return fmtDate(s);
};
export const initials = (name: string) =>
  name
    .replace(/^(Prof\.ª|Prof\.|Ir\.|Pe\.|Sr\.|Sra\.)\s*/g, '')
    .replace(/^Dra\.\s*/, '')
    .split(/\s+/)
    .filter((w) => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
export const majorLabel = (m: string) => (m === 'CT' ? 'CT / IPA' : 'CSH / IPS');
export const gradeRoman = (g: number) => (({ 10: 'X', 11: 'XI', 12: 'XII' }) as Record<number, string>)[g] || String(g);
export const DAYS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DAYS_SHORT = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// Operational "today" for the school dataset (Asia/Dili).
export const SCHOOL_TODAY = '2026-10-15';
export const SCHOLARSHIP_LABEL: Record<string, string> = { MERITO: 'Mérito', JESUITA: 'Jesuita', SOSIAL: 'Sosiál' };
export const CATEGORY_LABEL: Record<string, string> = { FUNCIONARIO: 'Funcionário Público', KONTRATADU: 'Kontratadu (MEC)', PART_TIME: 'Part-Time' };

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) => r.map((c) => { const s = c == null ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(','))
    .join('\n');
}
// Grading scale 0–10. REPROVADO for 0.00–5.00, APROVADO above 5.00 (mirrors server/seed.js).
export const SCALE_MAX = 10;
export const PASS_ABOVE = 5;
export const passed = (f: number | null | undefined) => f != null && f > PASS_ABOVE;
export const gradeFinal = (tpc: number, t1: number, t2: number, ez: number) => Math.round((tpc * 0.2 + t1 * 0.25 + t2 * 0.25 + ez * 0.3) * 100) / 100;
export const situationOf = (f: number | null) => (f == null ? null : passed(f) ? 'APROVADO' : 'REPROVADO');
