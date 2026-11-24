# ADR-016: Local laptop profile

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

School laptops may lack admin rights, Docker or fast internet.

## Decision

Local development uses PostgreSQL 17 (installer or portable binaries), `DEV_SYNC_TASKS=true` instead of Redis/Celery, the filesystem storage backend, and Playwright with an installed Edge/Chrome channel instead of downloading browsers. `setup.sh` automates this.
