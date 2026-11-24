# SIMS SMA Timor-Leste — NOSSEF Railaco

School Information Management System for Escola Secundária Católica Nossa Senhora de Fátima (NOSSEF) Railaco.
**Source of truth: [`prd.md`](prd.md).** Visual design: [`ui.md`](ui.md). Decisions: [`docs/adr/`](docs/adr/README.md).
Operations: [`docs/runbooks/`](docs/runbooks/).

## Stack (PRD §8)

| Part | Technology |
| --- | --- |
| Web / PWA | Next.js 16.2 (App Router, TypeScript), Tailwind v4, TanStack Query, IndexedDB offline queue — `apps/web` |
| API | Python 3.12, Django 5.2 LTS, Django REST Framework, drf-spectacular — `apps/api` |
| Database | PostgreSQL 17 |
| Background jobs | Celery 5.6 + Redis 7 (locally optional: `DEV_SYNC_TASKS=true` runs tasks inline) |
| API contract | OpenAPI → TypeScript types — `packages/api-contracts` |
| Production | Docker Compose + Caddy (TLS) — `infra/` |

The previous Express/SQLite prototype is kept read-only in `legacy/` as a design reference (ADR-015).

## Quick start on a new laptop

From the project root (Git Bash on Windows, terminal on Linux/macOS):

```bash
bash setup.sh            # installs Node 22, pnpm, Python 3.12, PostgreSQL 17 if missing; migrates, seeds, builds, starts
bash setup.sh --start    # next time: just start everything
```

Open **http://localhost:3000**. All demo data is synthetic and local only; password for every account: `nossef2026`.

| Account | Role | Try |
| --- | --- | --- |
| `admin` | Super admin | Everything, audit log, imports, announcements |
| `sekretaria` | School admin (TU) | Students, enrollment, PPDB, announcements, imports |
| `cristina.amaral` | Principal | Dashboard KPIs, report publishing, promotion, finance overview |
| `maria.martins` | Curriculum | Years/trimestres, schedules, grading schemes, completion, report cards |
| `antonio.soares` | Homeroom teacher | Daily attendance, gradebook, class report cards |
| `agostinho.freitas` | Teacher | Lesson attendance (works offline), gradebook, Excel score import |
| `finansas` | Finance | SPP invoices, cash desk + receipts, bank-proof verification, arrears |
| `admisaun` | Admission officer | Applicant queue, verification, decisions |
| `konselora` | Counselor (BK) | Confidential cases, discipline, guardian notices |
| `biblioteka` | Librarian | Circulation desk, catalog, overdue loans |
| `patrimoniu` | Asset officer | Asset register, assignment, maintenance |
| `estudante` | Student | Dashboard, report cards, attendance, bills, loans |
| `inan-aman` | Guardian (2 children) | Child switcher, report cards, bills + transfer-proof upload, notices |

Public pages without login: `/admissions` (online registration), `/admissions/status`, `/verify/report/<token>` (QR on report-card PDFs).

Other options: `--dev` (hot reload), `--no-start`, `--no-demo`, `--reset-db`. See `bash setup.sh --help`.

## Modules (PRD roadmap F0–F15)

| Phase | Scope | Status |
| --- | --- | --- |
| F0–F1 | Foundation, identity, RBAC + object scope, school profile, audit | Done |
| F2–F3 | Academic years/trimestres (CAU 1–3), subjects, rombels, assignments, students, guardians, enrollment, transfers | Done |
| F4–F5 | Student 360, PPDB online admissions (public wizard → decision → enrollment) | Done |
| F6 | Schedules with collision engine, attendance (daily + lesson, offline PWA queue, corrections, leave) | Done |
| F7–F8 | Grading schemes, gradebook, Excel score import, term grades, report cards (PDF + QR), transcript, promotion, national exam XII | Done |
| F9 | Finance: fee plans, discounts/scholarships, SPP generation, cash/bank payments, receipts, reversal, arrears | Done |
| F10 | BK counseling (restricted + audited), discipline, extracurricular | Done |
| F11 | Library circulation, assets | Done |
| F12 | Announcements, notification inbox, encrypted Web Push, student/guardian portal | Done |
| F13 | Imports (students, teachers, subjects, library, assets, scores), 27 canonical reports (CSV/XLSX/PDF), role dashboards | Done |
| F14 | Production settings, Docker/Caddy, backups + restore drill, k6, permission matrix, `check --deploy` | Done (run drills on the server) |
| F15 | `go_live_check`, go-live checklist and runbooks | Ready — school executes the checklist |

## Manual commands (PRD §52.3)

```bash
# API
cd apps/api
python -m venv .venv && .venv/Scripts/pip install -r requirements/dev.txt   # bin/pip on Linux/macOS
python manage.py migrate
python manage.py seed_reference_data
python manage.py seed_demo_school          # synthetic demo (local only)
python manage.py runserver                 # http://127.0.0.1:8000/api/v1/  (docs: /api/v1/docs/ in DEBUG)

# Web
pnpm install
pnpm dev:web                               # http://localhost:3000 (proxies /api to Django)

# Quality gates
cd apps/api && pytest && ruff check .
pnpm lint && pnpm typecheck && pnpm test
cd apps/web && pnpm exec playwright test   # E2E (uses installed Edge on Windows)
pnpm api:schema                            # regenerate OpenAPI + TS types after API changes
```

Operational commands: `check_data_integrity` (INT-001…025), `go_live_check [--strict]`, `cleanup_generated_files`,
`generate_vapid_keys`. Production deployment: [`docs/runbooks/deployment.md`](docs/runbooks/deployment.md).
