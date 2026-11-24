import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRightLeft, FileText, Lock, Printer } from 'lucide-react';
import { useAuth, useDB, useLookups } from '../context/AppContexts';
import { Badge, Button, Card, Denied, KV, Modal, Mono, PageHeader, StatusPill, Table, Tabs, Td, Th, Tr } from '../components/ui';
import { DigitalIdCard, Photo3x4 } from '../components/StudentCard';
import { fmtDate, fmtDateTime, majorLabel, num2, SCHOLARSHIP_LABEL, usd } from '../lib/format';
import { TransferModal, useStudentStats } from './Students';
import { fileUrl } from '../lib/files';
import { AttendanceHistory, GradesSummary, InvoiceStatement } from './StudentPortal';

type T = 'summary' | 'enrollment' | 'guardians' | 'attendance' | 'grades' | 'finance' | 'documents';

export default function StudentProfile() {
  const { id } = useParams();
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const s = db.students.find((x) => x.id === id) || null;
  const stats = useStudentStats(s);
  const [tab, setTab] = useState<T>('summary');
  const [transfer, setTransfer] = useState(false);
  const [card, setCard] = useState(false);
  if (!s) return <Denied code="OBJECT_SCOPE_DENIED" />;
  const cls = L.classes.get(s.classId);
  const guardians = db.guardians.filter((g) => g.studentIds.includes(s.id));
  const tabs: { id: T; label: string; icon?: typeof Lock }[] = [
    { id: 'summary', label: 'Ringkasan & Identitas' }, { id: 'enrollment', label: 'Riwayat Kelas (Enrollment)' }, { id: 'guardians', label: 'Orang Tua / Wali' },
    { id: 'attendance', label: 'Presensi' }, { id: 'grades', label: 'Nilai & Rapor' },
    ...(can('finance.view') ? [{ id: 'finance' as T, label: 'Keuangan SPP', icon: Lock }] : []), { id: 'documents', label: 'Dokumen Privasi' },
  ];
  return (
    <div>
      <PageHeader title="Profil Siswa 360°" back="/students" />
      <div className="bg-white border border-line rounded-lg p-5 md:p-6 mb-5 flex flex-col md:flex-row gap-5">
        <Photo3x4 name={s.name} w={64} bg={s.gender === 'F' ? 'red' : 'blue'} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-semibold">{s.name}</h2><StatusPill status={s.status} />{s.scholarship && <Badge tone="info">Bolsa {SCHOLARSHIP_LABEL[s.scholarship]}</Badge>}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-ink2">
            <span>NIS <Mono className="text-ink">{s.studentNo}</Mono></span>
            <span>EMIS <Mono className="text-ink">{s.nationalNo}</Mono></span>
            <span>Penempatan: <b className="text-ink">{cls?.name} — Tahun Ajaran 2026</b></span>
          </div>
          <div className="text-sm text-ink2 mt-1">Profesor da Turma: {L.teachers.get(cls?.homeroomTeacherId || '')?.name}</div>
        </div>
        <div className="flex flex-wrap gap-2 md:self-start">
          {can('student.change_status') && <Button icon={ArrowRightLeft} onClick={() => setTransfer(true)}>Mutasi / Pindah Kelas-Jurusan</Button>}
          <Button icon={Printer} onClick={() => setCard(true)}>Cetak Kartu Pelajar</Button>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'summary' && (
        <div className="grid lg:grid-cols-3 gap-5">
          <Card title="Identitas" className="lg:col-span-2">
            <div className="grid md:grid-cols-2 gap-x-8">
              <div>
                <KV k="Nama Lengkap" v={s.name} />
                <KV k="Jenis Kelamin" v={s.gender === 'F' ? 'Perempuan (Feto)' : 'Laki-laki (Mane)'} />
                <KV k="Tempat, Tanggal Lahir" v={`${s.birthPlace}, ${fmtDate(s.birthDate)}`} />
                <KV k="Agama" v={s.religion || 'Katóliku'} />
              </div>
              <div>
                <KV k="Alamat" v={s.address} />
                <KV k="Tahun Masuk" v={s.entryYear} mono />
                <KV k="Jurusan" v={majorLabel(s.major)} />
                <KV k="Kehadiran" v={`${stats?.rate.toFixed(1)}%`} mono />
              </div>
            </div>
          </Card>
          <Card title="Kartu Pelajar Digital"><DigitalIdCard student={s} cls={cls} /></Card>
        </div>
      )}
      {tab === 'enrollment' && (
        <div className="space-y-5">
          <Card title="Timeline Riwayat Enrollment (immutable)" pad={false}>
            <Table>
              <thead><tr><Th>Tahun</Th><Th>Tingkat</Th><Th>Jurusan</Th><Th>Rombel</Th><Th>Status</Th><Th>Sumber</Th></tr></thead>
              <tbody>{[...s.enrollments].reverse().map((e, i) => <Tr key={i}><Td mono className="font-semibold">{e.year}</Td><Td>Kelas {e.grade}</Td><Td>{majorLabel(e.major)}</Td><Td>{e.className}</Td><Td><StatusPill status={e.status} /></Td><Td><Mono className="text-xs">{e.source}</Mono></Td></Tr>)}</tbody>
            </Table>
          </Card>
          <Card title="Riwayat Mutasi (StudentTransfer)" pad={false}>
            {s.transfers.length ? (
              <Table>
                <thead><tr><Th>Tanggal Efektif</Th><Th>Jenis</Th><Th>Dari → Ke</Th><Th>Alasan</Th><Th>Disetujui</Th></tr></thead>
                <tbody>{s.transfers.map((t, i) => <Tr key={i}><Td mono>{t.effectiveDate}</Td><Td><Mono className="text-xs">{t.type}</Mono></Td><Td>{t.fromClass} → {t.toClass}</Td><Td>{t.reason}{t.document && <a href={fileUrl(t.document.id)} target="_blank" rel="noreferrer" className="block text-xs text-accent">{t.document.name}</a>}</Td><Td className="text-xs text-ink2">{t.approvedBy}<div>{fmtDateTime(t.at)}</div></Td></Tr>)}</tbody>
              </Table>
            ) : <div className="p-5 text-sm text-ink2">Belum ada riwayat mutasi.</div>}
          </Card>
        </div>
      )}
      {tab === 'guardians' && (
        <div className="grid md:grid-cols-2 gap-4">
          {guardians.map((g, i) => (
            <Card key={g.id} title={g.name} actions={<>{i === 0 && <Badge tone="dark">Primary Contact</Badge>}<Badge>Financial Contact</Badge></>}>
              <KV k="Hubungan" v={g.relation} />
              <KV k="Pekerjaan" v={g.occupation || '—'} />
              <KV k="No. HP" v={g.phone} mono />
              <KV k="Anak di NOSSEF" v={g.studentIds.map((x) => L.students.get(x)?.name).join(', ')} />
            </Card>
          ))}
        </div>
      )}
      {tab === 'attendance' && <AttendanceHistory student={s} />}
      {tab === 'grades' && <GradesSummary student={s} showAll />}
      {tab === 'finance' && <InvoiceStatement student={s} />}
      {tab === 'documents' && (
        <Card title="Dokumen Privasi" pad={false}>
          {[['Sertidaun Moris / Batizmu', 'PDF', 412], ['Sertifikadu Pre-Sekundária', 'PDF', 680], ['Pasfoto 3x4', 'JPG', 140], ['Kartaun Família', 'PDF', 230]].map(([n, t, k]) => (
            <div key={n as string} className="flex items-center gap-3 px-4 h-14 border-b border-line last:border-0">
              <FileText className="w-5 h-5 text-ink2" strokeWidth={1.5} />
              <span className="flex-1 text-sm">{n}</span><Badge mono>{t}</Badge><Mono className="text-xs text-muted">{k} KB</Mono>
            </div>
          ))}
          <div className="px-4 py-3 text-xs text-ink2 border-t border-line">Setiap akses dokumen dicatat di Audit Log. Rata-rata nilai T2: <Mono>{num2(db.scores.filter((x) => x.studentId === s.id && x.trimester === 2 && x.final != null).reduce((a, b, _i, arr) => a + b.final! / arr.length, 0))}</Mono> · Saldo SPP: <Mono>{usd(stats?.balance)}</Mono></div>
        </Card>
      )}
      <TransferModal student={s} open={transfer} onClose={() => setTransfer(false)} />
      <Modal open={card} onClose={() => setCard(false)} title="Cetak Kartu Pelajar" footer={<Button variant="primary" icon={Printer} onClick={() => window.print()}>Cetak</Button>}>
        <div className="print-area flex justify-center py-4"><DigitalIdCard student={s} cls={cls} /></div>
      </Modal>
    </div>
  );
}
