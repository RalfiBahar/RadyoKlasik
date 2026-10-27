#!/bin/sh
# Deploy / update the stack on the VPS (Phase 9). Run from anywhere:
#
#   ./infra/scripts/deploy.sh            # pull, rebuild, restart, health-check
#   ./infra/scripts/deploy.sh --no-pull  # redeploy the current checkout
#
# Liquidsoap is only restarted when its script changed (a restart is a brief
# stream interruption); Icecast keeps listeners connected otherwise.
set -eu
cd "$(dirname "$0")/.."
compose="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

before=$(git rev-parse HEAD)
if [ "${1:-}" != "--no-pull" ]; then
  git pull --ff-only
fi
after=$(git rev-parse HEAD)

echo "==> Taking a database backup before deploying"
$compose run --rm backup /backup/backup.sh once >/dev/null && echo "    backup ok" || echo "    WARNING: pre-deploy backup failed"

echo "==> Building and starting"
$compose up -d --build --remove-orphans

if [ "$before" != "$after" ] && git diff --name-only "$before" "$after" | grep -q '^infra/liquidsoap/'; then
  echo "==> radio.liq changed: restarting Liquidsoap"
  $compose restart liquidsoap
fi

echo "==> Waiting for the API to report healthy"
for i in $(seq 1 30); do
  if $compose exec -T api curl -fsS localhost:8001/api/v1/health >/dev/null 2>&1; then
    echo "    API healthy"
    $compose ps
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 4
done
echo "API did not become healthy — check: $compose logs --tail 100 api"
exit 1
