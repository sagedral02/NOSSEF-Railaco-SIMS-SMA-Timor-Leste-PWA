import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, FileSpreadsheet } from 'lucide-react';
import { useAuth, useDB, useI18n, useLookups } from '../context/AppContexts';
import { useUploadValor } from '../components/AppShell';
import { useGradeScope } from '../components/UploadValorExcel';
import { Avatar, Badge, Button, Card, cx, Mono, PageHeader, Stat, StatusPill, Table, Td, Th, Tr } from '../components/ui';
import { DAYS, fmtDateTime, num2, relTime, SCHOOL_TODAY, usd } from '../lib/format';

export function Organigram() {
  const db = useDB();
  const L = useLookups();
  const Box = ({ title, name, dark }: { title: string; name: string; dark?: boolean }) => (
    <div className={cx('rounded-md border px-3 py-2 text-center min-w-[150px]', dark ? 'bg-ink text-white border-ink' : 'bg-white border-line')}>
      <div className={cx('text-[10px] uppercase tracking-wider', dark ? 'text-white/70' : 'text-muted')}>{title}</div>
      <div className="text-xs font-semibold mt-0.5">{name}</div>
    </div>
  );
  const V = () => <div className="w-px h-4 bg-line-strong mx-auto" />;
  return (
    <div className="overflow-x-auto scroll-thin">
      <div className="min-w-[640px] flex flex-col items-center py-2">
        <Box title="Fundação / Companhia de Jesus" name="Superior Provincial SJ Timor-Leste" />
        <V />
        <Box title="Diretora Geral da Escola" name="Prof. Dra. Cristina Amaral" dark />
        <V />
        <div className="relative flex gap-4 pt-4 before:absolute before:top-0 before:left-[75px] before:right-[75px] before:h-px before:bg-line-strong">
          {[['Vise-Diretora Pedagójika', 'Ir. Maria Gorete Martins'], ['Sekretaria da Escola', 'Sra. Imaculada Hornai'], ['Finansas & Tesoureiro', 'Sr. Lourenço Correia'], ['Kapelaun / Pastoral', 'Pe. José Carvalho, SJ']].map(([t, n]) => (
            <div key={t} className="relative before:absolute before:-top-4 before:left-1/2 before:w-px before:h-4 before:bg-line-strong"><Box title={t} name={n} /></div>
          ))}
        </div>
        <V />
        <div className="flex flex-wrap justify-center gap-2 max-w-3xl">
          {db.classes.map((c) => (
            <div key={c.id} className="border border-line rounded-md px-2.5 py-1.5 bg-canvas text-center">
              <div className="text-[11px] font-semibold">{c.name}</div>
              <div className="text-[10px] text-ink2">{L.teachers.get(c.homeroomTeacherId)?.name.replace(/^Prof\.(ª)?\s/, '')}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-muted mt-2 uppercase tracking-wider">Profesor da Turma (Titulár de Turma)</div>
      </div>
    </div>
  );
}

export function FeeTable() {
  const db = useDB();
  return (
    <Table>
      <thead><tr><Th>Tingkat</Th><Th align="right">Etapa 1</Th><Th align="right">Etapa 2</Th><Th align="right">Total / Tahun</Th></tr></thead>
      <tbody>
        {db.feePlans.map((f) => (
          <Tr key={f.id}><Td>{f.label}</Td><Td align="right" mono>{usd(f.etapa1)}</Td><Td align="right" mono>{usd(f.etapa2)}</Td><Td align="right" mono className="font-semibold">{usd(f.total)}</Td></Tr>
        ))}
      </tbody>
    </Table>
  );
}

export function useRanking(limit = 5) {
  const db = useDB();
  return useMemo(() => {
    const sums = new Map<string, { s: number; n: number }>();
    db.scores.filter((x) => x.trimester === 2 && x.final != null).forEach((x) => {
      const v = sums.get(x.studentId) || { s: 0, n: 0 };
      v.s += x.final!; v.n++; sums.set(x.studentId, v);
    });
    return [...sums.entries()].map(([id, v]) => ({ student: db.students.find((s) => s.id === id)!, avg: v.s / v.n })).filter((x) => x.student).sort((a, b) => b.avg - a.avg).slice(0, limit);
  }, [db, limit]);
}

export default function Dashboard() {
  const db = useDB();
  const L = useLookups();
  const { t } = useI18n();
  const { user, can, hasRole } = useAuth();
  const openUpload = useUploadValor();
  const scope = useGradeScope();
  const ranking = useRanking(5);
  const isTeacher = hasRole('TEACHER', 'HOMEROOM_TEACHER');
  const tri = db.trimesters.find((x) => x.status === 'ACTIVE')!;

  const m = useMemo(() => {
    const active = db.students.filter((s) => s.status === 'ACTIVE');
    const byGrade = [10, 11, 12].map((g) => active.filter((s) => s.grade === g).length);
    const today = db.attendanceSessions.filter((a) => a.date === SCHOOL_TODAY);
    const recs = today.flatMap((a) => Object.values(a.records));
    const present = recs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const tg = db.termGrades.filter((x) => x.trimester === tri.number);
    const fin = tg.filter((x) => x.status === 'FINALIZED').length;
    const classesNotFinal = db.classes.filter((c) => tg.some((x) => x.classId === c.id && x.status !== 'FINALIZED')).length;
    const month = db.payments.filter((p) => p.status === 'VERIFIED' && p.receivedAt.startsWith(SCHOOL_TODAY.slice(0, 7))).reduce((s, p) => s + p.amount, 0);
    const year = db.payments.filter((p) => p.status === 'VERIFIED').reduce((s, p) => s + p.amount, 0);
    const arrears = db.invoices.filter((i) => ['UNPAID', 'PARTIALLY_PAID'].includes(i.status) && i.dueDate < SCHOOL_TODAY).reduce((s, i) => s + (i.total - i.paid), 0);
    const pending = db.payments.filter((p) => p.status === 'PENDING').length;
    return { active: active.length, byGrade, rate: recs.length ? (present / recs.length) * 100 : 0, notPresent: recs.length - present, sessionsToday: today.length, cau: tg.length ? (fin / tg.length) * 100 : 0, classesNotFinal, month, year, arrears, pending };
  }, [db, tri.number]);

  const myClasses = useMemo(() => {
    if (!isTeacher) return [];
    return [...new Set(scope.map((a) => a.classId))];
  }, [scope, isTeacher]);
  const homeroom = db.classes.find((c) => c.homeroomTeacherId === user?.profileId);
  const todayDow = new Date(SCHOOL_TODAY + 'T00:00:00Z').getUTCDay();
  const mySchedule = db.schedule.filter((s) => s.teacherId === user?.profileId && s.day === todayDow).sort((a, b) => a.period - b.period);

  const activity = can('audit.view')
    ? db.auditLogs.filter((a) => a.eventType !== 'USER_LOGIN').slice(0, 6).map((a) => ({ id: a.id, text: `${a.eventType.replace(/_/g, ' ')}`, sub: `${a.target} · ${a.actor}`, at: a.at }))
    : db.pautaSubmissions.slice(0, 6).map((p) => ({ id: p.id, text: `${p.protocol} dikirim oleh ${L.teachers.get(p.teacherId)?.name || '—'}`, sub: p.status, at: p.submittedAt }));

  return (
    <div>
      <PageHeader
        title={t('dash.title')}
        subtitle={<span>Tahun Ajaran <Mono>2026</Mono> · {tri.number}º Trimestre (CAU {tri.cau}) · {DAYS[todayDow]}, 15 Out 2026 · Asia/Dili</span>}
        actions={
          <>
            {can('finance.view') && <Link to="/finance?tab=pending"><Button>Verifikasi Kuitansi Bank</Button></Link>}
            {can('student.create') && <Link to="/students"><Button>Direktori Siswa</Button></Link>}
            {can('report.publish') && <Link to="/grades/submissions"><Button variant="dark">Review Pauta Valor</Button></Link>}
          </>
        }
      />

      {isTeacher && (
        <div className="bg-canvas md:bg-white border border-line-strong rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="w-6 h-6 text-ink shrink-0 mt-0.5" strokeWidth={1.5} />
            <div>
              <div className="font-display font-semibold text-ink">{t('dash.teacherBanner')}</div>
              <div className="text-sm text-ink2 mt-0.5">
                {user?.name}{homeroom && <> · Profesor da Turma <b className="text-ink">{homeroom.name}</b></>} · {myClasses.length} rombel diajar
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:flex gap-2 shrink-0">
            <Button icon={Download} onClick={() => openUpload()}>{t('dash.downloadModelo')}</Button>
            <Button variant="primary" icon={FileSpreadsheet} onClick={() => openUpload()}>{t('top.uploadValor')}</Button>
          </div>
        </div>
      )}

      <div className="bg-white border border-line rounded-lg grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-line mb-5 overflow-hidden">
        <Stat label="Siswa Aktif" value={<Mono className="text-2xl">{m.active}</Mono>} sub={<>X: {m.byGrade[0]} | XI: {m.byGrade[1]} | XII: {m.byGrade[2]}</>} to={can('student.view') ? '/students' : undefined} />
        <Stat label="Presensi Hari Ini" value={<Mono className="text-2xl">{m.rate.toFixed(1)}%</Mono>} sub={`${m.notPresent} Alpa/Sakit/Izin · ${m.sessionsToday}/${db.classes.length} rombel`} to="/attendance" />
        <Stat label={`Kelengkapan CAU ${tri.cau}`} value={<Mono className="text-2xl">{m.cau.toFixed(0)}%</Mono>} sub={`${m.classesNotFinal} kelas belum final`} to="/grades" />
        {can('finance.view') ? (
          <>
            <Stat label="Koleksi SPP (USD)" value={<Mono className="text-2xl">{usd(m.month)}</Mono>} sub={<>Bulan berjalan · Tahun: <Mono>{usd(m.year)}</Mono></>} to="/finance" />
            <Stat label="Tunggakan SPP" value={<Mono className="text-2xl">{usd(m.arrears)}</Mono>} tone="bad" sub="Lewat jatuh tempo" to="/finance?tab=arrears" />
            <Stat label="Kuitansi Bank Pending" value={<Mono className="text-2xl">{m.pending} Kuitansi</Mono>} sub="Antrean verifikasi" to="/finance?tab=pending" />
          </>
        ) : (
          <>
            <Stat label="Guru Aktif" value={<Mono className="text-2xl">{db.teachers.filter((x) => x.status === 'ACTIVE').length}</Mono>} sub={`${db.staff.length} staf pendukung`} />
            <Stat label="Rombel" value={<Mono className="text-2xl">{db.classes.length}</Mono>} sub="CT (IPA) & CSH (IPS)" />
            <Stat label="Pauta Menunggu Review" value={<Mono className="text-2xl">{db.pautaSubmissions.filter((p) => p.status === 'PENDING_DIRECTOR_REVIEW').length}</Mono>} sub="PENDING_DIRECTOR_REVIEW" to="/grades/submissions" />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-5">
          {isTeacher && (
            <Card title={`Jadwal Mengajar Hari Ini — ${DAYS[todayDow]}`} pad={false} actions={<Link to="/schedules" className="text-xs text-accent">Lihat jadwal</Link>}>
              {mySchedule.length ? (
                <div className="divide-y divide-line">
                  {mySchedule.map((s) => {
                    const bp = db.bellPeriods.find((b) => b.order === s.period);
                    return (
                      <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                        <Mono className="text-xs text-ink2 w-24">{bp?.start}–{bp?.end}</Mono>
                        <div className="flex-1 min-w-0"><div className="text-sm font-medium">{L.subjects.get(s.subjectId)?.name}</div><div className="text-xs text-ink2">{L.classes.get(s.classId)?.name} · {L.rooms.get(s.roomId)?.code}</div></div>
                        <Link to={`/attendance?class=${s.classId}`}><Button size="sm">Presensi</Button></Link>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="px-4 py-6 text-sm text-ink2">Tidak ada jadwal mengajar hari ini.</div>}
            </Card>
          )}
          <Card title="Kesiapan Akademik & Pauta per Rombel" pad={false} actions={<Badge mono>T{tri.number} · CAU {tri.cau}</Badge>}>
            <Table>
              <thead><tr><Th>Rombel</Th><Th>Profesor da Turma</Th><Th>Presensi Hari Ini</Th><Th>Input Nilai CAU {tri.cau}</Th><Th></Th></tr></thead>
              <tbody>
                {db.classes.filter((c) => !isTeacher || myClasses.includes(c.id) || can('academic.view')).map((c) => {
                  const sess = db.attendanceSessions.find((a) => a.classId === c.id && a.date === SCHOOL_TODAY);
                  const tg = db.termGrades.filter((x) => x.classId === c.id && x.trimester === tri.number);
                  const fin = tg.filter((x) => x.status === 'FINALIZED').length;
                  return (
                    <Tr key={c.id}>
                      <Td><div className="font-medium">{c.name}</div><div className="text-xs text-ink2">{db.students.filter((s) => s.classId === c.id).length} siswa</div></Td>
                      <Td className="whitespace-nowrap">{L.teachers.get(c.homeroomTeacherId)?.name}</Td>
                      <Td>{sess ? <StatusPill status={sess.status === 'SUBMITTED' ? 'SUBMITTED' : 'OPEN'} label={sess.status === 'SUBMITTED' ? 'Terkirim' : 'Terbuka'} /> : <StatusPill status="PENDING" label="Belum dicatat" />}</Td>
                      <Td><div className="flex items-center gap-2"><Mono className="text-xs">{fin}/{tg.length}</Mono><div className="w-20 h-1.5 bg-line rounded-full overflow-hidden"><div className="h-full bg-ok" style={{ width: `${tg.length ? (fin / tg.length) * 100 : 0}%` }} /></div></div></Td>
                      <Td align="right"><Link to={`/grades?class=${c.id}`} className="inline-flex items-center gap-1 text-xs text-accent whitespace-nowrap">Buka <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} /></Link></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
          <Card title="Ringkasan Tarif Resmi SPP (Etapa 1 & Etapa 2)" pad={false}><FeeTable /></Card>
          <Card title="Arsip Historis NOSSEF 2002 – 2026" actions={<Link to="/students?tab=archive" className="text-xs text-accent">Buka arsip</Link>}>
            <div className="flex items-end gap-[3px] h-32">
              {db.archive.map((a) => (
                <div key={a.year} className="flex-1 flex flex-col items-center justify-end group relative h-full">
                  <div className="w-full bg-ink/80 group-hover:bg-accent rounded-t-sm transition-colors" style={{ height: `${(a.enrolled / 650) * 100}%` }} />
                  <div className="absolute -top-6 hidden group-hover:block bg-ink text-white text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap z-10">{a.year}: {a.enrolled}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] font-mono text-muted mt-1"><span>2002</span><span>2014</span><span>2026</span></div>
            <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
              <div><div className="text-xs text-ink2">Total Alumni</div><Mono className="text-lg font-semibold">{db.archive.reduce((s, a) => s + a.graduates, 0).toLocaleString()}</Mono></div>
              <div><div className="text-xs text-ink2">Rata-rata Kelulusan</div><Mono className="text-lg font-semibold">{(db.archive.filter((a) => a.passRate).reduce((s, a) => s + a.passRate!, 0) / db.archive.filter((a) => a.passRate).length).toFixed(1)}%</Mono></div>
              <div><div className="text-xs text-ink2">Tahun Berdiri</div><Mono className="text-lg font-semibold">2002</Mono></div>
            </div>
          </Card>
        </div>
        <div className="lg:col-span-4 space-y-5">
          <Card title="Top 5 Ranking Jeral (CT & CSH)" pad={false} actions={<Badge mono>T2 · 0–10</Badge>}>
            {ranking.map((r, i) => (
              <div key={r.student.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0">
                <Mono className="w-5 text-ink2">{i + 1}</Mono>
                <Avatar name={r.student.name} size={30} tone={i === 0 ? 'dark' : 'neutral'} />
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{r.student.name}</div><div className="text-xs text-ink2">{L.classes.get(r.student.classId)?.name}</div></div>
                <Mono className="font-semibold">{num2(r.avg)}</Mono>
              </div>
            ))}
          </Card>
          <Card title="Log Aktivitas & Protokol Terbaru" pad={false}>
            {activity.map((a) => (
              <div key={a.id} className="px-4 py-3 border-b border-line last:border-0">
                <div className="text-sm text-ink">{a.text}</div>
                <div className="text-xs text-ink2 mt-0.5 flex justify-between gap-2"><Mono className="text-[11px] truncate">{a.sub}</Mono><span className="shrink-0" title={fmtDateTime(a.at)}>{relTime(a.at)}</span></div>
              </div>
            ))}
          </Card>
          <Card title="Kalender Terdekat" pad={false}>
            {db.calendarEvents.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0">
                <Mono className="text-xs text-ink2 w-20">{e.date.slice(5).split('-').reverse().join('/')}</Mono>
                <span className="text-sm flex-1">{e.title}</span>
                <Badge tone={e.type === 'HOLIDAY' ? 'bad' : e.type === 'EXAM' ? 'warn' : 'neutral'}>{e.type}</Badge>
              </div>
            ))}
          </Card>
        </div>
      </div>
      <Card title="Estrutura Eskola NOSSEF — Organigram" className="mt-5"><Organigram /></Card>
    </div>
  );
}
