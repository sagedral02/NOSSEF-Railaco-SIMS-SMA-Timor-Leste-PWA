#!/usr/bin/env bash
# Restore drill / disaster recovery (F14-14). Restores into a SEPARATE database by default so drills never touch prod:
#   infra/scripts/restore_db.sh backups/db-20261016T020000Z.dump [target_db]
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP=${1:?usage: restore_db.sh <dump> [target_db]}
TARGET=${2:-nossef_restore_drill}
sha256sum -c "$(dirname "$DUMP")"/SHA256SUMS-"$(basename "$DUMP" .dump | sed 's/^db-//')" --ignore-missing
docker compose -f docker-compose.prod.yml exec -T db sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists $TARGET && createdb -U \"\$POSTGRES_USER\" $TARGET"
docker compose -f docker-compose.prod.yml exec -T db sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $TARGET --no-owner" < "$DUMP"
docker compose -f docker-compose.prod.yml run --rm -e DATABASE_URL="postgres://\$POSTGRES_USER:\$POSTGRES_PASSWORD@db:5432/$TARGET" api python manage.py check_data_integrity
echo "restore drill ok into $TARGET — record the date/duration in docs/runbooks/backup-restore.md"
