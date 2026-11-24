import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCheck, CloudOff, RefreshCw, Save, Send } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation, useOffline, useToast } from '../context/AppContexts';
import { Alert, Badge, Button, Card, cx, EmptyState, Input, Mono, PageHeader, Select, StatusPill, Table, Tabs, Td, Th, Tr } from '../components/ui';
import { fmtDate, SCHOOL_TODAY } from '../lib/format';
import type { AttRecord } from '../lib/types';
import { fileUrl } from '../lib/files';

const OPTS: { k: AttRecord['status']; s: string; label: string; on: string }[] = [
  { k: 'PRESENT', s: 'H', label: 'Hadir', on: 'bg-ok-bg text-ok border-ok' },
  { k: 'SICK', s: 'S', label: 'Sakit', on: 'bg-warn-bg text-warn border-warn' },
  { k: 'PERMITTED', s: 'I', label: 'Izin', on: 'bg-selected text-accent border-accent' },
  { k: 'ABSENT', s: 'A', label: 'Alpa', on: 'bg-bad-bg text-bad border-bad' },
  { k: 'LATE', s: 'T', label: 'Telat', on: 'bg-warn-bg text-warn border-warn' },
];

function Recorder() {
  const db = useDB();
  const L = useLookups();
  const { user, can } = useAuth();
  const { online, enqueue, queue, sync, syncing } = useOffline();
  const { toast } = useToast();
  const mutate = useMutation();
  const [params] = useSearchParams();
  const myClasses = useMemo(() => {
    if (can('attendance.correct')) return db.classes;
    const ids = new Set([...db.teachingAssignments.filter((a) => a.teacherId === user?.profileId).map((a) => a.classId), ...db.classes.filter((c) => c.homeroomTeacherId === user?.profileId).map((c) => c.id)]);
    return db.classes.filter((c) => ids.has(c.id));
  }, [db, user, can]);
  const homeroom = db.classes.find((c) => c.homeroomTeacherId === user?.profileId);
  const [classId, setClassId] = useState(params.get('class') || homeroom?.id || myClasses[0]?.id || '');
  const [date, setDate] = useState(SCHOOL_TODAY);
  const session = db.attendanceSessions.find((a) => a.classId === classId && a.date === date && a.mode === 'DAILY');
  const draftKey = `nossef.att.${classId}.${date}`;
  const [local, setLocal] = useState<Record<string, AttRecord>>({});
  useEffect(() => {
    let draft: Record<string, AttRecord> | null = null;
    try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch { /* ignore */ }
    setLocal(draft || {});
  }, [draftKey]);
  useEffect(() => { try { if (Object.keys(local).length) localStorage.setItem(draftKey, JSON.stringify(local)); else localStorage.removeItem(draftKey); } catch { /* ignore */ } }, [local, draftKey]);

  if (!myClasses.length) return <EmptyState title="Anda tidak memiliki rombel untuk dicatat presensinya." />;
  const students = db.students.filter((s) => s.classId === classId && s.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name));
  const rec = (sid: string): AttRecord | undefined => local[sid] || session?.records[sid];
  const setRec = (sid: string, r: Partial<AttRecord>) => setLocal((x) => ({ ...x, [sid]: { ...(x[sid] || session?.records[sid] || { status: 'PRESENT' }), ...r } as AttRecord }));
  const counts = OPTS.map((o) => students.filter((s) => rec(s.id)?.status === o.k).length);
  const unmarked = students.filter((s) => !rec(s.id)).length;
  const dirty = Object.keys(local).length;
  const pendingHere = queue.filter((q) => q.body.classId === classId && q.body.date === date).length;
  const cls = L.classes.get(classId);
  const leaves = db.leaveRequests.filter((l) => students.some((s) => s.id === l.studentId) && l.from <= date && l.to >= date);

  async function persist(submit: boolean) {
    const records: Record<string, AttRecord> = {};
    students.forEach((s) => { const r = rec(s.id); if (r) records[s.id] = { status: r.status, minutesLate: r.status === 'LATE' ? r.minutesLate || 0 : undefined, note: r.note }; });
    if (submit && unmarked) { toast(`${unmarked} siswa belum ditandai.`, 'error'); return; }
    const body = { classId, date, baseVersion: session?.version ?? 0, records, submit };
    if (!online) {
      enqueue({ method: 'POST', url: '/api/attendance/sessions', body, label: `Presensi ${cls?.name} ${date}` });
      setLocal({});
      toast('Mode offline — presensi disimpan di perangkat dan akan disinkronkan.', 'info');
      return;
    }
    const r = await mutate('POST', '/api/attendance/sessions', body, submit ? 'Sesi presensi dikirim (SUBMITTED).' : 'Draf presensi tersimpan.');
    if (r) setLocal({});
  }

  return (
    <>
      <div className="bg-white border border-line rounded-lg p-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><span className="text-xs text-ink2">Rombel</span>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-8 w-36">{myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </label>
        <label className="flex items-center gap-2"><span className="text-xs text-ink2">Tanggal</span><Input type="date" value={date} max={SCHOOL_TODAY} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" /></label>
        <span className="text-xs text-ink2">Mode <Mono className="text-ink">DAILY</Mono></span>
        <span className="text-xs text-ink2">Versi Sesi <Mono className="text-ink">v{session?.version ?? 0}</Mono></span>
        <span className="text-xs text-ink2">Status <StatusPill status={session?.status || 'DRAFT'} /></span>
        <span className="ml-auto">{online ? <Badge tone="ok" dot>Tersinkronisasi ke Server</Badge> : <Badge tone="warn" dot>Offline</Badge>}</span>
      </div>
      {!online && (
        <div className="mb-3 bg-warn-bg border border-warn/30 rounded-md px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <CloudOff className="w-5 h-5 text-warn" strokeWidth={1.5} />
          <span className="flex-1 text-ink"><b>Mode Offline Aktif</b> — Perubahan disimpan di perangkat (IndexedDB) dan akan disinkronkan saat koneksi pulih.</span>
          <Button size="sm" icon={RefreshCw} disabled>Sinkronkan Sekarang ({queue.length})</Button>
        </div>
      )}
      {online && pendingHere > 0 && <div className="mb-3"><Alert tone="warn" title={`${pendingHere} perubahan menunggu sinkronisasi`} action={<Button size="sm" icon={RefreshCw} onClick={sync} disabled={syncing}>Sinkronkan Sekarang</Button>} /></div>}
      {leaves.length > 0 && <div className="mb-3"><Alert tone="info" title="Pengajuan izin dari wali">{leaves.map((l) => `${L.students.get(l.studentId)?.name} (${l.type}: ${l.reason})`).join(' · ')}</Alert></div>}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {OPTS.map((o, i) => <Badge key={o.k} tone={o.k === 'PRESENT' ? 'ok' : o.k === 'ABSENT' ? 'bad' : o.k === 'PERMITTED' ? 'info' : 'warn'}>{o.label} <Mono>{counts[i]}</Mono></Badge>)}
        {unmarked > 0 && <Badge>Belum ditandai <Mono>{unmarked}</Mono></Badge>}
        <div className="flex-1" />
        <Button icon={CheckCheck} onClick={() => setLocal(Object.fromEntries(students.map((s) => [s.id, { ...(rec(s.id) || {}), status: 'PRESENT' as const }])))}>Tandai Semua Hadir</Button>
        <Button icon={Save} disabled={!dirty} onClick={() => persist(false)}>Simpan Draf</Button>
        <Button variant="primary" icon={Send} onClick={() => persist(true)} disabled={!dirty && session?.status === 'SUBMITTED'}>Kirim Sesi (Submit)</Button>
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        {students.map((s, i) => {
          const r = rec(s.id);
          const changed = !!local[s.id];
          return (
            <div key={s.id} className={cx('flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-4 py-3 border-b border-line last:border-0', changed && 'bg-warn-bg/30')}>
              <div className="flex items-center gap-3 md:w-[320px] shrink-0">
                <Mono className="text-xs text-muted w-6">{i + 1}</Mono>
                <div className="min-w-0"><div className="text-sm font-medium truncate">{s.name}</div><Mono className="text-[11px] text-ink2">{s.studentNo}</Mono></div>
                {changed && <span className="w-1.5 h-1.5 rounded-full bg-warn ml-auto md:ml-0" title="Belum tersimpan" />}
              </div>
              <div className="flex gap-1.5 flex-1 flex-wrap">
                {OPTS.map((o) => (
                  <button key={o.k} onClick={() => setRec(s.id, { status: o.k })} title={o.k}
                    className={cx('min-h-[40px] min-w-[44px] px-2.5 rounded-md border text-sm font-semibold transition-colors flex-1 md:flex-none', r?.status === o.k ? o.on : 'border-line text-ink2 hover:bg-hover')}>
                    {o.s}<span className="hidden lg:inline font-normal text-xs ml-1">{o.label}</span>
                  </button>
                ))}
                {r?.status === 'LATE' && (
                  <div className="flex items-center gap-1"><Input mono type="number" min={1} max={240} value={r.minutesLate ?? ''} onChange={(e) => setRec(s.id, { minutesLate: Number(e.target.value) })} className="h-10 w-16 text-right" /><span className="text-xs text-ink2">mnt</span></div>
                )}
              </div>
              <Input value={r?.note || ''} onChange={(e) => setRec(s.id, { note: e.target.value })} placeholder="Catatan" className="h-9 md:w-52" />
            </div>
          );
        })}
      </div>
      {session && <div className="text-xs text-ink2 mt-2">Terakhir diperbarui · {fmtDate(session.date)} · dicatat oleh {L.teachers.get(session.recordedBy)?.name || session.recordedBy}</div>}
    </>
  );
}

function Review() {
  const db = useDB();
  const L = useLookups();
  const [date, setDate] = useState(SCHOOL_TODAY);
  const rows = db.classes.map((c) => {
    const s = db.attendanceSessions.find((a) => a.classId === c.id && a.date === date);
    const r = s ? Object.values(s.records) : [];
    const n = (k: string) => r.filter((x) => x.status === k).length;
    return { c, s, total: r.length, p: n('PRESENT'), l: n('LATE'), sk: n('SICK'), i: n('PERMITTED'), a: n('ABSENT') };
  });
  const absentList = db.attendanceSessions.filter((a) => a.date === date).flatMap((a) => Object.entries(a.records).filter(([, r]) => r.status !== 'PRESENT').map(([sid, r]) => ({ sid, r, classId: a.classId })));
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2"><span className="text-sm text-ink2">Tanggal</span><Input type="date" value={date} max={SCHOOL_TODAY} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" /></div>
      <Card title="Rekap Presensi per Rombel" pad={false}>
        <Table>
          <thead><tr><Th>Rombel</Th><Th>Status Sesi</Th><Th align="right">Hadir</Th><Th align="right">Telat</Th><Th align="right">Sakit</Th><Th align="right">Izin</Th><Th align="right">Alpa</Th><Th align="right">%</Th></tr></thead>
          <tbody>{rows.map((r) => <Tr key={r.c.id}><Td className="font-medium">{r.c.name}</Td><Td>{r.s ? <StatusPill status={r.s.status} /> : <StatusPill status="PENDING" label="Belum dicatat" />}</Td><Td align="right" mono>{r.p}</Td><Td align="right" mono>{r.l}</Td><Td align="right" mono>{r.sk}</Td><Td align="right" mono>{r.i}</Td><Td align="right" mono className={r.a ? 'text-bad' : ''}>{r.a}</Td><Td align="right" mono>{r.total ? (((r.p + r.l) / r.total) * 100).toFixed(1) : '—'}</Td></Tr>)}</tbody>
        </Table>
      </Card>
      <Card title="Siswa Tidak Hadir / Terlambat" pad={false}>
        {absentList.length ? (
          <Table>
            <thead><tr><Th>Siswa</Th><Th>Rombel</Th><Th>Status</Th><Th>Catatan</Th></tr></thead>
            <tbody>{absentList.map((x) => <Tr key={x.sid}><Td>{L.students.get(x.sid)?.name}</Td><Td>{L.classes.get(x.classId)?.name}</Td><Td><StatusPill status={x.r.status} label={x.r.status === 'LATE' ? `LATE ${x.r.minutesLate} mnt` : undefined} /></Td><Td className="text-xs text-ink2">{x.r.note || '—'}</Td></Tr>)}</tbody>
          </Table>
        ) : <EmptyState title="Tidak ada data." />}
      </Card>
      <Card title="Pengajuan Izin / Sakit dari Wali" pad={false}>
        {db.leaveRequests.length ? db.leaveRequests.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line last:border-0 text-sm">
            <span className="font-medium">{L.students.get(l.studentId)?.name}</span><span className="text-ink2">{fmtDate(l.from)} – {fmtDate(l.to)} · {l.type} · {l.reason}</span>{l.attachmentFileId && <a href={fileUrl(l.attachmentFileId)} target="_blank" rel="noreferrer" className="text-xs text-accent">Lampiran</a>}<span className="ml-auto"><StatusPill status={l.status} /></span>
          </div>
        )) : <EmptyState title="Tidak ada pengajuan." />}
      </Card>
    </div>
  );
}

export default function Attendance() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'record' | 'review'>(can('attendance.record') ? 'record' : 'review');
  return (
    <div>
      <PageHeader title="Presensi Siswa" subtitle="Online & Offline PWA · H Hadir · S Sakit · I Izin · A Alpa · T Terlambat" />
      <Tabs value={tab} onChange={setTab} tabs={[...(can('attendance.record') || can('attendance.correct') ? [{ id: 'record' as const, label: 'Catat Presensi' }] : []), { id: 'review', label: 'Rekap & Review' }]} />
      {tab === 'record' ? <Recorder /> : <Review />}
    </div>
  );
}
