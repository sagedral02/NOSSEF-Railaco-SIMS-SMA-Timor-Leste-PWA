# ADR-020: Notifications, Web Push and exports

- Status: Accepted
- Date: 2026-10-16
- PRD: §30, §32.3, §33, F12–F13

## Decision

- Domain services emit in-process events after commit; `modules.communications.handlers` maps them to inbox notifications with deterministic `dedup_key`s. Each channel has its own `NotificationDelivery` row, so retries never send twice.
- Web Push uses VAPID (`pywebpush`); endpoints/keys are Fernet-encrypted at rest (`FIELD_ENCRYPTION_KEY`, derived from `SECRET_KEY` when unset). Payloads are generic `{title, body, url}`; details stay behind the authenticated deep link. Push and email are off by default (`ENABLE_WEB_PUSH`, `ENABLE_EMAIL`).
- Exports run as `ReportJob`s through the same scope selectors as the screens, are only downloadable by the requester, and expire after `REPORT_RETENTION_DAYS`.
- Dashboards are derived aggregates cached 60 s per user; they are never a source of truth.
