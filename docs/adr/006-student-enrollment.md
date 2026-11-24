# ADR-006: Historical StudentEnrollment

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

A mutable `current_class` field loses history needed for transcripts, promotion and audits.

## Decision

Placement is recorded as `StudentEnrollment` rows per academic year; at most one ACTIVE enrollment per student per year (partial unique constraint).
