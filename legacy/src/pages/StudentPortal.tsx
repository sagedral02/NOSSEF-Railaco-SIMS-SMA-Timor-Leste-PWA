import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Award, BookOpen, CalendarDays, CreditCard, Download, FileText, QrCode, Upload, User } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, KV, Modal, Mono, PageHeader, Select, StatusPill, Table, Tabs, Td, Th, Tr } from '../components/ui';
import { DigitalIdCard, Photo3x4 } from '../components/StudentCard';
import { TimetableGrid } from '../components/Timetable';
import ReportCardDoc from '../components/ReportCardDoc';
import { DAYS, fmtDate, fmtDateTime, majorLabel, num2, SCHOOL_TODAY, usd } from '../lib/format';
import type { Payment, ReportCard, Student } from '../lib/types';

export function AttendanceHistory({ student }: { student: Student }) {
  const db = useDB();
  const rows = db.attendanceSessions.filter((a) => a.classId === student.classId && a.records[student.id]).sort((a, b) => b.date.localeCompare(a.date));
  const counts = { PRESENT: 0, SICK: 0, PERMITTED: 0, ABSENT: 0, LATE: 0 } as Record<string, number>;
  rows.forEach((a) => counts[a.records[student.id].status]++);
  const rate = rows.length ? ((counts.PRESENT + counts.LATE) / rows.length) * 100 : 0;
  return (
    <div className="space-y-4">
      <div className="bg-white border border-line rounded-lg grid grid-cols-3 md:grid-cols-6 divide-x divide-line">
        <div className="p-4"><div className="text-xs text-ink2">Kehadiran</div><Mono className="text-xl font-semibold">{rate.toFixed(1)}%</Mono></div>
        {(['PRESENT', 'LATE', 'SICK', 'PERMITTED', 'ABSENT'] as const).map((k, i) => (
          <div key={k} className="p-4"><div className="text-xs text-ink2">{['Hadir', 'Telat', 'Sakit', 'Izin', 'Alpa'][i]}</div><Mono className="text-xl font-semibold">{counts[k]}</Mono></div>
        ))}
      </div>
      <Card title="Riwayat Presensi Harian" pad={false}>
        <Table>
          <thead><tr><Th>Tanggal</Th><Th>Status</Th><Th>Catatan</Th></tr></thead>
          <tbody>{rows.map((a) => { const r = a.records[student.id]; return <Tr key={a.id}><Td mono>{fmtDate(a.date)}</Td><Td><StatusPill status={r.status} label={r.status === 'LATE' ? `LATE ${r.minutesLate || ''} mnt` : undefined} /></Td><Td className="text-ink2 text-xs">{r.note || '—'}</Td></Tr>; })}</tbody>
        </Table>
      </Card>
    </div>
  );
}

export function GradesSummary({ student, showAll, onOpenCard }: { student: Student; showAll?: boolean; onOpenCard?: (rc: ReportCard) => void }) {
  const db = useDB();
  const L = useLookups();
  const subjects = db.teachingAssignments.filter((a) => a.classId === student.classId).map((a) => L.subjects.get(a.subjectId)!);
  const cards = db.reportCards.filter((r) => r.studentId === student.id && (showAll || r.status === 'PUBLISHED')).sort((a, b) => a.trimester - b.trimester);
  const isFinal = (subId: string, t: number) => db.termGrades.find((x) => x.classId === student.classId && x.subjectId === subId && x.trimester === t)?.status === 'FINALIZED';
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <Card title="Nilai per Mata Pelajaran (Média Final 0–10)" pad={false} className="lg:col-span-2">
        <Table>
          <thead><tr><Th>Disciplina</Th><Th align="right">CAU 1</Th><Th align="right">CAU 2</Th><Th align="right">CAU 3</Th></tr></thead>
          <tbody>
            {subjects.map((sub) => (
              <Tr key={sub.id}>
                <Td><Mono className="text-xs text-muted mr-2">{sub.code}</Mono>{sub.name}</Td>
                {[1, 2, 3].map((t) => {
                  const sc = db.scores.find((x) => x.studentId === student.id && x.subjectId === sub.id && x.trimester === t);
                  const visible = showAll || isFinal(sub.id, t);
                  return <Td key={t} align="right" mono className={sc?.situation === 'REPROVADO' ? 'text-bad' : ''}>{visible && sc ? num2(sc.final) : <span className="text-muted">—</span>}</Td>;
                })}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card title="Rapor Resmi" pad={false}>
        {cards.length ? cards.map((rc) => (
          <div key={rc.id} className="flex items-center gap-3 px-4 h-14 border-b border-line last:border-0">
            <FileText className="w-5 h-5 text-ink2" strokeWidth={1.5} />
            <div className="flex-1"><div className="text-sm font-medium">{rc.trimester}º Trimestre</div><div className="text-xs text-ink2">{rc.publishedAt ? fmtDate(rc.publishedAt) : 'Belum terbit'} · Rev. {rc.revision}</div></div>
            <StatusPill status={rc.status} />
            {onOpenCard && <Button size="sm" icon={Download} onClick={() => onOpenCard(rc)}>PDF</Button>}
          </div>
        )) : <EmptyState icon={FileText} title="Belum ada rapor yang diterbitkan." />}
      </Card>
    </div>
  );
}

/** How to pay: payments are only received by Finansas (cash or bank deposit receipt). */
export function PaymentInfo() {
  return (
    <Alert tone="info" title="Cara pembayaran SPP">
      Bayar <b>tunai</b> langsung di Finansas (Tesouraria) sekolah, atau setor ke rekening sekolah di bank (BNU · Mandiri · BNCTL · ANZ)
      lalu bawa <b>kuitansi bank</b> asli ke Finansas untuk dicatat. Kwitansi resmi sekolah tersedia di halaman ini setelah diverifikasi.
    </Alert>
  );
}

export function ReceiptModal({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const L = useLookups();
  if (!payment) return null;
  const s = L.students.get(payment.studentId);
  return (
    <Modal open onClose={onClose} title="Kwitansi Resmi" footer={<Button variant="primary" onClick={() => window.print()}>Cetak / Simpan PDF</Button>}>
      <div className="print-area border border-line rounded-lg p-6 text-sm">
        <div className="flex items-center gap-3 border-b border-line pb-3">
          <img src="/crest.svg" width={36} height={36} alt="" />
          <div><div className="font-display font-semibold">NOSSEF Railaco — Tesouraria</div><div className="text-xs text-ink2">Kwitansi Pembayaran Resmi</div></div>
          <Mono className="ml-auto font-semibold">{payment.receiptNo || '—'}</Mono>
        </div>
        <div className="mt-3">
          <KV k="Diterima dari" v={s?.name} />
          <KV k="NIS / Rombel" v={<>{s?.studentNo} · {L.classes.get(s?.classId || '')?.name}</>} />
          <KV k="No. Pembayaran" v={payment.paymentNo} mono />
          <KV k="Metode" v={payment.method === 'CASH' ? 'Tunai (Kasir)' : `Kuitansi Bank — ${payment.bank}`} />
          {payment.method === 'BANK_RECEIPT' && <KV k="No. Kuitansi Bank" v={payment.proofRef} mono />}
          <KV k="Tanggal" v={fmtDateTime(payment.receivedAt)} />
          {payment.allocations.map((a) => <KV key={a.invoiceId} k={<>Alokasi {L.invoices.get(a.invoiceId)?.invoiceNo}</>} v={usd(a.amount)} mono />)}
          <div className="flex justify-between pt-3 mt-1 border-t border-ink font-semibold"><span>Total</span><Mono className="text-base">{usd(payment.amount)}</Mono></div>
        </div>
        <div className="mt-6 text-xs text-ink2">Tesoureiro: {payment.receivedBy}</div>
      </div>
    </Modal>
  );
}

export function InvoiceStatement({ student }: { student: Student }) {
  const db = useDB();
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const invoices = db.invoices.filter((i) => i.studentId === student.id);
  const payments = db.payments.filter((p) => p.studentId === student.id);
  const balance = invoices.filter((i) => i.status !== 'VOID').reduce((s, i) => s + i.total - i.paid, 0);
  return (
    <div className="space-y-5">
      <div className="bg-white border border-line rounded-lg p-4 flex flex-wrap items-center gap-4">
        <div><div className="text-xs text-ink2">Sisa Tagihan</div><Mono className={`text-2xl font-semibold ${balance > 0 ? 'text-bad' : 'text-ok'}`}>{usd(balance)}</Mono></div>
        <div><div className="text-xs text-ink2">Total Terbayar</div><Mono className="text-lg font-semibold">{usd(invoices.reduce((s, i) => s + i.paid, 0))}</Mono></div>
        <div className="flex-1" />
      </div>
      {balance > 0 && <PaymentInfo />}
      <Card title="Tagihan (Invoice)" pad={false}>
        <Table>
          <thead><tr><Th>No. Invoice</Th><Th>Periode</Th><Th align="right">Subtotal</Th><Th align="right">Beasiswa</Th><Th align="right">Total</Th><Th align="right">Terbayar</Th><Th align="right">Saldo</Th><Th>Status</Th></tr></thead>
          <tbody>{invoices.map((i) => <Tr key={i.id}><Td mono>{i.invoiceNo}</Td><Td>{i.period}<div className="text-xs text-ink2">Jatuh tempo {fmtDate(i.dueDate)}</div></Td><Td align="right" mono>{usd(i.subtotal)}</Td><Td align="right" mono>{i.discount ? `-${usd(i.discount)}` : '—'}</Td><Td align="right" mono>{usd(i.total)}</Td><Td align="right" mono>{usd(i.paid)}</Td><Td align="right" mono className={i.total - i.paid > 0 ? 'text-bad' : ''}>{usd(i.total - i.paid)}</Td><Td><StatusPill status={i.status} /></Td></Tr>)}</tbody>
        </Table>
      </Card>
      <Card title="Riwayat Pembayaran" pad={false}>
        {payments.length ? (
          <Table>
            <thead><tr><Th>No.</Th><Th>Tanggal</Th><Th>Metode</Th><Th align="right">Nominal</Th><Th>Status</Th><Th></Th></tr></thead>
            <tbody>{payments.map((p) => <Tr key={p.id}><Td mono>{p.paymentNo}</Td><Td>{fmtDateTime(p.receivedAt)}</Td><Td>{p.method === 'CASH' ? 'Tunai' : `Kuitansi ${p.bank}`}</Td><Td align="right" mono>{usd(p.amount)}</Td><Td><StatusPill status={p.status} /></Td><Td align="right">{p.receiptNo && <Button size="sm" icon={Download} onClick={() => setReceipt(p)}>Kwitansi</Button>}</Td></Tr>)}</tbody>
          </Table>
        ) : <EmptyState title="Belum ada pembayaran." />}
      </Card>
      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

export default function StudentPortal() {
  const { tab = 'home' } = useParams();
  const nav = useNavigate();
  const db = useDB();
  const L = useLookups();
  const { user } = useAuth();
  const s = db.students.find((x) => x.id === user?.profileId);
  const [qr, setQr] = useState(false);
  const [rc, setRc] = useState<ReportCard | null>(null);
  const todayDow = new Date(SCHOOL_TODAY + 'T00:00:00Z').getUTCDay();
  const today = useMemo(() => db.schedule.filter((e) => e.classId === s?.classId && e.day === todayDow).sort((a, b) => a.period - b.period), [db, s, todayDow]);
  if (!s) return <EmptyState title="Profil siswa tidak ditemukan." />;
  const cls = L.classes.get(s.classId);
  const loans = db.loans.filter((l) => ['OPEN', 'OVERDUE'].includes(l.status));
  const balance = db.invoices.reduce((t, i) => t + i.total - i.paid, 0);
  const att = { PRESENT: 0, SICK: 0, PERMITTED: 0, ABSENT: 0, LATE: 0 } as Record<string, number>;
  db.attendanceSessions.forEach((a) => a.records[s.id] && att[a.records[s.id].status]++);
  const attTotal = Object.values(att).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="bg-white border border-line rounded-lg p-4 md:p-5 mb-5 flex items-center gap-4">
        <Photo3x4 name={s.name} w={48} bg={s.gender === 'F' ? 'red' : 'blue'} />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-ink2">Bondia,</div>
          <h1 className="font-display text-lg md:text-xl font-semibold truncate">{s.name}</h1>
          <div className="text-sm text-ink2">{cls?.name} — Tahun Ajaran 2026 · <Mono>{s.studentNo}</Mono></div>
        </div>
        <Button variant="dark" icon={QrCode} onClick={() => setQr(true)}><span className="hidden sm:inline">Tampilkan Kartu Pelajar QR</span><span className="sm:hidden">QR</span></Button>
      </div>
      <Tabs value={tab} onChange={(t) => nav(`/student/${t}`)} tabs={[
        { id: 'home', label: 'Beranda' }, { id: 'schedule', label: 'Jadwal', icon: CalendarDays }, { id: 'grades', label: 'Nilai & Rapor', icon: Award },
        { id: 'finance', label: 'SPP', icon: CreditCard }, { id: 'library', label: 'Perpustakaan', icon: BookOpen }, { id: 'profile', label: 'Profil', icon: User },
      ]} />
      <Alert tone="info" title="Mode baca-saja">Portal siswa hanya menampilkan data milik Anda. Perubahan data dilakukan oleh Sekretaria.</Alert>
      <div className="mt-5">
        {tab === 'home' && (
          <div className="grid md:grid-cols-2 gap-5">
            <Card title={`Jadwal Hari Ini — ${DAYS[todayDow]}`} pad={false}>
              {today.map((e) => { const bp = db.bellPeriods.find((b) => b.order === e.period); return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0">
                  <Mono className="text-xs text-ink2 w-12">{bp?.start}</Mono>
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium">{L.subjects.get(e.subjectId)?.name}</div><div className="text-xs text-ink2">{L.teachers.get(e.exception?.substituteTeacherId || e.teacherId)?.name} · {L.rooms.get(e.roomId)?.code}</div></div>
                  {e.exception && <Badge tone="warn">Guru pengganti</Badge>}
                </div>
              ); })}
              {!today.length && <div className="p-4 text-sm text-ink2">Tidak ada pelajaran.</div>}
            </Card>
            <Card title="Rekap Kehadiran Trimestre Ini">
              <Mono className="text-3xl font-semibold">{attTotal ? (((att.PRESENT + att.LATE) / attTotal) * 100).toFixed(1) : '0'}%</Mono>
              <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                {[['Hadir', att.PRESENT + att.LATE], ['Sakit', att.SICK], ['Izin', att.PERMITTED], ['Alpa', att.ABSENT]].map(([k, v]) => <div key={k as string} className="border border-line rounded-md py-2"><Mono className="font-semibold">{v}</Mono><div className="text-[11px] text-ink2">{k}</div></div>)}
              </div>
            </Card>
            <Card title="Nilai & Rapor Terbit" pad={false} actions={<button className="text-xs text-accent" onClick={() => nav('/student/grades')}>Semua</button>}>
              {db.reportCards.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 h-14 border-b border-line last:border-0">
                  <FileText className="w-5 h-5 text-ink2" strokeWidth={1.5} />
                  <div className="flex-1 text-sm">Rapor {r.trimester}º Trimestre (CAU {r.trimester})</div>
                  <Button size="sm" icon={Download} onClick={() => setRc(r)}>PDF</Button>
                </div>
              ))}
            </Card>
            <Card title="Status SPP & Pinjaman Buku">
              <div className="flex items-center justify-between">
                <div><div className="text-xs text-ink2">Sisa tagihan SPP</div><Mono className={`text-2xl font-semibold ${balance > 0 ? 'text-bad' : 'text-ok'}`}>{usd(balance)}</Mono></div>
                <Button icon={CreditCard} onClick={() => nav('/student/finance')}>Lihat Tagihan</Button>
              </div>
              <div className="mt-4 pt-3 border-t border-line">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-2">Buku dipinjam</div>
                {loans.length ? loans.map((l) => { const cp = L.copies.get(l.copyId); return <div key={l.id} className="flex items-center justify-between text-sm py-1"><span className="truncate">{L.books.get(cp?.bookId || '')?.title}</span><span className="text-xs text-ink2 shrink-0 ml-2">Kembali {fmtDate(l.dueAt)} <StatusPill status={l.status} /></span></div>; }) : <div className="text-sm text-ink2">Tidak ada pinjaman.</div>}
              </div>
            </Card>
          </div>
        )}
        {tab === 'schedule' && <div className="bg-white border border-line rounded-lg p-3"><TimetableGrid entries={db.schedule} mode="class" /></div>}
        {tab === 'grades' && <GradesSummary student={s} onOpenCard={setRc} />}
        {tab === 'finance' && <InvoiceStatement student={s} />}
        {tab === 'library' && (
          <Card title="Pinjaman Perpustakaan Saya" pad={false}>
            {db.loans.length ? <Table><thead><tr><Th>Barcode</Th><Th>Judul</Th><Th>Dipinjam</Th><Th>Jatuh Tempo</Th><Th>Status</Th></tr></thead>
              <tbody>{db.loans.map((l) => { const cp = L.copies.get(l.copyId); return <Tr key={l.id}><Td mono>{cp?.barcode}</Td><Td>{L.books.get(cp?.bookId || '')?.title}</Td><Td>{fmtDate(l.borrowedAt)}</Td><Td>{fmtDate(l.dueAt)}</Td><Td><StatusPill status={l.status} /></Td></Tr>; })}</tbody></Table>
              : <EmptyState title="Belum ada pinjaman." />}
          </Card>
        )}
        {tab === 'profile' && (
          <div className="grid md:grid-cols-2 gap-5">
            <Card title="Identitas">
              <KV k="Nama" v={s.name} /><KV k="NIS" v={s.studentNo} mono /><KV k="EMIS" v={s.nationalNo} mono />
              <KV k="Tempat, Tgl Lahir" v={`${s.birthPlace}, ${fmtDate(s.birthDate)}`} /><KV k="Rombel" v={`${cls?.name} · ${majorLabel(s.major)}`} />
              <KV k="Profesor da Turma" v={L.teachers.get(cls?.homeroomTeacherId || '')?.name} /><KV k="Alamat" v={s.address} />
            </Card>
            <Card title="Kartu Pelajar Digital"><DigitalIdCard student={s} cls={cls} /></Card>
          </div>
        )}
      </div>
      <Modal open={qr} onClose={() => setQr(false)} title="Kartu Pelajar Digital"><div className="flex justify-center py-6"><div className="scale-110 md:scale-125 origin-center py-6"><DigitalIdCard student={s} cls={cls} /></div></div></Modal>
      <Modal open={!!rc} onClose={() => setRc(null)} title={`Rapor ${rc?.trimester}º Trimestre`} size="xl" footer={<Button variant="primary" icon={Download} onClick={() => window.print()}>Unduh / Cetak PDF</Button>}>
        {rc && <ReportCardDoc student={s} trimester={rc.trimester} card={rc} />}
      </Modal>
    </div>
  );
}
