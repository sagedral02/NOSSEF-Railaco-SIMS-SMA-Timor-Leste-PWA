# Incident response

| Severity | Examples | First response |
| --- | --- | --- |
| P1 | Site down, data exposed to wrong user, payment/grade corruption | Within 1 h: contain (disable feature flag / block route at proxy), notify principal |
| P2 | One module failing, queue stuck, push/email failing | Same day |
| P3 | Cosmetic / single user issue | Next release |

1. **Contain** — feature flags in `.env.production` (`ENABLE_*`) + restart; or stop `worker` if a job misbehaves.
2. **Diagnose** — `logs -f api worker`, Sentry, `/admin/audit` (filter by actor/resource/request id shown in error banners).
3. **Fix** — through the normal release pipeline (branch → CI → tag). No hot edits in containers.
4. **Data correction** — only through domain actions that audit (reopen/void/reverse/correct). Never edit rows by SQL.
5. **Post-mortem** within 5 working days; add a test that reproduces it.

Contacts / owners: fill in during F15 hand-over (IT operator, principal, finance lead, curriculum lead).
