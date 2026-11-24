import { useMemo, useState } from 'react';
import { BookPlus, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { Alert, Badge, Button, Card, Field, Input, Modal, Mono, PageHeader, SearchInput, Select, StatusPill, Table, Tabs, Td, Th, Tr } from '../components/ui';
import { fmtDate, SCHOOL_TODAY, usd } from '../lib/format';

type T = 'circulation' | 'catalog' | 'copies' | 'overdue';

function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

export default function Library() {
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const mutate = useMutation();
  const [tab, setTab] = useState<T>(can('library.issue') ? 'circulation' : 'catalog');
  const [co, setCo] = useState({ barcode: '', borrowerType: 'STUDENT', borrowerId: '', dueAt: addDays(SCHOOL_TODAY, 14) });
  const [bq, setBq] = useState('');
  const [rt, setRt] = useState({ barcode: '', condition: 'GOOD', fine: '' });
  const [q, setQ] = useState('');
  const [addBook, setAddBook] = useState(false);
  const [nb, setNb] = useState({ isbn: '', title: '', author: '', category: 'Literatura', copies: 1 });
  const borrowerName = (type: string, id: string) => (type === 'STUDENT' ? L.students.get(id)?.name : L.teachers.get(id)?.name);
  const coCopy = db.libraryCopies.find((c) => c.barcode === co.barcode.trim().toUpperCase());
  const rtCopy = db.libraryCopies.find((c) => c.barcode === rt.barcode.trim().toUpperCase());
  const rtLoan = rtCopy && db.loans.find((l) => l.copyId === rtCopy.id && ['OPEN', 'OVERDUE'].includes(l.status));
  const borrowers = useMemo(() => {
    const list = co.borrowerType === 'STUDENT' ? db.students.map((s) => ({ id: s.id, name: s.name, sub: L.classes.get(s.classId)?.name })) : db.teachers.map((t) => ({ id: t.id, name: t.name, sub: t.employeeNo }));
    return bq ? list.filter((x) => x.name.toLowerCase().includes(bq.toLowerCase())).slice(0, 6) : [];
  }, [db, co.borrowerType, bq, L]);
  const loans = db.loans.filter((l) => tab !== 'overdue' || l.status === 'OVERDUE').filter((l) => ['OPEN', 'OVERDUE'].includes(l.status));
  const daysLate = (due: string) => Math.max(0, Math.round((new Date(SCHOOL_TODAY).getTime() - new Date(due).getTime()) / 86400000));
  return (
    <div>
      <PageHeader title="Perpustakaan Sekolah" subtitle={<><Mono>{db.libraryBooks.length}</Mono> judul · <Mono>{db.libraryCopies.length}</Mono> salinan fisik · <Mono>{db.loans.filter((l) => l.status === 'OPEN' || l.status === 'OVERDUE').length}</Mono> dipinjam</>}
        actions={can('library.manage_catalog') && <Button icon={BookPlus} onClick={() => setAddBook(true)}>Tambah Judul</Button>} />
      <Tabs<T> value={tab} onChange={setTab} tabs={[
        ...(can('library.issue') ? [{ id: 'circulation' as T, label: 'Meja Sirkulasi' }] : []), { id: 'catalog', label: 'Katalog Judul Buku', count: db.libraryBooks.length },
        { id: 'copies', label: 'Salinan Fisik & Barcode', count: db.libraryCopies.length }, { id: 'overdue', label: 'Daftar Terlambat', count: db.loans.filter((l) => l.status === 'OVERDUE').length },
      ]} />
      {tab === 'circulation' && (
        <>
          <div className="grid lg:grid-cols-2 gap-5 mb-5">
            <Card title="Peminjaman Baru (Checkout)">
              <div className="space-y-3">
                <Field label="Barcode Salinan Buku" hint={coCopy ? `${L.books.get(coCopy.bookId)?.title} · ${coCopy.status}` : 'Scan atau ketik barcode, mis. BC-NOS-00841'}>
                  <Input mono value={co.barcode} onChange={(e) => setCo({ ...co, barcode: e.target.value.toUpperCase() })} placeholder="BC-NOS-00000" />
                </Field>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <Field label="Peminjam"><Select value={co.borrowerType} onChange={(e) => setCo({ ...co, borrowerType: e.target.value, borrowerId: '' })}><option value="STUDENT">Siswa</option><option value="TEACHER">Guru</option></Select></Field>
                  <Field label="Nama">
                    <div className="relative">
                      <Input value={co.borrowerId ? borrowerName(co.borrowerType, co.borrowerId) || '' : bq} onChange={(e) => { setBq(e.target.value); setCo({ ...co, borrowerId: '' }); }} placeholder="Cari nama..." />
                      {!co.borrowerId && borrowers.length > 0 && <div className="absolute z-20 top-11 inset-x-0 bg-white border border-line rounded-md shadow-lg py-1">{borrowers.map((b) => <button key={b.id} onClick={() => { setCo({ ...co, borrowerId: b.id }); setBq(''); }} className="w-full text-left px-3 h-9 text-sm hover:bg-hover">{b.name} <span className="text-xs text-muted">{b.sub}</span></button>)}</div>}
                    </div>
                  </Field>
                </div>
                <Field label="Tanggal Jatuh Tempo"><Input type="date" value={co.dueAt} onChange={(e) => setCo({ ...co, dueAt: e.target.value })} /></Field>
                <Button variant="primary" icon={LogOut} disabled={!co.barcode || !co.borrowerId} onClick={async () => { if (await mutate('POST', '/api/library/checkout', co, 'Peminjaman diproses.')) setCo({ ...co, barcode: '', borrowerId: '' }); }}>Proses Pinjam</Button>
              </div>
            </Card>
            <Card title="Pengembalian / Perpanjangan">
              <div className="space-y-3">
                <Field label="Barcode"><Input mono value={rt.barcode} onChange={(e) => setRt({ ...rt, barcode: e.target.value.toUpperCase() })} placeholder="BC-NOS-00000" /></Field>
                {rt.barcode && !rtLoan && <Alert tone="warn">Tidak ada pinjaman terbuka untuk barcode ini.</Alert>}
                {rtLoan && (
                  <div className="border border-line rounded-md p-3 text-sm">
                    <div className="font-medium">{L.books.get(rtCopy!.bookId)?.title}</div>
                    <div className="text-xs text-ink2 mt-1">{borrowerName(rtLoan.borrowerType, rtLoan.borrowerId)} · pinjam {fmtDate(rtLoan.borrowedAt)} · tempo {fmtDate(rtLoan.dueAt)} · <StatusPill status={rtLoan.status} /></div>
                    {rtLoan.status === 'OVERDUE' && <div className="text-xs text-bad mt-1">Terlambat <Mono>{daysLate(rtLoan.dueAt)}</Mono> hari · denda saran <Mono>{usd(daysLate(rtLoan.dueAt) * 0.1)}</Mono></div>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Kondisi saat kembali"><Select value={rt.condition} onChange={(e) => setRt({ ...rt, condition: e.target.value })}><option>GOOD</option><option>DAMAGED</option><option>LOST</option></Select></Field>
                  <Field label="Denda (USD, opsional)"><Input mono type="number" step="0.01" value={rt.fine} onChange={(e) => setRt({ ...rt, fine: e.target.value })} /></Field>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" icon={LogIn} disabled={!rtLoan} onClick={async () => { if (await mutate('POST', '/api/library/return', rt, 'Buku dikembalikan.')) setRt({ barcode: '', condition: 'GOOD', fine: '' }); }}>Kembalikan Buku</Button>
                  <Button icon={RefreshCw} disabled={!rtLoan} onClick={() => mutate('POST', '/api/library/renew', rt, 'Pinjaman diperpanjang 14 hari.')}>Perpanjang (Renew)</Button>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
      {(tab === 'circulation' || tab === 'overdue') && (
        <Card title={tab === 'overdue' ? 'Pinjaman Terlambat' : 'Pinjaman Terbuka'} pad={false}>
          <Table>
            <thead><tr><Th>Barcode</Th><Th>Judul & ISBN</Th><Th>Peminjam</Th><Th>Dipinjam</Th><Th>Jatuh Tempo</Th><Th align="right">Denda (USD)</Th><Th>Status</Th></tr></thead>
            <tbody>{loans.map((l) => { const cp = L.copies.get(l.copyId); const b = L.books.get(cp?.bookId || ''); return (
              <Tr key={l.id} onClick={() => setRt({ ...rt, barcode: cp?.barcode || '' })}>
                <Td mono>{cp?.barcode}</Td><Td>{b?.title}<div><Mono className="text-[11px] text-muted">{b?.isbn}</Mono></div></Td>
                <Td>{borrowerName(l.borrowerType, l.borrowerId)}<div className="text-xs text-ink2">{l.borrowerType === 'STUDENT' ? L.classes.get(L.students.get(l.borrowerId)?.classId || '')?.name : 'Guru'}</div></Td>
                <Td>{fmtDate(l.borrowedAt)}</Td><Td>{fmtDate(l.dueAt)}</Td>
                <Td align="right" mono>{l.status === 'OVERDUE' ? usd(daysLate(l.dueAt) * 0.1) : '—'}</Td><Td><StatusPill status={l.status} /></Td>
              </Tr>); })}</tbody>
          </Table>
        </Card>
      )}
      {tab === 'catalog' && (
        <>
          <div className="mb-3"><SearchInput value={q} onChange={setQ} placeholder="Judul, penulis, ISBN" className="w-80" /></div>
          <div className="bg-white border border-line rounded-lg overflow-hidden">
            <Table>
              <thead><tr><Th>ISBN</Th><Th>Judul Buku</Th><Th>Penulis</Th><Th>Kategori</Th><Th>Salinan</Th></tr></thead>
              <tbody>{db.libraryBooks.filter((b) => !q || `${b.title} ${b.author} ${b.isbn}`.toLowerCase().includes(q.toLowerCase())).map((b) => {
                const cps = db.libraryCopies.filter((c) => c.bookId === b.id);
                const n = (s: string) => cps.filter((c) => c.status === s).length;
                return <Tr key={b.id}><Td mono>{b.isbn}</Td><Td className="font-medium">{b.title}</Td><Td>{b.author}</Td><Td><Badge>{b.category}</Badge></Td>
                  <Td><div className="flex flex-wrap gap-1"><Badge tone="ok">AVAILABLE: <Mono>{n('AVAILABLE')}</Mono></Badge>{n('ON_LOAN') > 0 && <Badge tone="info">ON_LOAN: <Mono>{n('ON_LOAN')}</Mono></Badge>}{n('REPAIR') > 0 && <Badge tone="warn">REPAIR: <Mono>{n('REPAIR')}</Mono></Badge>}{n('LOST') > 0 && <Badge tone="bad">LOST: <Mono>{n('LOST')}</Mono></Badge>}</div></Td></Tr>;
              })}</tbody>
            </Table>
          </div>
        </>
      )}
      {tab === 'copies' && (
        <div className="bg-white border border-line rounded-lg overflow-hidden">
          <Table>
            <thead><tr><Th>Barcode</Th><Th>Judul</Th><Th>Diperoleh</Th><Th>Status</Th></tr></thead>
            <tbody>{db.libraryCopies.map((c) => <Tr key={c.id}><Td mono>{c.barcode}</Td><Td>{L.books.get(c.bookId)?.title}</Td><Td>{fmtDate(c.acquiredAt)}</Td><Td><StatusPill status={c.status} /></Td></Tr>)}</tbody>
          </Table>
        </div>
      )}
      <Modal open={addBook} onClose={() => setAddBook(false)} title="Tambah Judul Buku" footer={<><Button onClick={() => setAddBook(false)}>Batal</Button><Button variant="primary" disabled={!nb.title || !nb.isbn} onClick={async () => {
        const b = await mutate<{ id: string }>('POST', '/api/c/libraryBooks', { isbn: nb.isbn, title: nb.title, author: nb.author, category: nb.category, year: 2026 });
        if (b) { for (let i = 0; i < nb.copies; i++) await mutate('POST', '/api/c/libraryCopies', { bookId: b.id, barcode: `BC-NOS-${String(Date.now() % 100000).padStart(5, '0')}${i}`, status: 'AVAILABLE', acquiredAt: SCHOOL_TODAY }); setAddBook(false); }
      }}>Simpan</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ISBN"><Input mono value={nb.isbn} onChange={(e) => setNb({ ...nb, isbn: e.target.value })} /></Field>
          <Field label="Jumlah Salinan"><Input mono type="number" min={1} value={nb.copies} onChange={(e) => setNb({ ...nb, copies: Number(e.target.value) })} /></Field>
          <Field label="Judul" className="col-span-2"><Input value={nb.title} onChange={(e) => setNb({ ...nb, title: e.target.value })} /></Field>
          <Field label="Penulis"><Input value={nb.author} onChange={(e) => setNb({ ...nb, author: e.target.value })} /></Field>
          <Field label="Kategori"><Input value={nb.category} onChange={(e) => setNb({ ...nb, category: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
