# Architecture Decision Records

PRD §76 requires these ADRs. ADR-001 to ADR-014 record decisions that are already final in `prd.md`;
they explain the "why" for maintainers. ADR-015 onward record implementation-detail decisions taken while building.

| ADR | Decision | Status |
| --- | --- | --- |
| [001](001-modular-monolith.md) | Modular monolith instead of microservices | Accepted |
| [002](002-django-drf.md) | Django/DRF backend | Accepted |
| [003](003-postgresql.md) | PostgreSQL source of truth | Accepted |
| [004](004-session-csrf.md) | Session/CSRF browser authentication | Accepted |
| [005](005-trimester-cau.md) | Three-trimestre + CAU model | Accepted |
| [006](006-student-enrollment.md) | Historical StudentEnrollment | Accepted |
| [007](007-major-ipa-ips.md) | IPA/IPS Major model | Accepted |
| [008](008-offline-attendance.md) | Offline attendance mutation queue | Accepted |
| [009](009-finance-model.md) | Finance invoice/allocation/reversal model | Accepted |
| [010](010-private-storage.md) | Private object storage | Accepted |
| [011](011-celery.md) | Celery async job model | Accepted |
| [012](012-report-snapshot.md) | Report snapshot/revision model | Accepted |
| [013](013-single-school.md) | No multi-school tenancy | Accepted |
| [014](014-scope-exclusions.md) | No full LMS/payroll/general-ledger in scope | Accepted |
| [015](015-migration-from-legacy.md) | Rebuild from the Express/SQLite prototype | Accepted |
| [016](016-local-dev-profile.md) | Local laptop profile: portable PostgreSQL, sync tasks, Edge for E2E | Accepted |
| [017](017-admissions-extensions.md) | Admissions token, required documents, public endpoints | Accepted |
| [018](018-grading-scheme-fields.md) | Configurable grading scheme fields (NOSSEF 0–10, CAU) | Accepted |
| [019](019-finance-extensions.md) | Finance REJECTED status, allocation suggestion, exact reversal | Accepted |
| [020](020-notifications-and-push.md) | Notifications, encrypted Web Push, scoped exports | Accepted |
