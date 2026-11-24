# ADR-012: Report snapshot/revision model

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

A published report card must not change when source scores change later.

## Decision

Publishing stores an immutable snapshot with a revision number; changes require reopen (permission + reason + audit) and produce a new revision (INV-11).
