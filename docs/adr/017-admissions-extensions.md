# ADR-017: Admissions model extensions

- Status: Accepted
- Date: 2026-10-16
- PRD: §15.17–§15.21, §19, F5

## Context

The PRD admission models do not say how applicants come back to a public status page without an account, which documents a period requires, or how guardians/students upload bank proofs during re-registration.

## Decision

- `AdmissionPeriod.required_documents` (Postgres array) lists document types the wizard must collect.
- `Applicant.access_token_hash` stores a SHA-256 of a random token handed out once at submission; status lookups use registration number + birth date (+ token on the same device). Registration numbers are random (`PPDB-YYYY-XXXXXX`) so they cannot be enumerated.
- Public endpoints live under `/admissions/public/*`, are throttled (`THROTTLE_PUBLIC_FORM`) and never return other applicants' data.

## Consequences

Recovering a lost registration number requires name + birth date + guardian phone, rate limited.
