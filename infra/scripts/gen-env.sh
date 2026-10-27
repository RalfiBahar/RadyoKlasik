#!/bin/sh
# Create infra/.env for a new server from .env.example, replacing every
# "change-me-*" placeholder with a strong random secret (Phase 9).
#
#   ./scripts/gen-env.sh            # writes .env (refuses to overwrite)
#   STREAM_DOMAIN=... API_DOMAIN=... ./scripts/gen-env.sh
#
# Review the result, then set ADMIN_USERNAME, CADDY_EMAIL, ALERT_WEBHOOK_URL
# and BACKUP_RCLONE_REMOTE by hand.
set -eu
cd "$(dirname "$0")/.."
[ -e .env ] && { echo ".env already exists — move it away first."; exit 1; }

rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "${1:-32}"; }

pg=$(rand 32)
awk -v pg="$pg" -v seed="$(rand 8)" '
  BEGIN { srand(); }
  /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" pg; next }
  /^DATABASE_URL=/      { sub(/change-me-postgres/, pg); print; next }
  /=change-me/          { split($0, kv, "="); cmd = "head -c 48 /dev/urandom | base64 | tr -dc A-Za-z0-9 | head -c 32"; cmd | getline s; close(cmd); print kv[1] "=" s; next }
  /^SEED_ON_START=/     { print "SEED_ON_START=false"; next }
  /^ICECAST_HOSTNAME=/  { print "ICECAST_HOSTNAME=" (ENVIRON["STREAM_DOMAIN"] ? ENVIRON["STREAM_DOMAIN"] : "stream.radyoklasik.online"); next }
  /^STREAM_DOMAIN=/ && ENVIRON["STREAM_DOMAIN"] { print "STREAM_DOMAIN=" ENVIRON["STREAM_DOMAIN"]; next }
  /^API_DOMAIN=/ && ENVIRON["API_DOMAIN"]       { print "API_DOMAIN=" ENVIRON["API_DOMAIN"]; next }
  { print }
' .env.example > .env

chmod 600 .env
echo "Wrote infra/.env with fresh secrets (mode 600)."
echo "Admin login for the studio: ADMIN_USERNAME / ADMIN_PASSWORD in .env"
