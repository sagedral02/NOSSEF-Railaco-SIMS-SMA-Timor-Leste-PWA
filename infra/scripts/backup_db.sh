#!/usr/bin/env bash
# Logical PostgreSQL backup + private-file archive (F14-03). Run daily from cron on the host:
#   0 2 * * * /opt/nossef/infra/scripts/backup_db.sh >> /var/log/nossef-backup.log 2>&1
# Keeps BACKUP_KEEP_DAYS (default 14). Copy the backups directory off-site (rclone/rsync) after it runs.
set -euo pipefail
cd "$(dirname "$0")/.."
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DIR=${BACKUP_DIR:-./backups}
KEEP=${BACKUP_KEEP_DAYS:-14}
mkdir -p "$DIR"
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$DIR/db-$STAMP.dump"
docker compose -f docker-compose.prod.yml exec -T api tar -C /data -czf - private > "$DIR/files-$STAMP.tgz"
sha256sum "$DIR/db-$STAMP.dump" "$DIR/files-$STAMP.tgz" > "$DIR/SHA256SUMS-$STAMP"
find "$DIR" -type f -mtime +"$KEEP" -delete
echo "backup ok $STAMP"
