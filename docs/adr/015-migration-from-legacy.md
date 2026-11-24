# ADR-015: Rebuild from the Express/SQLite prototype

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

The first implementation (React/Vite + Express + SQLite JSON tables, now in `legacy/`) followed an earlier specification and deviates from `prd.md` in stack and business rules (0–10 fixed-weight grading, CT/CSH codes, finance-only payment entry).

## Decision

The system is rebuilt phase by phase (F0–F15) on the PRD stack. The visual design (tokens, components, layout) is ported unchanged. Business rules follow `prd.md`: grading is a configurable weighted scheme with CAU 1–3; majors are IPA/IPS with local display names; guardians/students may upload bank proof that stays PENDING until Finance verifies. `legacy/` is reference only and is deleted after F15.
