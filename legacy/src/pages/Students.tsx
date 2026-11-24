import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ArrowRightLeft, ChevronRight, CreditCard, Download, FileUp, Printer, UserPlus } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { ActionBar, Avatar, Badge, Button, Card, Checkbox, Drawer, EmptyState, Field, Input, KV, MobileRow, Modal, Mono, PageHeader, Pager, SearchInput, Select, StatusPill, Table, Tabs, Td, Th, Tr, usePaged } from '../components/ui';
import { DigitalIdCard, Photo3x4 } from '../components/StudentCard';
import { downloadText, fmtDate, majorLabel, SCHOLARSHIP_LABEL, SCHOOL_TODAY, toCsv, usd } from '../lib/format';
import type { Student } from '../lib/types';
import type { StoredFile } from '../lib/files';
import { FileField } from '../components/FileField';

type TabId = 'active' | 'bolseiru' | 'chefe' | 'archive';

export function useStudentStats(s: Student | null) {
  const db = useDB();
  return useMemo(() => {
    if (!s) return null;
    const sess = db.attendanceSessions.filter((a) => a.classId === s.classId && a.records[s.id]);
    const counts = { PRESENT: 0, SICK: 0, PERMITTED: 0, ABSENT: 0, LATE: 0 } as Record<string, number>;
    sess.forEach((a) => counts[a.records[s.id].status]++);
    const total = sess.length;
    const inv = db.invoices.filter((i) => i.studentId === s.id && i.status !== 'VOID');
    const balance = inv.reduce((t, i) => t + (i.total - i.paid), 0);
    return { counts, total, rate: total ? ((counts.PRESENT + counts.LATE) / total) * 100 : 0, balance, invoices: inv };
  }, [db, s]);
}

function AddStudentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDB();
  const mutate = useMutation();
  const [f, setF] = useState({ name: '', gender: 'F', birthDate: '', birthPlace: '', classId: db.classes[0].id, guardianName: '', guardianPhone: '', nationalNo: '' });
  return (
    <Modal open={open} onClose={onClose} title="Tambah Siswa" footer={<><Button onClick={onClose}>Batal</Button><Button variant="primary" disabled={!f.name} onClick={async () => { if (await mutate('POST', '/api/students', f, 'Siswa ditambahkan.')) onClose(); }}>Simpan</Button></>}>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Nama Lengkap" required className="md:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Jenis Kelamin"><Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="F">Perempuan</option><option value="M">Laki-laki</option></Select></Field>
        <Field label="Rombel"><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Tempat Lahir"><Input value={f.birthPlace} onChange={(e) => setF({ ...f, birthPlace: e.target.value })} /></Field>
        <Field label="Tanggal Lahir"><Input type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} /></Field>
        <Field label="No. EMIS Nasional"><Input mono value={f.nationalNo} onChange={(e) => setF({ ...f, nationalNo: e.target.value })} placeholder="EMIS-TL-..." /></Field>
        <Field label="Nama Wali"><Input value={f.guardianName} onChange={(e) => setF({ ...f, guardianName: e.target.value })} /></Field>
        <Field label="No. HP Wali"><Input value={f.guardianPhone} onChange={(e) => setF({ ...f, guardianPhone: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function TransferModal({ student, open, onClose }: { student: Student | null; open: boolean; onClose: () => void }) {
  const db = useDB();
  const mutate = useMutation();
  const [f, setF] = useState<{ type: string; toClassId: string; effectiveDate: string; reason: string; document: StoredFile | null }>({ type: 'INTERNAL_CLASS', toClassId: '', effectiveDate: SCHOOL_TODAY, reason: '', document: null });
  if (!student) return null;
  const options = db.classes.filter((c) => c.grade === student.grade && c.id !== student.classId && (f.type === 'INTERNAL_CLASS' ? c.major === student.major : f.type === 'INTERNAL_MAJOR' ? c.major !== student.major : false));
  return (
    <Modal open={open} onClose={onClose} title="Mutasi / Transfer Internal"
      footer={<><Button onClick={onClose}>Batal</Button><Button variant="dark" disabled={!f.reason || !f.effectiveDate || (f.type !== 'OUT' && !f.toClassId)} onClick={async () => { if (await mutate('POST', `/api/students/${student.id}/transfer`, f, 'Mutasi siswa tercatat.')) onClose(); }}>Simpan Mutasi</Button></>}>
      <div className="text-sm mb-4"><b>{student.name}</b> · <Mono>{student.studentNo}</Mono> · {db.classes.find((c) => c.id === student.classId)?.name}</div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Jenis Mutasi" className="md:col-span-2">
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, toClassId: '' })}>
            <option value="INTERNAL_CLASS">INTERNAL_CLASS — Pindah rombel (jurusan sama)</option>
            <option value="INTERNAL_MAJOR">INTERNAL_MAJOR — Pindah jurusan (CT ↔ CSH)</option>
            <option value="OUT">OUT — Keluar / pindah sekolah</option>
          </Select>
        </Field>
        {f.type !== 'OUT' && <Field label="Rombel Tujuan" required><Select value={f.toClassId} onChange={(e) => setF({ ...f, toClassId: e.target.value })}><option value="">Pilih...</option>{options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
        <Field label="Tanggal Efektif" required><Input type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} /></Field>
        <Field label="Alasan Mutasi" required className="md:col-span-2"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <Field label="Unggah Surat Pendukung" className="md:col-span-2"><FileField value={f.document} onChange={(d) => setF({ ...f, document: d })} category="transfer-letter" /></Field>
      </div>
    </Modal>
  );
}

function Inspector({ s, onClose }: { s: Student | null; onClose: () => void }) {
  const L = useLookups();
  const { can } = useAuth();
  const stats = useStudentStats(s);
  const nav = useNavigate();
  const [card, setCard] = useState(false);
  const [transfer, setTransfer] = useState(false);
  if (!s) return null;
  const cls = L.classes.get(s.classId);
  const g = s.guardianId ? L.guardians.get(s.guardianId) : null;
  return (
    <>
      <Drawer open onClose={onClose} title={s.name} subtitle={<Mono>{s.studentNo}</Mono>}
        footer={<><Button icon={Printer} onClick={() => setCard(true)}>Cetak Kartu</Button>{can('student.change_status') && <Button icon={ArrowRightLeft} onClick={() => setTransfer(true)}>Pindah Kelas</Button>}<Button variant="primary" onClick={() => nav(`/students/${s.id}`)}>Buka Profil 360</Button></>}>
        <div className="flex gap-4">
          <Photo3x4 name={s.name} w={72} bg={s.gender === 'F' ? 'red' : 'blue'} />
          <div className="text-sm space-y-1">
            <div><StatusPill status={s.status} /></div>
            <div>{cls?.name} · {majorLabel(s.major)}</div>
            <div className="text-ink2">Wali Kelas: {L.teachers.get(cls?.homeroomTeacherId || '')?.name}</div>
            {s.scholarship && <Badge tone="info">Bolsa {SCHOLARSHIP_LABEL[s.scholarship]}</Badge>}
          </div>
        </div>
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-2">Kehadiran Trimestre Berjalan</div>
          <div className="grid grid-cols-5 border border-line rounded-md divide-x divide-line text-center">
            {(['PRESENT', 'SICK', 'PERMITTED', 'ABSENT', 'LATE'] as const).map((k, i) => (
              <div key={k} className="py-2"><Mono className="text-base font-semibold">{stats?.counts[k]}</Mono><div className="text-[10px] text-ink2">{['Hadir', 'Sakit', 'Izin', 'Alpa', 'Telat'][i]}</div></div>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <KV k="EMIS Nasional" v={s.nationalNo} mono />
          <KV k="Tanggal Lahir" v={`${s.birthPlace}, ${fmtDate(s.birthDate)}`} />
          <KV k="Wali Utama" v={g ? <>{g.name}<div className="text-xs text-ink2 font-mono">{g.phone}</div></> : '—'} />
          {can('finance.view') && <KV k="Saldo SPP" v={<span className={stats!.balance > 0 ? 'text-bad' : 'text-ok'}>{stats!.balance > 0 ? usd(stats!.balance) : 'Lunas'}</span>} mono />}
        </div>
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-2">Kartu Pelajar Digital</div>
          <DigitalIdCard student={s} cls={cls} />
        </div>
      </Drawer>
      <Modal open={card} onClose={() => setCard(false)} title="Cetak Kartu Pelajar" footer={<Button variant="primary" icon={Printer} onClick={() => window.print()}>Cetak</Button>}>
        <div className="print-area flex justify-center py-4"><DigitalIdCard student={s} cls={cls} /></div>
      </Modal>
      <TransferModal student={s} open={transfer} onClose={() => setTransfer(false)} />
    </>
  );
}

export default function Students() {
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'active';
  const setTab = (t: TabId) => setParams({ tab: t });
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('');
  const [major, setMajor] = useState('');
  const [classId, setClassId] = useState(params.get('class') || '');
  const [status, setStatus] = useState('');
  const [gender, setGender] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Student | null>(null);
  const [add, setAdd] = useState(false);
  const [bulkCard, setBulkCard] = useState(false);

  const rows = useMemo(() => {
    let r = db.students;
    if (tab === 'bolseiru') r = r.filter((s) => s.scholarship);
    if (tab === 'chefe') r = r.filter((s) => db.classes.some((c) => c.chefeStudentId === s.id));
    const s = q.toLowerCase();
    return r.filter((x) =>
      (!s || x.name.toLowerCase().includes(s) || x.studentNo.toLowerCase().includes(s) || x.nationalNo.toLowerCase().includes(s)) &&
      (!grade || x.grade === Number(grade)) && (!major || x.major === major) && (!classId || x.classId === classId) && (!status || x.status === status) && (!gender || x.gender === gender)
    ).sort((a, b) => a.classId.localeCompare(b.classId) || a.name.localeCompare(b.name));
  }, [db, tab, q, grade, major, classId, status, gender]);
  const pg = usePaged(rows, 25);
  const allSel = pg.slice.length > 0 && pg.slice.every((r) => sel.has(r.id));

  function exportXlsx() {
    const data = rows.map((s) => ({ 'NIS': s.studentNo, 'EMIS': s.nationalNo, 'Naran': s.name, 'Sexu': s.gender, 'Turma': L.classes.get(s.classId)?.name, 'Área': s.major, 'Status': s.status, 'Bolsa': s.scholarship || '', 'Wali': L.guardians.get(s.guardianId || '')?.name || '', 'HP Wali': L.guardians.get(s.guardianId || '')?.phone || '' }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Estudantes');
    XLSX.writeFile(wb, `Estudantes_NOSSEF_2026.xlsx`);
  }

  return (
    <div>
      <PageHeader title="Direktori Siswa Terpadu" subtitle={<><Mono>{db.students.filter((s) => s.status === 'ACTIVE').length}</Mono> siswa aktif · Tahun Ajaran 2026</>} />
      <Tabs<TabId> value={tab} onChange={setTab} tabs={[
        { id: 'active', label: 'Semua Siswa Aktif', count: db.students.length },
        { id: 'bolseiru', label: 'Penerima Beasiswa (Bolseiru)', count: db.students.filter((s) => s.scholarship).length },
        { id: 'chefe', label: 'Ketua Kelas (Chefe de Turma)', count: db.classes.length },
        { id: 'archive', label: 'Arsip Historis (2002–2026)' },
      ]} />

      {tab === 'archive' ? <Archive /> : (
        <>
          <div className="flex flex-col lg:flex-row gap-3 mb-3">
            <SearchInput value={q} onChange={setQ} placeholder="Cari nama, NIS, atau EMIS..." className="lg:w-72" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 flex-1">
              <Select value={grade} onChange={(e) => setGrade(e.target.value)} className="h-9"><option value="">Semua Tingkat</option><option value="10">Kelas X (10º)</option><option value="11">Kelas XI (11º)</option><option value="12">Kelas XII (12º)</option></Select>
              <Select value={major} onChange={(e) => setMajor(e.target.value)} className="h-9"><option value="">Semua Jurusan</option><option value="CT">IPA / CT</option><option value="CSH">IPS / CSH</option></Select>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9"><option value="">Semua Rombel</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9"><option value="">Semua Status</option><option>ACTIVE</option><option>LISENSA</option><option>TRANSFERRED</option></Select>
              <Select value={gender} onChange={(e) => setGender(e.target.value)} className="h-9"><option value="">L/P</option><option value="F">Perempuan</option><option value="M">Laki-laki</option></Select>
            </div>
          </div>
          <div className="mb-3">
            <ActionBar selectedCount={sel.size} onClear={() => setSel(new Set())} noun="siswa"
              bulk={<><Button size="sm" icon={CreditCard} onClick={() => setBulkCard(true)}>Cetak Kartu</Button><Button size="sm" icon={Download} onClick={() => downloadText('siswa_terpilih.csv', toCsv([['NIS', 'Nama', 'Rombel'], ...db.students.filter((s) => sel.has(s.id)).map((s) => [s.studentNo, s.name, L.classes.get(s.classId)?.name])]))}>Export CSV</Button></>}>
              {can('student.create') && <Button variant="primary" icon={UserPlus} onClick={() => setAdd(true)}>Tambah Siswa</Button>}
              {can('system.import') && <Link to="/reports-center?tab=imports"><Button icon={FileUp}>Import Siswa</Button></Link>}
              <Button icon={Download} onClick={exportXlsx}>Export XLSX</Button>
              <Button icon={Printer} onClick={() => window.print()}>Export PDF</Button>
            </ActionBar>
          </div>
          <div className="bg-white border border-line rounded-lg overflow-hidden print-area">
            {rows.length === 0 ? <EmptyState title="Tidak ada siswa yang cocok dengan filter." /> : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <thead><tr>
                      <Th className="w-10"><Checkbox checked={allSel} indeterminate={!allSel && pg.slice.some((r) => sel.has(r.id))} onChange={(v) => { const n = new Set(sel); pg.slice.forEach((r) => (v ? n.add(r.id) : n.delete(r.id))); setSel(n); }} /></Th>
                      <Th>NIS / EMIS</Th><Th>Nama Lengkap Siswa</Th><Th>Tingkat & Jurusan</Th><Th>Rombel Aktif</Th><Th className="hidden xl:table-cell">Wali Utama & No. HP</Th><Th>Beasiswa</Th><Th>Status</Th><Th></Th>
                    </tr></thead>
                    <tbody>
                      {pg.slice.map((s) => {
                        const g = L.guardians.get(s.guardianId || '');
                        const chefe = db.classes.find((c) => c.chefeStudentId === s.id);
                        return (
                          <Tr key={s.id} onClick={() => setOpen(s)} selected={sel.has(s.id)}>
                            <Td><Checkbox checked={sel.has(s.id)} onChange={(v) => { const n = new Set(sel); if (v) n.add(s.id); else n.delete(s.id); setSel(n); }} /></Td>
                            <Td><Mono>{s.studentNo}</Mono><div className="text-[11px] font-mono text-muted">{s.nationalNo}</div></Td>
                            <Td><div className="flex items-center gap-2.5"><Avatar name={s.name} size={28} /><span className="font-medium">{s.name}</span>{chefe && <Badge tone="dark">Chefe de Turma</Badge>}</div></Td>
                            <Td className="whitespace-nowrap">{s.grade}º · {majorLabel(s.major)}</Td>
                            <Td><Badge>{L.classes.get(s.classId)?.name}</Badge></Td>
                            <Td className="hidden xl:table-cell"><div className="text-sm">{g?.name || '—'}</div><Mono className="text-xs text-ink2">{g?.phone}</Mono></Td>
                            <Td>{s.scholarship ? <Badge tone="info">{SCHOLARSHIP_LABEL[s.scholarship]}</Badge> : <span className="text-muted text-xs">—</span>}</Td>
                            <Td><StatusPill status={s.status} /></Td>
                            <Td><ChevronRight className="w-4 h-4 text-muted" strokeWidth={1.5} /></Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
                <div className="md:hidden">
                  {pg.slice.map((s) => (
                    <MobileRow key={s.id} onClick={() => setOpen(s)} leading={<Avatar name={s.name} size={36} />} title={s.name}
                      subtitle={<><Mono className="text-[11px]">{s.studentNo}</Mono> · {L.classes.get(s.classId)?.name}</>} trailing={<StatusPill status={s.status} />} />
                  ))}
                </div>
                <Pager {...pg} />
              </>
            )}
          </div>
          {tab === 'chefe' && <ChefeTable />}
        </>
      )}
      {open && <Inspector s={open} onClose={() => setOpen(null)} />}
      <AddStudentModal open={add} onClose={() => setAdd(false)} />
      <Modal open={bulkCard} onClose={() => setBulkCard(false)} title={`Cetak ${sel.size} Kartu Pelajar`} size="xl" footer={<Button variant="primary" icon={Printer} onClick={() => window.print()}>Cetak</Button>}>
        <div className="print-area grid md:grid-cols-2 gap-4">{db.students.filter((s) => sel.has(s.id)).map((s) => <DigitalIdCard key={s.id} student={s} cls={L.classes.get(s.classId)} />)}</div>
      </Modal>
    </div>
  );
}

function ChefeTable() {
  const db = useDB();
  const L = useLookups();
  const mutate = useMutation();
  const { can } = useAuth();
  return (
    <Card title="Penetapan Ketua Kelas (Chefe de Turma)" pad={false} className="mt-5">
      <Table>
        <thead><tr><Th>Rombel</Th><Th>Profesor da Turma</Th><Th>Chefe de Turma</Th><Th>Ganti</Th></tr></thead>
        <tbody>
          {db.classes.map((c) => (
            <Tr key={c.id}>
              <Td className="font-medium">{c.name}</Td>
              <Td>{L.teachers.get(c.homeroomTeacherId)?.name}</Td>
              <Td>{L.students.get(c.chefeStudentId || '')?.name || '—'}</Td>
              <Td>
                <Select disabled={!can('academic.manage_class') && !can('student.update')} className="h-8 max-w-xs" value={c.chefeStudentId || ''} onChange={(e) => mutate('PATCH', `/api/c/classes/${c.id}`, { chefeStudentId: e.target.value }, 'Chefe de Turma diperbarui.')}>
                  {db.students.filter((s) => s.classId === c.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function Archive() {
  const db = useDB();
  const [q, setQ] = useState('');
  const alumni = db.alumni.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || String(a.gradYear).includes(q)).sort((a, b) => b.gradYear - a.gradYear);
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card title="Dadus Estudante NOSSEF 2002–2026 (per Angkatan)" pad={false}>
        <div className="max-h-[560px] overflow-y-auto scroll-thin">
          <Table>
            <thead><tr><Th>Tahun</Th><Th align="right">Siswa</Th><Th align="right">L</Th><Th align="right">P</Th><Th align="right">Lulusan</Th><Th align="right">CT/CSH</Th><Th align="right">% Lulus</Th></tr></thead>
            <tbody>
              {[...db.archive].reverse().map((a) => (
                <Tr key={a.year}><Td mono className="font-semibold">{a.year}</Td><Td align="right" mono>{a.enrolled}</Td><Td align="right" mono>{a.male}</Td><Td align="right" mono>{a.female}</Td><Td align="right" mono>{a.graduates || '—'}</Td><Td align="right" mono>{a.graduates ? `${a.ctGrad}/${a.cshGrad}` : '—'}</Td><Td align="right" mono>{a.passRate ? `${a.passRate.toFixed(1)}%` : '—'}</Td></Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
      <Card title="Rekaman Alumni" pad={false} actions={<SearchInput value={q} onChange={setQ} placeholder="Nama / tahun" className="w-44" />}>
        <div className="max-h-[560px] overflow-y-auto scroll-thin">
          <Table>
            <thead><tr><Th>NIS</Th><Th>Nama</Th><Th>Lulus</Th><Th>Área</Th><Th align="right">Média</Th><Th>Destinasi</Th></tr></thead>
            <tbody>{alumni.map((a) => <Tr key={a.id}><Td mono>{a.studentNo}</Td><Td>{a.name}</Td><Td mono>{a.gradYear}</Td><Td>{a.major}</Td><Td align="right" mono>{a.finalAvg.toFixed(2)}</Td><Td className="text-ink2 text-xs">{a.destination}</Td></Tr>)}</tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
