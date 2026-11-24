# Audit events

All PRD §14 events are defined in `apps/api/modules/audit/events.py`. Account-lifecycle detail added for §13.2:

| Event | When |
| --- | --- |
| `USER_UPDATED` | Profile fields of an account changed (diff stored in before/after) |
| `USER_ACTIVATED` | Account moved to ACTIVE |
| `USER_SUSPENDED` | Account moved to SUSPENDED (sessions revoked, roles kept) |
| `PASSWORD_CHANGED` | User changed own password (other sessions revoked) |

`USER_DISABLED` also revokes every session and every role link (one `ROLE_REMOVED` row per role).
Snapshots never contain passwords, tokens, session/CSRF values or counseling narrative (keys are redacted).

## Domain events added in F9–F13

| Event | Written when |
| --- | --- |
| `INVOICE_GENERATED` / `INVOICE_VOIDED` | SPP batch or manual invoice; void with reason |
| `PAYMENT_CREATED` / `PAYMENT_VERIFIED` / `PAYMENT_REJECTED` / `PAYMENT_REVERSED` | Payment lifecycle (reason recorded for reject/reverse) |
| `RECEIPT_GENERATED` / `DISCOUNT_CHANGED` | Receipt snapshot; discount approval |
| `COUNSELING_CASE_ACCESSED` / `COUNSELING_CASE_UPDATED` | Every detail read of a case; open/edit/status/follow-up (narrative never stored in the log) |
| `DISCIPLINE_INCIDENT_RECORDED` / `DISCIPLINE_INCIDENT_VOIDED` / `GUARDIAN_NOTICE_SENT` | Incident lifecycle and guardian communication |
| `EXTRACURRICULAR_MEMBERSHIP_CHANGED` | Join/waitlist/withdraw/complete |
| `LIBRARY_LOAN_CHANGED` / `LIBRARY_COPY_CHANGED` | Checkout/return/renew/lost; copy status |
| `ASSET_CHANGED` / `ASSET_ASSIGNED` | Maintenance, transfer, retire/restore, import; assign/return |
| `ANNOUNCEMENT_PUBLISHED` / `ANNOUNCEMENT_ARCHIVED` | Announcement lifecycle |
| `IMPORT_CONFIRMED` / `EXPORT_GENERATED` | Import confirm; export containing personal data |
