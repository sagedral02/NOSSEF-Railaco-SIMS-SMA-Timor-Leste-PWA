import { useState } from 'react';
import { MessageSquarePlus, Plus, ShieldAlert } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { api } from '../lib/api';
import { Alert, Badge, Button, Drawer, EmptyState, Field, Input, KV, Modal, Mono, PageHeader, Select, StatusPill, Table, Tabs, Td, Textarea, Th, Tr } from '../components/ui';
import { fmtDate, fmtDateTime } from '../lib/format';
import type { CounselingCase } from '../lib/types';

function CaseDrawer({ c, onClose }: { c: CounselingCase; onClose: () => void }) {
  const L = useLookups();
  const { can } = useAuth();
  const mutate = useMutation();
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('NOTE');
  const [status, setStatus] = useState(c.status);
  const s = L.students.get(c.studentId);
  return (
    <Drawer open onClose={onClose} width={480} title={<Mono>{c.caseNo}</Mono>} subtitle={`${s?.name} · ${L.classes.get(s?.classId || '')?.name}`}
      footer={can('counseling.manage') ? <Button variant="primary" icon={MessageSquarePlus} disabled={!note.trim()} onClick={async () => { if (await mutate('POST', `/api/counseling/${c.id}/followup`, { note, kind, status }, 'Catatan tindak lanjut ditambahkan.')) setNote(''); }}>Tambah Catatan</Button> : undefined}>
      <div className="flex flex-wrap gap-2 mb-4"><StatusPill status={c.status} /><StatusPill status={c.severity} /><Badge>{c.category}</Badge></div>
      <KV k="Dibuka" v={fmtDate(c.openedAt)} />
      <KV k="Konselor" v={L.staff.get(c.counselorStaffId)?.name} />
      <KV k="Pertemuan Orang Tua" v={c.guardianMeeting || '—'} />
      <div className="mt-4"><div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-1">Ringkasan</div><p className="text-sm">{c.summary}</p></div>
      {c.chronology && <div className="mt-3 border border-line rounded-md p-3 bg-canvas text-sm"><div className="text-xs font-semibold text-ink2 mb-1 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.5} />Kronologi Rahasia</div>{c.chronology}</div>}
      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-2">Linimasa Tindak Lanjut (append-only)</div>
        <ol className="relative border-l border-line ml-1.5 space-y-4">
          {c.followUps.map((f, i) => (
            <li key={i} className="pl-4 relative">
              <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-ink" />
              <div className="text-xs text-ink2">{fmtDateTime(f.at)} · {f.by} {f.kind === 'GUARDIAN_COMM' && <Badge className="ml-1">Komunikasi Wali</Badge>}</div>
              <div className="text-sm mt-0.5">{f.note}</div>
            </li>
          ))}
        </ol>
      </div>
      {can('counseling.manage') && (
        <div className="mt-5 pt-4 border-t border-line space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jenis"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="NOTE">Catatan Tindak Lanjut</option><option value="GUARDIAN_COMM">Log Komunikasi Wali</option></Select></Field>
            <Field label="Status Kasus"><Select value={status} onChange={(e) => setStatus(e.target.value)}>{['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'GUARDIAN_COMM' ? 'Ringkasan komunikasi dengan orang tua/wali...' : 'Catatan tindak lanjut...'} />
        </div>
      )}
    </Drawer>
  );
}

export default function Counseling() {
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const mutate = useMutation();
  const [tab, setTab] = useState<'cases' | 'discipline'>(can('counseling.view') || can('counseling.summary') ? 'cases' : 'discipline');
  const [open, setOpen] = useState<CounselingCase | null>(null);
  const [newCase, setNewCase] = useState(false);
  const [newInc, setNewInc] = useState(false);
  const [f, setF] = useState({ studentId: db.students[0].id, category: 'AKADÉMIKU', severity: 'MEDIUM', summary: '' });
  const [inc, setInc] = useState({ studentId: db.students[0].id, category: 'TARDINESS', severity: 'LOW', actionTaken: '', occurredAt: '2026-10-15T08:00' });
  async function openCase(c: CounselingCase) {
    if (can('counseling.view')) { try { setOpen(await api<CounselingCase>('GET', `/api/counseling/${c.id}`)); } catch { setOpen(c); } } else setOpen(c);
  }
  return (
    <div>
      <PageHeader title="Bimbingan Konseling (BK) & Kedisiplinan" />
      <div className="mb-4 bg-canvas border border-line rounded-md px-4 py-2.5 flex items-center gap-2 text-xs text-ink2">
        <ShieldAlert className="w-4 h-4 text-ink" strokeWidth={1.5} />
        <span><b className="text-ink">Akses Terbatas (Restricted):</b> Catatan konseling bersifat rahasia dan setiap pembukaan kasus dicatat dalam Audit Log (<Mono>COUNSELING_CASE_ACCESSED</Mono>).</span>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[...(can('counseling.view') || can('counseling.summary') ? [{ id: 'cases' as const, label: 'Kasus Konseling', count: db.counselingCases.length }] : []), { id: 'discipline', label: 'Insiden Kedisiplinan', count: db.disciplineIncidents.length }]} />
      {tab === 'cases' && (
        <>
          {!can('counseling.view') && <div className="mb-3"><Alert tone="warn">Sebagai Profesor da Turma Anda hanya melihat ringkasan non-sensitif.</Alert></div>}
          {can('counseling.manage') && <div className="flex justify-end mb-3"><Button variant="primary" icon={Plus} onClick={() => setNewCase(true)}>Buka Kasus Baru</Button></div>}
          <div className="bg-white border border-line rounded-lg overflow-hidden">
            {db.counselingCases.length ? (
              <Table>
                <thead><tr><Th>No. Kasus</Th><Th>Siswa & Kelas</Th><Th>Kategori</Th><Th>Urgensi</Th><Th>Konselor</Th><Th>Dibuka</Th><Th>Status</Th></tr></thead>
                <tbody>{db.counselingCases.map((c) => { const s = L.students.get(c.studentId); return (
                  <Tr key={c.id} onClick={() => openCase(c)}>
                    <Td mono>{c.caseNo}</Td><Td>{s?.name}<div className="text-xs text-ink2">{L.classes.get(s?.classId || '')?.name}</div></Td><Td>{c.category}</Td><Td><StatusPill status={c.severity} /></Td><Td className="text-xs">{L.staff.get(c.counselorStaffId)?.name}</Td><Td>{fmtDate(c.openedAt)}</Td><Td><StatusPill status={c.status} /></Td>
                  </Tr>); })}</tbody>
              </Table>
            ) : <EmptyState title="Tidak ada kasus." />}
          </div>
        </>
      )}
      {tab === 'discipline' && (
        <>
          {can('discipline.manage') && <div className="flex justify-end mb-3"><Button variant="primary" icon={Plus} onClick={() => setNewInc(true)}>Laporkan Pelanggaran</Button></div>}
          <div className="bg-white border border-line rounded-lg overflow-hidden">
            <Table>
              <thead><tr><Th>No.</Th><Th>Waktu</Th><Th>Siswa</Th><Th>Kategori</Th><Th>Tingkat</Th><Th>Tindakan</Th><Th>Pelapor</Th><Th>Status</Th></tr></thead>
              <tbody>{db.disciplineIncidents.map((d) => <Tr key={d.id}><Td mono>{d.incidentNo}</Td><Td className="text-xs whitespace-nowrap">{fmtDateTime(d.occurredAt)}</Td><Td>{L.students.get(d.studentId)?.name}</Td><Td><Mono className="text-xs">{d.category}</Mono></Td><Td><StatusPill status={d.severity} /></Td><Td className="text-xs">{d.actionTaken}</Td><Td className="text-xs text-ink2">{d.reportedBy}</Td>
                <Td>{can('discipline.manage') && d.status === 'OPEN' ? <button onClick={() => mutate('PATCH', `/api/c/disciplineIncidents/${d.id}`, { status: 'RESOLVED' }, 'Insiden diselesaikan.')}><StatusPill status="OPEN" /></button> : <StatusPill status={d.status} />}</Td></Tr>)}</tbody>
            </Table>
          </div>
        </>
      )}
      {open && <CaseDrawer key={open.id} c={(can('counseling.view') && db.counselingCases.find((x) => x.id === open.id)) || open} onClose={() => setOpen(null)} />}
      <Modal open={newCase} onClose={() => setNewCase(false)} title="Buka Kasus Konseling" footer={<><Button onClick={() => setNewCase(false)}>Batal</Button><Button variant="primary" disabled={!f.summary} onClick={async () => { if (await mutate('POST', '/api/c/counselingCases', { ...f, caseNo: `BK-2026-${String(Date.now()).slice(-4)}`, counselorStaffId: 'stf_0005', status: 'OPEN', openedAt: '2026-10-15', chronology: '', followUps: [], guardianMeeting: null }, 'Kasus dibuka.')) setNewCase(false); }}>Simpan</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Siswa" className="col-span-2"><Select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}>{db.students.map((s) => <option key={s.id} value={s.id}>{s.name} — {L.classes.get(s.classId)?.name}</option>)}</Select></Field>
          <Field label="Kategori"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['AKADÉMIKU', 'FAMÍLIA', 'SOSIÁL', 'SAÚDE MENTÁL', 'KARREIRA', 'DISIPLINA'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Urgensi"><Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Ringkasan" className="col-span-2"><Textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={newInc} onClose={() => setNewInc(false)} title="Laporkan Pelanggaran Tata Tertib" footer={<><Button onClick={() => setNewInc(false)}>Batal</Button><Button variant="primary" disabled={!inc.actionTaken} onClick={async () => { if (await mutate('POST', '/api/c/disciplineIncidents', { ...inc, occurredAt: new Date(inc.occurredAt).toISOString(), incidentNo: `DSP-2026-${String(Date.now()).slice(-4)}`, status: 'OPEN', reportedBy: 'Staf' }, 'Insiden dicatat.')) setNewInc(false); }}>Simpan</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Siswa" className="col-span-2"><Select value={inc.studentId} onChange={(e) => setInc({ ...inc, studentId: e.target.value })}>{db.students.map((s) => <option key={s.id} value={s.id}>{s.name} — {L.classes.get(s.classId)?.name}</option>)}</Select></Field>
          <Field label="Waktu"><Input type="datetime-local" value={inc.occurredAt} onChange={(e) => setInc({ ...inc, occurredAt: e.target.value })} /></Field>
          <Field label="Kategori"><Select value={inc.category} onChange={(e) => setInc({ ...inc, category: e.target.value })}>{['TARDINESS', 'UNIFORM', 'ABSENCE', 'MISCONDUCT', 'PHONE_USE'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Tingkat"><Select value={inc.severity} onChange={(e) => setInc({ ...inc, severity: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Tindakan"><Input value={inc.actionTaken} onChange={(e) => setInc({ ...inc, actionTaken: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
