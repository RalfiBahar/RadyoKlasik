#!/bin/sh
# Reverse sync: copy what happened on the new server back to the legacy
# droplet, so rolling back to it loses nothing (infra/DEPLOY_PLAN.md rule 4).
# Needed from deploy stage 3 (api. moved) until legacy is retired.
#
# Run on the NEW server from infra/:   ./scripts/sync-legacy.sh [--dry-run]
# Nightly (crontab -e on the new server):
#   30 3 * * * cd /opt/radyoklasik/infra && ./scripts/sync-legacy.sh >> /var/log/radyo-legacy-sync.log 2>&1
#
# Needs: this server's SSH key in the legacy droplet's ~/.ssh/authorized_keys.
# Settings (infra/.env or environment):
#   LEGACY_SSH=root@161.35.28.160
#   LEGACY_DIR=/root/RadyoKlasik/RadyoKlasikServer
#   LEGACY_BUNDLE=/root/rk-sync         where the bundle lands on legacy
#   LEGACY_MIN_FREE_GB=2                never fill legacy's disk past this
#   LEGACY_SYNC_SINCE=2026-11-01        only copy recordings made since (the
#                                       api. switch); default: last 60 days
#
# --dry-run still builds and uploads the bundle but changes nothing in the
# legacy database/folders; it prints what would change.
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  vars=$(grep -E '^LEGACY_[A-Z_]+=' .env | xargs || true)
  # shellcheck disable=SC2086
  [ -n "$vars" ] && export $vars
fi
LEGACY_SSH=${LEGACY_SSH:-root@161.35.28.160}
LEGACY_DIR=${LEGACY_DIR:-/root/RadyoKlasik/RadyoKlasikServer}
LEGACY_BUNDLE=${LEGACY_BUNDLE:-/root/rk-sync}
MIN_FREE_GB=${LEGACY_MIN_FREE_GB:-2}
DRY=""
[ "${1:-}" = "--dry-run" ] && DRY="--dry-run"

STAGE="$PWD/legacy-sync"
compose="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
ssh_legacy() { ssh -o BatchMode=yes -o ConnectTimeout=20 "$LEGACY_SSH" "$@"; }
log() { echo "[legacy-sync] $(date -u +%FT%TZ) $*"; }

mkdir -p "$STAGE"
log "start ${DRY:-(apply)} -> $LEGACY_SSH"

# 1. What legacy already has, and how much room it has.
ssh_legacy "ls -1 '$LEGACY_DIR/recordings'" > "$STAGE/legacy-has.txt"
free_kb=$(ssh_legacy "df -Pk '$LEGACY_DIR' | awk 'NR==2 {print \$4}'")
# Files still sitting in an old bundle on legacy will be replaced: count them as free.
old_kb=$(ssh_legacy "du -sk '$LEGACY_BUNDLE/recordings' 2>/dev/null | cut -f1" || echo 0)
max_gb=$(awk -v f="$free_kb" -v o="${old_kb:-0}" -v m="$MIN_FREE_GB" \
  'BEGIN { g = (f + o) / 1048576 - m; if (g < 0) g = 0; printf "%.2f", g }')
log "legacy free: $((free_kb / 1048576)) GB; room for new recordings: $max_gb GB"

# 2. Build the bundle from the new server's data.
$compose run --rm -T -v "$STAGE:/legacy-sync" api \
  node scripts/exportToLegacy.js /legacy-sync/bundle \
  --skip-list /legacy-sync/legacy-has.txt --max-gb "$max_gb"

# 3. Ship it and apply it with legacy's own Node + sqlite3.
rsync -a --delete -e "ssh -o BatchMode=yes" "$STAGE/bundle/" "$LEGACY_SSH:$LEGACY_BUNDLE/"
ssh_legacy "cd '$LEGACY_DIR' && node '$LEGACY_BUNDLE/apply.js' '$LEGACY_BUNDLE' '$LEGACY_DIR' $DRY"
log "done"
