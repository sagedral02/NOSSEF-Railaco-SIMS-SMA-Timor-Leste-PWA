'use client';

// Roster marking — offline-safe (PRD §20, §34.5). Every mark becomes a queued command with a client UUID;
// drafts survive reloads in IndexedDB; sync is idempotent and conflicts are surfaced, never overwritten.
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Lock, Pencil, RefreshCw, Send } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/toast';
import { Alert, ApiErrorAlert, Avatar, Badge, Button, Card, ErrorState, Field, Input, Modal, Mono, PageHeader, Select, Skeleton, StatusPill, Textarea } from '@/components/ui';
import { useAuth } from '@/features/auth/auth';
import { useI18n, type MessageKey } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { cx } from '@/lib/format';
import type { CachedSession, Draft, RosterStudent } from '@/lib/offline/db';
import { useOffline } from '@/lib/offline/provider';
import { discardMutation, enqueueMark, enqueueMarks, getDrafts, getSessionSnapshot, keepMine, saveSessionSnapshot } from '@/lib/offline/sync';

const STATUSES = ['PRESENT', 'LATE', 'SICK', 'PERMITTED', 'ABSENT'] as const;
const TONE: Record<string, string> = {
  PRESENT: 'bg-ok text-white border-ok', LATE: 'bg-warn text-white border-warn', SICK: 'bg-accent text-white border-accent',
  PERMITTED: 'bg-ink2 text-white border-ink2', ABSENT: 'bg-bad text-white border-bad',
};

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const { t, tx } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { online, queue, sync, syncing, refresh } = useOffline();
  const [session, setSession] = useState<CachedSession | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [late, setLate] = useState<{ student: RosterStudent; minutes: string } | null>(null);
  const [correcting, setCorrecting] = useState<RosterStudent | null>(null);
  const [correction, setCorrection] = useState({ status: 'PRESENT', minutes: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const syncTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (navigator.onLine) {
      try {
        const fresh = await api.get<CachedSession>(`/attendance/sessions/${id}/`);
        await saveSessionSnapshot(fresh);
        setSession({ ...fresh, cached_at: new Date().toISOString() });
        setFromCache(false);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 0) {
          setError(e);
          return;
        }
      }
    }
    const snap = await getSessionSnapshot(id);
    if (snap && !navigator.onLine) {
      setSession(snap);
      setFromCache(true);
    } else if (!snap && !navigator.onLine) {
      setError(new ApiError(0, 'NETWORK_ERROR', t('offline.unavailable')));
    }
    setDrafts(await getDrafts(id));
  }, [id, t]);

  useEffect(() => {
    // Deferred so state updates happen in a callback, not synchronously in the effect body.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  // After a sync completes, reload so server versions/states are fresh.
  const pendingHere = queue.filter((m) => m.session_id === id && (m.state === 'PENDING' || m.state === 'SENDING'));
  const conflictsHere = queue.filter((m) => m.session_id === id && m.state === 'CONFLICT');
  const rejectedHere = queue.filter((m) => m.session_id === id && m.state === 'REJECTED');
  const pendingCount = pendingHere.length;
  const lastPending = useRef(pendingCount);
  useEffect(() => {
    if (lastPending.current > 0 && pendingCount === 0 && online) void load();
    lastPending.current = pendingCount;
  }, [pendingCount, online, load]);

  const scheduleSync = () => {
    if (!navigator.onLine) return;
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => void sync(), 800);
  };

  const effective = useMemo(() => {
    const out: Record<string, { status: string | null; minutes: number | null; pending: boolean }> = {};
    for (const s of session?.roster ?? []) {
      const d = drafts[s.student_id];
      out[s.student_id] = d ? { status: d.status, minutes: d.minutes_late, pending: true } : { status: s.record?.status ?? null, minutes: s.record?.minutes_late ?? null, pending: false };
    }
    return out;
  }, [session, drafts]);

  const mark = async (s: RosterStudent, status: string, minutes: number | null = null) => {
    await enqueueMark({ sessionId: id, studentId: s.student_id, status, minutesLate: minutes, baseVersion: s.record?.version ?? null,
      label: `${session?.classroom_name} ${session?.date} — ${s.full_name}` });
    setDrafts(await getDrafts(id));
    await refresh();
    scheduleSync();
  };

  const markAllPresent = async () => {
    // Explicit action (blank is never PRESENT, PRD §20.3); enqueued atomically.
    const marks = (session?.roster ?? []).filter((s) => !effective[s.student_id]?.status).map((s) => ({
      sessionId: id, studentId: s.student_id, status: 'PRESENT', minutesLate: null, baseVersion: s.record?.version ?? null,
      label: `${session?.classroom_name} ${session?.date} — ${s.full_name}`,
    }));
    await enqueueMarks(marks);
    setDrafts(await getDrafts(id));
    await refresh();
    scheduleSync();
  };

  const run = async (fn: () => Promise<unknown>, okMsg: MessageKey) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      toast(t(okMsg));
      await load();
      qc.invalidateQueries({ queryKey: ['attendance'] });
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState error={error} onRetry={() => { setError(null); void load(); }} />;
  if (!session) return <Card pad={false}><Skeleton /></Card>;
  const open = session.status === 'OPEN';
  const editable = open && session.can_record;
  const unmarked = session.roster.filter((s) => !effective[s.student_id]?.status).length;
  const counts = STATUSES.map((st) => [st, session.roster.filter((s) => effective[s.student_id]?.status === st).length] as const);

  return (
    <>
      <PageHeader
        back="/attendance/today"
        title={`${session.classroom_name}${session.subject_code ? ` · ${session.subject_code}` : ''}`}
        subtitle={<>{session.date} · {session.bell_period_name ?? t('att.daily')} · <Mono>v{session.version}</Mono>{fromCache && <> · <Badge tone="warn">{t('offline.cached')}</Badge></>}</>}
        actions={
          <>
            <StatusPill status={session.status} />
            {pendingCount > 0 && <Button icon={RefreshCw} disabled={!online || syncing} onClick={() => void sync()}>{t('offline.syncNow')} ({pendingCount})</Button>}
            {editable && <Button icon={CheckCheck} disabled={!unmarked} onClick={() => void markAllPresent()}>{t('att.markAll')}</Button>}
            {editable && <Button variant="primary" icon={Send} disabled={busy || !online || pendingCount > 0 || unmarked > 0}
              onClick={() => run(() => api.post(`/attendance/sessions/${id}/submit/`), 'att.submitted')}>{t('att.submit')}</Button>}
            {session.status === 'SUBMITTED' && (can('attendance.approve') || can('attendance.correct')) && (
              <Button icon={Lock} disabled={busy || !online} onClick={() => run(() => api.post(`/attendance/sessions/${id}/lock/`), 'common.saved')}>{t('att.lock')}</Button>
            )}
          </>
        }
      />
      {!open && <div className="mb-3"><Alert tone="info">{t('att.lockedHint')}</Alert></div>}
      {editable && unmarked > 0 && <div className="mb-3 text-xs text-warn font-medium">{t('att.unmarked', { count: unmarked })}</div>}
      {editable && pendingCount > 0 && !online && <div className="mb-3"><Alert tone="warn">{t('offline.queuedHint')}</Alert></div>}
      {editable && pendingCount > 0 && online && <p className="mb-3 text-xs text-muted">{t('att.submitNeedsSync')}</p>}
      {actionError != null && <div className="mb-3"><ApiErrorAlert error={actionError} /></div>}
      {conflictsHere.map((c) => {
        const s = session.roster.find((r) => r.student_id === c.student_id);
        return (
          <div key={c.mutation_id} className="mb-3">
            <Alert tone="bad" title={`${t('offline.conflictTitle')} — ${s?.full_name ?? ''}`}
              action={<span className="flex gap-2 shrink-0">
                <Button size="sm" onClick={async () => { await keepMine(c.mutation_id); await refresh(); scheduleSync(); }}>{t('offline.keepMine')}</Button>
                <Button size="sm" variant="primary" onClick={async () => { await discardMutation(c.mutation_id); setDrafts(await getDrafts(id)); await load(); }}>{t('offline.useServer')}</Button>
              </span>}>
              {t('offline.mine')}: <strong>{tx(`att.status.${c.status}`, c.status)}</strong> · {t('offline.server')}: <strong>{c.server ? tx(`att.status.${c.server.status}`, c.server.status) : '—'}</strong>
            </Alert>
          </div>
        );
      })}
      {rejectedHere.map((r) => <div key={r.mutation_id} className="mb-3"><Alert tone="bad" title={r.label}>{tx(`error.${r.last_error}`, r.last_error ?? '')}</Alert></div>)}
      <Card pad={false}>
        <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-line text-xs">
          {counts.map(([st, n]) => <Badge key={st} tone={st === 'PRESENT' ? 'ok' : st === 'ABSENT' ? 'bad' : st === 'LATE' ? 'warn' : 'neutral'}>{tx(`att.status.${st}`, st)}: {n}</Badge>)}
        </div>
        {session.roster.map((s, i) => {
          const e = effective[s.student_id];
          return (
            <div key={s.student_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-line last:border-0">
              <Mono className="w-6 text-xs text-muted">{i + 1}</Mono>
              <Avatar name={s.full_name} size={30} />
              <div className="flex-1 min-w-[160px]">
                <div className="text-sm font-medium">{s.full_name}</div>
                <div className="text-[11px] text-ink2"><Mono className="text-[11px]">{s.student_no}</Mono>
                  {s.leave && <Badge tone="info" className="ml-1">{t('att.onLeave')}: {tx(`leave.type.${s.leave}`, s.leave)}</Badge>}
                  {e?.pending && <Badge tone="warn" className="ml-1">{t('att.pendingSync')}</Badge>}
                  {e?.status === 'LATE' && e.minutes ? <span className="ml-1">{e.minutes} {t('att.minutes')}</span> : null}
                </div>
              </div>
              {editable ? (
                <div className="flex gap-1" role="radiogroup" aria-label={s.full_name}>
                  {STATUSES.map((st) => (
                    <button key={st} type="button" role="radio" aria-checked={e?.status === st} title={tx(`att.status.${st}`, st)}
                      onClick={() => (st === 'LATE' ? setLate({ student: s, minutes: String(e?.minutes ?? 10) }) : void mark(s, st))}
                      className={cx('h-9 min-w-9 px-2 rounded-md border text-xs font-semibold transition-colors', e?.status === st ? TONE[st] : 'bg-white border-line text-ink2 hover:bg-hover')}>
                      <span aria-hidden>{tx(`att.short.${st}`, st[0])}</span><span className="sr-only">{tx(`att.status.${st}`, st)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  {e?.status ? <StatusPill status={e.status} label={tx(`att.status.${e.status}`, e.status)} /> : <span className="text-xs text-muted">—</span>}
                  {s.record && online && (can('attendance.correct') || (session.status === 'SUBMITTED' && session.can_record)) && (
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { setActionError(null); setCorrection({ status: s.record!.status, minutes: String(s.record!.minutes_late ?? ''), reason: '' }); setCorrecting(s); }}>{t('att.correct')}</Button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </Card>
      <Modal open={!!late} onClose={() => setLate(null)} title={tx('att.status.LATE', 'LATE')} size="sm"
        footer={<><Button onClick={() => setLate(null)}>{t('common.cancel')}</Button><Button variant="primary" disabled={!Number(late?.minutes)} onClick={async () => { if (late) await mark(late.student, 'LATE', Number(late.minutes)); setLate(null); }}>{t('common.save')}</Button></>}>
        <Field label={`${late?.student.full_name ?? ''} — ${t('att.minutes')}`}><Input type="number" min={1} max={600} value={late?.minutes ?? ''} onChange={(e) => late && setLate({ ...late, minutes: e.target.value })} autoFocus /></Field>
      </Modal>
      <Modal open={!!correcting} onClose={() => setCorrecting(null)} title={`${t('att.correctTitle')} — ${correcting?.full_name ?? ''}`} size="sm"
        footer={<><Button onClick={() => setCorrecting(null)}>{t('common.cancel')}</Button><Button variant="primary" disabled={!correction.reason.trim() || busy}
          onClick={() => correcting?.record && run(async () => {
            await api.post(`/attendance/records/${correcting.record!.id}/correct/`, { status: correction.status, minutes_late: correction.status === 'LATE' ? Number(correction.minutes) : null, reason: correction.reason });
            setCorrecting(null);
          }, 'common.saved')}>{t('common.save')}</Button></>}>
        <div className="space-y-3">
          <Field label={t('common.status')}>
            <Select value={correction.status} onChange={(e) => setCorrection({ ...correction, status: e.target.value })}>
              {STATUSES.map((st) => <option key={st} value={st}>{tx(`att.status.${st}`, st)}</option>)}
            </Select>
          </Field>
          {correction.status === 'LATE' && <Field label={t('att.minutes')}><Input type="number" min={1} value={correction.minutes} onChange={(e) => setCorrection({ ...correction, minutes: e.target.value })} /></Field>}
          <Field label={t('common.reason')} required><Textarea value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} placeholder={t('common.reasonPlaceholder')} /></Field>
          {actionError != null && <ApiErrorAlert error={actionError} />}
        </div>
      </Modal>
    </>
  );
}
