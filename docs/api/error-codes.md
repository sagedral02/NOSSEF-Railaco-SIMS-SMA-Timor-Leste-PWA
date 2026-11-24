# API error codes

Envelope (PRD §46.3):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": {"field": ["..."]}, "request_id": "uuid", "details": {} },
  "meta": { "request_id": "uuid" } }
```

The canonical catalog is PRD §48 (implemented in `apps/api/common/api/exceptions.py::ErrorCode`).
The following transport-level codes are added because §48 has no code for these HTTP situations:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `AUTH_NOT_AUTHENTICATED` | 401 | No valid session |
| `AUTH_RESET_TOKEN_INVALID` | 400 | Password-reset link invalid, used or expired |
| `INVALID_STATE_TRANSITION` | 409 | Workflow transition not allowed from the current state (PRD §66) |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Retryable command sent without `Idempotency-Key` |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key reused with a different payload (non-payment commands) |
| `METHOD_NOT_ALLOWED` | 405 | HTTP method not supported by the endpoint |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Body content type not accepted |
| `INTERNAL_ERROR` | 500 | Unexpected server error (logged with `request_id`) |

Objects outside the actor's scope are answered as `404 RESOURCE_NOT_FOUND` so their existence is not leaked
(PRD §46.4: "Not found/inaccessible according to object policy").

## Domain extensions (F9–F13)

| Code | HTTP | Meaning |
| --- | --- | --- |
| `PAYMENT_OVERALLOCATION` | 409 | Allocation exceeds the invoice's outstanding balance (no credit wallet) |
| `PAYMENT_IDEMPOTENCY_CONFLICT` | 409 | Idempotency-Key reused for a different payment |
| `PAYMENT_ALREADY_REVERSED` | 409 | Reversal attempted twice |
| `INVOICE_VOID_NOT_ALLOWED` | 409 | Invoice has verified allocations (reverse payment first) |
| `COUNSELING_CASE_CLOSED` | 409 | Closed case must be reopened (`counseling.reopen` + reason) before changes |
| `EXTRACURRICULAR_CAPACITY_FULL` | 409 | Activity full and waitlist not allowed |
| `LIBRARY_COPY_UNAVAILABLE` | 409 | Copy is not AVAILABLE (on loan, withdrawn, lost…) |
| `LIBRARY_LOAN_ALREADY_CLOSED` | 409 | Loan already returned/lost (double return rejected) |
| `LIBRARY_BORROWER_INACTIVE` | 409 | Borrower is not an active student/teacher |
| `LIBRARY_RENEWAL_LIMIT` | 409 | Maximum renewals reached |
| `ASSET_NOT_AVAILABLE` | 409 | Asset already assigned / retired / lost |
| `FEATURE_DISABLED` | 409 | Optional feature (e.g. Web Push) is switched off |
| `IMPORT_TEMPLATE_INVALID` / `IMPORT_HAS_ERRORS` / `IMPORT_ALREADY_CONFIRMED` | 409 | Import pipeline gates |

Import row errors use stable codes `IMPORT_REQUIRED`, `IMPORT_INVALID_DATE`, `IMPORT_INVALID_CHOICE`, `IMPORT_INVALID_NUMBER`,
`IMPORT_DUPLICATE_IN_FILE`, `IMPORT_DUPLICATE_SUSPECTED`, `IMPORT_UNKNOWN_CLASSROOM`, `IMPORT_UNKNOWN_ROOM`.
