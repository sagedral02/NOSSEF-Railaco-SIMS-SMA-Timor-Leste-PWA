// IndexedDB schema (PRD §34.4). Cache/queue only — never a source of truth (INV-19), never auth tokens.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'nossef-offline';
export const DB_VERSION = 1;

export type MutationState = 'PENDING' | 'SENDING' | 'APPLIED' | 'CONFLICT' | 'REJECTED';

export interface RosterStudent {
  student_id: string; student_no: string; full_name: string; gender: string; leave: string | null;
  record: { id: string; status: string; minutes_late: number | null; note: string; version: number } | null;
}
export interface CachedSession {
  id: string; classroom_name: string; date: string; session_type: string; subject_code: string | null; bell_period_name: string | null;
  status: string; version: number; can_record: boolean; roster: RosterStudent[]; cached_at: string;
}
export interface Draft { key: string; session_id: string; student_id: string; status: string; minutes_late: number | null; note: string }
export interface QueuedMutation {
  mutation_id: string; session_id: string; student_id: string; status: string; minutes_late: number | null; note: string;
  base_record_version: number | null; client_recorded_at: string; state: MutationState; attempts: number; last_error?: string;
  server?: { status: string; minutes_late: number | null; version: number } | null; label: string;
}

interface Schema extends DBSchema {
  meta: { key: string; value: unknown };
  class_rosters: { key: string; value: { key: string; session_id: string; roster: RosterStudent[] } };
  attendance_sessions: { key: string; value: CachedSession };
  attendance_drafts: { key: string; value: Draft; indexes: { by_session: string } };
  mutation_queue: { key: string; value: QueuedMutation; indexes: { by_session: string; by_state: string } };
  sync_receipts: { key: string; value: { mutation_id: string; result: string; at: string; detail?: unknown } };
  reference_cache: { key: string; value: { key: string; value: unknown; at: string } };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function db() {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable');
  dbPromise ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      // Versioned migrations: each step only adds what that version introduced.
      if (oldVersion < 1) {
        database.createObjectStore('meta');
        database.createObjectStore('class_rosters', { keyPath: 'key' });
        database.createObjectStore('attendance_sessions', { keyPath: 'id' });
        database.createObjectStore('attendance_drafts', { keyPath: 'key' }).createIndex('by_session', 'session_id');
        const q = database.createObjectStore('mutation_queue', { keyPath: 'mutation_id' });
        q.createIndex('by_session', 'session_id');
        q.createIndex('by_state', 'state');
        database.createObjectStore('sync_receipts', { keyPath: 'mutation_id' });
        database.createObjectStore('reference_cache', { keyPath: 'key' });
      }
    },
    blocked() {
      // Another tab holds an older version open; it will reload on 'versionchange'.
    },
  });
  return dbPromise;
}

const USER_SCOPED = ['class_rosters', 'attendance_sessions', 'attendance_drafts', 'mutation_queue', 'sync_receipts', 'reference_cache'] as const;

/** Clear every user-scoped store (logout / different user). Caller must handle unsynced mutations first. */
export async function clearUserData() {
  const d = await db();
  const tx = d.transaction([...USER_SCOPED, 'meta'], 'readwrite');
  await Promise.all([...USER_SCOPED.map((s) => tx.objectStore(s).clear()), tx.objectStore('meta').delete('current_user')]);
  await tx.done;
}

/** Bind the local cache to a user; switching users clears the previous user's data (PRD §34.4). */
export async function bindUser(userId: string): Promise<{ switched: boolean; pendingFromOther: number }> {
  const d = await db();
  const current = (await d.get('meta', 'current_user')) as string | undefined;
  if (current && current !== userId) {
    const pending = (await d.getAllFromIndex('mutation_queue', 'by_state', 'PENDING')).length;
    await clearUserData();
    await d.put('meta', userId, 'current_user');
    return { switched: true, pendingFromOther: pending };
  }
  if (!current) await d.put('meta', userId, 'current_user');
  return { switched: false, pendingFromOther: 0 };
}

export async function deviceId(): Promise<string> {
  const d = await db();
  let id = (await d.get('meta', 'device_id')) as string | undefined;
  if (!id) {
    id = crypto.randomUUID();
    await d.put('meta', id, 'device_id');
  }
  return id;
}
