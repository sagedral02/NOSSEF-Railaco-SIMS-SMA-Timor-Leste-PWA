import { useState } from 'react';
import { Award, ClipboardCheck, Plus, Printer } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation, useToast } from '../context/AppContexts';
import { Badge, Button, Card, Field, Modal, Mono, PageHeader, ProgressBar, SearchInput, Select, StatusPill, Table, Tabs, Td, Th, Tr } from '../components/ui';
import { fmtDate, SCHOOL_TODAY } from '../lib/format';

const UNITS = [
  { id: 'ALL', label: 'Semua Unit' },
  { id: 'KORENOSSEF', label: 'KORENOSSEF (Dewan Kepemimpinan Siswa)' },
  { id: 'PASTORAL', label: 'Ekipa Pastoral Eskolár' },
  { id: 'DRUMBAND', label: 'Ekipa Drum Band / Fanfarra' },
  { id: 'OTHER', label: 'Olahraga & Klub Akademik' },
] as const;
const ROLES: Record<string, string[]> = {
  KORENOSSEF: ['Presidente KORENOSSEF', 'Vise-Presidente', 'Sekretáriu', 'Tesoureiru', 'Divizaun Liturjia', 'Divizaun Desportu', 'Divizaun Kultura', 'Membru'],
  PASTORAL: ['Divizaun Liturjia', 'Koru Múzika Sakra', 'Acólitos', 'Leitór', 'Karitas & Asaun Sosiál', 'Retiru Espirituál'],
  DRUMBAND: ['Naipe Snare Drum', 'Naipe Bass Drum', 'Naipe Perkusaun', 'Liras & Sinos', 'Trompete Fanfarra', 'Mayorette', 'Pasukan Pengibar Bandeira', 'Maestro / Mayor'],
  OTHER: ['Membru', 'Kapitaun Ekipa', 'Koordenadór'],
};

export default function Extracurricular() {
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const { toast } = useToast();
  const mutate = useMutation();
  const [unit, setUnit] = useState<(typeof UNITS)[number]['id']>('ALL');
  const acts = db.activities.filter((a) => unit === 'ALL' || a.unit === unit);
  const [actId, setActId] = useState(db.activities[0].id);
  const act = acts.find((a) => a.id === actId) || acts[0];
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const [att, setAtt] = useState(false);
  const [cert, setCert] = useState<string | null>(null);
  const [nm, setNm] = useState({ studentId: '', role: '' });
  const [present, setPresent] = useState<Set<string>>(new Set());
  const members = db.memberships.filter((m) => m.activityId === act.id && (!q || L.students.get(m.studentId)?.name.toLowerCase().includes(q.toLowerCase())));
  const activeCount = db.memberships.filter((m) => m.activityId === act.id && m.status === 'ACTIVE').length;
  const manage = can('extracurricular.manage');
  return (
    <div>
      <PageHeader title="Organisasi Khas NOSSEF & Ekstrakurikuler" subtitle="KORENOSSEF · Ekipa Pastoral Eskolár · Ekipa Drum Band / Fanfarra" />
      <Tabs value={unit} onChange={(u) => { setUnit(u); const first = db.activities.find((a) => u === 'ALL' || a.unit === u); if (first) setActId(first.id); }} tabs={UNITS.map((u) => ({ id: u.id, label: u.label }))} />
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
        {acts.map((a) => (
          <button key={a.id} onClick={() => setActId(a.id)} className={`shrink-0 text-left border rounded-lg px-4 py-3 min-w-[220px] ${a.id === act.id ? 'border-accent bg-selected' : 'border-line bg-white hover:bg-hover'}`}>
            <div className="text-sm font-semibold">{a.name}</div>
            <div className="text-xs text-ink2 mt-0.5"><Mono>{db.memberships.filter((m) => m.activityId === a.id && m.status === 'ACTIVE').length}/{a.capacity}</Mono> anggota aktif</div>
          </button>
        ))}
      </div>
      <Card className="mb-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <div className="font-display text-lg font-semibold">{act.name}</div>
            <div className="text-sm text-ink2 mt-0.5">Guru Pembina: <span className="text-ink">{L.teachers.get(act.advisorTeacherId)?.name}</span> · Jadwal: {act.schedule}{act.generation && <> · {act.generation}</>}</div>
            <div className="flex items-center gap-3 mt-3 max-w-sm"><ProgressBar value={(activeCount / act.capacity) * 100} tone={activeCount >= act.capacity ? 'bad' : 'accent'} /><Mono className="text-xs whitespace-nowrap">{activeCount} / {act.capacity} Anggota Aktif</Mono></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {manage && <Button variant="primary" icon={Plus} onClick={() => { setNm({ studentId: '', role: (ROLES[act.unit] || ROLES.OTHER)[0] }); setAdd(true); }}>Daftarkan Siswa</Button>}
            {manage && <Button icon={ClipboardCheck} onClick={() => { setPresent(new Set(members.filter((m) => m.status === 'ACTIVE').map((m) => m.studentId))); setAtt(true); }}>Catat Presensi Kegiatan</Button>}
            <Button icon={Award} onClick={() => setCert(members.find((m) => m.status === 'ACTIVE')?.studentId || null)}>Cetak Sertifikat {act.unit === 'KORENOSSEF' ? 'Kepemimpinan' : ''}</Button>
          </div>
        </div>
      </Card>
      <div className="flex mb-3"><SearchInput value={q} onChange={setQ} placeholder="Cari anggota" className="w-72" /></div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <Table>
          <thead><tr><Th>NIS</Th><Th>Nama Siswa</Th><Th>Kelas/Jurusan</Th><Th>Divisi / Peran</Th><Th>Tanggal Bergabung</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {members.map((m) => { const s = L.students.get(m.studentId); return (
              <Tr key={m.id}>
                <Td mono>{s?.studentNo}</Td><Td className="font-medium">{s?.name}</Td><Td>{L.classes.get(s?.classId || '')?.name}</Td>
                <Td>{m.role.startsWith('Presidente') || m.role.startsWith('Maestro') ? <Badge tone="dark">{m.role}</Badge> : m.role}</Td>
                <Td>{fmtDate(m.joinedAt)}</Td>
                <Td>{manage ? <Select className="h-8 w-32" value={m.status} onChange={(e) => mutate('PATCH', `/api/c/memberships/${m.id}`, { status: e.target.value }, 'Status keanggotaan diperbarui.')}>{['ACTIVE', 'COMPLETED', 'WITHDRAWN'].map((x) => <option key={x}>{x}</option>)}</Select> : <StatusPill status={m.status} />}</Td>
                <Td><button className="text-xs text-accent" onClick={() => setCert(m.studentId)}>Sertifikat</button></Td>
              </Tr>); })}
          </tbody>
        </Table>
      </div>
      <Modal open={add} onClose={() => setAdd(false)} title="Daftarkan Siswa" footer={<><Button onClick={() => setAdd(false)}>Batal</Button><Button variant="primary" disabled={!nm.studentId} onClick={async () => { if (await mutate('POST', '/api/c/memberships', { activityId: act.id, studentId: nm.studentId, role: nm.role, joinedAt: SCHOOL_TODAY, status: 'ACTIVE' }, 'Anggota ditambahkan.')) setAdd(false); }}>Daftarkan</Button></>}>
        <div className="space-y-4">
          <Field label="Siswa"><Select value={nm.studentId} onChange={(e) => setNm({ ...nm, studentId: e.target.value })}><option value="">Pilih siswa...</option>{db.students.filter((s) => !db.memberships.some((m) => m.activityId === act.id && m.studentId === s.id && m.status === 'ACTIVE')).map((s) => <option key={s.id} value={s.id}>{s.name} — {L.classes.get(s.classId)?.name}</option>)}</Select></Field>
          <Field label="Divisi / Peran"><Select value={nm.role} onChange={(e) => setNm({ ...nm, role: e.target.value })}>{(ROLES[act.unit] || ROLES.OTHER).map((r) => <option key={r}>{r}</option>)}</Select></Field>
        </div>
      </Modal>
      <Modal open={att} onClose={() => setAtt(false)} title={`Presensi Kegiatan — ${fmtDate(SCHOOL_TODAY)}`} footer={<><Button onClick={() => setAtt(false)}>Batal</Button><Button variant="primary" onClick={() => { toast(`Presensi kegiatan tersimpan: ${present.size} hadir.`); setAtt(false); }}>Simpan Presensi</Button></>}>
        <div className="border border-line rounded-md max-h-[50vh] overflow-y-auto scroll-thin">
          {members.filter((m) => m.status === 'ACTIVE').map((m) => (
            <label key={m.id} className="flex items-center gap-3 px-3 h-11 border-b border-line last:border-0 cursor-pointer">
              <input type="checkbox" className="accent-[#0061FE] w-4 h-4" checked={present.has(m.studentId)} onChange={(e) => { const n = new Set(present); if (e.target.checked) n.add(m.studentId); else n.delete(m.studentId); setPresent(n); }} />
              <span className="flex-1 text-sm">{L.students.get(m.studentId)?.name}</span><span className="text-xs text-ink2">{m.role}</span>
            </label>
          ))}
        </div>
      </Modal>
      <Modal open={!!cert} onClose={() => setCert(null)} title="Sertifikat" size="lg" footer={<Button variant="primary" icon={Printer} onClick={() => window.print()}>Cetak</Button>}>
        {cert && (() => { const s = L.students.get(cert)!; const m = db.memberships.find((x) => x.studentId === cert && x.activityId === act.id); return (
          <div className="print-area border-[6px] border-double border-ink p-10 text-center bg-white">
            <img src="/crest.svg" width={48} height={48} alt="" className="mx-auto" />
            <div className="text-xs tracking-[0.3em] uppercase text-ink2 mt-3">Escola Secundária Católica NOSSEF Railaco</div>
            <div className="font-display text-3xl font-semibold mt-4">SERTIFIKADU</div>
            <div className="text-sm text-ink2 mt-1">{act.unit === 'KORENOSSEF' ? 'Lideransa Estudante' : 'Partisipasaun'}</div>
            <div className="text-sm mt-6">Fó ba</div>
            <div className="font-display text-2xl font-semibold mt-1">{s.name}</div>
            <div className="text-sm text-ink2 mt-1"><Mono>{s.studentNo}</Mono> · {L.classes.get(s.classId)?.name}</div>
            <div className="text-sm mt-5 max-w-md mx-auto">tanba nia dedikasaun hanesan <b>{m?.role || 'Membru'}</b> iha <b>{act.name}</b> durante Tinan Akadémiku 2026.</div>
            <div className="flex justify-between mt-12 text-xs">
              <div className="w-44 border-t border-ink pt-1">{L.teachers.get(act.advisorTeacherId)?.name}<br />Guru Pembina</div>
              <div className="w-44 border-t border-ink pt-1">Prof. Dra. Cristina Amaral<br />Diretora Geral</div>
            </div>
          </div>
        ); })()}
      </Modal>
    </div>
  );
}
