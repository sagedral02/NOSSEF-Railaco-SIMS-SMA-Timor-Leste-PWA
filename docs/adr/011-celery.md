# ADR-011: Celery async job model

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

PDF/XLSX reports, imports, notifications and SPP generation are slow or retryable.

## Decision

Celery 5.6 with Redis broker and the queues in PRD §37.1. Tasks receive IDs, are idempotent and enqueued with `transaction.on_commit`. Locally `DEV_SYNC_TASKS=true` runs them inline (never in production).
