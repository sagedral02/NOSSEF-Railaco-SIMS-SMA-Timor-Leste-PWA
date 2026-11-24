import { useMemo, useState } from 'react';
import { CheckCircle2, FileText, GraduationCap, Send, UserCheck, XCircle } from 'lucide-react';
import { useAuth, useDB, useMutation } from '../context/AppContexts';
import { ActionBar, Alert, Badge, Button, Checkbox, cx, Drawer, EmptyState, Field, FilterPills, Input, KV, Modal, Mono, PageHeader, ReasonDialog, SearchInput, Select, StatusPill, Table, Td, Th, Tr } from '../components/ui';
import { fmtDate, fmtDateTime, num2 } from '../lib/format';
import type { Applicant } from '../lib/types';
import { FilePreview } from '../components/FileField';

const STATUSES = ['ALL', 'DRAFT', 'SUBMITTED', 'VERIFIED', 'ACCEPTED', 'WAITING_LIST', 'REJECTED', 'RE_REGISTERED', 'ENROLLED'] as const;

function DocPreview({ d, name }: { d: Applicant['documents'][number]; name: string }) {
  if (d.fileId) return <FilePreview id={d.fileId} name={d.fileName} height={480} />;
  return (
    <div className="aspect-[1/1.3] w-full border border-line rounded-md bg-white p-4 flex flex-col text-[10px] text-ink2">
      <div className="text-center font-semibold text-ink text-[11px] border-b border-line pb-2">{d.type === 'PHOTO' ? 'PASFOTO 3x4' : d.type === 'BIRTH' ? 'SERTIDAUN MORIS / BATIZMU' : 'SERTIFIKADU ENSINO PRE-SEKUNDÁRIU'}</div>
      {d.type === 'PHOTO' ? (
        <div className="flex-1 flex items-center justify-center"><div className="w-24 h-32 bg-[#B3261E] rounded-sm" /></div>
      ) : (
        <div className="flex-1 space-y-1.5 pt-3">
          <div>Naran: <b className="text-ink">{name}</b></div>
          {Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-1.5 rounded bg-line" style={{ width: `${55 + ((i * 23) % 40)}%` }} />)}
          <div className="pt-4 flex justify-end"><div className="w-16 h-16 rounded-full border-2 border-line-strong/60" /></div>
        </div>
      )}
      <div className="flex justify-between pt-2 border-t border-line font-mono"><span>{d.fileName || '—'}</span><span>{d.sizeKb} KB</span></div>
      <div className="text-center text-[10px] text-muted pt-1">Data contoh (seed) — pendaftar ini tidak mengunggah file asli.</div>
    </div>
  );
}

function Workspace({ a, onClose }: { a: Applicant; onClose: () => void }) {
  const { can } = useAuth();
  const mutate = useMutation();
  const [docs, setDocs] = useState(a.documents);
  const [score, setScore] = useState(a.testScore == null ? '' : String(a.testScore));
  const [docIdx, setDocIdx] = useState(0);
  const [reject, setReject] = useState(false);
  const dirty = JSON.stringify(docs) !== JSON.stringify(a.documents) || score !== (a.testScore == null ? '' : String(a.testScore));
  const allValid = docs.every((d) => d.status === 'VALID');
  const act = (action: string, note?: string) => mutate('POST', `/api/admissions/${a.id}/transition`, { action, note }, `Status pendaftar diperbarui.`);
  return (
    <Drawer open onClose={onClose} width={720} title={a.name} subtitle={<><Mono>{a.regNo}</Mono> · {a.origin} · Minat {a.majorPref === 'CT' ? 'IPA / CT' : 'IPS / CSH'}</>}
      footer={<>
        {dirty && <Button onClick={() => mutate('POST', `/api/admissions/${a.id}/transition`, { action: 'update', documents: docs, testScore: score }, 'Verifikasi dokumen & skor tersimpan.')}>Simpan Verifikasi</Button>}
        {a.status === 'SUBMITTED' && can('admission.verify') && <Button variant="primary" icon={CheckCircle2} disabled={!allValid || dirty} onClick={() => act('verify')}>Verifikasi Berkas</Button>}
        {['VERIFIED', 'WAITING_LIST'].includes(a.status) && can('admission.decide') && (
          <>
            {a.status === 'VERIFIED' && <Button variant="danger" icon={XCircle} onClick={() => setReject(true)}>Tolak</Button>}
            {a.status === 'VERIFIED' && <Button onClick={() => act('waitlist')}>Cadangan</Button>}
            <Button variant="primary" icon={UserCheck} onClick={() => act('accept')}>Terima</Button>
          </>
        )}
        {a.status === 'ACCEPTED' && can('admission.enroll') && <Button variant="primary" onClick={() => act('reregister')}>Konfirmasi Daftar Ulang</Button>}
        {a.status === 'RE_REGISTERED' && <span className="text-xs text-ink2 self-center">Gunakan "Batch Kirim ke Kelas 10" untuk konversi menjadi siswa aktif (atomic enroll).</span>}
      </>}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <StatusPill status={a.status} />
        {a.rank && <Badge mono>Rank #{a.rank}</Badge>}
        <span className="text-xs text-ink2">Dikirim {fmtDateTime(a.submittedAt)}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <div className="flex gap-1 mb-2">{docs.map((d, i) => <button key={d.type} onClick={() => setDocIdx(i)} className={cx('h-8 px-2.5 rounded-md text-xs border inline-flex items-center gap-1.5', i === docIdx ? 'bg-ink text-white border-ink' : 'border-line text-ink2')}>{d.type === 'CERTIFICATE' ? 'Ijazah' : d.type === 'BIRTH' ? 'Akta Lahir' : 'Pasfoto'}{d.fileId && <span className="w-1.5 h-1.5 rounded-full bg-ok" />}</button>)}</div>
          <DocPreview d={docs[docIdx]} name={a.name} />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-2">Checklist Dokumen</div>
          {docs.map((d, i) => (
            <div key={d.type} className="border border-line rounded-md p-3 mb-2">
              <div className="flex items-center gap-2 text-sm"><FileText className="w-4 h-4 text-ink2" strokeWidth={1.5} /><span className="flex-1">{d.label}</span><StatusPill status={d.status} /></div>
              {can('admission.verify') && ['SUBMITTED', 'DRAFT'].includes(a.status) && (
                <div className="flex gap-1 mt-2">
                  {(['PENDING', 'VALID', 'INVALID'] as const).map((st) => (
                    <button key={st} onClick={() => setDocs(docs.map((x, j) => (j === i ? { ...x, status: st } : x)))} className={cx('flex-1 h-8 rounded-md text-xs font-medium border', d.status === st ? (st === 'VALID' ? 'bg-ok-bg text-ok border-ok' : st === 'INVALID' ? 'bg-bad-bg text-bad border-bad' : 'bg-canvas border-line-strong') : 'border-line text-ink2')}>{st}</button>
                  ))}
                </div>
              )}
              {d.status === 'INVALID' && <Input className="mt-2 h-8" placeholder="Alasan invalid" value={d.reason || ''} onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />}
            </div>
          ))}
          <Field label="Skor Seleksi (0–100)" className="mt-3"><Input mono type="number" value={score} onChange={(e) => setScore(e.target.value)} disabled={!can('admission.verify')} /></Field>
          <div className="mt-4">
            <KV k="Tempat, Tgl Lahir" v={`${a.birthPlace}, ${fmtDate(a.birthDate)}`} />
            <KV k="Nilai Pre-Sekundária" v={num2(a.avgScore)} mono />
            <KV k="Wali" v={<>{a.guardian.name} ({a.guardian.relation})<div className="font-mono text-xs">{a.guardian.phone}</div></>} />
            <KV k="Alamat" v={a.address} />
          </div>
          {a.decisionNote && <div className="mt-3"><Alert tone="info" title="Catatan keputusan">{a.decisionNote}</Alert></div>}
        </div>
      </div>
      <ReasonDialog open={reject} onClose={() => setReject(false)} title="Tolak Pendaftar" confirmLabel="Tolak" danger onConfirm={(r) => { act('reject', r); }} />
    </Drawer>
  );
}

export default function AdmissionsDesk() {
  const db = useDB();
  const { can } = useAuth();
  const mutate = useMutation();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('ALL');
  const [major, setMajor] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [batch, setBatch] = useState(false);
  const [target, setTarget] = useState('');
  const rows = useMemo(() => db.applicants.filter((a) => (status === 'ALL' || a.status === status) && (!major || a.majorPref === major) && (!q || a.name.toLowerCase().includes(q.toLowerCase()) || a.regNo.includes(q.toUpperCase()))).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)), [db, status, major, q]);
  const selected = db.applicants.filter((a) => sel.has(a.id));
  const allReReg = selected.length > 0 && selected.every((a) => a.status === 'RE_REGISTERED');
  const period = db.admissionPeriods[0];
  const openA = db.applicants.find((a) => a.id === open);
  const grade10 = db.classes.filter((c) => c.grade === 10);
  return (
    <div>
      <PageHeader title="Meja Verifikasi Pendaftaran (PPDB)" subtitle={<>{period.name} · {fmtDate(period.open)} – {fmtDate(period.close)} · Kuota <Mono>{period.quota}</Mono> · <StatusPill status={period.status} /></>}
        actions={<a href="/ppdb/apply" target="_blank" rel="noreferrer"><Button>Buka Portal Publik</Button></a>} />
      <div className="flex flex-col gap-3 mb-3">
        <FilterPills value={status} onChange={setStatus} options={STATUSES.map((s) => ({ id: s, label: s === 'ALL' ? 'Semua' : s.replace('_', ' '), count: s === 'ALL' ? db.applicants.length : db.applicants.filter((a) => a.status === s).length }))} />
        <div className="flex flex-col md:flex-row gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Nama atau No. Registrasi" className="md:w-72" />
          <Select value={major} onChange={(e) => setMajor(e.target.value)} className="h-9 md:w-48"><option value="">Semua Jurusan</option><option value="CT">IPA / CT</option><option value="CSH">IPS / CSH</option></Select>
          <div className="flex-1" />
          <ActionBar selectedCount={sel.size} onClear={() => setSel(new Set())} noun="pendaftar"
            bulk={<Button size="sm" icon={GraduationCap} disabled={!allReReg || !can('admission.enroll')} onClick={() => setBatch(true)}>Batch Kirim ke Kelas 10</Button>}>
            <Button icon={GraduationCap} disabled>Batch Kirim ke Kelas 10</Button>
          </ActionBar>
        </div>
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        {rows.length ? (
          <Table>
            <thead><tr><Th className="w-10" /><Th>No. Registrasi</Th><Th>Nama Lengkap</Th><Th>Sekolah Asal</Th><Th>Minat Jurusan</Th><Th>Status Dokumen</Th><Th align="right">Skor / Rank</Th><Th>Status Alur</Th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const valid = a.documents.filter((d) => d.status === 'VALID').length;
                return (
                  <Tr key={a.id} onClick={() => setOpen(a.id)} selected={sel.has(a.id)}>
                    <Td><Checkbox checked={sel.has(a.id)} onChange={(v) => { const n = new Set(sel); if (v) n.add(a.id); else n.delete(a.id); setSel(n); }} /></Td>
                    <Td mono>{a.regNo}</Td>
                    <Td className="font-medium whitespace-nowrap">{a.name}</Td>
                    <Td className="text-ink2">{a.origin}</Td>
                    <Td><Badge>{a.majorPref === 'CT' ? 'IPA / CT' : 'IPS / CSH'}</Badge></Td>
                    <Td><Badge tone={valid === a.documents.length ? 'ok' : 'warn'}><Mono>{valid}/{a.documents.length}</Mono> Valid</Badge></Td>
                    <Td align="right" mono>{a.testScore != null ? `${num2(a.testScore)} · #${a.rank}` : '—'}</Td>
                    <Td><StatusPill status={a.status} /></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : <EmptyState title="Tidak ada pendaftar dengan filter ini." />}
      </div>
      {openA && <Workspace key={openA.id + openA.status} a={openA} onClose={() => setOpen(null)} />}
      <Modal open={batch} onClose={() => setBatch(false)} title="Batch Kirim ke Kelas 10 (Atomic Enroll)"
        footer={<><Button onClick={() => setBatch(false)}>Batal</Button><Button variant="dark" icon={Send} disabled={!target} onClick={async () => { if (await mutate('POST', '/api/admissions/enroll-batch', { applicantIds: [...sel], classId: target }, `${sel.size} pendaftar dikonversi menjadi siswa aktif.`)) { setBatch(false); setSel(new Set()); } }}>Konversi Menjadi Siswa Aktif</Button></>}>
        <Alert tone="info">Semua pendaftar terpilih akan dibuatkan data Siswa, Wali, dan Enrollment 2027 dalam satu transaksi. Jika satu gagal, tidak ada yang tersimpan.</Alert>
        <Field label="Rombel Kelas 10 Tujuan" className="mt-4"><Select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Pilih rombel...</option>{grade10.map((c) => <option key={c.id} value={c.id}>{c.name} ({db.students.filter((s) => s.classId === c.id).length} siswa)</option>)}</Select></Field>
        <div className="mt-4 border border-line rounded-md">{selected.map((a) => <div key={a.id} className="flex justify-between px-3 h-9 items-center border-b border-line last:border-0 text-sm"><span>{a.name}</span><Mono className="text-xs">{a.regNo}</Mono></div>)}</div>
      </Modal>
    </div>
  );
}
