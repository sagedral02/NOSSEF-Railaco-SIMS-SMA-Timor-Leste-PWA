import { useMemo, useState } from 'react';
import { CalendarX, Plus, Printer, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { Alert, Button, Drawer, Field, Input, Mono, PageHeader, Select, Textarea } from '../components/ui';
import { TimetableGrid } from '../components/Timetable';
import { api, ApiError } from '../lib/api';
import { DAYS, SCHOOL_TODAY } from '../lib/format';
import type { ScheduleEntry } from '../lib/types';

type Mode = 'class' | 'teacher' | 'room';

export default function Schedules() {
  const db = useDB();
  const L = useLookups();
  const { can, user } = useAuth();
  const mutate = useMutation();
  const isTeacher = user?.profileType === 'TEACHER' && !can('schedule.manage');
  const [mode, setMode] = useState<Mode>(isTeacher ? 'teacher' : 'class');
  const [classId, setClassId] = useState(db.classes[0].id);
  const [teacherId, setTeacherId] = useState(user?.profileType === 'TEACHER' ? user.profileId! : db.teachers[2].id);
  const [roomId, setRoomId] = useState(db.rooms[0].id);
  const [form, setForm] = useState<null | { id?: string; day: number; period: number; subjectId: string; teacherId: string; roomId: string }>(null);
  const [exc, setExc] = useState<ScheduleEntry | null>(null);
  const [excForm, setExcForm] = useState({ type: 'SUBSTITUTED', substituteTeacherId: '', note: '', date: SCHOOL_TODAY });
  const [conflict, setConflict] = useState<{ code: string; message: string }[] | null>(null);
  const [checked, setChecked] = useState(false);
  const entries = useMemo(() => db.schedule.filter((e) => (mode === 'class' ? e.classId === classId : mode === 'teacher' ? e.teacherId === teacherId : e.roomId === roomId)), [db, mode, classId, teacherId, roomId]);
  const manage = can('schedule.manage');
  const offerings = db.teachingAssignments.filter((a) => a.classId === classId);

  function openNew(day: number, period: number) {
    if (!manage || mode !== 'class') return;
    const a = offerings[0];
    setConflict(null); setChecked(false);
    setForm({ day, period, subjectId: a?.subjectId || '', teacherId: a?.teacherId || '', roomId: L.classes.get(classId)?.roomId || db.rooms[0].id });
  }
  async function validate(dry: boolean) {
    if (!form) return;
    setConflict(null);
    try {
      await api('POST', '/api/schedule', { ...form, classId, dryRun: true });
      setChecked(true);
      if (!dry) { if (await mutate('POST', '/api/schedule', { ...form, classId }, 'Slot jadwal tersimpan.')) setForm(null); }
    } catch (e) {
      const err = e as ApiError;
      setConflict((err.extra.conflicts as { code: string; message: string }[]) || [{ code: err.code, message: err.message }]);
      setChecked(false);
    }
  }

  return (
    <div>
      <PageHeader title="Matriks Jadwal Pelajaran" subtitle="Segunda – Sábado · 8 jam pelajaran · deteksi bentrok guru & ruang"
        actions={<>{manage && mode === 'class' && <Button variant="primary" icon={Plus} onClick={() => openNew(1, 1)}>Tambah Slot Jadwal</Button>}<Button icon={Printer} onClick={() => window.print()}>Cetak PDF</Button></>} />
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="flex rounded-md border border-line overflow-hidden bg-white">
          {([['class', 'Per Rombel'], ['teacher', 'Per Guru'], ['room', 'Per Ruangan']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`h-9 px-3 text-sm ${mode === k ? 'bg-ink text-white' : 'text-ink2 hover:bg-hover'}`}>{l}</button>
          ))}
        </div>
        {mode === 'class' && <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9 md:w-44">{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
        {mode === 'teacher' && <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="h-9 md:w-72">{db.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
        {mode === 'room' && <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="h-9 md:w-56">{db.rooms.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</Select>}
        <span className="md:ml-auto text-xs text-ink2 self-center"><Mono>{entries.length}</Mono> slot · {manage ? 'Klik sel kosong untuk menambah, klik pelajaran untuk mengubah' : 'Baca-saja'}</span>
      </div>
      <div className="bg-white border border-line rounded-lg p-2 md:p-3 print-area">
        <TimetableGrid entries={entries} mode={mode} onCell={manage && mode === 'class' ? openNew : undefined}
          onEntry={manage ? (e) => { setConflict(null); setChecked(false); if (mode === 'class') setForm({ id: e.id, day: e.day, period: e.period, subjectId: e.subjectId, teacherId: e.teacherId, roomId: e.roomId }); else { setExc(e); } } : undefined} />
      </div>

      <Drawer open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Ubah Slot Jadwal' : 'Tambah Slot Jadwal'} subtitle={form && `${L.classes.get(classId)?.name} · ${DAYS[form.day]} · Jam ${form.period}`}
        footer={<>
          {form?.id && <Button variant="danger" icon={Trash2} onClick={async () => { if (await mutate('DELETE', `/api/schedule/${form.id}`, undefined, 'Slot dihapus.')) setForm(null); }}>Hapus</Button>}
          {form?.id && <Button icon={CalendarX} onClick={() => { const e = db.schedule.find((x) => x.id === form.id)!; setForm(null); setExc(e); }}>Catat Pengecualian</Button>}
          <Button icon={ShieldCheck} onClick={() => validate(true)}>Validasi Bentrok (Dry-Run)</Button>
          <Button variant="primary" onClick={() => validate(false)}>Simpan</Button>
        </>}>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hari"><Select value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</Select></Field>
              <Field label="Jam"><Select value={form.period} onChange={(e) => setForm({ ...form, period: Number(e.target.value) })}>{db.bellPeriods.map((b) => <option key={b.id} value={b.order}>Jam {b.order} ({b.start})</option>)}</Select></Field>
            </div>
            <Field label="Mata Pelajaran"><Select value={form.subjectId} onChange={(e) => { const a = offerings.find((x) => x.subjectId === e.target.value); setForm({ ...form, subjectId: e.target.value, teacherId: a?.teacherId || form.teacherId }); }}>{offerings.map((a) => <option key={a.subjectId} value={a.subjectId}>{L.subjects.get(a.subjectId)?.name}</option>)}</Select></Field>
            <Field label="Guru"><Select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>{db.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Ruang"><Select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>{db.rooms.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</Select></Field>
            {conflict && conflict.map((c, i) => <Alert key={i} tone="bad" title={<Mono>{c.code}</Mono>}>{c.message} Penyimpanan diblokir.</Alert>)}
            {checked && !conflict && <Alert tone="ok" title="Tidak ada bentrok">Guru dan ruang tersedia pada slot ini.</Alert>}
          </div>
        )}
      </Drawer>

      <Drawer open={!!exc} onClose={() => setExc(null)} title="Pengecualian / Guru Pengganti" subtitle={exc && `${L.subjects.get(exc.subjectId)?.name} · ${L.classes.get(exc.classId)?.name} · ${DAYS[exc.day]} Jam ${exc.period}`}
        footer={<>
          {exc?.exception && <Button onClick={async () => { if (await mutate('POST', `/api/schedule/${exc!.id}/exception`, { type: null }, 'Pengecualian dihapus.')) setExc(null); }}>Hapus Pengecualian</Button>}
          <Button variant="primary" onClick={async () => { if (await mutate('POST', `/api/schedule/${exc!.id}/exception`, excForm, 'Pengecualian jadwal dicatat.')) setExc(null); }}>Simpan</Button>
        </>}>
        <div className="space-y-4">
          <Field label="Jenis"><Select value={excForm.type} onChange={(e) => setExcForm({ ...excForm, type: e.target.value })}><option value="SUBSTITUTED">SUBSTITUTED — Guru pengganti</option><option value="CANCELLED">CANCELLED — Dibatalkan</option></Select></Field>
          <Field label="Tanggal"><Input type="date" value={excForm.date} onChange={(e) => setExcForm({ ...excForm, date: e.target.value })} /></Field>
          {excForm.type === 'SUBSTITUTED' && <Field label="Guru Pengganti"><Select value={excForm.substituteTeacherId} onChange={(e) => setExcForm({ ...excForm, substituteTeacherId: e.target.value })}><option value="">Pilih...</option>{db.teachers.filter((t) => t.id !== exc?.teacherId && t.status === 'ACTIVE').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
          <Field label="Catatan"><Textarea value={excForm.note} onChange={(e) => setExcForm({ ...excForm, note: e.target.value })} /></Field>
        </div>
      </Drawer>
    </div>
  );
}
