# ADR-018: Configurable grading scheme fields

- Status: Accepted
- Date: 2026-10-16
- PRD: §15.39–§15.47, §22, F7

## Context

NOSSEF grades on a 0–10 scale with pass > 5 and a CAU component per trimester, while the PRD requires the weighting to be configuration, not code.

## Decision

`GradingScheme` adds `scale_max`, `precision`, `aggregation` (MEAN/SUM/BEST), `absent_policy` (ZERO/EXCLUDE), `remedial_policy` (MAX/REPLACE/CAP_AT_PASS) and `passing_inclusive`. The default NOSSEF template is TPC 20 % · Teste 1 25 % · Teste 2 25 % · CAU *n* 30 % on scale 10, pass `> 5`. The calculator uses `Decimal` throughout and quantizes once (ROUND_HALF_UP) at the end.

## Consequences

Another weighting (e.g. 0–100, pass ≥ 60) is a data change via `/grading-schemes/generate/` or the scheme editor; no deployment needed.
