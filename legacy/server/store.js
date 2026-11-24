// SQLite persistence (development phase) using Node's built-in node:sqlite.
// Each collection is stored in its own table: (id TEXT PRIMARY KEY, data TEXT JSON).
// Singleton objects (school, counters) live in the `meta` table.
// Uploaded files and generated reports are stored as BLOBs in the `files` table.
// The server keeps a hydrated in-memory copy for business logic and writes back only changed rows.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

process.removeAllListeners('warning'); // silence the node:sqlite ExperimentalWarning
const { DatabaseSync } = await import('node:sqlite');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.join(__dirname, 'data', 'nossef.sqlite');

const SINGLETONS = new Set(['school', 'counters']);
const keyOf = (rec) => String(rec.id ?? rec.code ?? rec.studentId ?? rec.year);
const tableName = (col) => col.replace(/[^A-Za-z0-9_]/g, '');

export function openStore() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sql = new DatabaseSync(DB_PATH);
  sql.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
      category TEXT, owner TEXT, created_at TEXT NOT NULL, data BLOB NOT NULL
    );
  `);
  // Snapshot of last persisted JSON per record, to only write changes.
  const snapshot = new Map(); // col -> Map(key -> json)

  function collections() {
    return sql.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('meta','files')`).all().map((r) => r.name);
  }
  function isEmpty() {
    return !sql.prepare(`SELECT 1 FROM meta WHERE key='school'`).get();
  }
  function load() {
    const db = {};
    for (const r of sql.prepare('SELECT key, data FROM meta').all()) db[r.key] = JSON.parse(r.data);
    for (const col of collections()) {
      const rows = sql.prepare(`SELECT id, data FROM "${col}" ORDER BY rowid`).all();
      db[col] = rows.map((r) => JSON.parse(r.data));
      snapshot.set(col, new Map(rows.map((r) => [r.id, r.data])));
    }
    return db;
  }
  function ensureTable(col) {
    sql.exec(`CREATE TABLE IF NOT EXISTS "${tableName(col)}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  }
  /** Persist all changed records. Runs in one transaction. */
  function persist(db) {
    sql.exec('BEGIN');
    try {
      for (const [col, value] of Object.entries(db)) {
        if (SINGLETONS.has(col) || !Array.isArray(value)) {
          sql.prepare('INSERT INTO meta(key, data) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run(col, JSON.stringify(value));
          continue;
        }
        const t = tableName(col);
        if (!snapshot.has(col)) { ensureTable(col); snapshot.set(col, new Map()); }
        const snap = snapshot.get(col);
        const seen = new Set();
        const upsert = sql.prepare(`INSERT INTO "${t}"(id, data) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`);
        for (const rec of value) {
          const k = keyOf(rec);
          seen.add(k);
          const json = JSON.stringify(rec);
          if (snap.get(k) !== json) { upsert.run(k, json); snap.set(k, json); }
        }
        const del = sql.prepare(`DELETE FROM "${t}" WHERE id = ?`);
        for (const k of [...snap.keys()]) if (!seen.has(k)) { del.run(k); snap.delete(k); }
      }
      sql.exec('COMMIT');
    } catch (e) {
      sql.exec('ROLLBACK');
      throw e;
    }
  }
  /** Drop all data and write a fresh dataset. */
  function reset(db) {
    for (const col of collections()) sql.exec(`DROP TABLE IF EXISTS "${col}"`);
    sql.exec('DELETE FROM meta; DELETE FROM files;');
    snapshot.clear();
    persist(db);
  }
  // ---- files ----
  function putFile({ id, name, mime, data, category, owner }) {
    sql.prepare('INSERT INTO files(id, name, mime, size, category, owner, created_at, data) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, name, mime, data.length, category || null, owner || null, new Date().toISOString(), data);
    return { id, name, mime, size: data.length };
  }
  function getFile(id) {
    return sql.prepare('SELECT id, name, mime, size, category, owner, created_at, data FROM files WHERE id = ?').get(id);
  }
  function fileMeta(id) {
    return sql.prepare('SELECT id, name, mime, size, category, owner, created_at FROM files WHERE id = ?').get(id);
  }
  return { sql, isEmpty, load, persist, reset, putFile, getFile, fileMeta };
}
