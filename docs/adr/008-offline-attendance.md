# ADR-008: Offline attendance mutation queue

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

Teachers record attendance on unstable connections.

## Decision

The PWA stores explicit mutations in IndexedDB with a client `mutation_id`; the server records `OfflineMutationReceipt` so replays are idempotent and version conflicts return 409.
