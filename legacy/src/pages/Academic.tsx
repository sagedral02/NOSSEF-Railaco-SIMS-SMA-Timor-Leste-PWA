import { useState } from 'react';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { Badge, Button, Card, cx, Field, Input, Modal, Mono, PageHeader, Select, StatusPill, Table, Tabs, Td, Th, Tr } from '../components/ui';
import { fmtDate } from '../lib/format';

type T = 'years' | 'subjects' | 'classes' | 'assignments' | 'bells' | 'curriculum';

function CurriculumDiagram() {
  const db = useDB();
  const common = db.subjects.filter((s) => s.majors.length === 2);
  const ct = db.subjects.filter((s) => s.majors.length === 1 && s.majors[0] === 'CT');
  const csh = db.subjects.filter((s) => s.majors.length === 1 && s.majors[0] === 'CSH');
  const Box = ({ code, name, w }: { code: string; name: string; w: number }) => (
    <div className="flex items-center gap-2 border border-line rounded-md bg-white px-2.5 py-1.5 text-xs"><Mono className="text-[10px] text-muted w-8">{code}</Mono><span className="flex-1 truncate">{name}</span><Mono className="text-[10px] text-ink2">{w}j</Mono></div>
  );
  return (
    <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink2">Komponen Jerál (CT & CSH)</div>
        {common.map((s) => <Box key={s.id} code={s.code} name={s.name} w={s.weeklyPeriods} />)}
      </div>
      <svg width="60" height="220" className="hidden md:block self-center text-line-strong"><path d="M0 110 H30 M30 40 V180 M30 40 H60 M30 180 H60" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
      <div className="space-y-4">
        <div className="border border-line rounded-lg p-3 bg-canvas">
          <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold">Ciências e Tecnologias (CT / IPA)</span><Badge>10º–12º</Badge></div>
          <div className="space-y-1.5">{ct.map((s) => <Box key={s.id} code={s.code} name={s.name} w={s.weeklyPeriods} />)}</div>
        </div>
        <div className="border border-line rounded-lg p-3 bg-canvas">
          <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold">Ciências Sociais e Humanidades (CSH / IPS)</span><Badge>10º–12º</Badge></div>
          <div className="space-y-1.5">{csh.map((s) => <Box key={s.id} code={s.code} name={s.name} w={s.weeklyPeriods} />)}</div>
        </div>
      </div>
    </div>
  );
}

export default function Academic() {
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const mutate = useMutation();
  const [tab, setTab] = useState<T>('years');
  const [addSub, setAddSub] = useState(false);
  const [ns, setNs] = useState({ code: '', name: '', majors: ['CT', 'CSH'], weeklyPeriods: 2 });
  const [assignClass, setAssignClass] = useState(db.classes[0].id);
  const year = db.academicYears.find((y) => y.status === 'ACTIVE')!;
  const checks = [
    ['3 Trimestre valid & berurutan', db.trimesters.length === 3],
    ['CAU 1–3 terpetakan ke Trimestre 1–3', db.trimesters.every((t) => t.cau === t.number)],
    ['Kelas X / XI / XII tersedia', [10, 11, 12].every((g) => db.classes.some((c) => c.grade === g))],
    ['Jurusan IPA (CT) & IPS (CSH) tersedia', ['CT', 'CSH'].every((m) => db.classes.some((c) => c.major === m))],
    ['Jam pelajaran (Bell Periods) terisi', db.bellPeriods.length >= 6],
    ['Setiap rombel memiliki Profesor da Turma', db.classes.every((c) => c.homeroomTeacherId)],
    ['Penugasan mengajar lengkap', db.classes.every((c) => db.subjects.filter((s) => s.majors.includes(c.major)).every((s) => db.teachingAssignments.some((a) => a.classId === c.id && a.subjectId === s.id)))],
  ] as const;
  const canEdit = can('academic.manage_class');
  return (
    <div>
      <PageHeader title="Konfigurasi Akademik" subtitle={<>Tahun Ajaran <Mono>{year.name}</Mono> · {fmtDate(year.start)} – {fmtDate(year.end)} · <StatusPill status={year.status} /></>} />
      <Tabs<T> value={tab} onChange={setTab} tabs={[
        { id: 'years', label: 'Tahun Ajaran & 3 Trimestre' }, { id: 'curriculum', label: 'Diagram Kurikulum' }, { id: 'subjects', label: 'Mata Pelajaran (CT/CSH)', count: db.subjects.length },
        { id: 'classes', label: 'Rombel & Ruang', count: db.classes.length }, { id: 'assignments', label: 'Penugasan Mengajar' }, { id: 'bells', label: 'Jam Pelajaran' },
      ]} />
      {tab === 'years' && (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 grid md:grid-cols-3 gap-4">
            {db.trimesters.map((t) => (
              <div key={t.id} className={cx('bg-white border rounded-lg p-4', t.status === 'ACTIVE' ? 'border-accent' : 'border-line')}>
                <div className="flex items-center justify-between"><span className="font-display font-semibold">{t.number}º Trimestre</span><StatusPill status={t.status} /></div>
                <div className="mt-1 text-sm"><span className="text-ink2">Terikat ke</span> <Badge tone="dark">CAU {t.cau}</Badge></div>
                <div className="mt-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-ink2">Mulai</span><span>{fmtDate(t.start)}</span></div>
                  <div className="flex justify-between"><span className="text-ink2">Selesai</span><span>{fmtDate(t.end)}</span></div>
                  <div className="flex justify-between"><span className="text-ink2">Jendela input nilai</span><span>{fmtDate(t.gradeWindowStart).replace(' 2026', '')} – {fmtDate(t.gradeWindowEnd)}</span></div>
                </div>
                {can('academic.manage_trimester') && t.status !== 'ACTIVE' && t.status !== 'CLOSED' && <Button size="sm" className="mt-3 w-full" onClick={() => mutate('PATCH', `/api/c/trimesters/${t.id}`, { status: 'ACTIVE' }, 'Trimestre diaktifkan.')}>Aktifkan</Button>}
              </div>
            ))}
            <Card title="Riwayat Tahun Ajaran" pad={false} className="md:col-span-3">
              <Table><thead><tr><Th>Tahun</Th><Th>Mulai</Th><Th>Selesai</Th><Th>Status</Th></tr></thead>
                <tbody>{db.academicYears.map((y) => <Tr key={y.id}><Td mono className="font-semibold">{y.name}</Td><Td>{fmtDate(y.start)}</Td><Td>{fmtDate(y.end)}</Td><Td><StatusPill status={y.status} /></Td></Tr>)}</tbody></Table>
            </Card>
          </div>
          <Card title="Gate Aktivasi Tahun Ajaran">
            <div className="space-y-2.5">
              {checks.map(([label, ok]) => (
                <div key={label} className="flex items-start gap-2 text-sm">{ok ? <CheckCircle2 className="w-4 h-4 text-ok mt-0.5" strokeWidth={1.5} /> : <Circle className="w-4 h-4 text-muted mt-0.5" strokeWidth={1.5} />}<span className={ok ? 'text-ink' : 'text-ink2'}>{label}</span></div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-line text-xs text-ink2">{checks.every((c) => c[1]) ? 'Semua syarat terpenuhi — tahun ajaran siap diaktifkan.' : 'Lengkapi syarat sebelum aktivasi.'}</div>
          </Card>
        </div>
      )}
      {tab === 'curriculum' && <Card title="Peta Alur Kurikulum NOSSEF — Ensino Secundário Geral"><CurriculumDiagram /></Card>}
      {tab === 'subjects' && (
        <Card pad={false} title="Mata Pelajaran & Jam Kredit" actions={can('academic.manage_subject') && <Button size="sm" icon={Plus} onClick={() => setAddSub(true)}>Tambah</Button>}>
          <Table>
            <thead><tr><Th>Kode</Th><Th>Mata Pelajaran</Th><Th>Jurusan</Th><Th align="right">Jam/Minggu</Th><Th align="right">Guru Pengampu</Th></tr></thead>
            <tbody>{db.subjects.map((s) => <Tr key={s.id}><Td mono>{s.code}</Td><Td className="font-medium">{s.name}</Td><Td>{s.majors.map((m) => <Badge key={m} className="mr-1">{m}</Badge>)}</Td><Td align="right" mono>{s.weeklyPeriods}</Td><Td align="right" mono>{new Set(db.teachingAssignments.filter((a) => a.subjectId === s.id).map((a) => a.teacherId)).size}</Td></Tr>)}</tbody>
          </Table>
        </Card>
      )}
      {tab === 'classes' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Card title="Rombongan Belajar 2026" pad={false}>
            <Table>
              <thead><tr><Th>Rombel</Th><Th>Jurusan</Th><Th>Ruang</Th><Th align="right">Siswa</Th><Th>Profesor da Turma</Th></tr></thead>
              <tbody>{db.classes.map((c) => <Tr key={c.id}><Td className="font-medium">{c.name}</Td><Td>{c.major}</Td><Td>{canEdit ? <Select className="h-8 w-28" value={c.roomId} onChange={(e) => mutate('PATCH', `/api/c/classes/${c.id}`, { roomId: e.target.value }, 'Ruang diperbarui.')}>{db.rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</Select> : <Mono>{L.rooms.get(c.roomId)?.code}</Mono>}</Td><Td align="right" mono>{db.students.filter((s) => s.classId === c.id).length}/{L.rooms.get(c.roomId)?.capacity}</Td><Td className="text-xs">{L.teachers.get(c.homeroomTeacherId)?.name}</Td></Tr>)}</tbody>
            </Table>
          </Card>
          <Card title="Ruang Fisik (Rooms)" pad={false}>
            <Table><thead><tr><Th>Kode</Th><Th>Nama</Th><Th align="right">Kapasitas</Th></tr></thead>
              <tbody>{db.rooms.map((r) => <Tr key={r.id}><Td mono>{r.code}</Td><Td>{r.name}</Td><Td align="right" mono>{r.capacity}</Td></Tr>)}</tbody></Table>
          </Card>
        </div>
      )}
      {tab === 'assignments' && (
        <Card pad={false} title="Matriks Penugasan Mengajar (Teaching Assignment)" actions={<Select className="h-8 w-36" value={assignClass} onChange={(e) => setAssignClass(e.target.value)}>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}>
          <Table>
            <thead><tr><Th>Mata Pelajaran</Th><Th align="right">Jam/Minggu</Th><Th>Guru Pengampu</Th></tr></thead>
            <tbody>
              {db.teachingAssignments.filter((a) => a.classId === assignClass).map((a) => (
                <Tr key={a.id}>
                  <Td><Mono className="text-xs text-muted mr-2">{L.subjects.get(a.subjectId)?.code}</Mono>{L.subjects.get(a.subjectId)?.name}</Td>
                  <Td align="right" mono>{a.weeklyPeriods}</Td>
                  <Td>{canEdit ? <Select className="h-8 max-w-xs" value={a.teacherId} onChange={(e) => mutate('PATCH', `/api/c/teachingAssignments/${a.id}`, { teacherId: e.target.value }, 'Penugasan diperbarui.')}>{db.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select> : L.teachers.get(a.teacherId)?.name}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {tab === 'bells' && (
        <Card pad={false} title="Periode Bel (Bell Periods)">
          <Table><thead><tr><Th>Urutan</Th><Th>Mulai</Th><Th>Selesai</Th><Th align="right">Durasi</Th></tr></thead>
            <tbody>{db.bellPeriods.map((b) => <Tr key={b.id}><Td>Jam {b.order}</Td><Td mono>{b.start}</Td><Td mono>{b.end}</Td><Td align="right" mono>45 mnt</Td></Tr>)}</tbody></Table>
          <div className="px-4 py-3 text-xs text-ink2 border-t border-line">Intervalu: 09:45 – 10:05 · Sábadu: Jam 1–4</div>
        </Card>
      )}
      <Modal open={addSub} onClose={() => setAddSub(false)} title="Tambah Mata Pelajaran" footer={<><Button onClick={() => setAddSub(false)}>Batal</Button><Button variant="primary" disabled={!ns.code || !ns.name} onClick={async () => { if (await mutate('POST', '/api/c/subjects', { ...ns, credit: ns.weeklyPeriods }, 'Mata pelajaran ditambahkan.')) setAddSub(false); }}>Simpan</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kode"><Input mono value={ns.code} onChange={(e) => setNs({ ...ns, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Jam/Minggu"><Input mono type="number" value={ns.weeklyPeriods} onChange={(e) => setNs({ ...ns, weeklyPeriods: Number(e.target.value) })} /></Field>
          <Field label="Nama" className="col-span-2"><Input value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} /></Field>
          <Field label="Jurusan" className="col-span-2"><Select value={ns.majors.join(',')} onChange={(e) => setNs({ ...ns, majors: e.target.value.split(',') })}><option value="CT,CSH">CT & CSH</option><option value="CT">CT</option><option value="CSH">CSH</option></Select></Field>
        </div>
      </Modal>
    </div>
  );
}
