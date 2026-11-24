import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, Download, FileText, Mail, Phone, Upload } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { Alert, Avatar, Badge, Button, Card, cx, EmptyState, Field, Input, KV, Modal, Mono, Select, StatusPill, Tabs, Textarea } from '../components/ui';
import ReportCardDoc from '../components/ReportCardDoc';
import { fmtDate, SCHOOL_TODAY, usd } from '../lib/format';
import type { ReportCard } from '../lib/types';
import type { StoredFile } from '../lib/files';
import { FileField } from '../components/FileField';
import { AttendanceHistory, InvoiceStatement } from './StudentPortal';

function LeaveModal({ studentId, open, onClose }: { studentId: string; open: boolean; onClose: () => void }) {
  const mutate = useMutation();
  const [f, setF] = useState({ type: 'SICK', from: SCHOOL_TODAY, to: SCHOOL_TODAY, reason: '' });
  const [file, setFile] = useState<StoredFile | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Ajukan Surat Izin / Sakit Anak"
      footer={<><Button onClick={onClose}>Batal</Button><Button variant="primary" disabled={!f.reason} onClick={async () => { if (await mutate('POST', '/api/leave-requests', { ...f, studentId, attachmentFileId: file?.id || null }, 'Pengajuan izin terkirim ke Profesor da Turma.')) onClose(); }}>Kirim Pengajuan</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Jenis" className="col-span-2"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="SICK">Sakit (Moras)</option><option value="PERMITTED">Izin Keluarga</option></Select></Field>
        <Field label="Dari"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Sampai"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Alasan" required className="col-span-2"><Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <Field label="Lampiran surat dokter (opsional)" className="col-span-2"><FileField value={file} onChange={setFile} category="leave" /></Field>
      </div>
    </Modal>
  );
}

export default function GuardianPortal() {
  const { tab = 'home' } = useParams();
  const nav = useNavigate();
  const db = useDB();
  const L = useLookups();
  const { user } = useAuth();
  const guardian = db.guardians.find((g) => g.id === user?.profileId);
  const children = db.students.filter((s) => guardian?.studentIds.includes(s.id));
  const [active, setActive] = useState(children[0]?.id);
  const [leave, setLeave] = useState(false);
  const [rc, setRc] = useState<ReportCard | null>(null);
  useEffect(() => { if (!active && children[0]) setActive(children[0].id); }, [children, active]);
  const s = children.find((c) => c.id === active);
  if (!s) return <EmptyState title="Tidak ada siswa yang terhubung dengan akun ini." />;
  const cls = L.classes.get(s.classId);
  const hr = L.teachers.get(cls?.homeroomTeacherId || '');
  const todaySess = db.attendanceSessions.find((a) => a.classId === s.classId && a.date === SCHOOL_TODAY);
  const todayRec = todaySess?.records[s.id];
  const invoices = db.invoices.filter((i) => i.studentId === s.id);
  const balance = invoices.filter((i) => i.status !== 'VOID').reduce((t, i) => t + i.total - i.paid, 0);
  const cards = db.reportCards.filter((r) => r.studentId === s.id);
  const leaves = db.leaveRequests.filter((l) => l.studentId === s.id);

  return (
    <div>
      <div className="mb-4">
        <div className="text-xs text-ink2">Portal Inan-Aman · {guardian?.name}</div>
        <h1 className="font-display text-xl md:text-2xl font-semibold">Pemantauan Anak</h1>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5">
        {children.map((c) => (
          <button key={c.id} onClick={() => setActive(c.id)} className={cx('flex items-center gap-2.5 h-12 pl-2 pr-4 rounded-full border whitespace-nowrap transition-colors', c.id === active ? 'bg-ink text-white border-ink' : 'bg-white border-line text-ink hover:bg-hover')}>
            <Avatar name={c.name} size={32} tone={c.id === active ? 'blue' : 'neutral'} />
            <span className="text-left leading-tight"><span className="block text-sm font-medium">{c.name}</span><span className={cx('block text-[11px]', c.id === active ? 'text-white/70' : 'text-ink2')}>{L.classes.get(c.classId)?.name}{c.id === active ? ' · Aktif' : ''}</span></span>
          </button>
        ))}
      </div>
      <Tabs value={tab} onChange={(t) => nav(`/guardian/${t}`)} tabs={[{ id: 'home', label: 'Ringkasan' }, { id: 'attendance', label: 'Presensi' }, { id: 'report-cards', label: 'Rapor' }, { id: 'finance', label: 'SPP & Kwitansi' }]} />
      {tab === 'home' && (
        <div className="grid lg:grid-cols-3 gap-5">
          <Card title="Status Kehadiran Hari Ini" actions={<Button size="sm" icon={CalendarClock} onClick={() => setLeave(true)}>Ajukan Izin/Sakit</Button>}>
            {todayRec ? (
              <div className="flex items-center gap-3"><StatusPill status={todayRec.status} /><span className="text-sm text-ink2">{todayRec.status === 'PRESENT' ? 'Hadir pukul 07:25' : todayRec.status === 'LATE' ? `Terlambat ${todayRec.minutesLate} menit` : todayRec.note || 'Tidak hadir'}</span></div>
            ) : <div className="text-sm text-ink2">Presensi hari ini belum dicatat oleh guru.</div>}
            {leaves.length > 0 && (
              <div className="mt-4 pt-3 border-t border-line space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink2">Pengajuan Izin</div>
                {leaves.map((l) => <div key={l.id} className="flex items-center justify-between text-sm"><span>{fmtDate(l.from)} – {fmtDate(l.to)} · {l.type}</span><StatusPill status={l.status} /></div>)}
              </div>
            )}
          </Card>
          <Card title="Kontak Resmi Profesor da Turma">
            <div className="flex items-center gap-3">
              <Avatar name={hr?.name || ''} size={40} tone="dark" />
              <div><div className="text-sm font-semibold">{hr?.name}</div><div className="text-xs text-ink2">Titulár de Turma {cls?.name}</div></div>
            </div>
            <div className="mt-3"><KV k="Konsultasi" v="Kamis 13:30 – 15:00" /><KV k="Telepon" v={hr?.phone} mono /><KV k="Email" v={hr?.email} /></div>
            <div className="flex gap-2 mt-3">
              <a href={`tel:${hr?.phone}`}><Button size="sm" icon={Phone}>Telepon</Button></a>
              <a href={`mailto:${hr?.email}`}><Button size="sm" icon={Mail}>Email</Button></a>
            </div>
          </Card>
          <Card title="Tagihan SPP (USD)">
            <div className="text-xs text-ink2">Sisa tunggakan</div>
            <Mono className={`text-2xl font-semibold ${balance > 0 ? 'text-bad' : 'text-ok'}`}>{usd(balance)}</Mono>
            <div className="mt-3 space-y-1">{invoices.map((i) => <div key={i.id} className="flex items-center justify-between text-sm"><span>{i.period}</span><span className="flex items-center gap-2"><Mono className="text-xs">{usd(i.paid)}/{usd(i.total)}</Mono><StatusPill status={i.status} /></span></div>)}</div>
            {balance > 0 && <p className="text-xs text-ink2 mt-3">Bayar tunai di Finansas sekolah, atau setor di bank lalu serahkan kuitansi bank ke Finansas.</p>}
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" icon={Download} onClick={() => nav('/guardian/finance')}>Unduh Kwitansi Resmi PDF</Button>
            </div>
          </Card>
          <Card title="Rapor Resmi Trimestre" pad={false} className="lg:col-span-3">
            {cards.length ? cards.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 h-14 border-b border-line last:border-0">
                <FileText className="w-5 h-5 text-ink2" strokeWidth={1.5} />
                <span className="flex-1 text-sm">Rapor {r.trimester}º Trimestre — {s.name}</span>
                <Badge>{fmtDate(r.publishedAt)}</Badge>
                <Button size="sm" icon={Download} onClick={() => setRc(r)}>PDF</Button>
              </div>
            )) : <EmptyState title="Belum ada rapor terbit." />}
          </Card>
        </div>
      )}
      {tab === 'attendance' && <><div className="mb-4 flex justify-end"><Button icon={CalendarClock} onClick={() => setLeave(true)}>Ajukan Surat Izin/Sakit Anak</Button></div><AttendanceHistory student={s} /></>}
      {tab === 'report-cards' && (
        <Card title="Rapor Terbit" pad={false}>
          {cards.map((r) => <div key={r.id} className="flex items-center gap-3 px-4 h-14 border-b border-line last:border-0"><FileText className="w-5 h-5 text-ink2" strokeWidth={1.5} /><span className="flex-1 text-sm">{r.trimester}º Trimestre · Rev. {r.revision}</span><StatusPill status={r.status} /><Button size="sm" icon={Download} onClick={() => setRc(r)}>PDF</Button></div>)}
        </Card>
      )}
      {tab === 'finance' && <InvoiceStatement student={s} />}
      <Alert tone="info" title="Akses baca-saja">Data hanya untuk siswa yang terhubung dengan akun Anda (StudentGuardian aktif).</Alert>
      <LeaveModal studentId={s.id} open={leave} onClose={() => setLeave(false)} />
      <Modal open={!!rc} onClose={() => setRc(null)} title="Rapor Resmi" size="xl" footer={<Button variant="primary" icon={Download} onClick={() => window.print()}>Unduh / Cetak PDF</Button>}>
        {rc && <ReportCardDoc student={s} trimester={rc.trimester} card={rc} />}
      </Modal>
    </div>
  );
}
