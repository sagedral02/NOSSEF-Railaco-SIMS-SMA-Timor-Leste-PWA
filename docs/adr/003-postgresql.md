# ADR-003: PostgreSQL source of truth

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

Academic and financial history must be consistent under concurrency; PostgreSQL provides constraints, partial unique indexes, row locks and JSONB for snapshots.

## Decision

All canonical data lives in PostgreSQL 17. IndexedDB (offline) and Redis are caches/queues only (INV-13, INV-19). The previous SQLite prototype is not migrated as-is (see ADR-015).
