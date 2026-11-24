// Offline mutation queue + sync engine (PRD §34.5): PENDING → SENDING → APPLIED | CONFLICT | REJECTED,
// network/5xx → back to PENDING, 401/403 stops sync. Same mutation_id is safe to resend (server receipts).
import { API_BASE } from '@/lib/api';

import { db, deviceId, type CachedSession, type Draft, type QueuedMutation } from './db';

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((l) => l());
}

export async function saveSessionSnapshot(session: Omit<CachedSession, 'cached_at'>) {
  const d = await db();
  await d.put('attendance_sessions', { ...session, cached_at: new Date().toISOString() });
  await d.put('class_rosters', { key: session.id, session_id: session.id, roster: session.roster });
}

export async function getSessionSnapshot(id: string) {
  return (await db()).get('attendance_sessions', id);
}

export async function listCachedSessions() {
  return (await db()).getAll('attendance_sessions');
}

export async function getDrafts(sessionId: string): Promise<Record<string, Draft>> {
  const rows = await (await db()).getAllFromIndex('attendance_drafts', 'by_session', sessionId);
  return Object.fromEntries(rows.map((r) => [r.student_id, r]));
}

export interface MarkArgs {
  sessionId: string; studentId: string; status: string; minutesLate: number | null; note?: string; baseVersion: number | null; label: string;
}

/** Record marks locally (drafts) and enqueue offline-safe commands — all in one IndexedDB transaction. */
export async function enqueueMarks(marks: MarkArgs[]) {
  if (!marks.length) return;
  const d = await db();
  const tx = d.transaction(['attendance_drafts', 'mutation_queue'], 'readwrite');
  const queue = tx.objectStore('mutation_queue');
  for (const args of marks) {
    await tx.objectStore('attendance_drafts').put({
      key: `${args.sessionId}:${args.studentId}`, session_id: args.sessionId, student_id: args.studentId, status: args.status,
      minutes_late: args.minutesLate, note: args.note ?? '',
    });
    // Supersede older still-pending commands for the same student (they were never sent).
    for (const m of await queue.index('by_session').getAll(args.sessionId)) {
      if (m.student_id === args.studentId && m.state === 'PENDING') await queue.delete(m.mutation_id);
    }
    await queue.put({
      mutation_id: crypto.randomUUID(), session_id: args.sessionId, student_id: args.studentId, status: args.status, minutes_late: args.minutesLate,
      note: args.note ?? '', base_record_version: args.baseVersion, client_recorded_at: new Date().toISOString(), state: 'PENDING', attempts: 0,
      label: args.label,
    });
  }
  await tx.done;
  notify();
}

export function enqueueMark(args: MarkArgs) {
  return enqueueMarks([args]);
}

export async function queueSnapshot() {
  return (await db()).getAll('mutation_queue');
}

export async function discardMutation(id: string) {
  const d = await db();
  const m = await d.get('mutation_queue', id);
  await d.delete('mutation_queue', id);
  if (m) await d.delete('attendance_drafts', `${m.session_id}:${m.student_id}`);
  notify();
}

/** Re-queue a conflicted mark on top of the server's current version (explicit user choice = "keep mine"). */
export async function keepMine(id: string) {
  const d = await db();
  const m = await d.get('mutation_queue', id);
  if (!m) return;
  await d.delete('mutation_queue', id);
  await d.put('mutation_queue', { ...m, mutation_id: crypto.randomUUID(), base_record_version: m.server?.version ?? null, state: 'PENDING',
    attempts: 0, last_error: undefined, server: undefined });
  notify();
}

function readCookie(name: string) {
  const m = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}

let running: Promise<SyncOutcome> | null = null;
export interface SyncOutcome { applied: number; conflicts: number; rejected: number; authError: boolean; networkError: boolean }

export function syncNow(): Promise<SyncOutcome> {
  running ??= doSync().finally(() => { running = null; notify(); });
  return running;
}

async function doSync(): Promise<SyncOutcome> {
  const out: SyncOutcome = { applied: 0, conflicts: 0, rejected: 0, authError: false, networkError: false };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ...out, networkError: true };
  const d = await db();
  const pending = await d.getAllFromIndex('mutation_queue', 'by_state', 'PENDING');
  if (!pending.length) return out;
  const bySession = new Map<string, QueuedMutation[]>();
  for (const m of pending) bySession.set(m.session_id, [...(bySession.get(m.session_id) ?? []), m]);
  const device = await deviceId();
  if (!readCookie('csrftoken')) await fetch(`${API_BASE}/auth/csrf/`, { credentials: 'same-origin' }).catch(() => null);
  for (const [sessionId, mutations] of bySession) {
    for (const m of mutations) await d.put('mutation_queue', { ...m, state: 'SENDING', attempts: m.attempts + 1 });
    notify();
    const snapshot = await d.get('attendance_sessions', sessionId);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/attendance/offline-sync/`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': readCookie('csrftoken') },
        body: JSON.stringify({
          batch_id: crypto.randomUUID(), device_id: device, session_id: sessionId, base_session_version: snapshot?.version ?? null,
          mutations: mutations.map((m) => ({
            mutation_id: m.mutation_id, student_id: m.student_id, base_record_version: m.base_record_version, status: m.status,
            minutes_late: m.minutes_late, note: m.note, client_recorded_at: m.client_recorded_at,
          })),
        }),
      });
    } catch {
      for (const m of mutations) await d.put('mutation_queue', { ...m, state: 'PENDING', attempts: m.attempts + 1, last_error: 'NETWORK_ERROR' });
      out.networkError = true;
      break;
    }
    if (res.status === 401 || res.status === 403) {
      for (const m of mutations) await d.put('mutation_queue', { ...m, state: 'PENDING', last_error: res.status === 401 ? 'AUTH_NOT_AUTHENTICATED' : 'PERMISSION_DENIED' });
      out.authError = true;
      break; // stop sync and ask the user to (re)authenticate (PRD §34.5)
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const retry = res.status >= 500;
      for (const m of mutations) {
        await d.put('mutation_queue', { ...m, state: retry ? 'PENDING' : 'REJECTED', last_error: body?.error?.code ?? `HTTP_${res.status}` });
      }
      if (retry) out.networkError = true; else out.rejected += mutations.length;
      continue;
    }
    const body = (await res.json()).data as { session_version: number; session_status: string; results: { mutation_id: string; result: string; code?: string; server?: QueuedMutation['server'] }[] };
    const results = new Map(body.results.map((r) => [r.mutation_id, r]));
    for (const m of mutations) {
      const r = results.get(m.mutation_id);
      if (!r) continue;
      if (r.result === 'APPLIED' || r.result === 'DUPLICATE') {
        await d.delete('mutation_queue', m.mutation_id);
        await d.delete('attendance_drafts', `${m.session_id}:${m.student_id}`);
        await d.put('sync_receipts', { mutation_id: m.mutation_id, result: r.result, at: new Date().toISOString() });
        if (snapshot) {
          const roster = snapshot.roster.map((s) => (s.student_id === m.student_id && r.server
            ? { ...s, record: { id: s.record?.id ?? '', status: r.server.status, minutes_late: r.server.minutes_late, note: m.note, version: r.server.version } }
            : s));
          snapshot.roster = roster;
        }
        out.applied++;
      } else if (r.result === 'CONFLICT') {
        await d.put('mutation_queue', { ...m, state: 'CONFLICT', last_error: r.code, server: r.server ?? null });
        out.conflicts++;
      } else {
        await d.put('mutation_queue', { ...m, state: 'REJECTED', last_error: r.code });
        out.rejected++;
      }
    }
    if (snapshot) await d.put('attendance_sessions', { ...snapshot, version: body.session_version, status: body.session_status });
  }
  return out;
}
