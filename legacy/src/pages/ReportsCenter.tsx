import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { CheckCircle2, Download, FileSpreadsheet, Play, RotateCw, UploadCloud } from 'lucide-react';
import { useAuth, useData, useDB, useMutation, useToast } from '../context/AppContexts';
import { api, ApiError } from '../lib/api';
import { fileUrl, jobDownloadUrl, uploadFile } from '../lib/files';
import { Alert, Badge, Button, Card, cx, Drawer, Field, Mono, PageHeader, ProgressBar, Select, StatusPill, Table, Tabs, Td, Th, Tr } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import type { Job } from '../lib/types';

type Rep = { code: string; domain: string; name: string; perm: string; trimester?: boolean };
const REPORTS: Rep[] = [
  { code: 'ADM-01', domain: 'Pendaftaran', name: 'Rekap Pendaftar PPDB per Status & Jurusan', perm: 'admission.view' },
  { code: 'STU-01', domain: 'Siswa', name: 'Daftar Siswa Aktif per Rombel', perm: 'student.view' },
  { code: 'STU-02', domain: 'Siswa', name: 'Penerima Beasiswa (Bolseiru)', perm: 'student.view' },
  { code: 'ATT-01', domain: 'Presensi', name: 'Rekap Presensi Harian', perm: 'attendance.view' },
  { code: 'ATT-02', domain: 'Presensi', name: 'Rekap Presensi per Siswa', perm: 'attendance.view' },
  { code: 'GRD-01', domain: 'Nilai / CAU', name: 'Kelengkapan Input Nilai per Mapel', perm: 'assessment.view' },
  { code: 'GRD-02', domain: 'Nilai / CAU', name: 'Ranking Jeral per Jurusan', perm: 'assessment.view', trimester: true },
  { code: 'RPT-01', domain: 'Rapor', name: 'Status Penerbitan Rapor', perm: 'report.view', trimester: true },
  { code: 'FIN-01', domain: 'Keuangan SPP', name: 'Penerimaan Pembayaran', perm: 'finance.view' },
  { code: 'FIN-03', domain: 'Keuangan SPP', name: 'Rekapitulasi Tunggakan SPP', perm: 'finance.view' },
  { code: 'LIB-01', domain: 'Perpustakaan', name: 'Sirkulasi & Keterlambatan', perm: 'library.view' },
  { code: 'AST-01', domain: 'Aset', name: 'Register Aset & Kondisi', perm: 'asset.view' },
  { code: 'EXT-01', domain: 'Ekstrakurikuler', name: 'Keanggotaan Unit NOSSEF', perm: 'extracurricular.view' },
];

function Catalog({ onQueued }: { onQueued: () => void }) {
  const db = useDB();
  const { can } = useAuth();
  const mutate = useMutation();
  const [open, setOpen] = useState<Rep | null>(null);
  const [fmt, setFmt] = useState('XLSX');
  const [classId, setClassId] = useState('');
  const [tri, setTri] = useState('');
  const reps = REPORTS.filter((r) => can(r.perm));
  const domains = [...new Set(reps.map((r) => r.domain))];
  async function run() {
    const job = await mutate<Job>('POST', '/api/jobs', { code: open!.code, format: fmt, params: { classId: classId || undefined, trimester: tri ? Number(tri) : undefined } }, `Laporan ${open!.code} masuk antrean.`);
    if (job) { setOpen(null); onQueued(); }
  }
  return (
    <>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {domains.map((d) => (
          <Card key={d} title={d} pad={false}>
            {reps.filter((r) => r.domain === d).map((r) => (
              <button key={r.code} onClick={() => setOpen(r)} className="w-full flex items-center gap-3 px-4 h-12 border-b border-line last:border-0 hover:bg-hover text-left">
                <Mono className="text-xs text-ink2 w-14">{r.code}</Mono><span className="text-sm flex-1">{r.name}</span><FileSpreadsheet className="w-4 h-4 text-muted" strokeWidth={1.5} />
              </button>
            ))}
          </Card>
        ))}
      </div>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name} subtitle={<Mono>{open?.code}</Mono>} footer={<Button variant="primary" icon={Play} onClick={run}>Jalankan Laporan (Async Job)</Button>}>
        <div className="space-y-4">
          <Field label="Tahun Ajaran"><Select disabled><option>2026</option></Select></Field>
          {open?.trimester && <Field label="Trimestre"><Select value={tri} onChange={(e) => setTri(e.target.value)}><option value="">{open.code === 'GRD-02' ? '2º Trimestre (default)' : 'Semua'}</option>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}º Trimestre</option>)}</Select></Field>}
          <Field label="Kelas"><Select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Semua Rombel</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Format"><div className="flex gap-2">{['PDF', 'XLSX', 'CSV'].map((f) => <button key={f} onClick={() => setFmt(f)} className={cx('flex-1 h-10 rounded-md border text-sm font-mono', fmt === f ? 'bg-ink text-white border-ink' : 'border-line text-ink2')}>{f}</button>)}</div></Field>
          <Alert tone="info">Laporan dibuat di server sebagai background job. File hasil disimpan di database dan dapat diunduh dari tab Monitor Background Jobs.</Alert>
        </div>
      </Drawer>
    </>
  );
}

const IMPORT_TEMPLATES: Record<string, string[]> = {
  STUDENTS: ['name', 'gender', 'birthDate', 'birthPlace', 'className', 'nationalNo'],
  TEACHERS: ['name', 'gender', 'category', 'specialization', 'phone'],
  LIBRARY_BOOKS: ['isbn', 'title', 'author', 'category', 'year'],
};
function Imports() {
  const { toast } = useToast();
  const mutate = useMutation();
  const [kind, setKind] = useState('STUDENTS');
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [res, setRes] = useState<{ total: number; valid: number; invalid: number; errors: { row: number; field: string; code: string; message: string }[] } | null>(null);
  const [done, setDone] = useState<Job | null>(null);
  function template() {
    const h = IMPORT_TEMPLATES[kind];
    const sample = kind === 'STUDENTS' ? [['Ana Maria Soares', 'F', '2010-05-12', 'Railaco', '10º CT-A', ''], ['Tomás Belo', 'M', '2010-02-01', 'Gleno', '10º CT-Z', '']] : kind === 'TEACHERS' ? [['Prof. Exemplo', 'M', 'KONTRATADU', 'Licenciatura em Física', '+670 7700 0000']] : [['978-0-00-000000-0', 'Livro Exemplo', 'Autor', 'Literatura', 2024], ['', 'Tanpa ISBN', '', '', '']];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h, ...sample]), kind); XLSX.writeFile(wb, `template_import_${kind}.xlsx`);
  }
  async function onFile(f: File) {
    setFile(f);
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    setRows(data);
    try { setRes(await api('POST', `/api/import/${kind}`, { rows: data, fileName: f.name })); setStep(2); } catch (e) { toast((e as ApiError).message, 'error'); }
  }
  async function confirm() {
    const stored = file ? await uploadFile(file, { category: 'import' }).catch(() => null) : null;
    const j = await mutate<Job>('POST', `/api/import/${kind}`, { rows, confirm: true, fileName: file?.name, fileId: stored?.id }, 'Impor dieksekusi.');
    if (j) { setDone(j); setStep(4); }
  }
  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {['UPLOAD', 'PREVIEW & VALIDATION', 'ERROR INSPECTOR', 'RESULT'].map((s, i) => (
          <li key={s} className={cx('flex items-center gap-2 px-3 h-10 rounded-md border bg-white', step === i + 1 ? 'border-accent text-accent font-semibold' : step > i + 1 ? 'border-line text-ink' : 'border-line text-muted')}>
            {step > i + 1 ? <CheckCircle2 className="w-4 h-4 text-ok" strokeWidth={1.5} /> : <Mono className="text-[11px]">0{i + 1}</Mono>}{s}
          </li>
        ))}
      </ol>
      {step === 1 && (
        <Card>
          <div className="grid md:grid-cols-[240px_1fr] gap-5">
            <div className="space-y-3">
              <Field label="Jenis Impor"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.keys(IMPORT_TEMPLATES).map((k) => <option key={k}>{k}</option>)}</Select></Field>
              <Button icon={Download} onClick={template} className="w-full">Unduh Template</Button>
              <div className="text-xs text-ink2">Kolom: <Mono className="text-[11px]">{IMPORT_TEMPLATES[kind].join(', ')}</Mono></div>
            </div>
            <label className="border-2 border-dashed border-line-strong rounded-lg bg-canvas hover:bg-hover cursor-pointer flex flex-col items-center justify-center py-12">
              <UploadCloud className="w-8 h-8 text-ink2" strokeWidth={1.5} />
              <span className="text-sm mt-2">Pilih file template .xlsx / .csv</span>
              <span className="text-xs text-muted">Tidak ada data yang ditulis sebelum konfirmasi</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
            </label>
          </div>
        </Card>
      )}
      {step >= 2 && step < 4 && res && (
        <>
          <div className="bg-white border border-line rounded-lg grid grid-cols-3 divide-x divide-line">
            <div className="p-4"><div className="text-xs text-ink2">Total Baris</div><Mono className="text-2xl font-semibold">{res.total}</Mono></div>
            <div className="p-4"><div className="text-xs text-ink2">Baris Valid</div><Mono className="text-2xl font-semibold text-ok">{res.valid}</Mono></div>
            <div className="p-4"><div className="text-xs text-ink2">Baris Error</div><Mono className="text-2xl font-semibold text-bad">{res.invalid}</Mono></div>
          </div>
          <Card title={<>ImportRowError — {file?.name}</>} pad={false}>
            {res.errors.length ? (
              <Table>
                <thead><tr><Th>Nomor Baris</Th><Th>Nama Kolom</Th><Th>Kode Error</Th><Th>Pesan Perbaikan</Th></tr></thead>
                <tbody>{res.errors.map((e, i) => <Tr key={i}><Td mono>{e.row}</Td><Td mono>{e.field}</Td><Td><Badge tone="bad" mono>{e.code}</Badge></Td><Td>{e.message}</Td></Tr>)}</tbody>
              </Table>
            ) : <div className="p-4"><Alert tone="ok">Semua baris valid.</Alert></div>}
          </Card>
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setStep(1); setRes(null); }}>Ulangi</Button>
            <Button variant="dark" disabled={!res.valid} onClick={confirm}>Konfirmasi & Eksekusi Impor ({res.valid} baris)</Button>
          </div>
        </>
      )}
      {step === 4 && done && (
        <Card>
          <div className="flex items-center gap-3"><CheckCircle2 className="w-6 h-6 text-ok" strokeWidth={1.5} /><div><div className="font-semibold">Impor selesai (SUCCEEDED)</div><div className="text-sm text-ink2"><Mono>{done.result?.imported}</Mono> baris diimpor · <Mono>{done.result?.skipped}</Mono> dilewati</div></div></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => { setStep(1); setRes(null); setDone(null); }}>Impor Lain</Button>
            {done.fileId && <a href={fileUrl(done.fileId, true)}><Button icon={Download}>Unduh Laporan Hasil</Button></a>}
            {done.sourceFileId && <a href={fileUrl(done.sourceFileId, true)}><Button icon={Download}>Unduh File Sumber</Button></a>}
          </div>
        </Card>
      )}
    </div>
  );
}

function Jobs() {
  const db = useDB();
  const { reload } = useData();
  const mutate = useMutation();
  const active = db.reportJobs.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => reload(), 1000); // poll while background jobs run
    return () => clearInterval(t);
  }, [active, reload]);
  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <Table>
        <thead><tr><Th>Job</Th><Th>Jenis</Th><Th>Kode</Th><Th>Format</Th><Th>Oleh</Th><Th>Dibuat</Th><Th className="w-40">Progres</Th><Th>Status</Th><Th /></tr></thead>
        <tbody>{db.reportJobs.map((j) => (
          <Tr key={j.id}>
            <Td className="font-medium">{j.name}{j.rows != null && <div className="text-xs text-ink2"><Mono className="text-[11px]">{j.rows}</Mono> baris</div>}{j.error && <div className="text-xs text-bad">{j.error}</div>}</Td>
            <Td><Badge mono>{j.kind}</Badge></Td><Td mono>{j.code}</Td><Td mono>{j.format}</Td><Td mono className="text-xs">{j.by}</Td><Td className="text-xs whitespace-nowrap">{fmtDateTime(j.createdAt)}</Td>
            <Td><div className="flex items-center gap-2"><ProgressBar value={j.progress} tone={j.status === 'FAILED' ? 'bad' : j.status === 'SUCCEEDED' ? 'ok' : 'accent'} /><Mono className="text-[11px]">{j.progress}%</Mono></div></Td>
            <Td><StatusPill status={j.status} label={j.status === 'RUNNING' ? `RUNNING ${j.progress}%` : undefined} /></Td>
            <Td>
              {j.status === 'FAILED' && j.kind === 'REPORT' && <Button size="sm" icon={RotateCw} onClick={() => mutate('POST', `/api/jobs/${j.id}/retry`, {}, 'Job dijalankan ulang.')}>Coba Lagi</Button>}
              {j.status === 'SUCCEEDED' && (j.fileId || j.kind === 'REPORT') && <a href={jobDownloadUrl(j.id)}><Button size="sm" icon={Download}>Unduh Hasil</Button></a>}
            </Td>
          </Tr>))}</tbody>
      </Table>
    </div>
  );
}

export default function ReportsCenter() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'reports';
  return (
    <div>
      <PageHeader title="Pusat Laporan, Impor Massal & Background Jobs" />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'reports', label: 'Katalog Laporan Resmi' }, ...(can('system.import') ? [{ id: 'imports', label: 'Impor Data 4-Tahap' }] : []), { id: 'jobs', label: 'Monitor Background Jobs' }]} />
      {tab === 'reports' && <Catalog onQueued={() => setParams({ tab: 'jobs' })} />}
      {tab === 'imports' && <Imports />}
      {tab === 'jobs' && <Jobs />}
    </div>
  );
}
