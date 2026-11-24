'use client';

import type { ReactNode } from 'react';

import { Badge, Mono } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { cx, fmtDate, schoolToday } from '@/lib/format';

export interface Bell { id: string; name: string; sequence: number; start_time: string; end_time: string }
export interface Slot {
  date: string; weekday: number; entry_id: string; bell_period_id: string; bell_period: string; start_time: string; end_time: string;
  classroom: string; classroom_id: string; subject_code: string; subject_name: string; teacher: string; room: string | null;
  exception: string | null; exception_reason: string | null; teaching_assignment_id: string;
}
export interface TimetableData { title: string; week: string[]; bell_periods: Bell[]; slots: Slot[] }

const TONE: Record<string, 'bad' | 'warn' | 'info'> = { CANCELLED: 'bad', MOVED: 'warn', SUBSTITUTED: 'info' };

/** Weekly grid (Mon–Sat, Sunday only when used). `show` chooses what the secondary line displays. */
export function Timetable({ data, show = 'teacher', onCell, onSlot, renderEmpty }: {
  data: TimetableData; show?: 'teacher' | 'classroom' | 'both'; onCell?: (weekday: number, bell: Bell, date: string) => void;
  onSlot?: (s: Slot) => void; renderEmpty?: (weekday: number, bell: Bell) => ReactNode;
}) {
  const { t, tx, locale } = useI18n();
  const days = data.week.map((d, i) => ({ date: d, weekday: i + 1 })).filter((d) => d.weekday <= 6 || data.slots.some((s) => s.weekday === 7));
  const at = (weekday: number, bell: string) => data.slots.filter((s) => s.weekday === weekday && s.bell_period_id === bell);
  const today = schoolToday();
  return (
    <div className="overflow-x-auto scroll-thin print-area">
      <table className="w-full border-collapse min-w-[760px]">
        <thead>
          <tr>
            <th scope="col" className="w-24 h-10 px-2 text-xs font-semibold uppercase tracking-wider text-ink2 bg-canvas border-b border-line text-left">{t('nav.schedule')}</th>
            {days.map((d) => (
              <th key={d.date} scope="col" className={cx('h-10 px-2 text-xs font-semibold text-ink2 bg-canvas border-b border-line text-left', d.date === today && 'text-accent')}>
                {t(`day.${d.weekday}` as MessageKey)} <span className="font-normal text-muted">{fmtDate(d.date, locale)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.bell_periods.map((b) => (
            <tr key={b.id}>
              <th scope="row" className="px-2 py-2 border-b border-line text-left align-top">
                <div className="text-xs font-semibold">{b.name}</div>
                <Mono className="text-[11px] text-muted">{b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}</Mono>
              </th>
              {days.map((d) => {
                const slots = at(d.weekday, b.id);
                return (
                  <td key={d.date} className={cx('p-1 border-b border-l border-line align-top h-16', onCell && !slots.length && 'cursor-pointer hover:bg-hover')}
                    onClick={() => !slots.length && onCell?.(d.weekday, b, d.date)}>
                    {slots.map((s) => (
                      <button key={s.entry_id + s.date} type="button" onClick={(e) => { e.stopPropagation(); onSlot?.(s); }}
                        className={cx('w-full text-left rounded-md border px-2 py-1.5 text-xs transition-colors', s.exception === 'CANCELLED' ? 'border-bad/30 bg-bad-bg/60 line-through decoration-bad/60' : 'border-line bg-white hover:border-line-strong', !onSlot && 'cursor-default')}>
                        <div className="flex items-center gap-1"><Mono className="text-xs font-semibold">{s.subject_code}</Mono>
                          {s.exception && <Badge tone={TONE[s.exception]} className="h-[18px] text-[10px]">{tx(`sched.exType.${s.exception}`, s.exception)}</Badge>}</div>
                        <div className="text-ink2 truncate">{show === 'classroom' ? s.classroom : show === 'both' ? `${s.classroom} · ${s.teacher}` : s.teacher}</div>
                        {s.room && <Mono className="text-[10px] text-muted">{s.room}</Mono>}
                      </button>
                    ))}
                    {!slots.length && renderEmpty?.(d.weekday, b)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function shiftWeek(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
