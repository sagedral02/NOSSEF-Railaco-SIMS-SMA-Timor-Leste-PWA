# Deployment runbook (staging / production)

Audience: the school's IT operator. Single Linux server (4 vCPU, 8 GB RAM, 100 GB SSD is ample for one school).

## First install

1. Install Docker Engine + Compose plugin. Point DNS `SITE_DOMAIN` to the server; open ports 80/443 only.
2. `git clone` the release tag to `/opt/nossef`, then `cp .env.production.example .env.production` and fill every value.
   Generate secrets with `python3 -c "import secrets;print(secrets.token_urlsafe(64))"`.
   Optional Web Push keys: `docker compose -f infra/docker-compose.prod.yml run --rm api python manage.py generate_vapid_keys`.
3. `docker compose -f infra/docker-compose.prod.yml --env-file .env.production up -d --build db redis`
4. `docker compose -f infra/docker-compose.prod.yml --env-file .env.production run --rm migrate`
5. Create the first administrator:
   `docker compose -f infra/docker-compose.prod.yml run --rm api python manage.py createsuperuser`
   then assign the `SUPER_ADMIN` role in **Sistem → Pengguna**.
6. `docker compose -f infra/docker-compose.prod.yml --env-file .env.production up -d` (api, worker, beat, web, proxy). Caddy obtains TLS automatically.
7. `docker compose -f infra/docker-compose.prod.yml run --rm api python manage.py go_live_check` — fix every FAIL.
8. Install the daily backup cron (`infra/scripts/backup_db.sh`) and run a restore drill (backup-restore.md).

## Upgrades

1. Read the release notes; take a backup (`infra/scripts/backup_db.sh`).
2. `git fetch --tags && git checkout <tag>`
3. `docker compose ... build && docker compose ... run --rm migrate && docker compose ... up -d`
4. Smoke test: login as admin, teacher, finance, guardian; open dashboard, attendance today, invoices.
5. Roll back = previous tag + restore only if a migration was destructive (migrations are reviewed to be additive).

## Health & monitoring

- `GET /api/v1/health/live` (process) and `/api/v1/health/ready` (DB + cache) — wire to uptime monitoring.
- Logs are JSON on stdout: `docker compose ... logs -f api worker`.
- Optional `SENTRY_DSN` for error alerts (PII scrubbing on).
- Queue depth: `docker compose ... exec redis redis-cli llen default` (repeat for reports/finance/imports/notifications).

## Security checklist

- `DEBUG=False`, unique `DJANGO_SECRET_KEY`, HSTS on after HTTPS is stable (`DJANGO_HSTS_SECONDS=31536000`).
- `python manage.py check --deploy` clean except HSTS preload (opt-in).
- Demo accounts never exist in production (`go_live_check` blocks on them). Never run `seed_demo_school` outside local.
