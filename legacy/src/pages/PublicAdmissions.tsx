import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Copy, Download, FileText, Search, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { fmtDate, fmtDateTime } from '../lib/format';
import type { StoredFile } from '../lib/files';
import { Alert, Badge, Button, cx, Field, Input, Mono, Select, StatusPill, Textarea } from '../components/ui';
import { FileField } from '../components/FileField';
import { PublicTopStrip } from './Login';

const STEPS = ['Identitas Calon Siswa', 'Data Orang Tua/Wali', 'Unggah Dokumen Resmi', 'Tinjau & Kirim'];
const DOCS = [
  { type: 'CERTIFICATE', label: 'Ijazah / SKHUN Pre-Sekundária' },
  { type: 'BIRTH', label: 'Akta Kelahiran / Sertidaun Batizmu' },
  { type: 'PHOTO', label: 'Pasfoto 3x4 (latar merah/biru)' },
];

// Registrations are remembered on this device so applicants can track them later without retyping.
interface SavedReg { regNo: string; birthDate: string; name: string; at: string; status: string }
const SAVED_KEY = 'nossef.ppdb.registrations';
function loadSaved(): SavedReg[] { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } }
function storeSaved(list: SavedReg[]) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } }
function rememberReg(r: SavedReg) { storeSaved([r, ...loadSaved().filter((x) => x.regNo !== r.regNo)].slice(0, 10)); }

function PublicHeader({ period }: { period: { name: string; status: string } | null }) {
  return (
    <div className="h-16 bg-white border-b border-line no-print">
      <div className="max-w-5xl mx-auto h-full px-4 flex items-center gap-3">
        <img src="/crest.svg" width={32} height={32} alt="" className="rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-ink truncate">Portal Penerimaan Siswa Baru (PPDB)</div>
          <div className="text-xs text-ink2 truncate">NOSSEF Railaco · Município Ermera</div>
        </div>
        {period && <Badge tone={period.status === 'OPEN' ? 'ok' : 'neutral'} dot className="hidden sm:inline-flex">Periode {period.name.replace('PPDB ', '')}: {period.status === 'OPEN' ? 'DIBUKA' : 'DITUTUP'}</Badge>}
        <Link to="/ppdb/status"><Button size="sm">Cek Status Pendaftaran</Button></Link>
      </div>
    </div>
  );
}

/** Registration proof shown right after submitting; can be printed / saved as PDF. */
function RegistrationProof({ result, onDone }: { result: SavedReg & { guardianPhone: string; majorPref: string }; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  return (
    <div className="space-y-4">
      <div className="print-area bg-white border border-line rounded-lg p-6 md:p-8">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <CheckCircle2 className="w-8 h-8 text-ok shrink-0" strokeWidth={1.5} />
          <div>
            <h2 className="font-display text-xl font-semibold">{result.status === 'DRAFT' ? 'Draf pendaftaran tersimpan' : 'Pendaftaran resmi terkirim'}</h2>
            <div className="text-xs text-ink2">Bukti Pendaftaran PPDB NOSSEF Railaco 2026/2027 · {fmtDateTime(result.at)}</div>
          </div>
        </div>
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center mt-5">
          <div>
            <div className="text-xs text-ink2">Nomor Registrasi</div>
            <div className="font-mono text-3xl font-semibold tracking-tight">{result.regNo}</div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-ink2">Nama</span><span>{result.name}</span>
              <span className="text-ink2">Tanggal Lahir</span><span>{fmtDate(result.birthDate)}</span>
              <span className="text-ink2">Minat Jurusan</span><span>{result.majorPref === 'CT' ? 'IPA / CT' : 'IPS / CSH'}</span>
              <span className="text-ink2">Status</span><span><StatusPill status={result.status} /></span>
            </div>
          </div>
          <div className="flex md:flex-col gap-2 no-print">
            <Button icon={Copy} onClick={() => { navigator.clipboard?.writeText(result.regNo).then(() => setCopied(true)).catch(() => {}); }}>{copied ? 'Tersalin' : 'Salin Nomor'}</Button>
            <Button icon={Download} onClick={() => window.print()}>Unduh / Cetak Bukti</Button>
          </div>
        </div>
        <div className="mt-6 flex gap-3 border border-warn/40 bg-warn-bg rounded-md p-4 text-sm">
          <AlertTriangle className="w-5 h-5 text-warn shrink-0" strokeWidth={1.5} />
          <div>
            <div className="font-semibold">PENTING — Simpan nomor registrasi ini baik-baik</div>
            <p className="text-ink2 mt-1">
              Nomor registrasi <b className="font-mono">{result.regNo}</b> bersama tanggal lahir calon siswa adalah satu-satunya cara untuk melacak status seleksi,
              melakukan daftar ulang, dan berkomunikasi dengan sekolah. Catat di kertas, simpan foto/PDF bukti ini, atau bagikan ke nomor HP wali.
              Sekolah tidak mengirim ulang nomor registrasi melalui telepon.
            </p>
            <p className="text-ink2 mt-1 no-print">Nomor ini juga sudah tersimpan otomatis di perangkat ini dan akan muncul di halaman Cek Status.</p>
          </div>
        </div>
      </div>
      <label className="flex items-start gap-3 bg-white border border-line rounded-lg p-4 text-sm cursor-pointer no-print">
        <input type="checkbox" className="accent-[#0061FE] w-4 h-4 mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>Saya sudah menyimpan nomor registrasi <b className="font-mono">{result.regNo}</b> dan memahami bahwa nomor ini diperlukan untuk melacak pendaftaran.</span>
      </label>
      <div className="flex justify-end gap-2 no-print">
        <Button variant="primary" disabled={!ack} onClick={onDone}>Lanjut ke Cek Status Seleksi</Button>
      </div>
    </div>
  );
}

function ApplyForm() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: '', gender: 'F', birthPlace: '', birthDate: '', origin: '', phone: '', email: '', address: '', majorPref: 'CT', avgScore: '' });
  const [g, setG] = useState({ name: '', relation: 'FATHER', occupation: '', phone: '', primary: true });
  const [docs, setDocs] = useState<Record<string, StoredFile | null>>({ CERTIFICATE: null, BIRTH: null, PHOTO: null });
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<(SavedReg & { guardianPhone: string; majorPref: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const avgInvalid = f.avgScore !== '' && (Number(f.avgScore) < 0 || Number(f.avgScore) > 10);

  const stepValid = [f.name && f.birthDate && f.birthPlace && f.origin && f.address && !avgInvalid, g.name && g.phone, Object.values(docs).every(Boolean), true];
  async function send(draft: boolean) {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ regNo: string; status: string }>('POST', '/api/public/admissions/apply', {
        ...f, guardian: g, draft,
        documents: DOCS.map((d) => ({ type: d.type, label: d.label, fileId: docs[d.type]?.id || null, fileName: docs[d.type]?.name || '', sizeKb: Math.ceil((docs[d.type]?.size || 0) / 1024) })),
      });
      const saved = { regNo: r.regNo, birthDate: f.birthDate, name: f.name, at: new Date().toISOString(), status: r.status };
      rememberReg(saved);
      setResult({ ...saved, guardianPhone: g.phone, majorPref: f.majorPref });
      window.scrollTo(0, 0);
    } catch (e) { const x = e as ApiError; setErr(`${x.code}: ${x.message}`); } finally { setBusy(false); }
  }

  if (result) return <RegistrationProof result={result} onDone={() => nav(`/ppdb/status?reg=${result.regNo}`)} />;

  return (
    <>
      <ol className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
        {STEPS.map((s, i) => (
          <li key={s} className={cx('flex items-center gap-2 h-10 px-3 rounded-md border text-sm whitespace-nowrap', i === step ? 'border-accent bg-selected text-accent font-semibold' : i < step ? 'border-line bg-white text-ink' : 'border-line bg-white text-muted')}>
            {i < step ? <CheckCircle2 className="w-4 h-4 text-ok" strokeWidth={1.5} /> : <Mono className="text-xs">{String(i + 1).padStart(2, '0')}</Mono>}
            {s}
          </li>
        ))}
      </ol>
      <div className="bg-white border border-line rounded-lg p-5 md:p-8">
        {step === 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nama Lengkap Resmi" required className="md:col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Sesuai akta kelahiran / sertidaun batizmu" /></Field>
            <Field label="Tempat Lahir" required><Input value={f.birthPlace} onChange={(e) => set('birthPlace', e.target.value)} /></Field>
            <Field label="Tanggal Lahir" required><Input type="date" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></Field>
            <Field label="Jenis Kelamin"><Select value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="F">Perempuan (Feto)</option><option value="M">Laki-laki (Mane)</option></Select></Field>
            <Field label="Sekolah Asal (Escola Pre-Sekundária)" required><Input value={f.origin} onChange={(e) => set('origin', e.target.value)} placeholder="mis. EBF Railaco" /></Field>
            <Field label="Nomor Telepon"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+670 77xx xxxx" /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Alamat Lengkap" required className="md:col-span-2"><Textarea value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Aldeia, Suco, Posto Administrativo" /></Field>
            <Field label="Minat Jurusan" hint="Preferensi awal; penempatan final ditentukan sekolah."><Select value={f.majorPref} onChange={(e) => set('majorPref', e.target.value)}><option value="CT">IPA / Ciências e Tecnologias</option><option value="CSH">IPS / Ciências Sociais e Humanidades</option></Select></Field>
            <Field label="Nilai Rata-rata Pre-Sekundária" hint="Skala 0 – 10" error={avgInvalid ? 'Nilai harus antara 0 dan 10.' : null}><Input mono type="number" step="0.01" min={0} max={10} value={f.avgScore} onChange={(e) => set('avgScore', e.target.value)} /></Field>
          </div>
        )}
        {step === 1 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nama Wali / Inan-Aman" required className="md:col-span-2"><Input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></Field>
            <Field label="Hubungan"><Select value={g.relation} onChange={(e) => setG({ ...g, relation: e.target.value })}><option value="FATHER">FATHER — Aman</option><option value="MOTHER">MOTHER — Inan</option><option value="GUARDIAN">GUARDIAN — Wali</option></Select></Field>
            <Field label="Pekerjaan"><Input value={g.occupation} onChange={(e) => setG({ ...g, occupation: e.target.value })} /></Field>
            <Field label="Nomor Telepon Aktif" required hint="Dipakai untuk memulihkan nomor registrasi jika lupa."><Input value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} placeholder="+670 77xx xxxx" /></Field>
            <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={g.primary} onChange={(e) => setG({ ...g, primary: e.target.checked })} className="accent-[#0061FE]" /> Kontak Utama</label>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            {DOCS.map((d) => (
              <Field key={d.type} label={d.label} required>
                <FileField value={docs[d.type]} onChange={(v) => setDocs((x) => ({ ...x, [d.type]: v }))} category="admission" publicUpload accept={d.type === 'PHOTO' ? '.jpg,.jpeg,.png' : '.pdf,.jpg,.jpeg,.png'} label={d.type === 'PHOTO' ? 'Unggah foto JPG/PNG' : 'Unggah PDF atau foto JPG/PNG'} hint="maks 5 MB" />
              </Field>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-2">Calon Siswa</div>
              <div className="font-medium">{f.name}</div>
              <div className="text-ink2">{f.birthPlace}, {fmtDate(f.birthDate)} · {f.gender === 'F' ? 'Perempuan' : 'Laki-laki'}</div>
              <div className="text-ink2">{f.origin} · Minat {f.majorPref === 'CT' ? 'IPA / CT' : 'IPS / CSH'}{f.avgScore && <> · Rata-rata <Mono>{f.avgScore}</Mono>/10</>}</div>
              <div className="text-ink2">{f.address}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-2">Orang Tua / Wali</div>
              <div className="font-medium">{g.name}</div>
              <div className="text-ink2">{g.relation} · {g.occupation || '—'} · <Mono>{g.phone}</Mono></div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mt-4 mb-2">Dokumen</div>
              {DOCS.map((d) => <div key={d.type} className="flex items-center gap-2 text-ink2"><FileText className="w-4 h-4" strokeWidth={1.5} />{docs[d.type]?.name || '—'}</div>)}
            </div>
            <div className="md:col-span-2"><Alert tone="info">Dengan mengirim formulir ini, Anda menyatakan bahwa data yang diisi benar dan dapat dipertanggungjawabkan. Setelah terkirim, Anda akan menerima <b>Nomor Registrasi</b> yang wajib disimpan.</Alert></div>
          </div>
        )}
        {err && <div className="mt-4"><Alert tone="bad" title="Tidak dapat mengirim">{err}</Alert></div>}
      </div>
      <div className="sticky bottom-0 mt-4 -mx-4 md:mx-0 px-4 md:px-0 py-3 bg-canvas/95 border-t md:border-0 border-line flex items-center gap-2">
        <Button onClick={() => send(true)} disabled={!f.name || !f.birthDate || !g.name || !g.phone || busy}>Simpan Draf</Button>
        <div className="flex-1" />
        {step > 0 && <Button icon={ArrowLeft} onClick={() => setStep(step - 1)}>Kembali</Button>}
        {step < 3 ? (
          <Button variant="primary" disabled={!stepValid[step]} onClick={() => setStep(step + 1)}>Lanjut</Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => send(false)}>Kirim Pendaftaran Resmi</Button>
        )}
      </div>
    </>
  );
}

type StatusRes = { regNo: string; name: string; status: string; majorPref: string; rank: number | null; decisionNote: string };
const STATUS_MSG: Record<string, [string, 'ok' | 'warn' | 'bad' | 'info']> = {
  ACCEPTED: ['Selamat! Anda DITERIMA di NOSSEF Railaco. Silakan melakukan Daftar Ulang di Sekretaria sebelum 15 Desember 2026 dengan membawa dokumen asli dan pembayaran Etapa 1 ($85.50).', 'ok'],
  RE_REGISTERED: ['Daftar ulang telah dikonfirmasi. Penempatan rombel Kelas 10 akan diumumkan.', 'ok'],
  ENROLLED: ['Anda telah terdaftar sebagai siswa aktif Kelas 10.', 'ok'],
  WAITING_LIST: ['Anda berada di daftar cadangan. Sekolah akan menghubungi jika kuota tersedia.', 'warn'],
  REJECTED: ['Mohon maaf, pendaftaran Anda tidak dapat diterima pada periode ini.', 'bad'],
  SUBMITTED: ['Berkas diterima dan sedang menunggu verifikasi petugas.', 'info'],
  VERIFIED: ['Berkas telah diverifikasi. Menunggu keputusan seleksi.', 'info'],
  DRAFT: ['Pendaftaran masih berupa draf dan belum dikirim.', 'warn'],
};

function StatusCheck() {
  const { search } = useLocation();
  const [saved, setSaved] = useState<SavedReg[]>(loadSaved);
  const pre = new URLSearchParams(search).get('reg');
  const preSaved = saved.find((s) => s.regNo === pre);
  const [regNo, setRegNo] = useState(preSaved?.regNo || '');
  const [birthDate, setBirthDate] = useState(preSaved?.birthDate || '');
  const [res, setRes] = useState<StatusRes | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [lost, setLost] = useState(false);
  const [lk, setLk] = useState({ name: '', birthDate: '', phone: '' });
  const [lkRes, setLkRes] = useState<{ regNo: string; name: string; birthDate: string; status: string } | null>(null);
  const [lkErr, setLkErr] = useState<string | null>(null);

  async function check(r = regNo, b = birthDate) {
    setErr(null); setRes(null);
    try {
      const out = await api<StatusRes>('GET', `/api/public/admissions/status?regNo=${encodeURIComponent(r)}&birthDate=${b}`);
      setRes(out);
      rememberReg({ regNo: out.regNo, birthDate: b, name: out.name, at: saved.find((x) => x.regNo === out.regNo)?.at || new Date().toISOString(), status: out.status });
      setSaved(loadSaved());
    } catch (x) { setErr(x as ApiError); }
  }
  useEffect(() => { if (preSaved) check(preSaved.regNo, preSaved.birthDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {saved.length > 0 && (
        <div className="bg-white border border-line rounded-lg overflow-hidden">
          <div className="px-5 h-11 flex items-center border-b border-line text-sm font-semibold">Pendaftaran tersimpan di perangkat ini</div>
          {saved.map((s) => (
            <div key={s.regNo} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-0">
              <div className="flex-1 min-w-0"><Mono className="font-semibold">{s.regNo}</Mono><div className="text-xs text-ink2 truncate">{s.name} · lahir {fmtDate(s.birthDate)}</div></div>
              <Button size="sm" icon={Search} onClick={() => { setRegNo(s.regNo); setBirthDate(s.birthDate); check(s.regNo, s.birthDate); }}>Cek</Button>
              <button title="Hapus dari perangkat" onClick={() => { const n = saved.filter((x) => x.regNo !== s.regNo); storeSaved(n); setSaved(n); }} className="p-1.5 text-muted hover:text-bad"><Trash2 className="w-4 h-4" strokeWidth={1.5} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="bg-white border border-line rounded-lg p-5 md:p-8">
        <h2 className="font-display text-lg font-semibold">Cek Status Pendaftaran</h2>
        <p className="text-sm text-ink2 mt-1">Masukkan nomor registrasi dan tanggal lahir calon siswa.</p>
        <form onSubmit={(e) => { e.preventDefault(); check(); }} className="grid md:grid-cols-[1fr_1fr_auto] gap-3 mt-5 items-end">
          <Field label="Nomor Registrasi"><Input mono value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} placeholder="REG-2026-0194" required /></Field>
          <Field label="Tanggal Lahir"><Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required /></Field>
          <Button variant="primary" icon={Search} type="submit" className="h-10">Cek Status</Button>
        </form>
        {err && <div className="mt-4 flex gap-2 bg-bad-bg border border-bad rounded-md px-3 py-2.5 text-sm"><AlertCircle className="w-4 h-4 text-bad mt-0.5" strokeWidth={1.5} /><div><Mono className="text-xs text-bad font-semibold">{err.code}</Mono><div className="text-ink2">{err.message}</div></div></div>}
        {res && (
          <div className="mt-6 border border-line rounded-lg overflow-hidden">
            <div className="px-5 py-4 bg-canvas border-b border-line flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0"><div className="font-semibold">{res.name}</div><Mono className="text-xs text-ink2">{res.regNo}</Mono></div>
              <StatusPill status={res.status} />
            </div>
            <div className="px-5 py-4 text-sm space-y-3">
              <Alert tone={STATUS_MSG[res.status]?.[1] || 'info'}>{STATUS_MSG[res.status]?.[0]}</Alert>
              <div className="flex gap-6 text-ink2"><span>Minat: {res.majorPref === 'CT' ? 'IPA / CT' : 'IPS / CSH'}</span>{res.rank && <span>Peringkat: <Mono>#{res.rank}</Mono></span>}</div>
              {res.decisionNote && <div className="text-ink2">Catatan: {res.decisionNote}</div>}
            </div>
          </div>
        )}
        <div className="mt-6 pt-4 border-t border-line">
          <button onClick={() => setLost(!lost)} className="text-sm text-accent">Lupa nomor registrasi?</button>
          {lost && (
            <div className="mt-3">
              <p className="text-xs text-ink2 mb-3">Isi data persis seperti pada formulir pendaftaran. Nomor registrasi akan ditampilkan jika ketiga data cocok.</p>
              <div className="grid md:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-end">
                <Field label="Nama Lengkap Calon Siswa"><Input value={lk.name} onChange={(e) => setLk({ ...lk, name: e.target.value })} /></Field>
                <Field label="Tanggal Lahir"><Input type="date" value={lk.birthDate} onChange={(e) => setLk({ ...lk, birthDate: e.target.value })} /></Field>
                <Field label="No. HP Wali"><Input value={lk.phone} onChange={(e) => setLk({ ...lk, phone: e.target.value })} placeholder="+670 77xx xxxx" /></Field>
                <Button className="h-10" disabled={!lk.name || !lk.birthDate || !lk.phone} onClick={async () => {
                  setLkErr(null); setLkRes(null);
                  try {
                    const r = await api<{ regNo: string; name: string; birthDate: string; status: string }>('POST', '/api/public/admissions/lookup', lk);
                    setLkRes(r); rememberReg({ ...r, at: new Date().toISOString() }); setSaved(loadSaved()); setRegNo(r.regNo); setBirthDate(r.birthDate);
                  } catch (e) { setLkErr((e as ApiError).message); }
                }}>Cari</Button>
              </div>
              {lkErr && <div className="mt-3"><Alert tone="bad">{lkErr}</Alert></div>}
              {lkRes && <div className="mt-3"><Alert tone="ok" title={<>Nomor registrasi Anda: <Mono>{lkRes.regNo}</Mono></>}>Nomor ini sudah disimpan di perangkat ini. Simpan juga di tempat lain agar tidak hilang.</Alert></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PublicAdmissions() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [period, setPeriod] = useState<{ name: string; status: string; close: string } | null>(null);
  useEffect(() => { api<{ period: { name: string; status: string; close: string } }>('GET', '/api/public/info').then((r) => setPeriod(r.period)).catch(() => {}); }, []);
  const isStatus = pathname.includes('status');
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="no-print"><PublicTopStrip /></div>
      <PublicHeader period={period} />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-1 mb-4 border-b border-line no-print">
          {[['apply', 'Formulir Pendaftaran'], ['status', 'Cek Status Seleksi']].map(([k, l]) => (
            <button key={k} onClick={() => nav(`/ppdb/${k}`)} className={cx('relative h-10 px-3 text-sm', (k === 'status') === isStatus ? 'font-semibold text-ink' : 'text-ink2')}>
              {l}{(k === 'status') === isStatus && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent" />}
            </button>
          ))}
          <Link to="/login" className="ml-auto text-xs text-ink2 hover:text-ink">Masuk staf</Link>
        </div>
        {period && !isStatus && <div className="text-xs text-ink2 mb-3 no-print">{period.name} · ditutup {fmtDate(period.close)}</div>}
        {isStatus ? <StatusCheck /> : <ApplyForm />}
      </div>
    </div>
  );
}
