'use client';

// Digital student card (ui.md SCREEN-05/21). The QR (server-rendered SVG) carries only the student number.
import { Printer } from 'lucide-react';
import Image from 'next/image';

import { Avatar, Button, Modal, Mono } from '@/components/ui';
import { useI18n } from '@/i18n';
import { API_BASE, fileUrl } from '@/lib/api';

export interface CardStudent {
  id: string; full_name: string; student_no: string; classroom?: string | null; academic_year?: string | null; photo_file?: string | null;
}

export function StudentIdCard({ s }: { s: CardStudent }) {
  const { t } = useI18n();
  return (
    <div className="w-[340px] max-w-full bg-white border border-line rounded-lg overflow-hidden break-inside-avoid">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-ink text-white">
        <Image src="/crest.svg" alt="" width={24} height={24} className="rounded" />
        <div className="leading-tight min-w-0">
          <div className="font-display text-sm font-semibold truncate">NOSSEF Railaco</div>
          <div className="text-[10px] text-white/70">{t('card.title')}</div>
        </div>
      </div>
      <div className="flex gap-3 p-4">
        {s.photo_file
          ? <Image unoptimized src={fileUrl(s.photo_file, true)} alt="" width={64} height={80} className="w-16 h-20 object-cover rounded border border-line" />
          : <div className="w-16 h-20 rounded border border-line bg-canvas flex items-center justify-center"><Avatar name={s.full_name} size={40} /></div>}
        <div className="flex-1 min-w-0 text-sm">
          <div className="font-semibold leading-snug">{s.full_name}</div>
          <Mono className="text-xs text-ink2">{s.student_no}</Mono>
          <div className="text-xs text-ink2 mt-1.5">{s.classroom ?? '—'}</div>
          {s.academic_year && <div className="text-xs text-ink2">{t('common.year')} {s.academic_year}</div>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not optimizable */}
        <img src={`${API_BASE}/students/${s.id}/qr/`} alt={t('card.qr')} width={80} height={80} className="w-20 h-20 shrink-0" />
      </div>
    </div>
  );
}

/** Print view for one or many cards (bulk "Cetak Kartu" in the directory). */
export function IdCardModal({ students, onClose }: { students: CardStudent[]; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal open onClose={onClose} title={t('card.title')} size={students.length > 1 ? 'lg' : 'sm'}
      footer={<><Button onClick={onClose}>{t('common.close')}</Button><Button variant="primary" icon={Printer} onClick={() => window.print()}>{t('card.print')}</Button></>}>
      <div className="print-area flex flex-wrap gap-3 justify-center">
        {students.map((s) => <StudentIdCard key={s.id} s={s} />)}
      </div>
    </Modal>
  );
}
