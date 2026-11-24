import { QRCodeSVG } from 'qrcode.react';
import { useDB, useLookups } from '../context/AppContexts';
import type { ReportCard, Student } from '../lib/types';
import { fmtDate, majorLabel, num2 } from '../lib/format';
import { cx } from './ui';

/** Official A4 trimester report card (Relatóriu Valór) preview. */
export default function ReportCardDoc({ student, trimester, card }: { student: Student; trimester: number; card?: ReportCard }) {
  const db = useDB();
  const L = useLookups();
  const cls = L.classes.get(student.classId);
  const subjects = db.teachingAssignments.filter((a) => a.classId === student.classId).map((a) => L.subjects.get(a.subjectId)!);
  const scores = subjects.map((sub) => ({ sub, sc: db.scores.find((x) => x.studentId === student.id && x.subjectId === sub.id && x.trimester === trimester) }));
  const finals = scores.map((x) => x.sc?.final).filter((x): x is number => x != null);
  const avg = finals.length ? finals.reduce((a, b) => a + b, 0) / finals.length : null;
  // class rank
  const classmates = db.students.filter((s) => s.classId === student.classId);
  const avgs = classmates.map((s) => {
    const f = db.scores.filter((x) => x.studentId === s.id && x.trimester === trimester && x.final != null).map((x) => x.final!);
    return { id: s.id, a: f.length ? f.reduce((p, c) => p + c, 0) / f.length : 0 };
  }).sort((a, b) => b.a - a.a);
  const rank = avgs.findIndex((x) => x.id === student.id) + 1;
  const att = { PRESENT: 0, SICK: 0, PERMITTED: 0, ABSENT: 0, LATE: 0 } as Record<string, number>;
  db.attendanceSessions.filter((a) => a.classId === student.classId && a.records[student.id]).forEach((a) => att[a.records[student.id].status]++);
  return (
    <div className="print-area bg-white border border-line mx-auto w-full max-w-[794px] aspect-[1/1.414] p-[5%] text-[11px] leading-snug text-ink flex flex-col">
      <div className="flex items-center gap-3 border-b-2 border-ink pb-3">
        <img src="/crest.svg" width={44} height={44} alt="" />
        <div className="flex-1 text-center">
          <div className="text-[9px] tracking-widest uppercase text-ink2">República Democrática de Timor-Leste · Ministério da Educação</div>
          <div className="font-display text-[15px] font-semibold">ESCOLA SECUNDÁRIA CATÓLICA NOSSA SENHORA DE FÁTIMA</div>
          <div className="text-[10px] text-ink2">Railaco, Município Ermera · secretaria@nossef-railaco.tl</div>
        </div>
        <div className="w-11" />
      </div>
      <div className="text-center mt-3 font-display font-semibold text-[13px] tracking-tight">RELATÓRIU VALÓR — {trimester}º TRIMESTRE (CAU {trimester}) · ANO LETIVO 2026</div>
      <div className="grid grid-cols-2 gap-x-6 mt-3 text-[10.5px]">
        <div>Naran: <b>{student.name}</b></div><div>Turma: <b>{cls?.name}</b> · {majorLabel(student.major)}</div>
        <div>Nº Estudante: <span className="font-mono">{student.studentNo}</span></div><div>EMIS: <span className="font-mono">{student.nationalNo}</span></div>
        <div>Moris: {student.birthPlace}, {fmtDate(student.birthDate)}</div><div>Profesor da Turma: {L.teachers.get(cls?.homeroomTeacherId || '')?.name}</div>
      </div>
      <table className="w-full mt-3 border-collapse text-[10.5px]">
        <thead>
          <tr className="bg-canvas">{['No', 'Disciplina', 'TPC', 'T1', 'T2', `CAU ${trimester}`, 'Média (0–10)', 'Situasaun'].map((h) => <th key={h} className="border border-line-strong px-1.5 py-1 font-semibold text-left">{h}</th>)}</tr>
        </thead>
        <tbody>
          {scores.map(({ sub, sc }, i) => (
            <tr key={sub.id}>
              <td className="border border-line-strong px-1.5 py-0.5 font-mono">{i + 1}</td>
              <td className="border border-line-strong px-1.5 py-0.5">{sub.name}</td>
              {[sc?.tpc, sc?.t1, sc?.t2, sc?.ezame].map((v, j) => <td key={j} className="border border-line-strong px-1.5 py-0.5 font-mono text-right">{num2(v)}</td>)}
              <td className="border border-line-strong px-1.5 py-0.5 font-mono text-right font-semibold">{num2(sc?.final)}</td>
              <td className={cx('border border-line-strong px-1.5 py-0.5', sc?.situation === 'REPROVADO' && 'text-bad')}>{sc?.situation ? sc.situation[0] + sc.situation.slice(1).toLowerCase() : '—'}</td>
            </tr>
          ))}
          <tr className="bg-canvas font-semibold"><td colSpan={6} className="border border-line-strong px-1.5 py-1 text-right">Média Jerál / Ranking Turma</td><td className="border border-line-strong px-1.5 py-1 font-mono text-right">{num2(avg)}</td><td className="border border-line-strong px-1.5 py-1 font-mono">#{rank} / {classmates.length}</td></tr>
        </tbody>
      </table>
      <div className="grid grid-cols-5 mt-3 border border-line-strong text-center text-[10px]">
        {[['Hadir', att.PRESENT], ['Telat', att.LATE], ['Sakit', att.SICK], ['Izin', att.PERMITTED], ['Alpa', att.ABSENT]].map(([k, v]) => <div key={k as string} className="border-r last:border-r-0 border-line-strong py-1"><div className="text-ink2">{k}</div><div className="font-mono font-semibold">{v}</div></div>)}
      </div>
      <div className="mt-3 border border-line-strong p-2 min-h-[48px]"><div className="text-[9px] uppercase tracking-wider text-ink2">Komentáriu Profesor da Turma</div><div className="mt-0.5">{card?.homeroomNote || '—'}</div></div>
      <div className="flex-1" />
      <div className="flex items-end justify-between mt-4 text-[10px]">
        <div className="text-center w-40"><div>Profesor da Turma</div><div className="h-10" /><div className="border-t border-ink pt-0.5">{L.teachers.get(cls?.homeroomTeacherId || '')?.name}</div></div>
        <div className="flex flex-col items-center">
          <QRCodeSVG value={`https://nossef-railaco.tl/verify/${card?.verifyToken || 'DRAFT'}`} size={64} />
          <div className="font-mono text-[9px] mt-1">{card?.verifyToken || 'DRAFT'} · Rev.{card?.revision ?? 0}</div>
        </div>
        <div className="text-center w-40"><div>Diretora Geral da Escola</div><div className="h-10" /><div className="border-t border-ink pt-0.5">Prof. Dra. Cristina Amaral</div></div>
      </div>
      {card?.status !== 'PUBLISHED' && <div className="text-center text-[10px] text-bad mt-2 font-semibold tracking-widest">DRAFT — LA ÓFISIÁL</div>}
    </div>
  );
}
