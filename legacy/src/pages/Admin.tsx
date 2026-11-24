import { useMemo, useState } from 'react';
import { KeyRound, Plus, Power, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth, useData, useDB, useMutation } from '../context/AppContexts';
import { Alert, Badge, Button, Card, cx, Drawer, Field, Input, KV, Modal, Mono, PageHeader, Pager, SearchInput, Select, StatusPill, Table, Tabs, Td, Th, Tr, usePaged } from '../components/ui';
import { Organigram } from './Dashboard';
import { ROLE_LABEL } from '../components/nav';
import { fmtDateTime } from '../lib/format';
import type { AuditLog, Role, User } from '../lib/types';
import { api } from '../lib/api';

const ROLES = Object.keys(ROLE_LABEL) as Role[];

function Users() {
  const db = useDB();
  const { can, user: me } = useAuth();
  const mutate = useMutation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<User | null>(null);
  const [add, setAdd] = useState(false);
  const [nu, setNu] = useState({ username: '', name: '', email: '', roles: ['TEACHER'] as Role[] });
  const rows = db.users.filter((u) => !q || `${u.username} ${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const live = open ? db.users.find((u) => u.id === open.id)! : null;
  return (
    <>
      <div className="flex gap-2 mb-3"><SearchInput value={q} onChange={setQ} placeholder="Username, nama, email" className="w-72" /><div className="flex-1" />{can('user.create') && <Button variant="primary" icon={Plus} onClick={() => setAdd(true)}>Buat Akun</Button>}</div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <Table>
          <thead><tr><Th>Username</Th><Th>Nama & Email</Th><Th>Profil Terkait</Th><Th>Peran Aktif</Th><Th>Login Terakhir</Th><Th>Status Akun</Th></tr></thead>
          <tbody>{rows.map((u) => (
            <Tr key={u.id} onClick={() => setOpen(u)}>
              <Td mono>{u.username}</Td><Td>{u.name}<div className="text-xs text-ink2">{u.email}</div></Td><Td className="text-xs">{u.profileType || '—'}</Td>
              <Td><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} mono>{r}</Badge>)}</div></Td>
              <Td className="text-xs whitespace-nowrap">{fmtDateTime(u.lastLogin)}</Td><Td><StatusPill status={u.status} /></Td>
            </Tr>))}</tbody>
        </Table>
      </div>
      {live && (
        <Drawer open onClose={() => setOpen(null)} title={live.name} subtitle={<Mono>{live.username}</Mono>}
          footer={can('user.update') && live.id !== me?.id ? <>
            <Button icon={KeyRound} onClick={() => mutate('PATCH', `/api/users/${live.id}`, { resetPassword: true }, 'Kata sandi direset ke default (nossef2026).')}>Reset Sandi</Button>
            {live.status === 'ACTIVE' ? <Button variant="danger" icon={Power} onClick={() => mutate('PATCH', `/api/users/${live.id}`, { status: 'SUSPENDED' }, 'Akun dinonaktifkan & sesi dicabut.')}>Nonaktifkan</Button>
              : <Button icon={RotateCcw} onClick={() => mutate('PATCH', `/api/users/${live.id}`, { status: 'ACTIVE' }, 'Akun diaktifkan.')}>Aktifkan</Button>}
          </> : undefined}>
          <StatusPill status={live.status} />
          <div className="mt-3"><KV k="Email" v={live.email} /><KV k="Login Terakhir" v={fmtDateTime(live.lastLogin)} /><KV k="Masa Berlaku Peran" v={`${live.roleValidFrom} – ${live.roleValidUntil}`} mono /></div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mt-5 mb-2">Peran (RBAC)</div>
          <div className="grid grid-cols-1 gap-1">
            {ROLES.map((r) => {
              const on = live.roles.includes(r);
              return (
                <label key={r} className={cx('flex items-center gap-3 px-3 h-10 rounded-md border text-sm', on ? 'border-accent bg-selected' : 'border-line')}>
                  <input type="checkbox" className="accent-[#0061FE]" checked={on} disabled={!can('user.update') || live.id === me?.id}
                    onChange={() => { const roles = on ? live.roles.filter((x) => x !== r) : [...live.roles, r]; if (roles.length) mutate('PATCH', `/api/users/${live.id}`, { roles }, 'Peran diperbarui (ROLE_ASSIGNED).'); }} />
                  <Mono className="text-xs w-40">{r}</Mono><span className="text-ink2 text-xs">{ROLE_LABEL[r]}</span>
                </label>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Field label="Berlaku dari"><Input type="date" defaultValue={live.roleValidFrom} onBlur={(e) => mutate('PATCH', `/api/users/${live.id}`, { roleValidFrom: e.target.value })} /></Field>
            <Field label="Berlaku sampai"><Input type="date" defaultValue={live.roleValidUntil} onBlur={(e) => mutate('PATCH', `/api/users/${live.id}`, { roleValidUntil: e.target.value })} /></Field>
          </div>
        </Drawer>
      )}
      <Modal open={add} onClose={() => setAdd(false)} title="Buat Akun Pengguna" footer={<><Button onClick={() => setAdd(false)}>Batal</Button><Button variant="primary" disabled={!nu.username || !nu.name} onClick={async () => { if (await mutate('POST', '/api/users', nu, 'Akun dibuat — sandi awal: nossef2026.')) setAdd(false); }}>Buat</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Username"><Input mono value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value.toLowerCase().replace(/\s/g, '.') })} /></Field>
          <Field label="Peran"><Select value={nu.roles[0]} onChange={(e) => setNu({ ...nu, roles: [e.target.value as Role] })}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
          <Field label="Nama Lengkap" className="col-span-2"><Input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></Field>
          <Field label="Email" className="col-span-2"><Input value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="otomatis @nossef-railaco.tl" /></Field>
        </div>
      </Modal>
    </>
  );
}

function School() {
  const db = useDB();
  const { can } = useAuth();
  const mutate = useMutation();
  const [f, setF] = useState(db.school);
  const edit = can('school.manage_settings');
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card title="Identitas Sekolah (SchoolProfile)">
        <div className="space-y-3">
          <Field label="Nama Resmi"><Input value={f.name} disabled={!edit} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Alamat"><Input value={f.address} disabled={!edit} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telepon"><Input mono value={f.phone} disabled={!edit} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Email"><Input value={f.email} disabled={!edit} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Zona Waktu"><Select value={f.timezone} disabled><option>Asia/Dili</option></Select></Field>
            <Field label="Mata Uang"><Select value={f.currency} disabled><option>USD</option></Select></Field>
            <Field label="Bahasa Default"><Select value={f.defaultLang} disabled={!edit} onChange={(e) => setF({ ...f, defaultLang: e.target.value })}><option value="tet">Tetun</option><option value="pt">Português</option><option value="id">Indonesia</option><option value="en">English</option></Select></Field>
            <Field label="Tahun Berdiri"><Input mono value={f.founded} disabled /></Field>
          </div>
          {edit && <div className="flex justify-end"><Button variant="primary" onClick={() => mutate('PATCH', '/api/school', f, 'Profil sekolah tersimpan.')}>Simpan</Button></div>}
        </div>
      </Card>
      <Card title="Estrutura Eskola NOSSEF"><Organigram /></Card>
    </div>
  );
}

function Audit() {
  const db = useDB();
  const [type, setType] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [open, setOpen] = useState<AuditLog | null>(null);
  const types = useMemo(() => [...new Set(db.auditLogs.map((a) => a.eventType))].sort(), [db]);
  const rows = db.auditLogs.filter((a) => (!type || a.eventType === type) && (!actor || a.actor.includes(actor)) && (!from || a.at >= from));
  const pg = usePaged(rows, 30);
  return (
    <>
      <div className="mb-3"><Alert tone="info" icon={ShieldCheck} title="Strictly Read-Only">Log audit forensik tidak dapat diubah atau dihapus. Waktu ditampilkan dalam Asia/Dili.</Alert></div>
      <div className="flex flex-col md:flex-row gap-2 mb-3">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="h-9 md:w-72"><option value="">Semua event_type</option>{types.map((t) => <option key={t}>{t}</option>)}</Select>
        <SearchInput value={actor} onChange={setActor} placeholder="Actor (username)" className="md:w-56" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 md:w-44" />
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <Table>
          <thead><tr><Th>Waktu (Asia/Dili)</Th><Th>event_type</Th><Th>Actor</Th><Th>Target Resource</Th><Th>request_id</Th></tr></thead>
          <tbody>{pg.slice.map((a) => (
            <Tr key={a.id} onClick={() => setOpen(a)} selected={open?.id === a.id}>
              <Td mono className="text-xs whitespace-nowrap">{fmtDateTime(a.at)}</Td>
              <Td><Badge mono tone={/REVERSED|REOPENED|REJECTED|VOID/.test(a.eventType) ? 'bad' : /ROLE|ACCESSED/.test(a.eventType) ? 'warn' : 'neutral'}>{a.eventType}</Badge></Td>
              <Td mono className="text-xs">{a.actor}</Td><Td mono className="text-xs">{a.target}</Td><Td mono className="text-xs text-ink2">{a.requestId}</Td>
            </Tr>))}</tbody>
        </Table>
        <Pager {...pg} />
      </div>
      {open && (
        <Drawer open onClose={() => setOpen(null)} width={560} title={<Mono>{open.eventType}</Mono>} subtitle={fmtDateTime(open.at)}>
          <KV k="Actor" v={open.actor} mono /><KV k="Target" v={open.target} mono /><KV k="request_id" v={open.requestId} mono /><KV k="IP" v={open.ip} mono />
          <div className="grid md:grid-cols-2 gap-3 mt-4">
            {(['before', 'after'] as const).map((k) => (
              <div key={k}>
                <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-1">{k}</div>
                <pre className="font-mono text-[11px] leading-relaxed bg-canvas border border-line rounded-md p-3 overflow-auto max-h-80 whitespace-pre-wrap break-all">{open[k] == null ? 'null' : JSON.stringify(open[k], null, 2)}</pre>
              </div>
            ))}
          </div>
        </Drawer>
      )}
    </>
  );
}

export default function Admin() {
  const { can } = useAuth();
  const { reload } = useData();
  const mutate = useMutation();
  const [tab, setTab] = useState<'users' | 'school' | 'audit'>(can('user.view') ? 'users' : 'audit');
  const [reset, setReset] = useState(false);
  return (
    <div>
      <PageHeader title="Administrasi Sistem" subtitle="Kontrol pengguna (RBAC), profil sekolah, dan log audit forensik"
        actions={can('*') && <Button variant="danger" onClick={() => setReset(true)}>Reset Data Demo</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[...(can('user.view') ? [{ id: 'users' as const, label: 'Users & Roles' }, { id: 'school' as const, label: 'Profil Sekolah' }] : []), ...(can('audit.view') ? [{ id: 'audit' as const, label: 'Forensic Audit Logs' }] : [])]} />
      {tab === 'users' && <Users />}
      {tab === 'school' && <School />}
      {tab === 'audit' && <Audit />}
      <Modal open={reset} onClose={() => setReset(false)} title="Reset Data Demo" size="sm" footer={<><Button onClick={() => setReset(false)}>Batal</Button><Button variant="dark" onClick={async () => { await mutate('POST', '/api/reset-demo', {}); setReset(false); await api('GET', '/api/auth/me').catch(() => { localStorage.removeItem('nossef.token'); location.href = '/login'; }); reload(); }}>Reset</Button></>}>
        <p className="text-sm text-ink2">Seluruh data akan dikembalikan ke kondisi awal (seed). Semua sesi login dicabut.</p>
      </Modal>
    </div>
  );
}
