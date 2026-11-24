# ADR-010: Private object storage

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

Student documents, bank proofs and generated reports are personal data.

## Decision

Files are stored behind a storage abstraction (filesystem locally, S3-compatible private bucket in production); the database stores metadata/object keys. Downloads go through authorized endpoints only (INV-16).
