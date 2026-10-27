# Radyo Klasik — deployment & rollback plan

Goal: move from RadioJar + the legacy backend to the self-hosted stack **with a
one-step way back to "everything legacy" at every stage**, and keep that way
back working until the old setup is retired on purpose.

## Today (what "legacy" means)

| Piece | Where | Notes |
|---|---|---|
| Live stream | RadioJar | Website falls back to it; mobile app uses it |
| Backend API (`api.radyoklasik.online`) | DigitalOcean droplet `radyo-klasik-server`, FRA1, `161.35.28.160`, 1 vCPU / 1 GB / 25 GB | Recordings, chat, announcement, push tokens (SQLite + files) |
| Listener website | Vercel | `NEXT_PUBLIC_STREAM_URL`, `NEXT_PUBLIC_API_URL` |
| Mobile app | App stores | Still on RadioJar — **backlog** |

## Ground rules that keep rollback possible

1. **Never modify the legacy droplet or cancel RadioJar** until the retirement
   criteria (§6) are met. Rollback = point traffic back at things that never
   stopped running.
2. **Same secrets on both servers.** Copy `SECRET_KEY` and `SHARED_SECRET_KEY`
   from the legacy server's `.env` into the new `infra/.env` (do *not* let
   `gen-env.sh` invent new ones for these two). Tokens the website/app hold
   then work on either server, so a DNS flip in either direction logs nobody
   out.
3. **Short DNS TTL.** Lower the TTL of `api.` and `stream.` to 300 s at least a
   day before any switch, so a rollback takes ≤ 5 minutes.
4. **Data flows both ways during the transition.** Legacy → new:
   `scripts/importLegacy.js` (built, idempotent). New → legacy: the reverse
   sync `infra/scripts/sync-legacy.sh` (built; `exportToLegacy.js` +
   `legacyApply.js`) copies new recordings (incl. ones only in R2), push
   tokens, chat and the announcement back into the legacy SQLite + folders,
   so rolling back never loses what happened on the new server. It only
   writes data on legacy (never code), never deletes from its archive, keeps
   `LEGACY_MIN_FREE_GB` free on its disk, and never lowers a play count.
5. **One switch per stage**, each with a written, tested way back.
6. **Don't merge the self-hosted work into `main` while legacy runs.** The
   droplet has a hand-run `~/update_radyo_klasik.sh` that does `git pull -f`
   on its checked-out branch (`main`), `npm install` and `pm2 restart all`.
   If `main` held the new code, one run of it would replace the legacy
   SQLite server with the Postgres one and take legacy down. Keep the work
   on `feature/self-hosted-radio` (the new server deploys from that branch)
   until stage 5, or first pin the droplet to a `legacy` branch:
   `git -C ~/RadyoKlasik checkout -b legacy` (then the script only pulls
   `legacy`). Never run that script during the transition.
7. **Legacy disk is ~85 % full (23 GB).** The reverse sync adds new
   recordings there; check `df -h /` before stage 3 and keep ≥ 2 GB free
   (e.g. only export recordings from the last 60 days).

## Stages

### Stage 0 — Prepare (no listener impact) · ~1 day

- Push the feature branch; let CI go green. **Don't merge to `main` yet**
  (rule 6). The new server checks out `feature/self-hosted-radio`.
- Lower DNS TTLs (rule 3).
- Create the new server (see §7) and the object-storage bucket.
- Copy the legacy secrets (rule 2); generate the rest with `gen-env.sh`.
- Decide the transition hostnames: `stream.radyoklasik.online` (new, unused
  today) and **`api-next.radyoklasik.online`** for the new API while legacy
  keeps `api.`.

**Rollback:** nothing to roll back.

### Stage 1 — New stack live on new names, staff only · ~1 week

- Deploy (`OPERATIONS.md` §1) with `API_DOMAIN=api-next.radyoklasik.online`.
- Copy legacy data across and import it:
  `importLegacy.js --dry-run`, then for real.
- Move the recordings archive to R2 (`R2_RECORDINGS_PLAN.md`, steps R1–R4).
- Upload the music library, build playlists/schedule/shows, create DJ
  accounts, set `ALERT_WEBHOOK_URL` and offsite backups.
- DJs rehearse in `api-next…/panel` (browser mic, external encoder, recorder).
  Listeners still hear RadioJar; nothing public changed.

**Exit criteria:** a full scheduled show done on the new stack; recording saved;
alerts fire on a test; a restore drill passes.
**Rollback:** none needed — nothing public points at it.

### Stage 2 — Website plays the new stream · ~1–2 weeks

- On Vercel set `NEXT_PUBLIC_STREAM_URL=https://stream.radyoklasik.online/stream`
  on a **Preview** deployment, test it, then promote to Production.
  The website's API stays the legacy `api.` (so chat/recordings unchanged).
- RadioJar keeps broadcasting in parallel — it's the mobile app's source and
  the safety net. Best case, the app hears the same programme: if RadioJar's
  broadcast link accepts an external source (like the encoder settings it
  shows DJs), add one more Liquidsoap output that sends the new mix to it.
  Otherwise RadioJar keeps its own AutoDJ and live shows go out on both.

**Rollback (≈1 min):** Vercel → Deployments → *Instant Rollback* to the
previous production deployment (or set `NEXT_PUBLIC_STREAM_URL` back to the
RadioJar URL and redeploy).

### Stage 3 — `api.` moves to the new server · then ≥ 2 weeks parallel

- Set up the reverse sync (rule 4) first:
  1. On the new server: `ssh-keygen -t ed25519` (if it has no key), then add
     `~/.ssh/id_ed25519.pub` to the legacy droplet's
     `/root/.ssh/authorized_keys` (the only change ever made on legacy).
  2. In `infra/.env`: `LEGACY_SYNC_SINCE=<date of the switch>`.
  3. `./scripts/sync-legacy.sh --dry-run` → read the report → run it for real.
- Freeze for ~10 minutes: run `importLegacy.js` once more (catch-up), then
  change the `api.radyoklasik.online` A record to the new server and add
  `api-legacy.radyoklasik.online → 161.35.28.160` so legacy stays reachable.
- The new API serves the legacy listener routes unchanged (tested), so the
  website **and the not-yet-updated mobile app** keep working: recordings,
  chat, announcement and push all come from the new server; the app still
  plays RadioJar.
- Run `./scripts/sync-legacy.sh` nightly from cron on the new server (line
  in the script's header) so legacy stays a valid, current fallback.
- Run one **rollback drill** in this stage (below), at a quiet hour.

**Rollback to everything-legacy (≈5–10 min):**
1. Run `./scripts/sync-legacy.sh` once (latest recordings/tokens/chat back to legacy).
2. DNS: `api.radyoklasik.online` → `161.35.28.160`.
3. Vercel: Instant Rollback (website back on RadioJar + legacy API).
4. Announce nothing — listeners and the app keep working; tokens are valid
   because the secrets are shared.

### Stage 4 — Steady state · until §6 is met

- Weekly: check `/api/v1/monitoring/status`, backups, alert channel.
- Monthly while legacy exists: a rollback drill to `api-legacy.` (switch a
  test client to it, confirm the nightly export landed).

### Stage 5 — Retire legacy

When §6 holds: cancel RadioJar, snapshot the legacy droplet ($0.06/GB/month,
keep ~3 months), delete it, remove `api-legacy.`.

## 6. Retirement criteria (all must hold)

- Mobile app update shipped and most active installs updated (backlog item).
- 30 days on the new stack with no rollback and no unresolved alert.
- Performance licences (e.g. MESAM/MSG) confirmed for self-hosted streaming.
- Offsite backups verified with a restore in the last 30 days.

## 7. Infrastructure & monthly cost

Bandwidth is the deciding cost. One listener on the 128 kbps stream for a whole
month ≈ **41 GB** (HD 192k ≈ 62 GB, low 64k ≈ 21 GB). "Listeners" below means
the **average** number listening at any moment across the month (RadioJar's
statistics show it).

### Actual audience (RadioJar, 1 May – 26 Oct 2026) → decision

7,924 listening hours over 179 days = **≈ 2 average listeners**; 445 GB in
total = **≈ 75 GB/month**. Peaks are the Sunday programme (e.g. 25 Oct:
1,109 sessions, 400 IPs, 294 h — roughly 70–80 at once). 87 % of listening
is from Türkiye; 66 % of sessions are iPhone (mostly the app).

So bandwidth is irrelevant: either provider's included traffic covers it
50× over. **Decision: DigitalOcean Basic 2 vCPU / 4 GB / 80 GB in FRA1
($24/month) + R2 (≈ $0)** — same account and region as today, Frankfurt is
close to Türkiye, and Hetzner would save only a few dollars. Spaces is not
needed (R2 instead). The tables below stay as the reference if the audience
grows a lot.

### Alternative: Hetzner + Cloudflare R2

| Item | What | €/$ per month |
|---|---|---|
| Server | Hetzner **CPX22** — 2 vCPU, 4 GB, 80 GB NVMe, **20 TB traffic**, Nuremberg/Helsinki | €19.99 (excl. VAT) |
| Object storage | Cloudflare **R2** — recordings, recording artwork, offsite backups; no egress fees | ≈ $0–2 (10 GB free, then $0.015/GB) |
| Website | Vercel (unchanged) | as today |
| **Total** | | **≈ €20–22 (~$22–24)** flat up to ~480 average listeners |

Extra traffic past 20 TB is about €1 per TB, so even 1,000 average listeners
(≈ 41 TB) only adds ~€21.

### Staying on DigitalOcean

| Item | What | $ per month |
|---|---|---|
| Droplet | Basic **2 vCPU / 4 GB / 80 GB**, 4,000 GiB transfer (pooled per team) | $24 |
| Spaces | 250 GiB + 1 TiB transfer, built-in CDN — recordings, artwork, backups | $5 |
| Overage | Outbound beyond the pooled allowance | $0.01/GiB |

| Average listeners | 25 | 100 | 250 | 500 |
|---|---|---|---|---|
| Stream traffic | ~1 TB | ~3.9 TB | ~9.7 TB | ~19.3 TB |
| **DigitalOcean total** | **$29** | **$29** | **≈ $86** | **≈ $182** |
| **Hetzner + R2 total** | **≈ €21** | **≈ €21** | **≈ €21** | **≈ €22** |

During the transition add the legacy droplet ($6) and RadioJar until stage 5.
Optional: DigitalOcean droplet backups +20–30% of the droplet price; not needed
with the built-in backup service sending to R2/Spaces.

**Why not 1 vCPU / 2 GB:** four live encoders + Postgres + API + panel need
~1.5 GB RAM and steady CPU; a deploy build on top of that runs out of memory.

**Later, if the audience grows a lot:** put a CDN in front of the HLS output
(it's plain files). Not needed below several hundred average listeners.

Prices checked October 2026 (DigitalOcean droplet/Spaces/volume pricing pages,
DigitalOcean bandwidth billing docs, Hetzner Regular Performance plans,
Cloudflare R2 pricing). Re-check before buying.
