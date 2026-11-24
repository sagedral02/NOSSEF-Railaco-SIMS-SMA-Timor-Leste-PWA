# Backup & restore

- **What**: PostgreSQL logical dump (`pg_dump -Fc`) + private file store (`/data/private`) + checksums.
- **When**: daily 02:00 via cron (`infra/scripts/backup_db.sh`), kept `BACKUP_KEEP_DAYS` (14) locally; copy `infra/backups/` off-site daily.
- **RPO/RTO target**: 24 h / 2 h. For tighter RPO enable WAL archiving (PITR) on the database volume.

## Restore drill (quarterly, and before go-live)

1. `infra/scripts/restore_db.sh infra/backups/db-<stamp>.dump` → restores into `nossef_restore_drill` and runs `check_data_integrity`.
2. Record below: date, dump used, duration, integrity result, operator.

| Date | Dump | Duration | Integrity | Operator |
| --- | --- | --- | --- | --- |
| | | | | |

## Real recovery

1. Stop writers: `docker compose ... stop api worker beat web`.
2. Restore into the main database name (pass it as the second argument) and extract the matching `files-<stamp>.tgz` into the `privatefiles` volume.
3. `run --rm migrate`, start services, `go_live_check`, smoke test, announce.
