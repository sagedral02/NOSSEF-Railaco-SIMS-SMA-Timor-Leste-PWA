import { QRCodeSVG } from 'qrcode.react';
import type { ClassRoom, Student } from '../lib/types';
import { fmtDate, initials, majorLabel } from '../lib/format';
import { cx } from './ui';

/** Formal 3x4 photo placeholder (red/blue background per school rule). */
export function Photo3x4({ name, w = 64, bg = 'red' }: { name: string; w?: number; bg?: 'red' | 'blue' }) {
  const h = Math.round((w * 4) / 3);
  return (
    <div className={cx('relative rounded border border-line overflow-hidden shrink-0', bg === 'red' ? 'bg-[#B3261E]' : 'bg-[#1F4FA3]')} style={{ width: w, height: h }}>
      <svg viewBox="0 0 30 40" className="absolute inset-0 w-full h-full">
        <circle cx="15" cy="15" r="7" fill="#F2E6DA" />
        <path d="M3 40 C3 28 9 25 15 25 C21 25 27 28 27 40 Z" fill="#FFFFFF" />
        <path d="M12 25 L15 31 L18 25" fill="#1E1919" />
      </svg>
      <span className="absolute bottom-0 inset-x-0 text-center text-[9px] font-semibold text-white/80 pb-0.5">{initials(name)}</span>
    </div>
  );
}

export function DigitalIdCard({ student, cls }: { student: Student; cls?: ClassRoom }) {
  return (
    <div className="w-full max-w-[340px] aspect-[1.586] rounded-lg border border-line bg-white overflow-hidden flex flex-col shadow-none">
      <div className="h-9 bg-ink text-white flex items-center gap-2 px-3">
        <img src="/crest.svg" width={20} height={20} alt="" className="rounded-sm" />
        <div className="leading-none">
          <div className="text-[10px] font-semibold tracking-wide">ESCOLA SECUNDÁRIA CATÓLICA NOSSEF</div>
          <div className="text-[8px] text-white/70 mt-0.5">Railaco · Ermera · Timor-Leste</div>
        </div>
        <span className="ml-auto text-[8px] font-mono text-white/70">KARTAUN ESTUDANTE</span>
      </div>
      <div className="flex-1 flex gap-3 p-3">
        <Photo3x4 name={student.name} w={60} bg={student.gender === 'F' ? 'red' : 'blue'} />
        <div className="flex-1 min-w-0 text-[10px] leading-snug">
          <div className="text-[12px] font-semibold text-ink leading-tight">{student.name}</div>
          <div className="font-mono text-ink mt-1">{student.studentNo}</div>
          <div className="text-ink2">{cls?.name} · {majorLabel(student.major)}</div>
          <div className="text-ink2">Moris: {student.birthPlace}, {fmtDate(student.birthDate)}</div>
          <div className="text-muted mt-1">Válidu to: 31 Dez 2026</div>
        </div>
        <div className="self-end">
          <QRCodeSVG value={`NOSSEF:${student.studentNo}:${student.nationalNo}`} size={64} level="M" />
        </div>
      </div>
    </div>
  );
}
