#!/bin/sh
# Radyo Klasik backups (Phase 9). Runs inside the `backup` compose service
# (postgres:16-alpine, so pg_dump matches the server version).
#
#   Database: pg_dump custom format, every day at BACKUP_HOUR (station-agnostic
#             UTC hour), kept BACKUP_KEEP_DAYS days.
#   Media:    tar.gz of the media volume (uploaded tracks + artwork) and the
#             app-data volume (recordings, thumbnails, chat, announcement) on
#             BACKUP_MEDIA_WEEKDAY (1 = Monday), kept BACKUP_KEEP_MEDIA copies.
#             Recordings already verified in Cloudflare R2 are left out (R2
#             is their copy); local-only and pending ones are included.
#   Offsite:  if BACKUP_RCLONE_REMOTE is set (e.g. "b2:radyoklasik-backups"),
#             new files are copied there with rclone (config in /config/rclone).
#
# `backup.sh once` runs a full backup (DB + media) immediately and exits.
set -eu

OUT=${BACKUP_DIR:-/backups}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
KEEP_MEDIA=${BACKUP_KEEP_MEDIA:-4}
HOUR=${BACKUP_HOUR:-3}
MEDIA_WEEKDAY=${BACKUP_MEDIA_WEEKDAY:-1}
MEDIA_SRC=${BACKUP_MEDIA_SRC:-/var/media}
APPDATA_SRC=${BACKUP_APPDATA_SRC:-/var/radyo-data}
REMOTE=${BACKUP_RCLONE_REMOTE:-}

mkdir -p "$OUT/db" "$OUT/media"

log() { echo "[backup] $(date -u +%FT%TZ) $*"; }

offsite() {
  [ -n "$REMOTE" ] || return 0
  command -v rclone >/dev/null 2>&1 || apk add --no-cache rclone >/dev/null
  rclone --config /config/rclone/rclone.conf copy "$1" "$REMOTE/$(basename "$(dirname "$1")")/" \
    && log "offsite copy ok: $1" || log "WARNING offsite copy failed: $1"
}

backup_db() {
  f="$OUT/db/radyoklasik-$(date -u +%Y%m%d-%H%M).dump"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "${POSTGRES_HOST:-postgres}" -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" -Fc -f "$f.part"
  mv "$f.part" "$f"
  log "database -> $f ($(du -h "$f" | cut -f1))"
  find "$OUT/db" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
  offsite "$f"
}

backup_media() {
  f="$OUT/media/media-$(date -u +%Y%m%d-%H%M).tar.gz"
  # Absolute-path layout (var/media/..., var/radyo-data/...) so restore.sh can
  # unpack it straight back into the mounted volumes with `tar -C /`.
  set -- "${MEDIA_SRC#/}"
  [ -d "$APPDATA_SRC" ] && set -- "$@" "${APPDATA_SRC#/}"
  # Leave out recordings whose verified copy is in R2.
  exclude="$OUT/media/.exclude"
  : > "$exclude"
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "${POSTGRES_HOST:-postgres}" -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" -Atc "SELECT filename FROM \"Recordings\" WHERE storage = 'r2'" 2>/dev/null \
    | sed "s#^#${APPDATA_SRC#/}/recordings/#" > "$exclude" || true
  [ -s "$exclude" ] && log "skipping $(wc -l < "$exclude") recording(s) stored in R2"
  tar -C / -X "$exclude" -czf "$f.part" "$@"
  rm -f "$exclude"
  mv "$f.part" "$f"
  log "media -> $f ($(du -h "$f" | cut -f1))"
  # Keep the newest KEEP_MEDIA archives.
  ls -1t "$OUT"/media/media-*.tar.gz 2>/dev/null | tail -n +"$((KEEP_MEDIA + 1))" | xargs -r rm -f
  offsite "$f"
}

if [ "${1:-}" = "once" ]; then
  backup_db
  backup_media
  exit 0
fi

log "scheduler started: DB daily at ${HOUR}:00 UTC, media weekday ${MEDIA_WEEKDAY}, offsite=${REMOTE:-off}"
last=""
while true; do
  today=$(date -u +%F)
  if [ "$(date -u +%H)" -eq "$HOUR" ] && [ "$last" != "$today" ]; then
    backup_db || log "ERROR database backup failed"
    if [ "$(date -u +%u)" -eq "$MEDIA_WEEKDAY" ]; then
      backup_media || log "ERROR media backup failed"
    fi
    last=$today
  fi
  sleep 300
done
