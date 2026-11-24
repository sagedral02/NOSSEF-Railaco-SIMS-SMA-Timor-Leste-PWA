import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Phone, Users } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { useUploadValor } from '../components/AppShell';
import { Avatar, Badge, Button, Card, Drawer, Field, KV, Mono, PageHeader, SearchInput, Select, StatusPill, Table, Tabs, Td, Th, Tr } from '../components/ui';
import { CATEGORY_LABEL, downloadText, toCsv } from '../lib/format';
import type { Teacher } from '../lib/types';

function TeacherDrawer({ t, onClose }: { t: Teacher; onClose: () => void }) {
  const db = useDB();
  const L = useLookups();
  const assign = db.teachingAssignments.filter((a) => a.teacherId === t.id);
  const hr = db.classes.find((c) => c.homeroomTeacherId === t.id);
  return (
    <Drawer open onClose={onClose} title={t.name} subtitle={<Mono>{t.employeeNo}</Mono>} width={440}>
      <div className="flex items-center gap-3 mb-4"><Avatar name={t.name} size={48} tone="dark" /><div><Badge tone="info">{CATEGORY_LABEL[t.category]}</Badge> <StatusPill status={t.status} /></div></div>
      <KV k="Spesialisasi / Ijazah" v={t.specialization} />
      <KV k="Riwayat Pendidikan" v={t.education} />
      <KV k="SK Pengangkatan" v={t.skNo} mono />
      <KV k="Bergabung" v={t.joinedYear} mono />
      <KV k="Beban Mengajar" v={`${t.hoursPerWeek} Jam/Minggu`} mono />
      <KV k="Perwalian" v={hr ? `Profesor da Turma ${hr.name}` : '—'} />
      <KV k="Kontak" v={<>{t.phone}<div className="text-xs">{t.email}</div></>} mono />
      <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mt-5 mb-2">Penugasan Mengajar 2026</div>
      <div className="border border-line rounded-md">
        {assign.map((a) => <div key={a.id} className="flex items-center justify-between px-3 h-9 border-b border-line last:border-0 text-sm"><span>{L.subjects.get(a.subjectId)?.name}</span><span className="text-ink2">{L.classes.get(a.classId)?.name} · <Mono>{a.weeklyPeriods}j</Mono></span></div>)}
        {!assign.length && <div className="px-3 py-2 text-sm text-ink2">Tidak ada penugasan.</div>}
      </div>
    </Drawer>
  );
}

function ProfesorDaTurmaSection() {
  const db = useDB();
  const L = useLookups();
  const { can, user } = useAuth();
  const mutate = useMutation();
  const openUpload = useUploadValor();
  const tri = db.trimesters.find((x) => x.status === 'ACTIVE')!.number;
  function exportCsv() {
    downloadText('profesor_da_turma_2026.csv', toCsv([['Turma', 'Profesor da Turma', 'Kontak', 'Chefe de Turma', 'Siswa'], ...db.classes.map((c) => [c.name, L.teachers.get(c.homeroomTeacherId)?.name, L.teachers.get(c.homeroomTeacherId)?.phone, L.students.get(c.chefeStudentId || '')?.name, db.students.filter((s) => s.classId === c.id).length])]));
  }
  return (
    <>
      <div className="flex justify-end gap-2 mb-3"><Button icon={Download} onClick={exportCsv}>Export CSV</Button><Button onClick={() => window.print()}>Export PDF</Button></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 print-area">
        {db.classes.map((c) => {
          const t = L.teachers.get(c.homeroomTeacherId);
          const subs = db.termGrades.filter((x) => x.classId === c.id && x.trimester === tri);
          const fin = subs.filter((x) => x.status === 'FINALIZED').length;
          const submitted = db.pautaSubmissions.filter((p) => p.classId === c.id && p.trimester === tri).length;
          const mine = user?.profileId === c.homeroomTeacherId;
          return (
            <div key={c.id} className="bg-white border border-line rounded-lg p-5">
              <div className="flex items-start justify-between">
                <div><div className="font-display text-lg font-semibold">{c.name}</div><div className="text-xs text-ink2">{c.major === 'CT' ? 'Ciências e Tecnologias' : 'Ciências Sociais e Humanidades'}</div></div>
                <Badge><Users className="w-3 h-3" strokeWidth={1.5} /><Mono>{db.students.filter((s) => s.classId === c.id).length}</Mono></Badge>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2"><Avatar name={t?.name || ''} size={28} tone="dark" /><div><div className="font-medium">{t?.name}</div><div className="text-xs text-ink2">Titulár de Turma</div></div></div>
                <div className="flex items-center gap-2 text-ink2"><Phone className="w-3.5 h-3.5" strokeWidth={1.5} /><Mono className="text-xs">{t?.phone}</Mono></div>
                <div className="text-ink2">Chefe de Turma: <span className="text-ink">{L.students.get(c.chefeStudentId || '')?.name}</span></div>
                <div className="flex items-center gap-2"><span className="text-ink2">Nilai T{tri}:</span><Badge tone={fin === subs.length ? 'ok' : 'warn'}><Mono>{fin}/{subs.length}</Mono> final</Badge><Badge><Mono>{submitted}</Mono> pauta Excel</Badge></div>
              </div>
              {can('academic.manage_class') && (
                <Field label="Ganti Profesor da Turma" className="mt-3">
                  <Select className="h-8" value={c.homeroomTeacherId} onChange={(e) => mutate('PATCH', `/api/c/classes/${c.id}`, { homeroomTeacherId: e.target.value }, 'Profesor da Turma diperbarui.')}>
                    {db.teachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                </Field>
              )}
              <div className="flex gap-2 mt-4">
                {(mine || can('score.revise')) && <Button size="sm" variant="primary" icon={FileSpreadsheet} onClick={() => openUpload({ classId: c.id })}>Upload Valor Turma</Button>}
                <Link to={`/students?class=${c.id}`}><Button size="sm">Lihat Kelas</Button></Link>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function Staff() {
  const db = useDB();
  const L = useLookups();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'teachers' | 'homeroom' | 'staff'>('teachers');
  const [q, setQ] = useState(params.get('q') || '');
  const [cat, setCat] = useState('');
  const [st, setSt] = useState('');
  const [open, setOpen] = useState<Teacher | null>(null);
  const rows = useMemo(() => db.teachers.filter((t) => (!q || t.name.toLowerCase().includes(q.toLowerCase()) || t.employeeNo.toLowerCase().includes(q.toLowerCase())) && (!cat || t.category === cat) && (!st || t.status === st)), [db, q, cat, st]);
  return (
    <div>
      <PageHeader title="Direktori Guru, Staf & Profesor da Turma" subtitle={<><Mono>{db.teachers.length}</Mono> guru · <Mono>{db.staff.length}</Mono> staf pendukung</>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'teachers', label: 'Dewan Guru (Professores)', count: db.teachers.length }, { id: 'homeroom', label: 'Wali Kelas (Profesor da Turma)', count: db.classes.length }, { id: 'staff', label: 'Staf Administrasi & Pendukung', count: db.staff.length }]} />
      {tab === 'teachers' && (
        <>
          <div className="flex flex-col md:flex-row gap-2 mb-3">
            <SearchInput value={q} onChange={setQ} placeholder="Nama atau NIP" className="md:w-72" />
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 md:w-56"><option value="">Semua Kategori</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Select value={st} onChange={(e) => setSt(e.target.value)} className="h-9 md:w-40"><option value="">Semua Status</option><option>ACTIVE</option><option>LEAVE</option><option>INACTIVE</option></Select>
          </div>
          <div className="bg-white border border-line rounded-lg overflow-hidden">
            <Table>
              <thead><tr><Th>NIP / Employee No</Th><Th>Nama Lengkap & Gelar</Th><Th>Kategori Kepegawaian</Th><Th>Spesialisasi / Mapel</Th><Th align="right">Beban Jam/Minggu</Th><Th>Perwalian Kelas</Th><Th>Akun Portal</Th></tr></thead>
              <tbody>
                {rows.map((t) => {
                  const hr = db.classes.find((c) => c.homeroomTeacherId === t.id);
                  return (
                    <Tr key={t.id} onClick={() => setOpen(t)}>
                      <Td mono>{t.employeeNo}</Td>
                      <Td><div className="flex items-center gap-2.5"><Avatar name={t.name} size={28} /><span className="font-medium whitespace-nowrap">{t.name}</span></div></Td>
                      <Td><Badge tone={t.category === 'FUNCIONARIO' ? 'dark' : t.category === 'KONTRATADU' ? 'info' : 'neutral'}>{CATEGORY_LABEL[t.category]}</Badge></Td>
                      <Td className="text-ink2 text-xs">{t.subjectIds.map((s) => L.subjects.get(s)?.name).join(', ')}</Td>
                      <Td align="right" mono>{t.hoursPerWeek} Jam</Td>
                      <Td>{hr ? <Badge>{hr.name}</Badge> : <span className="text-muted">—</span>}</Td>
                      <Td>{t.status !== 'ACTIVE' ? <StatusPill status={t.status} /> : db.users.length && !db.users.some((u) => u.profileId === t.id) ? <StatusPill status="NONE" label="Belum ada akun" /> : <StatusPill status="ACTIVE" />}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </>
      )}
      {tab === 'homeroom' && <ProfesorDaTurmaSection />}
      {tab === 'staff' && (
        <Card pad={false}>
          <Table>
            <thead><tr><Th>No. Pegawai</Th><Th>Nama</Th><Th>Jabatan</Th><Th>Kontak</Th><Th>Status</Th></tr></thead>
            <tbody>{db.staff.map((s) => <Tr key={s.id}><Td mono>{s.employeeNo}</Td><Td className="font-medium">{s.name}</Td><Td>{s.position}</Td><Td mono>{s.phone}</Td><Td><StatusPill status={s.status} /></Td></Tr>)}</tbody>
          </Table>
        </Card>
      )}
      {open && <TeacherDrawer t={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
