import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, CalendarDays, Megaphone, Paperclip, Plus } from 'lucide-react';
import { useAuth, useData, useDB, useMutation } from '../context/AppContexts';
import { api } from '../lib/api';
import { Badge, Button, Card, cx, Drawer, EmptyState, Field, Input, Mono, PageHeader, StatusPill, Tabs, Textarea } from '../components/ui';
import { fmtDate, fmtDateTime, relTime } from '../lib/format';
import type { Announcement } from '../lib/types';
import { fileUrl, type StoredFile } from '../lib/files';
import { FileField } from '../components/FileField';

const AUDIENCES = ['ALL', 'ROLE:TEACHER', 'ROLE:HOMEROOM_TEACHER', 'GUARDIAN', 'STUDENT', 'GRADE:10', 'GRADE:11', 'GRADE:12', 'MAJOR:CT', 'MAJOR:CSH'];

function Composer({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Announcement | null }) {
  const mutate = useMutation();
  const { user } = useAuth();
  const [f, setF] = useState(() => initial || { title: '', body: '', audience: ['ALL'], status: 'DRAFT', publishAt: '', push: false, author: user?.name || '' } as unknown as Announcement);
  const [file, setFile] = useState<StoredFile | null>(initial?.attachment ? { ...initial.attachment, size: 0 } : null);
  const save = async (status: string) => {
    const body = { ...f, attachment: file ? { id: file.id, name: file.name, mime: file.mime } : null, status, publishAt: status === 'PUBLISHED' ? new Date().toISOString() : f.publishAt ? new Date(f.publishAt).toISOString() : null, author: f.author || user?.name };
    const ok = initial ? await mutate('PATCH', `/api/c/announcements/${initial.id}`, body, 'Pengumuman diperbarui.') : await mutate('POST', '/api/c/announcements', body, status === 'PUBLISHED' ? 'Pengumuman diterbitkan.' : 'Pengumuman disimpan.');
    if (ok) onClose();
  };
  return (
    <Drawer open={open} onClose={onClose} width={520} title={initial ? 'Ubah Pengumuman' : 'Buat Pengumuman'}
      footer={<><Button onClick={() => save('DRAFT')} disabled={!f.title}>Simpan Draf</Button><Button onClick={() => save('SCHEDULED')} disabled={!f.title || !f.publishAt}>Jadwalkan</Button><Button variant="primary" onClick={() => save('PUBLISHED')} disabled={!f.title || !f.body}>Terbitkan Sekarang</Button></>}>
      <div className="space-y-4">
        <Field label="Judul" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Isi Pengumuman" required><Textarea className="min-h-[160px]" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Field label="Target Audiens">
          <div className="flex flex-wrap gap-1.5">
            {AUDIENCES.map((a) => {
              const on = f.audience.includes(a);
              return <button key={a} type="button" onClick={() => setF({ ...f, audience: on ? f.audience.filter((x) => x !== a) : [...f.audience.filter((x) => a !== 'ALL' ? x !== 'ALL' : false), a] })} className={cx('h-7 px-2.5 rounded-md text-xs font-mono border', on ? 'bg-ink text-white border-ink' : 'border-line text-ink2 hover:bg-hover')}>{a}</button>;
            })}
          </div>
        </Field>
        <Field label="Jadwal Terbit"><Input type="datetime-local" value={f.publishAt ? f.publishAt.slice(0, 16) : ''} onChange={(e) => setF({ ...f, publishAt: e.target.value })} /></Field>
        <Field label="Lampiran File Resmi"><FileField value={file} onChange={setFile} category="announcement" label="Pilih file (PDF/JPG)" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#0061FE]" checked={f.push} onChange={(e) => setF({ ...f, push: e.target.checked })} />Kirim juga sebagai Web Push</label>
      </div>
    </Drawer>
  );
}

export default function Communications({ initial = 'announcements' }: { initial?: 'announcements' | 'notifications' | 'calendar' }) {
  const db = useDB();
  const { reload } = useData();
  const { can, user } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState(initial);
  const [compose, setCompose] = useState<{ open: boolean; a?: Announcement | null }>({ open: false });
  const [filter, setFilter] = useState('');
  const [push, setPush] = useState(() => { try { return localStorage.getItem('nossef.push') === '1'; } catch { return false; } });
  const manage = can('announcement.publish');
  const visible = db.announcements.filter((a) => manage || (a.status === 'PUBLISHED' && (a.audience.includes('ALL') || user?.roles.some((r) => a.audience.includes(`ROLE:${r}`) || a.audience.includes(r)))));
  const list = visible.filter((a) => !filter || a.status === filter);
  return (
    <div>
      <PageHeader title="Pengumuman, Notifikasi & Kalender" actions={manage && tab === 'announcements' && <Button variant="primary" icon={Plus} onClick={() => setCompose({ open: true, a: null })}>Buat Pengumuman</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'announcements', label: 'Papan Pengumuman', icon: Megaphone, count: visible.length }, { id: 'notifications', label: 'Kotak Masuk Notifikasi', icon: BellRing, count: db.notifications.filter((n) => !n.read).length }, { id: 'calendar', label: 'Kalender Akademik', icon: CalendarDays }]} />
      {tab === 'announcements' && (
        <>
          {manage && <div className="flex gap-1.5 mb-3">{['', 'PUBLISHED', 'SCHEDULED', 'DRAFT'].map((s) => <button key={s} onClick={() => setFilter(s)} className={cx('h-8 px-3 rounded-full text-xs font-medium border', filter === s ? 'bg-ink text-white border-ink' : 'bg-white border-line text-ink2')}>{s || 'Semua'}</button>)}</div>}
          <div className="space-y-3">
            {list.map((a) => (
              <article key={a.id} className="bg-white border border-line rounded-lg p-5">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="font-display text-base font-semibold flex-1 min-w-[200px]">{a.title}</h3>
                  <StatusPill status={a.status} />
                  {manage && <Button size="sm" variant="ghost" onClick={() => setCompose({ open: true, a })}>Ubah</Button>}
                </div>
                <p className="text-sm text-ink2 mt-2 whitespace-pre-line">{a.body}</p>
                {a.attachment && <a href={fileUrl(a.attachment.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-sm text-accent"><Paperclip className="w-4 h-4" strokeWidth={1.5} />{a.attachment.name}</a>}
                <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-ink2">
                  {a.audience.map((x) => <Badge key={x} mono>{x}</Badge>)}
                  <span className="ml-auto">{a.author} · {a.publishAt ? fmtDateTime(a.publishAt) : 'belum dijadwalkan'}{a.push && ' · Web Push'}</span>
                </div>
              </article>
            ))}
            {!list.length && <div className="bg-white border border-line rounded-lg"><EmptyState icon={Megaphone} title="Belum ada pengumuman." /></div>}
          </div>
          {compose.open && <Composer key={compose.a?.id || 'new'} open initial={compose.a} onClose={() => setCompose({ open: false })} />}
        </>
      )}
      {tab === 'notifications' && (
        <div className="grid lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-8" pad={false} title="Notifikasi" actions={<Button size="sm" onClick={async () => { await api('POST', '/api/notifications/read', {}); reload(); }}>Tandai Semua Dibaca</Button>}>
            {db.notifications.length ? db.notifications.map((n) => (
              <button key={n.id} onClick={async () => { await api('POST', '/api/notifications/read', { ids: [n.id] }); reload(); nav(n.link); }} className="w-full flex gap-3 px-4 py-3.5 border-b border-line last:border-0 text-left hover:bg-hover">
                <span className={cx('w-2 h-2 rounded-full mt-1.5 shrink-0', n.read ? 'bg-transparent' : 'bg-accent')} />
                <span className="flex-1 min-w-0">
                  <span className={cx('block text-sm', !n.read && 'font-semibold')}>{n.title}</span>
                  <span className="block text-xs text-ink2 mt-0.5">{n.body}</span>
                  <span className="flex items-center gap-2 mt-1"><Mono className="text-[11px] text-muted">{n.event}</Mono><span className="text-[11px] text-muted">{relTime(n.at)}</span></span>
                </span>
                <span className="text-xs text-accent self-center whitespace-nowrap">Buka</span>
              </button>
            )) : <EmptyState icon={BellRing} title="Tidak ada notifikasi." />}
          </Card>
          <Card className="lg:col-span-4" title="Web Push Perangkat Ini">
            <p className="text-sm text-ink2">Terima notifikasi presensi, pembayaran, dan rapor langsung di perangkat ini. Ringkasan notifikasi tidak memuat data sensitif.</p>
            <div className="flex items-center justify-between mt-4 border border-line rounded-md px-3 h-12">
              <span className="text-sm">Notifikasi perangkat</span>
              <button onClick={async () => {
                const v = !push;
                if (v && 'Notification' in window) { try { await Notification.requestPermission(); } catch { /* ignore */ } }
                setPush(v); try { localStorage.setItem('nossef.push', v ? '1' : '0'); } catch { /* ignore */ }
              }} className={cx('w-11 h-6 rounded-full relative transition-colors', push ? 'bg-accent' : 'bg-line-strong')}>
                <span className={cx('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all', push ? 'left-[22px]' : 'left-0.5')} />
              </button>
            </div>
          </Card>
        </div>
      )}
      {tab === 'calendar' && (
        <div className="grid lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-7" title="Agenda Akademik 2026" pad={false}>
            {[...db.trimesters.flatMap((t) => [{ id: t.id + 's', date: t.start, title: `Mulai ${t.number}º Trimestre`, type: 'ACADEMIC' }, { id: t.id + 'e', date: t.end, title: `Akhir ${t.number}º Trimestre (CAU ${t.cau})`, type: 'EXAM' }]), ...db.calendarEvents].sort((a, b) => a.date.localeCompare(b.date)).map((e) => (
              <div key={e.id} className={cx('flex items-center gap-4 px-4 h-12 border-b border-line last:border-0', e.date < '2026-10-15' && 'opacity-50')}>
                <Mono className="text-xs w-24 text-ink2">{fmtDate(e.date)}</Mono>
                <span className="text-sm flex-1">{e.title}</span>
                <Badge tone={e.type === 'HOLIDAY' ? 'bad' : e.type === 'EXAM' ? 'warn' : e.type === 'RELIGIOUS' ? 'info' : 'neutral'}>{e.type}</Badge>
              </div>
            ))}
          </Card>
          <Card className="lg:col-span-5" title="Oktober 2026">
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="text-ink2 font-semibold py-1">{d}</div>)}
              {Array.from({ length: 4 }).map((_, i) => <div key={'e' + i} />)}
              {Array.from({ length: 31 }).map((_, i) => {
                const d = `2026-10-${String(i + 1).padStart(2, '0')}`;
                const ev = db.calendarEvents.find((e) => e.date === d);
                return <div key={d} title={ev?.title} className={cx('h-9 rounded-md flex items-center justify-center font-mono', d === '2026-10-15' ? 'bg-accent text-white' : ev ? 'bg-selected text-accent font-semibold' : 'text-ink')}>{i + 1}</div>;
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
