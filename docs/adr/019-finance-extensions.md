# ADR-019: Finance workflow extensions

- Status: Accepted
- Date: 2026-10-16
- PRD: §15.48–§15.58, §25, §66, F9

## Decision

- `Payment.status` includes `REJECTED` (PRD §66 lifecycle) with `rejection_reason`; bank-transfer submissions keep `intended_invoices` so Finance gets an oldest-due-first allocation suggestion.
- Balances are always recomputed from VERIFIED allocations under row locks in deterministic order; a reversal keeps allocations as history and simply stops counting them, so the previous balance is restored exactly.
- Invoice generation is idempotent through `generation_key = SPP:{year}:{student}:{YYYY-MM}`; eligibility is "enrolled at any time during the billing month".
- Receipts are immutable JSON snapshots; the PDF is rendered after commit.
- No student credit wallet: over-allocation is rejected (`PAYMENT_OVERALLOCATION`).
