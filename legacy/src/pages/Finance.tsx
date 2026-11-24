import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, CheckCircle2, Download, FilePlus2, Receipt, RotateCcw, XCircle } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { Alert, Avatar, Badge, Button, Card, cx, Drawer, EmptyState, Field, Input, KV, Modal, Mono, PageHeader, Pager, ReasonDialog, SearchInput, Select, Stat, StatusPill, Table, Tabs, Td, Th, Tr, usePaged } from '../components/ui';
import { ReceiptModal } from './StudentPortal';
import { downloadText, fmtDate, fmtDateTime, SCHOOL_TODAY, toCsv, usd } from '../lib/format';
import { FileField, FilePreview } from '../components/FileField';
import type { StoredFile } from '../lib/files';
import type { Payment, Student } from '../lib/types';
import { api } from '../lib/api';

type T = 'cashier' | 'invoices' | 'pending' | 'arrears' | 'fees';

function BankProof({ p }: { p: Payment }) {
  const L = useLookups();
  if (p.proofFileId) return <FilePreview id={p.proofFileId} name={`Kuitansi ${p.bank} ${p.proofRef}`} height={360} />;
  const s = L.students.get(p.studentId);
  return (
    <div className="rounded-md border border-line bg-canvas p-4 font-mono text-[11px] leading-relaxed text-ink">
      <div className="flex items-center justify-between border-b border-dashed border-line-strong pb-2 mb-2">
        <span className="font-semibold text-xs">{p.bank?.toUpperCase()}</span><span className="text-muted">KUITANSI SETORAN</span>
      </div>
      <div>NO. KUITANSI : {p.proofRef}</div>
      <div>DATA        : {fmtDateTime(p.receivedAt)}</div>
      <div>BENEFISIÁRIU: ESC. SEC. CAT. NOSSEF RAILACO</div>
      <div>KONTA       : 0021-•••-4410</div>
      <div>DESKRISAUN  : PROPINA {s?.studentNo}</div>
      <div className="border-t border-dashed border-line-strong mt-2 pt-2 text-sm font-semibold">MONTANTE    : USD {p.amount.toFixed(2)}</div>
      <div className="text-muted mt-2">Data contoh (seed) — tidak ada file kuitansi terlampir.</div>
    </div>
  );
}

function Cashier() {
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const mutate = useMutation();
  const [q, setQ] = useState('');
  const [student, setStudent] = useState<Student | null>(null);
  const [method, setMethod] = useState<'CASH' | 'BANK_RECEIPT'>('CASH');
  const [bank, setBank] = useState('BNU Timor');
  const [proofRef, setProofRef] = useState('');
  const [depositDate, setDepositDate] = useState(SCHOOL_TODAY);
  const [proofFile, setProofFile] = useState<StoredFile | null>(null);
  const [amount, setAmount] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [reverse, setReverse] = useState<Payment | null>(null);
  const matches = q.length >= 2 ? db.students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.studentNo.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const open = student ? db.invoices.filter((i) => i.studentId === student.id && ['UNPAID', 'PARTIALLY_PAID'].includes(i.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) : [];
  const allocTotal = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);
  const over = open.some((i) => Number(alloc[i.id] || 0) > i.total - i.paid + 0.001);
  const amt = Number(amount) || 0;
  const mismatch = Math.abs(allocTotal - amt) > 0.001;
  const recent = db.payments.slice(0, 12);

  function autoAllocate(v: string) {
    setAmount(v);
    let left = Number(v) || 0;
    const a: Record<string, string> = {};
    open.forEach((i) => { const bal = i.total - i.paid; const x = Math.min(left, bal); if (x > 0) { a[i.id] = x.toFixed(2); left -= x; } });
    setAlloc(a);
  }
  async function submit() {
    const allocations = Object.entries(alloc).filter(([, v]) => Number(v) > 0).map(([invoiceId, v]) => ({ invoiceId, amount: Number(v) }));
    const p = await mutate<Payment>('POST', '/api/finance/payments', { studentId: student!.id, method, bank: method === 'BANK_RECEIPT' ? bank : null, amount: amt, allocations, proofRef: method === 'BANK_RECEIPT' ? proofRef.trim() : null, proofFileId: proofFile?.id || null, depositDate: method === 'BANK_RECEIPT' ? depositDate : null, idempotencyKey: `pay-${student!.id}-${Date.now()}` }, method === 'CASH' ? 'Pembayaran tunai diterima — kwitansi diterbitkan.' : 'Kuitansi bank dicatat — menunggu verifikasi.');
    if (p) { if (p.receiptNo) setReceipt(p); setAmount(''); setAlloc({}); setProofRef(''); setProofFile(null); }
  }

  return (
    <div className="grid lg:grid-cols-12 gap-5">
      <Card title="Meja Kasir & Alokasi Pembayaran" className="lg:col-span-7">
        {!can('finance.receive_payment') ? <Alert tone="warn">Peran Anda hanya dapat melihat ringkasan keuangan.</Alert> : (
          <>
            <Field label="Pilih Siswa">
              <div className="relative">
                <SearchInput value={student ? `${student.name} · ${student.studentNo}` : q} onChange={(v) => { setStudent(null); setQ(v); setAlloc({}); setAmount(''); }} placeholder="Ketik nama atau NIS siswa..." />
                {!student && matches.length > 0 && (
                  <div className="absolute z-20 top-10 inset-x-0 bg-white border border-line rounded-md shadow-lg py-1">
                    {matches.map((s) => <button key={s.id} onClick={() => { setStudent(s); setQ(''); }} className="w-full flex items-center gap-3 px-3 h-10 hover:bg-hover text-left text-sm"><Mono className="text-xs text-ink2 w-28">{s.studentNo}</Mono>{s.name}<span className="ml-auto text-xs text-muted">{L.classes.get(s.classId)?.name}</span></button>)}
                  </div>
                )}
              </div>
            </Field>
            {student && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-2">Invoice belum lunas</div>
                {open.length ? (
                  <div className="border border-line rounded-md overflow-hidden">
                    {open.map((i) => (
                      <div key={i.id} className="flex items-center gap-3 px-3 py-2 border-b border-line last:border-0 text-sm">
                        <div className="flex-1 min-w-0"><Mono className="text-xs">{i.invoiceNo}</Mono><div className="text-xs text-ink2">{i.period} · saldo <Mono>{usd(i.total - i.paid)}</Mono></div></div>
                        <StatusPill status={i.status} />
                        <Input mono type="number" step="0.01" value={alloc[i.id] || ''} onChange={(e) => setAlloc({ ...alloc, [i.id]: e.target.value })} className={cx('h-9 w-28 text-right', Number(alloc[i.id] || 0) > i.total - i.paid + 0.001 && 'border-bad')} placeholder="0.00" />
                      </div>
                    ))}
                  </div>
                ) : <Alert tone="ok">Semua tagihan siswa ini sudah lunas.</Alert>}
                {open.length > 0 && (
                  <div className="grid md:grid-cols-3 gap-3 mt-4">
                    <Field label="Metode Pembayaran"><Select value={method} onChange={(e) => setMethod(e.target.value as 'CASH')}><option value="CASH">Tunai (Cash)</option><option value="BANK_RECEIPT">Kuitansi Bank</option></Select></Field>
                    <Field label="Nominal Bayar (USD)"><Input mono type="number" step="0.01" value={amount} onChange={(e) => autoAllocate(e.target.value)} placeholder="0.00" /></Field>
                    <div className="hidden md:block" />
                    {method === 'BANK_RECEIPT' && (
                      <>
                        <Field label="Bank"><Select value={bank} onChange={(e) => setBank(e.target.value)}><option>BNU Timor</option><option>Mandiri Timor-Leste</option><option>BNCTL</option><option>ANZ Timor-Leste</option></Select></Field>
                        <Field label="No. Kuitansi Bank" required><Input mono value={proofRef} onChange={(e) => setProofRef(e.target.value.toUpperCase())} placeholder="KB-000000" /></Field>
                        <Field label="Tanggal Setor"><Input type="date" value={depositDate} max={SCHOOL_TODAY} onChange={(e) => setDepositDate(e.target.value)} /></Field>
                        <Field label="Foto / PDF Kuitansi Bank" required className="md:col-span-3"><FileField value={proofFile} onChange={setProofFile} category="bank-receipt" accept=".pdf,.jpg,.jpeg,.png" maxMb={10} label="Unggah foto atau scan kuitansi bank" /></Field>
                      </>
                    )}
                  </div>
                )}
                {over && <div className="mt-3"><Alert tone="bad" title="PAYMENT_OVERALLOCATION">Alokasi melebihi sisa saldo invoice.</Alert></div>}
                {!over && amt > 0 && mismatch && <div className="mt-3"><Alert tone="warn">Total alokasi <Mono>{usd(allocTotal)}</Mono> harus sama dengan nominal <Mono>{usd(amt)}</Mono>.</Alert></div>}
                {open.length > 0 && <div className="flex justify-end mt-4"><Button variant="primary" icon={Receipt} disabled={!amt || over || mismatch || (method === 'BANK_RECEIPT' && (!proofRef.trim() || !proofFile))} onClick={submit}>{method === 'CASH' ? 'Terima Tunai & Terbitkan Kwitansi' : 'Catat Kuitansi Bank'}</Button></div>}
              </div>
            )}
          </>
        )}
      </Card>
      <Card title="Pembayaran Terbaru" pad={false} className="lg:col-span-5">
        {recent.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0">
            <div className="flex-1 min-w-0"><div className="text-sm truncate">{L.students.get(p.studentId)?.name}</div><div className="text-xs text-ink2"><Mono className="text-[11px]">{p.paymentNo}</Mono> · {p.method === 'CASH' ? 'Tunai' : `Kuitansi ${p.bank}`}</div></div>
            <Mono className="text-sm">{usd(p.amount)}</Mono>
            <StatusPill status={p.status} />
            {p.status === 'VERIFIED' && <div className="flex">
              <button className="p-1.5 text-ink2 hover:text-ink" title="Kwitansi" onClick={() => setReceipt(p)}><Receipt className="w-4 h-4" strokeWidth={1.5} /></button>
              {can('finance.reverse_payment') && <button className="p-1.5 text-ink2 hover:text-bad" title="Reverse Payment" onClick={() => setReverse(p)}><RotateCcw className="w-4 h-4" strokeWidth={1.5} /></button>}
            </div>}
          </div>
        ))}
      </Card>
      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />
      <ReasonDialog open={!!reverse} onClose={() => setReverse(null)} title={`Reverse Payment ${reverse?.paymentNo}`} confirmLabel="Reverse Payment" danger
        description={<>Saldo invoice akan dikembalikan secara transaksional. Tidak ada hard delete — tercatat sebagai <Mono>PAYMENT_REVERSED</Mono>.</>}
        onConfirm={(reason) => { mutate('POST', `/api/finance/payments/${reverse!.id}/reverse`, { reason }, 'Pembayaran di-reverse.'); }} />
    </div>
  );
}

function Invoices() {
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const mutate = useMutation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('');
  const [gen, setGen] = useState(false);
  const [voidInv, setVoidInv] = useState<string | null>(null);
  const periods = [...new Set(db.invoices.map((i) => i.period))];
  const rows = db.invoices.filter((i) => {
    const s = L.students.get(i.studentId);
    return (!q || i.invoiceNo.toLowerCase().includes(q.toLowerCase()) || s?.name.toLowerCase().includes(q.toLowerCase())) && (!status || i.status === status) && (!period || i.period === period);
  });
  const pg = usePaged(rows, 30);
  return (
    <>
      <div className="flex flex-col md:flex-row gap-2 mb-3">
        <SearchInput value={q} onChange={setQ} placeholder="No. invoice atau nama siswa" className="md:w-72" />
        <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 md:w-48"><option value="">Semua Periode</option>{periods.map((p) => <option key={p}>{p}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 md:w-44"><option value="">Semua Status</option>{['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOID'].map((s) => <option key={s}>{s}</option>)}</Select>
        <div className="flex-1" />
        {can('finance.generate_invoice') && <Button variant="primary" icon={FilePlus2} onClick={() => setGen(true)}>Generate Invoice SPP</Button>}
        <Button icon={Download} onClick={() => downloadText('invoices.csv', toCsv([['Invoice', 'Siswa', 'Rombel', 'Periode', 'Total', 'Terbayar', 'Saldo', 'Status'], ...rows.map((i) => [i.invoiceNo, L.students.get(i.studentId)?.name, L.classes.get(L.students.get(i.studentId)?.classId || '')?.name, i.period, i.total, i.paid, (i.total - i.paid).toFixed(2), i.status])]))}>Export</Button>
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <Table>
          <thead><tr><Th>No. Invoice</Th><Th>Nama Siswa & Rombel</Th><Th>Periode / Etapa</Th><Th align="right">Subtotal</Th><Th align="right">Diskon/Beasiswa</Th><Th align="right">Total (USD)</Th><Th align="right">Terbayar</Th><Th align="right">Saldo</Th><Th>Status</Th><Th></Th></tr></thead>
          <tbody>
            {pg.slice.map((i) => {
              const s = L.students.get(i.studentId);
              return (
                <Tr key={i.id}>
                  <Td mono>{i.invoiceNo}</Td>
                  <Td><div className="whitespace-nowrap">{s?.name}</div><div className="text-xs text-ink2">{L.classes.get(s?.classId || '')?.name}</div></Td>
                  <Td className="whitespace-nowrap">{i.period}<div className="text-xs text-ink2">Jatuh tempo {fmtDate(i.dueDate)}</div></Td>
                  <Td align="right" mono>{usd(i.subtotal)}</Td>
                  <Td align="right" mono className="text-ink2">{i.discount ? `-${usd(i.discount)}` : '—'}</Td>
                  <Td align="right" mono className="font-semibold">{usd(i.total)}</Td>
                  <Td align="right" mono>{usd(i.paid)}</Td>
                  <Td align="right" mono className={i.total - i.paid > 0 && i.status !== 'VOID' ? 'text-bad' : ''}>{usd(i.total - i.paid)}</Td>
                  <Td><StatusPill status={i.status} /></Td>
                  <Td>{can('finance.generate_invoice') && i.status === 'UNPAID' && i.paid === 0 && <button title="Void" onClick={() => setVoidInv(i.id)} className="p-1 text-muted hover:text-bad"><Ban className="w-4 h-4" strokeWidth={1.5} /></button>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pager {...pg} />
      </div>
      <GenerateModal open={gen} onClose={() => setGen(false)} />
      <ReasonDialog open={!!voidInv} onClose={() => setVoidInv(null)} title="Void Invoice" confirmLabel="Void" danger onConfirm={(reason) => { mutate('POST', `/api/finance/invoices/${voidInv}/void`, { reason }, 'Invoice di-void.'); }} />
    </>
  );
}

function GenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mutate = useMutation();
  const [f, setF] = useState({ period: 'Etapa 1 — 2027', etapa: 1, dueDate: '2027-03-31' });
  const [preview, setPreview] = useState<{ count: number; skipped: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={() => { setPreview(null); onClose(); }} title="Generate Invoice SPP"
      footer={<><Button onClick={async () => { setErr(null); try { setPreview(await api('POST', '/api/finance/invoices/generate', { ...f, dryRun: true })); } catch (e) { setErr((e as Error).message); } }}>Dry-Run Preview</Button>
        <Button variant="dark" disabled={!preview || !preview.count} onClick={async () => { if (await mutate('POST', '/api/finance/invoices/generate', f, `Invoice dibuat untuk periode ${f.period}.`)) { setPreview(null); onClose(); } }}>Generate Invoice</Button></>}>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Periode" className="md:col-span-3"><Input value={f.period} onChange={(e) => { setF({ ...f, period: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Etapa"><Select value={f.etapa} onChange={(e) => { setF({ ...f, etapa: Number(e.target.value) }); setPreview(null); }}><option value={1}>Etapa 1</option><option value={2}>Etapa 2</option><option value={0}>Bulanan (1/10)</option></Select></Field>
        <Field label="Jatuh Tempo"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      </div>
      {err && <div className="mt-3"><Alert tone="bad">{err}</Alert></div>}
      {preview && (
        <div className="mt-4 grid grid-cols-3 border border-line rounded-md divide-x divide-line text-center">
          <div className="py-3"><Mono className="text-lg font-semibold">{preview.count}</Mono><div className="text-xs text-ink2">Invoice baru</div></div>
          <div className="py-3"><Mono className="text-lg font-semibold">{preview.skipped}</Mono><div className="text-xs text-ink2">Dilewati (duplikat)</div></div>
          <div className="py-3"><Mono className="text-lg font-semibold">{usd(preview.total)}</Mono><div className="text-xs text-ink2">Total tagihan</div></div>
        </div>
      )}
      <div className="text-xs text-ink2 mt-3">Sistem tidak akan membuat invoice ganda untuk siswa dan periode yang sama. Beasiswa diterapkan otomatis sebagai diskon.</div>
    </Modal>
  );
}

function Pending() {
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const mutate = useMutation();
  const list = db.payments.filter((p) => p.status === 'PENDING');
  const [selId, setSelId] = useState<string | null>(list[0]?.id || null);
  const [reject, setReject] = useState(false);
  const sel = list.find((p) => p.id === selId) || list[0];
  if (!list.length) return <div className="bg-white border border-line rounded-lg"><EmptyState icon={CheckCircle2} title="Tidak ada kuitansi bank yang menunggu verifikasi." /></div>;
  const s = L.students.get(sel.studentId);
  return (
    <div className="grid lg:grid-cols-12 gap-5">
      <div className="lg:col-span-5 bg-white border border-line rounded-lg overflow-hidden">
        {list.map((p) => (
          <button key={p.id} onClick={() => setSelId(p.id)} className={cx('w-full flex items-center gap-3 px-4 py-3 border-b border-line text-left', sel.id === p.id ? 'bg-selected' : 'hover:bg-hover')}>
            <Avatar name={L.students.get(p.studentId)?.name || ''} size={32} />
            <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{L.students.get(p.studentId)?.name}</div><div className="text-xs text-ink2">{p.bank} · <Mono className="text-[11px]">{p.proofRef}</Mono></div></div>
            <Mono className="text-sm font-semibold">{usd(p.amount)}</Mono>
          </button>
        ))}
      </div>
      <Card className="lg:col-span-7" title={<>Kuitansi Bank <Mono className="text-ink2 font-normal ml-1">{sel.paymentNo}</Mono></>}>
        <div className="grid md:grid-cols-2 gap-5">
          <BankProof p={sel} />
          <div>
            <KV k="Siswa" v={s?.name} /><KV k="NIS / Rombel" v={<>{s?.studentNo} · {L.classes.get(s?.classId || '')?.name}</>} />
            <KV k="Bank" v={sel.bank} /><KV k="No. Kuitansi" v={sel.proofRef} mono /><KV k="Tanggal Setor" v={sel.depositDate ? fmtDate(sel.depositDate) : '—'} /><KV k="Dicatat" v={<>{fmtDateTime(sel.receivedAt)}<div className="text-xs text-ink2">{sel.receivedBy}</div></>} />
            <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mt-4 mb-1">Alokasi</div>
            {sel.allocations.map((a) => { const inv = L.invoices.get(a.invoiceId); return <KV key={a.invoiceId} k={<><Mono className="text-xs">{inv?.invoiceNo}</Mono><div className="text-[11px]">{inv?.period}</div></>} v={usd(a.amount)} mono />; })}
          </div>
        </div>
        {can('finance.verify_payment') && (
          <div className="flex flex-wrap justify-end gap-2 mt-5 pt-4 border-t border-line">
            <Button variant="danger" icon={XCircle} onClick={() => setReject(true)}>Tolak Kuitansi</Button>
            <Button variant="primary" icon={CheckCircle2} onClick={() => mutate('POST', `/api/finance/payments/${sel.id}/verify`, {}, 'Pembayaran diverifikasi & kwitansi diterbitkan.')}>Verifikasi & Terbitkan Kwitansi</Button>
          </div>
        )}
      </Card>
      <ReasonDialog open={reject} onClose={() => setReject(false)} title="Tolak Kuitansi Bank" confirmLabel="Tolak" danger onConfirm={(reason) => { mutate('POST', `/api/finance/payments/${sel.id}/reject`, { reason }, 'Kuitansi bank ditolak.'); }} />
    </div>
  );
}

function Arrears() {
  const db = useDB();
  const L = useLookups();
  const [classId, setClassId] = useState('');
  const [open, setOpen] = useState<Student | null>(null);
  const rows = useMemo(() => db.students.map((s) => {
    const inv = db.invoices.filter((i) => i.studentId === s.id && ['UNPAID', 'PARTIALLY_PAID'].includes(i.status) && i.dueDate < SCHOOL_TODAY);
    return { s, inv, bal: inv.reduce((t, i) => t + i.total - i.paid, 0) };
  }).filter((r) => r.bal > 0 && (!classId || r.s.classId === classId)).sort((a, b) => b.bal - a.bal), [db, classId]);
  const total = rows.reduce((t, r) => t + r.bal, 0);
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9 w-44"><option value="">Semua Rombel</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Badge tone="bad"><Mono>{rows.length}</Mono> siswa · <Mono>{usd(total)}</Mono></Badge>
        <div className="flex-1" />
        <Button icon={Download} onClick={() => downloadText('tunggakan_spp.csv', toCsv([['NIS', 'Nama', 'Rombel', 'Wali', 'HP Wali', 'Tunggakan'], ...rows.map((r) => [r.s.studentNo, r.s.name, L.classes.get(r.s.classId)?.name, L.guardians.get(r.s.guardianId || '')?.name, L.guardians.get(r.s.guardianId || '')?.phone, r.bal.toFixed(2)])]))}>Export Rekap Tunggakan</Button>
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <Table>
          <thead><tr><Th>NIS</Th><Th>Siswa</Th><Th>Rombel</Th><Th>Wali & Kontak</Th><Th>Invoice Tertunggak</Th><Th align="right">Tunggakan (USD)</Th></tr></thead>
          <tbody>{rows.map((r) => <Tr key={r.s.id} onClick={() => setOpen(r.s)}><Td mono>{r.s.studentNo}</Td><Td>{r.s.name}</Td><Td>{L.classes.get(r.s.classId)?.name}</Td><Td>{L.guardians.get(r.s.guardianId || '')?.name}<div><Mono className="text-xs text-ink2">{L.guardians.get(r.s.guardianId || '')?.phone}</Mono></div></Td><Td className="text-xs">{r.inv.map((i) => i.period).join(', ')}</Td><Td align="right" mono className="text-bad font-semibold">{usd(r.bal)}</Td></Tr>)}</tbody>
        </Table>
      </div>
      {open && (
        <Drawer open onClose={() => setOpen(null)} title={open.name} subtitle={<Mono>{open.studentNo}</Mono>}>
          {db.invoices.filter((i) => i.studentId === open.id).map((i) => <KV key={i.id} k={<>{i.period}<div><Mono className="text-[11px]">{i.invoiceNo}</Mono></div></>} v={<><Mono>{usd(i.total - i.paid)}</Mono> <StatusPill status={i.status} /></>} />)}
        </Drawer>
      )}
    </>
  );
}

function Fees() {
  const db = useDB();
  const { can } = useAuth();
  const mutate = useMutation();
  const [edit, setEdit] = useState<Record<string, { etapa1: string; etapa2: string }>>({});
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card title="Tabel Biaya Resmi (Official Fee Table)" pad={false}>
        <Table>
          <thead><tr><Th>Tingkat</Th><Th align="right">Etapa 1</Th><Th align="right">Etapa 2</Th><Th align="right">Total / Tahun</Th>{can('finance.manage_fee') && <Th />}</tr></thead>
          <tbody>
            {db.feePlans.map((f) => {
              const e = edit[f.id];
              return (
                <Tr key={f.id}>
                  <Td>{f.label}</Td>
                  <Td align="right">{e ? <Input mono className="h-8 w-24 text-right ml-auto" value={e.etapa1} onChange={(x) => setEdit({ ...edit, [f.id]: { ...e, etapa1: x.target.value } })} /> : <Mono>{usd(f.etapa1)}</Mono>}</Td>
                  <Td align="right">{e ? <Input mono className="h-8 w-24 text-right ml-auto" value={e.etapa2} onChange={(x) => setEdit({ ...edit, [f.id]: { ...e, etapa2: x.target.value } })} /> : <Mono>{usd(f.etapa2)}</Mono>}</Td>
                  <Td align="right" mono className="font-semibold">{usd(e ? Number(e.etapa1) + Number(e.etapa2) : f.total)}</Td>
                  {can('finance.manage_fee') && <Td align="right">{e ? <Button size="sm" variant="primary" onClick={async () => { await mutate('PATCH', `/api/c/feePlans/${f.id}`, { etapa1: Number(e.etapa1), etapa2: Number(e.etapa2), total: Number(e.etapa1) + Number(e.etapa2) }, 'Tarif diperbarui.'); const n = { ...edit }; delete n[f.id]; setEdit(n); }}>Simpan</Button> : <Button size="sm" onClick={() => setEdit({ ...edit, [f.id]: { etapa1: String(f.etapa1), etapa2: String(f.etapa2) } })}>Ubah</Button>}</Td>}
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <div className="px-4 py-3 text-xs text-ink2 border-t border-line">Pembayaran diterima di Finansas: tunai, atau kuitansi setoran bank (BNU · Mandiri · BNCTL · ANZ) yang dicatat dan diverifikasi oleh Tesoureiro.</div>
      </Card>
      <Card title="Beasiswa & Diskon" pad={false}>
        <Table>
          <thead><tr><Th>Kode</Th><Th>Nama Beasiswa</Th><Th align="right">Diskon</Th><Th align="right">Penerima</Th></tr></thead>
          <tbody>{db.scholarshipTypes.map((s) => <Tr key={s.code}><Td mono>{s.code}</Td><Td>{s.name}</Td><Td align="right" mono>{s.discountPct}%</Td><Td align="right" mono>{db.students.filter((x) => x.scholarship === s.code).length}</Td></Tr>)}</tbody>
        </Table>
      </Card>
    </div>
  );
}

export default function Finance() {
  const db = useDB();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as T) || 'cashier';
  const verified = db.payments.filter((p) => p.status === 'VERIFIED');
  const billed = db.invoices.filter((i) => i.status !== 'VOID').reduce((s, i) => s + i.total, 0);
  const paid = db.invoices.reduce((s, i) => s + i.paid, 0);
  const arrears = db.invoices.filter((i) => ['UNPAID', 'PARTIALLY_PAID'].includes(i.status) && i.dueDate < SCHOOL_TODAY).reduce((s, i) => s + i.total - i.paid, 0);
  return (
    <div>
      <PageHeader title="Keuangan Sekolah — SPP & Propina" subtitle="Semua nominal dalam USD · Tidak ada hard delete — gunakan reversal" />
      <div className="bg-white border border-line rounded-lg grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-line mb-5">
        <Stat label="Total Tagihan 2026" value={<Mono className="text-xl">{usd(billed)}</Mono>} />
        <Stat label="Terkumpul" value={<Mono className="text-xl">{usd(paid)}</Mono>} sub={`${((paid / billed) * 100).toFixed(1)}% · ${verified.length} pembayaran`} />
        <Stat label="Tunggakan" value={<Mono className="text-xl">{usd(arrears)}</Mono>} tone="bad" />
        <Stat label="Kuitansi Bank Pending" value={<Mono className="text-xl">{db.payments.filter((p) => p.status === 'PENDING').length}</Mono>} />
      </div>
      <Tabs<T> value={tab} onChange={(t) => setParams({ tab: t })} tabs={[
        { id: 'cashier', label: 'Ringkasan & Kasir' }, { id: 'invoices', label: 'Daftar Invoice SPP', count: db.invoices.length },
        { id: 'pending', label: 'Verifikasi Kuitansi Bank', count: db.payments.filter((p) => p.status === 'PENDING').length },
        { id: 'arrears', label: 'Tunggakan (Arrears)' }, { id: 'fees', label: 'Tarif Resmi & Beasiswa' },
      ]} />
      {tab === 'cashier' && <Cashier />}
      {tab === 'invoices' && <Invoices />}
      {tab === 'pending' && <Pending />}
      {tab === 'arrears' && <Arrears />}
      {tab === 'fees' && <Fees />}
    </div>
  );
}
