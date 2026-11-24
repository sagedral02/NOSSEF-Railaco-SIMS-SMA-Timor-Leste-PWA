import { useState } from 'react';
import { useData, useOffline, useToast } from '../context/AppContexts';
import { api } from '../lib/api';
import { Alert, Button, Field, Modal, Mono, StatusPill, Textarea } from './ui';

/** Shows 409 ATTENDANCE_VERSION_CONFLICT after offline sync: local vs server values. */
export default function ConflictModal() {
  const { conflicts, resolveConflict } = useOffline();
  const { db, reload } = useData();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'choose' | 'correct'>('choose');
  const c = conflicts[0];
  if (!c || !db) return null;
  const details = (c.error.extra?.conflicts as { studentId: string; local: { status: string }; server: { status: string; changedBy?: string; note?: string } }[]) || [];
  const done = () => { resolveConflict(c.mutation.id); setMode('choose'); setReason(''); reload(); };
  return (
    <Modal open onClose={done} title="Konflik Sinkronisasi Presensi" size="lg"
      footer={mode === 'choose' ? (
        <>
          <Button onClick={() => setMode('correct')}>Ajukan Koreksi dengan Alasan</Button>
          <Button variant="primary" onClick={() => { toast('Data server dipertahankan.', 'info'); done(); }}>Gunakan Data Server</Button>
        </>
      ) : (
        <>
          <Button onClick={() => setMode('choose')}>Kembali</Button>
          <Button variant="dark" disabled={!reason.trim()} onClick={async () => {
            const records: Record<string, unknown> = {};
            details.forEach((d) => (records[d.studentId] = { ...d.local, note: `Koreksi: ${reason}` }));
            try {
              await api('POST', '/api/attendance/sessions', { ...c.mutation.body, baseVersion: undefined, records, clientMutationId: undefined });
              toast('Koreksi presensi dikirim dan dicatat di Audit Log.');
            } catch (e) { toast((e as Error).message, 'error'); }
            done();
          }}>Kirim Koreksi</Button>
        </>
      )}>
      <Alert tone="bad" title={<Mono>409 {c.error.code}</Mono>}>{c.error.message} Perubahan offline Anda bertabrakan dengan perubahan yang dibuat di server.</Alert>
      <div className="mt-4 border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-3 bg-canvas text-xs font-semibold uppercase tracking-wider text-ink2 border-b border-line">
          <div className="px-3 h-9 flex items-center">Siswa</div>
          <div className="px-3 h-9 flex items-center border-l border-line">Data Lokal Anda (Offline)</div>
          <div className="px-3 h-9 flex items-center border-l border-line">Data Server Saat Ini</div>
        </div>
        {details.map((d) => {
          const s = db.students.find((x) => x.id === d.studentId);
          return (
            <div key={d.studentId} className="grid grid-cols-3 text-sm border-b border-line last:border-0">
              <div className="px-3 py-3"><div>{s?.name}</div><Mono className="text-xs text-muted">{s?.studentNo}</Mono></div>
              <div className="px-3 py-3 border-l border-line"><StatusPill status={d.local.status} /></div>
              <div className="px-3 py-3 border-l border-line">
                <StatusPill status={d.server.status} />
                <div className="text-xs text-ink2 mt-1">Diubah oleh {d.server.changedBy || 'TU'}{d.server.note ? ` — ${d.server.note}` : ''}</div>
              </div>
            </div>
          );
        })}
      </div>
      {mode === 'correct' && (
        <Field label="Alasan koreksi" required className="mt-4">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: Siswa hadir di jam pertama, surat izin baru diterima siang hari." autoFocus />
        </Field>
      )}
      {conflicts.length > 1 && <div className="text-xs text-ink2 mt-3"><Mono>{conflicts.length - 1}</Mono> konflik lain menunggu.</div>}
    </Modal>
  );
}
