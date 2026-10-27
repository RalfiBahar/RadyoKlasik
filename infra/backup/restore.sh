#!/bin/sh
# Restore a Radyo Klasik backup (Phase 9). Run from infra/ on the server:
#
#   ./backup/restore.sh db    backups/db/radyoklasik-YYYYMMDD-HHMM.dump
#   ./backup/restore.sh media backups/media/media-YYYYMMDD-HHMM.tar.gz
#
# The API is stopped while restoring (so it doesn't write mid-restore) and
# started again afterwards. Playout keeps streaming throughout (AutoDJ falls
# back to the emergency playlist while the API is down).
set -eu
cd "$(dirname "$0")/.."

kind=${1:-}
file=${2:-}
[ -n "$kind" ] && [ -f "$file" ] || { echo "usage: $0 db|media <backup file>"; exit 1; }

compose="docker compose"
echo "Stopping api..."
$compose stop api

case "$kind" in
  db)
    echo "Restoring database from $file ..."
    $compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$file"
    ;;
  media)
    echo "Restoring media + recordings/chat/thumbnails from $file ..."
    # The api image mounts the media and app-data volumes read-write.
    $compose run --rm -T --no-deps -v "$(pwd)/$(dirname "$file"):/restore:ro" \
      --entrypoint tar api -C / -xzf "/restore/$(basename "$file")"
    ;;
  *)
    echo "unknown kind: $kind (db|media)"; exit 1 ;;
esac

echo "Starting api..."
$compose start api
echo "Restore complete."
