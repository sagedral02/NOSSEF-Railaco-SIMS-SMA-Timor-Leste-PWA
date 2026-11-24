# ADR-009: Finance invoice/allocation/reversal model

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

Partial payments, scholarships and corrections must remain auditable.

## Decision

Invoice + InvoiceItem, Payment + PaymentAllocation, Receipt and PaymentReversal. Verified payments are never deleted; corrections are reversals. Money is Decimal end-to-end and JSON strings on the wire.
