'use client';

import { Mono, KV, Table, Td, Th, Tr, cx } from '@/components/ui';
import { useI18n } from '@/i18n';
import { API_BASE } from '@/lib/api';

export interface ReportCard {
  id: string; student: string; student_name: string; student_no: string; classroom: string; trimester: string; trimester_number: number; academic_year: string;
  status: string; homeroom_note: string; published_at: string | null; revision_no: number; reopen_reason: string; pdf_file: string | null; missing: string[];
  attendance_summary: { counts?: Record<string, number>; rate?: number | null; basis?: string };
  snapshot: { subjects?: { subject_code: string; subject_name: string; final_score: string; grade_label: string; cau_score: string | null }[]; average?: string | null; cau?: number };
}
export interface Readiness { students: number; ready: number; missing: Record<string, string[]> }

export function reportPdfUrl(id: string, inline = false) {
  return `${API_BASE}/report-cards/${id}/download/${inline ? '?inline=1' : ''}`;
}

export function ReportSnapshot({ r }: { r: ReportCard }) {
  const { t, tx } = useI18n();
  return (
    <div className="space-y-4">
      <Table>
        <thead><tr><Th>{t('gb.assignment')}</Th><Th align="center">CAU {r.snapshot.cau ?? ''}</Th><Th align="center">{t('gb.final')}</Th><Th /></tr></thead>
        <tbody>
          {(r.snapshot.subjects ?? []).map((s) => (
            <Tr key={s.subject_code}>
              <Td><Mono className="text-xs mr-2">{s.subject_code}</Mono>{s.subject_name}</Td>
              <Td align="center" mono>{s.cau_score != null ? Number(s.cau_score).toFixed(2) : '—'}</Td>
              <Td align="center" mono className={cx('font-semibold', s.grade_label === 'REPROVADO' && 'text-bad')}>{Number(s.final_score).toFixed(2)}</Td>
              <Td><span className={cx('text-xs', s.grade_label === 'REPROVADO' ? 'text-bad' : 'text-ok')}>{tx(`status.${s.grade_label}`, s.grade_label)}</span></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <div className="grid grid-cols-2 gap-3">
        <KV k={t('rc.average')} v={r.snapshot.average ?? '—'} mono />
        <KV k={t('rc.attendance')} v={r.attendance_summary.rate != null ? `${r.attendance_summary.rate}%` : '—'} mono />
      </div>
    </div>
  );
}
