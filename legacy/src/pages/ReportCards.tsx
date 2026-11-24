import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, FileStack, Lock, Printer, RotateCcw, Send } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { Alert, Badge, Button, Card, Checkbox, cx, EmptyState, Input, Modal, Mono, PageHeader, ReasonDialog, Select, StatusPill, Table, Tabs, Td, Th, Tr } from '../components/ui';
import ReportCardDoc from '../components/ReportCardDoc';
import { fmtDate, majorLabel, num2 } from '../lib/format';
import type { Student } from '../lib/types';

function RaporTab() {
  const db = useDB();
  const L = useLookups();
  const { can, user } = useAuth();
  const mutate = useMutation();
  const mine = db.classes.find((c) => c.homeroomTeacherId === user?.profileId);
  const [classId, setClassId] = useState(mine?.id || db.classes[0].id);
  const [tri, setTri] = useState(2);
  const [preview, setPreview] = useState<Student | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reopen, setReopen] = useState(false);
  const [bulk, setBulk] = useState(false);
  useEffect(() => { setNotes({}); setSel(new Set()); }, [classId, tri]);
  const subs = db.teachingAssignments.filter((a) => a.classId === classId);
  const fin = subs.filter((a) => db.termGrades.find((t) => t.classId === classId && t.subjectId === a.subjectId && t.trimester === tri)?.status === 'FINALIZED').length;
  const ready = fin === subs.length;
  const students = db.students.filter((s) => s.classId === classId).sort((a, b) => a.name.localeCompare(b.name));
  const cards = students.map((s) => ({ s, rc: db.reportCards.find((r) => r.studentId === s.id && r.trimester === tri) }));
  const allPublished = cards.every((c) => c.rc?.status === 'PUBLISHED');
  const canNote = can('report.generate') && (can('report.publish') || mine?.id === classId);
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9 w-40">{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={tri} onChange={(e) => setTri(Number(e.target.value))} className="h-9 w-52">{[1, 2, 3].map((n) => <option key={n} value={n}>{n}º Trimestre (CAU {n})</option>)}</Select>
        <div className="flex-1" />
        <Button icon={FileStack} onClick={() => setBulk(true)}>Generate Bulk PDF</Button>
        {can('report.generate') && <Button disabled={!sel.size} onClick={() => mutate('POST', '/api/report-cards/review', { ids: cards.filter((c) => sel.has(c.s.id)).map((c) => c.rc!.id) }, 'Rapor ditandai REVIEWED.')}>Tandai Reviewed</Button>}
        {can('report.reopen') && <Button icon={RotateCcw} disabled={!sel.size} onClick={() => setReopen(true)}>Reopen with Reason</Button>}
        {can('report.publish') && <Button variant="dark" icon={Send} disabled={!ready || allPublished} onClick={() => mutate('POST', '/api/report-cards/publish', { classId, trimester: tri }, 'Rapor diterbitkan & wali diberi notifikasi.')}>Publish Rapor</Button>}
      </div>
      <div className={cx('rounded-md border px-4 py-3 mb-4 flex flex-wrap items-center gap-3 text-sm', ready ? 'bg-ok-bg border-ok/30' : 'bg-warn-bg border-warn/30')}>
        {ready ? <CheckCircle2 className="w-4 h-4 text-ok" strokeWidth={1.5} /> : <Lock className="w-4 h-4 text-warn" strokeWidth={1.5} />}
        <span><b><Mono>{fin}/{subs.length}</Mono> Mata Pelajaran FINALIZED</b> {ready ? '— rapor siap diterbitkan.' : <>— tombol Publish dikunci (<Mono>REPORT_NOT_READY</Mono>).</>}</span>
        {!ready && <span className="text-xs text-ink2">Belum final: {subs.filter((a) => db.termGrades.find((t) => t.classId === classId && t.subjectId === a.subjectId && t.trimester === tri)?.status !== 'FINALIZED').map((a) => L.subjects.get(a.subjectId)?.code).join(', ')}</span>}
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <Table>
          <thead><tr><Th className="w-10"><Checkbox checked={sel.size === students.length} onChange={(v) => setSel(v ? new Set(students.map((s) => s.id)) : new Set())} /></Th><Th>Siswa</Th><Th align="right">Média</Th><Th>Status Rapor</Th><Th>Revisi</Th><Th className="min-w-[280px]">Catatan Wali Kelas</Th><Th /></tr></thead>
          <tbody>
            {cards.map(({ s, rc }) => {
              const f = db.scores.filter((x) => x.studentId === s.id && x.trimester === tri && x.final != null).map((x) => x.final!);
              const note = notes[s.id] ?? rc?.homeroomNote ?? '';
              return (
                <Tr key={s.id} selected={sel.has(s.id)}>
                  <Td><Checkbox checked={sel.has(s.id)} onChange={(v) => { const n = new Set(sel); if (v) n.add(s.id); else n.delete(s.id); setSel(n); }} /></Td>
                  <Td><div className="font-medium whitespace-nowrap">{s.name}</div><Mono className="text-[11px] text-ink2">{s.studentNo}</Mono></Td>
                  <Td align="right" mono>{f.length ? num2(f.reduce((a, b) => a + b, 0) / f.length) : '—'}</Td>
                  <Td><StatusPill status={rc?.status} /></Td>
                  <Td mono>Rev. {rc?.revision ?? 0}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Input value={note} disabled={!canNote || rc?.status === 'PUBLISHED'} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} className="h-8" placeholder="Komentáriu Profesor da Turma" />
                      {notes[s.id] !== undefined && notes[s.id] !== rc?.homeroomNote && <Button size="sm" variant="primary" onClick={async () => { await mutate('POST', '/api/report-cards/note', { ids: [rc!.id], note: notes[s.id] }, 'Catatan disimpan.'); const n = { ...notes }; delete n[s.id]; setNotes(n); }}>Simpan</Button>}
                    </div>
                  </Td>
                  <Td><Button size="sm" icon={Eye} onClick={() => setPreview(s)}>Pratinjau PDF</Button></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>
      <Modal open={!!preview} onClose={() => setPreview(null)} title="Pratinjau Rapor Resmi" size="xl" footer={<Button variant="primary" icon={Printer} onClick={() => window.print()}>Cetak / PDF</Button>}>
        {preview && <ReportCardDoc student={preview} trimester={tri} card={db.reportCards.find((r) => r.studentId === preview.id && r.trimester === tri)} />}
      </Modal>
      <Modal open={bulk} onClose={() => setBulk(false)} title={`Bulk PDF — ${L.classes.get(classId)?.name} T${tri}`} size="xl" footer={<Button variant="primary" icon={Printer} onClick={() => window.print()}>Cetak Semua</Button>}>
        <div className="print-area space-y-6">{students.slice(0, 40).map((s) => <ReportCardDoc key={s.id} student={s} trimester={tri} card={db.reportCards.find((r) => r.studentId === s.id && r.trimester === tri)} />)}</div>
      </Modal>
      <ReasonDialog open={reopen} onClose={() => setReopen(false)} title="Buka Kembali Rapor" confirmLabel="Reopen" danger onConfirm={(reason) => { mutate('POST', '/api/report-cards/reopen', { ids: cards.filter((c) => sel.has(c.s.id)).map((c) => c.rc!.id), reason }, 'Rapor dibuka kembali.'); }} />
    </>
  );
}

function TranscriptTab() {
  const db = useDB();
  const L = useLookups();
  const [q, setQ] = useState('');
  const [sid, setSid] = useState(db.students.find((s) => s.grade === 12)?.id || db.students[0].id);
  const s = L.students.get(sid)!;
  const subs = db.teachingAssignments.filter((a) => a.classId === s.classId).map((a) => L.subjects.get(a.subjectId)!);
  const matches = q ? db.students.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  return (
    <div className="grid lg:grid-cols-12 gap-5">
      <Card title="Pilih Siswa" className="lg:col-span-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari siswa..." />
        <div className="mt-2">{matches.map((m) => <button key={m.id} onClick={() => { setSid(m.id); setQ(''); }} className="w-full text-left px-2 h-9 text-sm hover:bg-hover rounded">{m.name} <span className="text-xs text-ink2">{L.classes.get(m.classId)?.name}</span></button>)}</div>
        <div className="mt-3 text-sm"><div className="font-semibold">{s.name}</div><Mono className="text-xs text-ink2">{s.studentNo}</Mono><div className="text-ink2 text-xs">{L.classes.get(s.classId)?.name} · {majorLabel(s.major)}</div></div>
      </Card>
      <Card title="Transkrip Akademik" className="lg:col-span-8" pad={false} actions={<Button size="sm" icon={Printer} onClick={() => window.print()}>Unduh Transkrip</Button>}>
        <div className="print-area">
          <Table>
            <thead><tr><Th>Disciplina</Th>{[1, 2, 3].map((t) => <Th key={t} align="right">2026 T{t}</Th>)}</tr></thead>
            <tbody>
              {subs.map((sub) => (
                <Tr key={sub.id}>
                  <Td>{sub.name}</Td>
                  {[1, 2, 3].map((t) => <Td key={t} align="right" mono>{num2(db.scores.find((x) => x.studentId === s.id && x.subjectId === sub.id && x.trimester === t)?.final ?? null)}</Td>)}
                </Tr>
              ))}
            </tbody>
          </Table>
          <div className="px-4 py-3 text-xs text-ink2 border-t border-line">Transkrip hanya menampilkan nilai Tahun Ajaran 2026 yang tercatat di sistem. Riwayat nilai tahun sebelumnya belum dimigrasikan.</div>
        </div>
      </Card>
    </div>
  );
}

function PromotionTab() {
  const db = useDB();
  const L = useLookups();
  const mutate = useMutation();
  const { can } = useAuth();
  const [classId, setClassId] = useState(db.classes[0].id);
  const cls = L.classes.get(classId)!;
  const students = db.students.filter((s) => s.classId === classId).sort((a, b) => a.name.localeCompare(b.name));
  const nextName = cls.grade === 12 ? 'Lulus (Alumni)' : cls.name.replace(/^(\d+)/, (m) => String(Number(m) + 1));
  const avgOf = (sid: string) => { const f = db.scores.filter((x) => x.studentId === sid && x.final != null && x.trimester <= 2).map((x) => x.final!); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null; };
  const initial = useMemo(() => Object.fromEntries(students.map((s) => {
    const ex = db.promotions.find((p) => p.studentId === s.id);
    const avg = avgOf(s.id) ?? 0;
    return [s.id, { decision: ex?.decision || (cls.grade === 12 ? 'GRADUATED' : avg > 5 ? 'PROMOTED' : 'REPEATED'), reason: ex?.reason || '', toMajor: ex?.toMajor || s.major }];
  })), [classId, db]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dec, setDec] = useState(initial);
  useEffect(() => setDec(initial), [initial]);
  const missing = students.filter((s) => (dec[s.id]?.decision === 'REPEATED' || dec[s.id]?.toMajor !== s.major) && !dec[s.id]?.reason);
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9 w-40">{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Badge tone="dark">{cls.name} → {nextName}</Badge>
        <div className="flex-1" />
        {can('report.publish') && <Button variant="dark" disabled={missing.length > 0} onClick={() => mutate('POST', '/api/promotions', { decisions: students.map((s) => ({ studentId: s.id, ...dec[s.id] })) }, 'Keputusan kenaikan kelas tersimpan.')}>Simpan Keputusan</Button>}
      </div>
      {missing.length > 0 && <div className="mb-3"><Alert tone="warn" title="Alasan wajib">{missing.length} siswa dengan keputusan REPEATED atau pindah jurusan belum diisi alasannya.</Alert></div>}
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <Table>
          <thead><tr><Th>Siswa</Th><Th align="right">Rata-rata T1–T2</Th><Th>Keputusan</Th><Th>Jurusan Tahun Depan</Th><Th>Alasan</Th></tr></thead>
          <tbody>
            {students.map((s) => {
              const d = dec[s.id] || { decision: 'PROMOTED', reason: '', toMajor: s.major };
              const set = (p: Partial<typeof d>) => setDec({ ...dec, [s.id]: { ...d, ...p } });
              const avg = avgOf(s.id);
              return (
                <Tr key={s.id}>
                  <Td><div className="font-medium">{s.name}</div><Mono className="text-[11px] text-ink2">{s.studentNo}</Mono></Td>
                  <Td align="right" mono className={avg != null && avg <= 5 ? 'text-bad' : ''}>{num2(avg)}</Td>
                  <Td><Select className="h-8 w-40" value={d.decision} onChange={(e) => set({ decision: e.target.value })}>{cls.grade === 12 ? <><option>GRADUATED</option><option>REPEATED</option></> : <><option>PROMOTED</option><option>REPEATED</option></>}</Select></Td>
                  <Td>{cls.grade < 12 ? <Select className="h-8 w-32" value={d.toMajor} onChange={(e) => set({ toMajor: e.target.value })}><option value="CT">CT / IPA</option><option value="CSH">CSH / IPS</option></Select> : '—'}</Td>
                  <Td><Input className={cx('h-8', (d.decision === 'REPEATED' || d.toMajor !== s.major) && !d.reason && 'border-bad')} value={d.reason} onChange={(e) => set({ reason: e.target.value })} placeholder={d.toMajor !== s.major ? 'Alasan Pindah Jurusan (wajib)' : d.decision === 'REPEATED' ? 'Alasan tinggal kelas (wajib)' : 'Opsional'} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </>
  );
}

function NationalExamTab() {
  const db = useDB();
  const L = useLookups();
  const mutate = useMutation();
  const { can } = useAuth();
  const [edit, setEdit] = useState<Record<string, { status: string; overallScore: string; certificateNo: string }>>({});
  if (!db.nationalExams.length) return <EmptyState title="Tidak ada kandidat." />;
  return (
    <>
      <Alert tone="info" title="Terpisah dari CAU">Ujian Nasional 12º Ano dicatat sebagai domain tersendiri dan tidak dihitung otomatis dari nilai CAU.</Alert>
      <div className="bg-white border border-line rounded-lg overflow-hidden mt-4">
        <Table>
          <thead><tr><Th>No. Kandidat</Th><Th>Siswa</Th><Th>Rombel</Th><Th>Status</Th><Th align="right">Skor</Th><Th>No. Sertifikat</Th><Th /></tr></thead>
          <tbody>
            {db.nationalExams.map((n) => {
              const s = L.students.get(n.studentId);
              const e = edit[n.id];
              return (
                <Tr key={n.id}>
                  <Td mono>{n.candidateNo}</Td><Td>{s?.name}</Td><Td>{L.classes.get(s?.classId || '')?.name}</Td>
                  <Td>{e ? <Select className="h-8 w-36" value={e.status} onChange={(x) => setEdit({ ...edit, [n.id]: { ...e, status: x.target.value } })}>{['REGISTERED', 'ATTENDED', 'PASSED', 'FAILED'].map((v) => <option key={v}>{v}</option>)}</Select> : <StatusPill status={n.status} />}</Td>
                  <Td align="right">{e ? <Input mono className="h-8 w-20 text-right ml-auto" value={e.overallScore} onChange={(x) => setEdit({ ...edit, [n.id]: { ...e, overallScore: x.target.value } })} /> : <Mono>{num2(n.overallScore)}</Mono>}</Td>
                  <Td>{e ? <Input mono className="h-8 w-40" value={e.certificateNo} onChange={(x) => setEdit({ ...edit, [n.id]: { ...e, certificateNo: x.target.value } })} /> : <Mono>{n.certificateNo || '—'}</Mono>}</Td>
                  <Td align="right">{can('report.publish') && (e ? <Button size="sm" variant="primary" onClick={async () => { await mutate('PATCH', `/api/c/nationalExams/${n.id}`, { status: e.status, overallScore: e.overallScore ? Number(e.overallScore) : null, certificateNo: e.certificateNo || null }, 'Data ujian nasional tersimpan.'); const x = { ...edit }; delete x[n.id]; setEdit(x); }}>Simpan</Button> : <Button size="sm" onClick={() => setEdit({ ...edit, [n.id]: { status: n.status, overallScore: n.overallScore?.toString() || '', certificateNo: n.certificateNo || '' } })}>Ubah</Button>)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </>
  );
}

export default function ReportCards() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const tab = pathname.includes('transcripts') ? 'transcripts' : pathname.includes('promotion') ? 'promotion' : pathname.includes('national') ? 'national' : 'report-cards';
  return (
    <div>
      <PageHeader title="Rapor, Transkrip, Kenaikan Kelas & Ujian Nasional" subtitle={`Penerbitan rapor trimestre · ${fmtDate('2026-10-15')}`} />
      <Tabs value={tab} onChange={(t) => nav(`/reports/${t}`)} tabs={[{ id: 'report-cards', label: 'Rapor Trimestre' }, { id: 'transcripts', label: 'Transkrip Akademik' }, { id: 'promotion', label: 'Kenaikan Kelas & Kelulusan' }, { id: 'national', label: 'Ujian Nasional Kelas XII' }]} />
      {tab === 'report-cards' && <RaporTab />}
      {tab === 'transcripts' && <TranscriptTab />}
      {tab === 'promotion' && <PromotionTab />}
      {tab === 'national' && <NationalExamTab />}
    </div>
  );
}
