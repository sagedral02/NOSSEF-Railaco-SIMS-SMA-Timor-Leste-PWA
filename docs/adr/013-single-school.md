# ADR-013: No multi-school tenancy

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

The product serves one SMA (INV-01).

## Decision

No tenant column or switching. `SchoolProfile` is a singleton enforced by a database constraint.
