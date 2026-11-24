import { useState } from 'react';
import { useDB, useLookups } from '../context/AppContexts';
import type { ScheduleEntry } from '../lib/types';
import { DAYS, DAYS_SHORT, SCHOOL_TODAY } from '../lib/format';
import { Badge, cx, Mono } from './ui';

export function TimetableGrid({ entries, mode, onCell, onEntry, highlight }: {
  entries: ScheduleEntry[]; mode: 'class' | 'teacher' | 'room'; onCell?: (day: number, period: number) => void; onEntry?: (e: ScheduleEntry) => void; highlight?: string;
}) {
  const db = useDB();
  const L = useLookups();
  const todayDow = new Date(SCHOOL_TODAY + 'T00:00:00Z').getUTCDay() || 1;
  const [day, setDay] = useState(todayDow);
  const cell = (d: number, p: number) => entries.filter((e) => e.day === d && e.period === p);
  const Entry = ({ e, compact }: { e: ScheduleEntry; compact?: boolean }) => {
    const sub = L.subjects.get(e.subjectId);
    const ex = e.exception;
    return (
      <button onClick={(ev) => { ev.stopPropagation(); onEntry?.(e); }} className={cx('w-full text-left rounded-md border px-2 py-1.5 transition-colors', ex ? 'border-warn/40 bg-warn-bg' : highlight && e.id === highlight ? 'border-accent bg-selected' : 'border-line bg-white hover:border-line-strong')}>
        <div className="flex items-center gap-1.5"><Mono className="text-[10px] text-ink2">{sub?.code}</Mono><span className={cx('font-medium text-ink truncate', compact ? 'text-xs' : 'text-sm')}>{sub?.name}</span></div>
        <div className="text-[11px] text-ink2 truncate">{mode === 'teacher' ? L.classes.get(e.classId)?.name : L.teachers.get(e.teacherId)?.name.replace(/^Prof\.(ª)?\s/, '')}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <Mono className="text-[10px] text-muted">{mode === 'room' ? L.classes.get(e.classId)?.name : L.rooms.get(e.roomId)?.code}</Mono>
          {ex && <Badge tone="warn" className="h-[18px] text-[10px] px-1.5">{ex.type === 'SUBSTITUTED' ? `Diganti: ${L.teachers.get(ex.substituteTeacherId || '')?.name.replace(/^Prof\.(ª)?\s/, '')}` : 'Dibatalkan'}</Badge>}
        </div>
      </button>
    );
  };
  return (
    <>
      <div className="hidden md:block overflow-x-auto scroll-thin">
        <table className="w-full border-collapse table-fixed min-w-[860px]">
          <thead>
            <tr>
              <th className="w-24 h-10 bg-canvas border border-line text-xs font-semibold uppercase tracking-wider text-ink2">Jam</th>
              {[1, 2, 3, 4, 5, 6].map((d) => <th key={d} className={cx('h-10 bg-canvas border border-line text-xs font-semibold uppercase tracking-wider', d === todayDow ? 'text-accent' : 'text-ink2')}>{DAYS[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {db.bellPeriods.map((bp) => (
              <tr key={bp.id}>
                <td className="border border-line px-2 py-1 text-center align-middle bg-canvas/50">
                  <div className="text-xs font-semibold">Jam {bp.order}</div>
                  <Mono className="text-[10px] text-ink2">{bp.start}–{bp.end}</Mono>
                </td>
                {[1, 2, 3, 4, 5, 6].map((d) => {
                  const list = cell(d, bp.order);
                  return (
                    <td key={d} onClick={() => onCell?.(d, bp.order)} className={cx('border border-line p-1 align-top h-[74px]', onCell && 'cursor-pointer hover:bg-hover', d === todayDow && 'bg-selected/30')}>
                      <div className="space-y-1">{list.map((e) => <Entry key={e.id} e={e} compact />)}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3">
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <button key={d} onClick={() => setDay(d)} className={cx('flex-1 min-w-[52px] h-11 rounded-md text-sm font-medium border', day === d ? 'bg-ink text-white border-ink' : 'bg-white border-line text-ink2')}>{DAYS_SHORT[d]}</button>
          ))}
        </div>
        <div className="space-y-2">
          {db.bellPeriods.map((bp) => {
            const list = cell(day, bp.order);
            if (!list.length) return null;
            return (
              <div key={bp.id} className="flex gap-3">
                <div className="w-14 pt-1.5 shrink-0"><div className="text-xs font-semibold">Jam {bp.order}</div><Mono className="text-[10px] text-ink2">{bp.start}</Mono></div>
                <div className="flex-1 space-y-1">{list.map((e) => <Entry key={e.id} e={e} />)}</div>
              </div>
            );
          })}
          {!db.bellPeriods.some((bp) => cell(day, bp.order).length) && <div className="text-sm text-ink2 py-6 text-center">Tidak ada pelajaran.</div>}
        </div>
      </div>
    </>
  );
}
