# Radyo Klasik — operations runbook

Everything runs on one Linux VPS with Docker Compose: Icecast, Liquidsoap,
the Node API, PostgreSQL, the DJ studio, Caddy (HTTPS) and a backup job.
The public listener website stays on Vercel.

```
listeners ──HTTPS──> stream.<domain> ──> Icecast (/stream, /stream-hd, /stream-low)
                                    └──> /hls/* (files written by Liquidsoap)
admins/DJs ──HTTPS──> api.<domain>/panel ──> panel (Next.js)
website/app ──HTTPS──> api.<domain>/...  ──> API ──> Postgres, Liquidsoap
```

Everything admin is on **`https://api.<domain>`**:
- `/panel` — the panel (studio, library, playlists, schedule, DJs, recordings,
  listener chat, announcements & push, analytics). `/` redirects here.
- `/auth/login` → `/dashboard` — the old EJS admin dashboard, kept as-is.
- Everything else — the API the website and mobile app use.

## 1. First-time server setup

Sizing: 2 vCPU / 4 GB RAM is plenty for the software (900 simultaneous
listeners used ~7% CPU in Icecast). **Bandwidth is the real limit**: each MP3
listener uses 128 kbps, so 500 listeners ≈ 64 Mbps sustained (~20 TB/month
at that level around the clock). Pick a VPS with unmetered or generous
traffic, or put a CDN in front of `/hls` (see §3).

1. Ubuntu 24.04, then install Docker Engine + the compose plugin
   (https://docs.docker.com/engine/install/ubuntu/).
2. Firewall: allow `22`, `80`, `443`, and `8005` (only if DJs will stream
   from external encoders such as BUTT/Mixxx):
   `ufw allow 22,80,443,8005/tcp && ufw enable`
3. DNS: point A records for `stream.` and `api.` at the server.
4. Clone and configure:
   ```sh
   git clone https://github.com/RalfiBahar/RadyoKlasik.git && cd RadyoKlasik/infra
   STREAM_DOMAIN=stream.radyoklasik.online API_DOMAIN=api.radyoklasik.online \
   ./scripts/gen-env.sh
   ```
   Then edit `.env`: `ADMIN_USERNAME`, `CADDY_EMAIL`, `ALERT_WEBHOOK_URL`,
   `BACKUP_RCLONE_REMOTE` (see §5).
5. Start: `./scripts/deploy.sh --no-pull`. Caddy fetches certificates on the
   first request to each domain.
6. Sign in at `https://api.<domain>/panel` with `ADMIN_USERNAME`/`ADMIN_PASSWORD`,
   create DJ accounts (DJ Management), upload the library, build playlists and
   the schedule.

## 2. Deploying updates

```sh
cd RadyoKlasik/infra && ./scripts/deploy.sh
```

It pulls, takes a backup, rebuilds and restarts changed containers, restarts
Liquidsoap only if `radio.liq` changed (a few seconds of interruption), and
waits for the API health check. CI (`.github/workflows/ci.yml`) runs the
backend + studio tests, the studio build, a Liquidsoap type-check and compose
validation on every push — deploy only green commits.

## 3. Streams

| URL | Format | Use |
|---|---|---|
| `https://stream.<domain>/stream` | MP3 128k | default (web, mobile, any player) |
| `https://stream.<domain>/stream-hd` | AAC-LC 192k | high quality |
| `https://stream.<domain>/stream-low` | HE-AAC 64k | mobile data |
| `https://stream.<domain>/hls/live.m3u8` | HLS, AAC 128k + 64k | adaptive; Safari/iOS natively, hls.js elsewhere |

HLS is plain files, so it can go behind a CDN (Cloudflare, Bunny) for
unlimited scale: cache `*.ts` for 60 s and never cache `*.m3u8`. If a CDN
fronts the stream domain, add `trusted_proxies` to Caddy's global options so
analytics still sees real listener IPs.

External encoders (studio PC with BUTT/Mixxx): server `stream.<domain>`, port
`8005`, mount `/live`, user `source`, password `LIVE_HARBOR_PASSWORD`. It mixes
exactly like the browser mic (voice-over ducking / takeover).

## 4. Monitoring & alerts

- **Alerts** (built into the API): set `ALERT_WEBHOOK_URL` to a Slack or
  Discord incoming webhook (or any URL accepting JSON). You get one message
  when something breaks and one when it recovers:
  dead air (with autopilot on), a stream mount off air, HLS stalled,
  Icecast/Liquidsoap/database unreachable, media disk < 10% free.
  Test it: `POST /api/v1/monitoring/test-alert` as admin.
- **Status**: `GET /api/v1/monitoring/status` (admin) — what the alerts see.
- **Metrics**: `GET /metrics` on the private network with
  `Authorization: Bearer $METRICS_TOKEN` (Caddy blocks it publicly). Scrape it
  with Grafana Cloud's agent or Prometheus: `rk_up`, `rk_listeners{mount}`,
  `rk_mount_up`, `rk_dead_air`, `rk_hls_playlist_age_seconds`,
  `rk_queue_depth`, `rk_media_disk_free_percent`, `rk_track_changes_total`.
- **External uptime check** (recommended, catches a dead server): any free
  uptime monitor on `https://stream.<domain>/hls/live.m3u8` and
  `https://api.<domain>/api/v1/health`.
- Logs: `docker compose logs -f --tail 100 api` (bounded to 50 MB per
  container in production).

## 5. Backups & restore

The `backup` service writes to `infra/backups/` on the host:
daily database dump (`BACKUP_HOUR`, UTC, kept `BACKUP_KEEP_DAYS`) and a weekly
files archive (`BACKUP_MEDIA_WEEKDAY`, newest `BACKUP_KEEP_MEDIA` kept)
containing the music library (`media` volume) **and** the `appdata` volume:
recorded programmes, recording thumbnails, listener chat and the announcement.
`deploy.sh` also backs up before every deploy.

**Offsite (do this):** local backups die with the server. Create a bucket
(Backblaze B2, S3, …), run `rclone config` on any machine, copy the resulting
`rclone.conf` to `infra/backup/rclone/rclone.conf`, and set
`BACKUP_RCLONE_REMOTE=<remote>:<bucket>`.

Manual backup: `docker compose run --rm backup /backup/backup.sh once`

Restore (stops the API during the restore; the stream keeps playing):
```sh
./backup/restore.sh db    backups/db/radyoklasik-YYYYMMDD-HHMM.dump
./backup/restore.sh media backups/media/media-YYYYMMDD-HHMM.tar.gz
```
Both restores were verified end-to-end (identical row counts; a deleted
file came back from the archive).

## 6. Security checklist

- Secrets come from `gen-env.sh`; never reuse the dev values. `.env` is
  mode 600 and git-ignored.
- Rotate: change the value in `.env`, then `./scripts/deploy.sh --no-pull`
  (rotating `SECRET_KEY` signs everyone out; `ICECAST_SOURCE_PASSWORD` /
  `LIVE_HARBOR_PASSWORD` changes need DJs' encoders updated).
- The public listener apps' shared secret can only reach listener routes
  (chat, recordings list, announcements); every operator action needs a staff
  login. Login is rate-limited (10 tries / 15 min / IP).
- Only 80/443 (+8005 for encoders) are open; Postgres, Icecast and the API
  are private.

## 7. Cutover from RadioJar

1. Deploy, upload the library, recreate playlists/schedule, invite DJs.
1. **Bring over the old backend's data** — past recordings, their thumbnails,
   the push-notification tokens of existing app users, chat and the
   announcement. Copy from the current server: `database.sqlite`,
   `recordings/`, `public/static/assets/thumbnails/`, `chatHistory.json`,
   `announcement.txt` into `infra/legacy/`, then:
   ```sh
   docker compose run --rm -v "$PWD/legacy:/legacy:ro" api node scripts/importLegacy.js /legacy --dry-run
   docker compose run --rm -v "$PWD/legacy:/legacy:ro" api node scripts/importLegacy.js /legacy
   ```
   Safe to re-run (nothing is duplicated or overwritten); it reports any
   recording rows whose MP3 is missing. Re-run it right before switching DNS
   to pick up anything recorded meanwhile.
2. Set `NEXT_PUBLIC_STREAM_URL=https://stream.<domain>/stream` and
   `NEXT_PUBLIC_API_URL=https://api.<domain>` on Vercel; redeploy the website.
3. Release the mobile app pointing at the new stream (still on RadioJar today).
4. Run both for a couple of weeks; watch alerts, analytics and the recorder.
5. Cancel RadioJar.

Note: streaming music publicly needs performance licences (in Turkey e.g.
MESAM/MSG and the related neighbouring-rights bodies). Check what RadioJar was
covering before switching it off; the Monthly tracks report (Analytics) is
the play log those bodies ask for.
