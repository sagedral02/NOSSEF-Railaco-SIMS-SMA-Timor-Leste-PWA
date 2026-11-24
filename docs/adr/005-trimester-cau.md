# ADR-005: Three-trimestre + CAU model

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

The school calendar has exactly three trimestres and one CAU per trimestre.

## Decision

AcademicYear has Trimestre 1/2/3 only; `cau_number` must equal the trimestre number (DB constraint + service check). Dates are configuration, never hard-coded.
