import { useState } from 'react';
import { Archive, PackagePlus, UserRoundCheck, Wrench } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { Button, Drawer, Field, Input, KV, Modal, Mono, PageHeader, ReasonDialog, SearchInput, Select, StatusPill, Table, Td, Th, Tr } from '../components/ui';
import { fmtDate, SCHOOL_TODAY, usd } from '../lib/format';
import type { Asset } from '../lib/types';

export default function Assets() {
  const db = useDB();
  const L = useLookups();
  const { can } = useAuth();
  const mutate = useMutation();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cond, setCond] = useState('');
  const [st, setSt] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [assign, setAssign] = useState(false);
  const [maint, setMaint] = useState(false);
  const [retire, setRetire] = useState(false);
  const [add, setAdd] = useState(false);
  const [af, setAf] = useState({ assignee: '', roomId: '', note: '' });
  const [mf, setMf] = useState({ note: '', condition: 'DAMAGED' });
  const [na, setNa] = useState({ name: '', serial: '', category: 'Komputer & IT', roomId: '', cost: '' });
  const cats = [...new Set(db.assets.map((a) => a.category))];
  const rows = db.assets.filter((a) => (!q || `${a.assetNo} ${a.name} ${a.serial}`.toLowerCase().includes(q.toLowerCase())) && (!cat || a.category === cat) && (!cond || a.condition === cond) && (!st || a.status === st));
  const open = db.assets.find((a) => a.id === openId) as Asset | undefined;
  const manage = can('asset.manage');
  return (
    <div>
      <PageHeader title="Inventaris Sarana Prasarana" subtitle={<><Mono>{db.assets.length}</Mono> aset · nilai perolehan <Mono>{usd(db.assets.filter((a) => a.status !== 'RETIRED').reduce((s, a) => s + a.cost, 0))}</Mono></>}
        actions={manage && <Button variant="primary" icon={PackagePlus} onClick={() => setAdd(true)}>Registrasi Aset Baru</Button>} />
      <div className="flex flex-col md:flex-row gap-2 mb-3">
        <SearchInput value={q} onChange={setQ} placeholder="Kode, nama, no. seri" className="md:w-64" />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 md:w-52"><option value="">Semua Kategori</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select value={cond} onChange={(e) => setCond(e.target.value)} className="h-9 md:w-40"><option value="">Semua Kondisi</option>{['GOOD', 'FAIR', 'DAMAGED', 'REPAIR', 'LOST'].map((c) => <option key={c}>{c}</option>)}</Select>
        <Select value={st} onChange={(e) => setSt(e.target.value)} className="h-9 md:w-44"><option value="">Semua Status</option>{['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED'].map((c) => <option key={c}>{c}</option>)}</Select>
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <Table>
          <thead><tr><Th>Kode Aset</Th><Th>Nama Barang & No. Seri</Th><Th>Kategori</Th><Th>Lokasi</Th><Th>Pemegang</Th><Th>Kondisi</Th><Th align="right">Nilai (USD)</Th><Th>Status</Th></tr></thead>
          <tbody>{rows.map((a) => (
            <Tr key={a.id} onClick={() => setOpenId(a.id)} selected={a.id === openId}>
              <Td mono>{a.assetNo}</Td><Td className="font-medium">{a.name}<div><Mono className="text-[11px] text-muted">{a.serial}</Mono></div></Td><Td>{a.category}</Td>
              <Td><Mono className="text-xs">{L.rooms.get(a.roomId || '')?.code || 'Gudang'}</Mono></Td><Td className="text-xs">{a.assignee || '—'}</Td>
              <Td><StatusPill status={a.condition} /></Td><Td align="right" mono>{usd(a.cost)}</Td><Td><StatusPill status={a.status} /></Td>
            </Tr>))}</tbody>
        </Table>
      </div>
      {open && (
        <Drawer open onClose={() => setOpenId(null)} title={open.name} subtitle={<Mono>{open.assetNo}</Mono>}
          footer={manage && open.status !== 'RETIRED' ? <>
            <Button icon={Archive} variant="danger" onClick={() => setRetire(true)}>Pensiunkan</Button>
            {open.status === 'MAINTENANCE' ? <Button icon={Wrench} onClick={() => mutate('POST', `/api/assets/${open.id}/complete`, { condition: 'GOOD', note: 'Selesai diperbaiki' }, 'Pemeliharaan selesai.')}>Selesai Perbaikan</Button> : <Button icon={Wrench} onClick={() => setMaint(true)}>Catat Pemeliharaan</Button>}
            <Button variant="primary" icon={UserRoundCheck} onClick={() => { setAf({ assignee: open.assignee || '', roomId: open.roomId || '', note: '' }); setAssign(true); }}>Serah Terima</Button>
          </> : undefined}>
          <div className="flex gap-2 mb-3"><StatusPill status={open.status} /><StatusPill status={open.condition} /></div>
          <KV k="Kategori" v={open.category} /><KV k="No. Seri" v={open.serial} mono /><KV k="Lokasi" v={L.rooms.get(open.roomId || '')?.name || 'Gudang'} />
          <KV k="Pemegang Saat Ini" v={open.assignee || '—'} /><KV k="Nilai Perolehan" v={usd(open.cost)} mono /><KV k="Tanggal Perolehan" v={fmtDate(open.acquiredAt)} />
          <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mt-5 mb-2">Riwayat Penugasan & Servis</div>
          <ol className="relative border-l border-line ml-1.5 space-y-3">
            {open.history.map((h, i) => <li key={i} className="pl-4 relative"><span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-ink" /><div className="text-xs text-ink2">{fmtDate(h.at)} · <Mono className="text-[11px]">{h.type}</Mono></div><div className="text-sm">{h.note}</div></li>)}
          </ol>
        </Drawer>
      )}
      <Modal open={assign} onClose={() => setAssign(false)} title="Serah Terima / Assign Aset" footer={<><Button onClick={() => setAssign(false)}>Batal</Button><Button variant="primary" onClick={async () => { if (await mutate('POST', `/api/assets/${open!.id}/assign`, { assignee: af.assignee || null, roomId: af.roomId || null, note: af.note }, 'Serah terima tercatat.')) setAssign(false); }}>Simpan</Button></>}>
        <div className="space-y-4">
          <Field label="Pemegang (Guru/Staf)"><Select value={af.assignee} onChange={(e) => setAf({ ...af, assignee: e.target.value })}><option value="">— Kembalikan ke gudang —</option>{[...db.teachers.map((t) => t.name), ...db.staff.map((s) => s.name)].map((n) => <option key={n}>{n}</option>)}</Select></Field>
          <Field label="Lokasi Ruangan"><Select value={af.roomId} onChange={(e) => setAf({ ...af, roomId: e.target.value })}><option value="">Gudang</option>{db.rooms.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</Select></Field>
          <Field label="Catatan"><Input value={af.note} onChange={(e) => setAf({ ...af, note: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={maint} onClose={() => setMaint(false)} title="Catat Pemeliharaan" footer={<><Button onClick={() => setMaint(false)}>Batal</Button><Button variant="primary" disabled={!mf.note} onClick={async () => { if (await mutate('POST', `/api/assets/${open!.id}/maintenance`, mf, 'Pemeliharaan dicatat.')) setMaint(false); }}>Simpan</Button></>}>
        <div className="space-y-4">
          <Field label="Kondisi"><Select value={mf.condition} onChange={(e) => setMf({ ...mf, condition: e.target.value })}>{['FAIR', 'DAMAGED', 'REPAIR'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Deskripsi pekerjaan"><Input value={mf.note} onChange={(e) => setMf({ ...mf, note: e.target.value })} /></Field>
        </div>
      </Modal>
      <ReasonDialog open={retire} onClose={() => setRetire(false)} title="Pensiunkan Aset" confirmLabel="Pensiunkan" danger onConfirm={(note) => { mutate('POST', `/api/assets/${open!.id}/retire`, { note }, 'Aset dipensiunkan.'); }} />
      <Modal open={add} onClose={() => setAdd(false)} title="Registrasi Aset Baru" footer={<><Button onClick={() => setAdd(false)}>Batal</Button><Button variant="primary" disabled={!na.name || !na.cost} onClick={async () => {
        const n = db.assets.length + 1;
        const code = na.category.startsWith('Lab') ? 'LAB' : na.category.startsWith('Komp') ? 'IT' : na.category.startsWith('Perabot') ? 'FUR' : na.category.startsWith('Alat') ? 'MUS' : 'GEN';
        if (await mutate('POST', '/api/c/assets', { assetNo: `AST-${code}-2026-${String(n).padStart(3, '0')}`, name: na.name, serial: na.serial, category: na.category, roomId: na.roomId || null, assignee: null, condition: 'GOOD', cost: Number(na.cost), status: 'AVAILABLE', acquiredAt: SCHOOL_TODAY, history: [{ at: SCHOOL_TODAY, type: 'REGISTERED', note: 'Rejistu inisiál' }] }, 'Aset diregistrasi.')) setAdd(false);
      }}>Simpan</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nama Barang" className="col-span-2"><Input value={na.name} onChange={(e) => setNa({ ...na, name: e.target.value })} /></Field>
          <Field label="No. Seri"><Input mono value={na.serial} onChange={(e) => setNa({ ...na, serial: e.target.value })} /></Field>
          <Field label="Nilai Perolehan (USD)"><Input mono type="number" value={na.cost} onChange={(e) => setNa({ ...na, cost: e.target.value })} /></Field>
          <Field label="Kategori"><Select value={na.category} onChange={(e) => setNa({ ...na, category: e.target.value })}>{['Laboratóriu IPA', 'Komputer & IT', 'Perabot Kelas', 'Alat Musik Drum Band', 'Fasilidade Jerál'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Lokasi"><Select value={na.roomId} onChange={(e) => setNa({ ...na, roomId: e.target.value })}><option value="">Gudang</option>{db.rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</Select></Field>
        </div>
      </Modal>
    </div>
  );
}
