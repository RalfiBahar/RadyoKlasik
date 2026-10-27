# Recordings → Cloudflare R2: build, migration & cutover plan

Goal: past programmes (the recorded shows) live in Cloudflare R2 instead of
the server's disk. Listeners, the website and the **not-yet-updated mobile
app** keep working with no change, play counts keep counting, and every step
has a way back. Fits inside `DEPLOY_PLAN.md` (stages 1–5).

## How it works today (both legacy and new server)

| Thing | Where | Used by |
|---|---|---|
| MP3 files | `recordings/` on the server disk (`/var/radyo-data/recordings` on the new stack) | — |
| Row per recording | `Recordings` table; `stream` = `recording/recordings/<file>` | list endpoints |
| Playback | `GET /recording/recordings/<file>?token=…` → +1 `play_count` → file sent from disk | website, mobile app |
| Artwork | `thumbnails/` on disk, served at `/static/assets/thumbnails/<file>` | website, app, recorder (embeds it in the MP3) |

Clients build the URL themselves from `stream` and `artwork`, so **those
stored values and URLs must not change** — the app in the stores can't be
updated yet.

## Target design

```
listener ──GET /recording/recordings/x.mp3?token=…──▶ API
                                                      │ checks token, play_count +1
                                                      ▼
                                      302 redirect to R2 URL
listener ──────────────── range requests ───────────▶ R2 (Cloudflare edge)
```

- **Same URL, redirect instead of file.** The API still checks the token and
  counts the play, then answers `302` to the file's R2 address. Browsers,
  iOS (AVPlayer) and Android (ExoPlayer) follow redirects for audio; seeking
  then happens directly against R2 (range requests), not through the server.
- **Per-recording storage flag.** New column `Recordings.storage`
  (`local` | `r2`, default `local`). The API serves each recording from where
  its flag says, so a half-migrated archive works, and rolling one file or
  all files back is just flipping the flag (while the local copy exists).
- **Same names in the bucket:** `recordings/<filename>`. No DB value changes
  except the new flag.
- **Artwork stays on the server disk** (change from what we discussed): the
  images are a few KB each, the recorder needs them locally to embed in the
  MP3, and Caddy serves them fast with long cache headers. They're copied to
  R2 as part of the off-site backup instead.
- **Off by default.** `RECORDINGS_STORAGE=local` keeps today's behaviour;
  `r2` turns it on. Deploying the code changes nothing until the switch.

### What R2 URL the redirect points to — decision needed

| Option | Speed | Needs | Notes |
|---|---|---|---|
| **A. Custom domain** `media.radyoklasik.online` on a public bucket (recommended) | Cloudflare CDN caches popular episodes at the edge | `radyoklasik.online` DNS managed by Cloudflare | Anyone with the direct link can play without the token — same in practice as today, since the token ships inside the public website |
| B. Presigned URLs (expire after e.g. 12 h) | Served by R2, no edge cache — still fast | nothing extra | Keeps the token rule strict; works if DNS stays where it is |

Code supports both (`R2_PUBLIC_BASE` set → A, empty → B), so this can be
decided at stage R1 and changed later without touching data.

## What gets built (stage R0, local only) — ✅ built 2026-10-27

Status: all of the below is in the code, off by default
(`RECORDINGS_STORAGE=local`). Tests: `__tests__/recordingStorage.test.js`
(11 cases) against MinIO; full backend suite 185/185, panel 37/37. The
artwork part of the backup (item 9) rides along with the existing media
archive rather than a separate bucket folder.

1. **`services/objectStorage.js`** — S3-compatible client (`@aws-sdk/client-s3`
   + presigner) pointed at R2: `upload(localPath, key)` (multipart for big
   files, stores a SHA-256 in object metadata), `head(key)`,
   `download(key, localPath)`, `remove(key)` (moves to `trash/` first),
   `publicUrl(key)`.
2. **Migration** `20261028000001-recording-storage.js` — adds `storage`
   (default `local`) and `storedAt`.
3. **Serving** — legacy `/recording/recordings/:file`, panel
   `/api/v1/recordings/:id/audio`: if `storage = r2` → redirect; else today's
   `sendFile`. If the flag says local but the file is gone and R2 has it →
   redirect (self-healing).
4. **Recorder** — after a recording is tagged: upload → verify (size +
   SHA-256 via HEAD) → set `storage = r2`. Upload failure leaves it `local`
   and fires the existing alert webhook; a retry job picks it up hourly.
   The local copy is kept for the grace period (below).
5. **Edits in the panel** (re-tagging metadata/artwork, replacing the file,
   delete): download if not local → change → re-upload → verify. Delete
   moves the object to `trash/` (bucket lifecycle rule deletes `trash/`
   after 30 days — R2 has no versioning, this is the undo window).
6. **`scripts/recordingsToR2.js`** — the bulk mover:
   - `--dry-run` — lists what would upload, total size, files missing on disk.
   - default — uploads every `local` recording (4 at a time), verifies each,
     flips its flag. Idempotent: re-running skips verified ones, resumes
     after a crash.
   - `--verify` — HEADs every `r2` recording, compares size + SHA-256, reports
     mismatches (and flips mismatches back to `local` if the file is still on
     disk).
   - `--prune-local --older-than 7d` — deletes local copies only of
     recordings verified in R2 more than 7 days ago. Never runs on its own.
   - `--back-to-local` — downloads anything missing locally and sets every row
     to `local` (full rollback).
7. **Housekeeping job** (daily, in the API's scheduler): prune local copies
   past the grace period **only if** `RECORDINGS_PRUNE_LOCAL=true` (off until
   stage R5).
8. **Panel** — recordings page shows a "Cloud / On server / Uploading" badge
   and a "Retry upload" action; `/api/v1/monitoring/status` reports counts
   per storage and failed uploads.
9. **Backups** — `backup.sh` skips `recordings/` files whose row is `r2`
   (R2 is the copy); still tars everything else. Thumbnails sync to the
   bucket under `backups/thumbnails/`.
10. **Reverse sync** (`exportToLegacy.js`, already in the deploy plan) pulls
   new recordings **from R2** when copying them back to the legacy droplet.
11. **Tests** — MinIO container in the dev compose acts as a fake R2:
    upload/verify/redirect/seek, play count +1 per request, flag rollback,
    recorder upload-failure path, legacy route unchanged for `local` rows.

Env vars (new, all optional): `RECORDINGS_STORAGE`, `R2_ACCOUNT_ID`,
`R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE`,
`RECORDINGS_LOCAL_GRACE_DAYS` (default 7), `RECORDINGS_PRUNE_LOCAL`.

**Exit:** all tests green locally against MinIO; with
`RECORDINGS_STORAGE=local` behaviour is byte-for-byte today's.

## Cutover

### R1 — Cloudflare setup (you, ~20 min, no listener impact)

1. Cloudflare dashboard → R2 → create bucket `radyoklasik-media`
   (location hint: Europe).
2. R2 → Manage API tokens → **Object Read & Write, this bucket only** →
   copy the keys into the new server's `infra/.env` (never into git).
3. Option A only: bucket → Settings → Custom domain →
   `media.radyoklasik.online`. Add a CORS rule allowing `GET, HEAD` from
   `https://radyoklasik.online` and `https://www.radyoklasik.online`.
4. Bucket → Lifecycle: delete objects under `trash/` after 30 days.

**Rollback:** delete the bucket. Nothing uses it yet.

### R2 — Measure the archive (read-only on legacy, 2 min)

On the legacy droplet (reads only, changes nothing):

```bash
du -sh ~/RadyoKlasik/RadyoKlasikServer/recordings ~/RadyoKlasik/RadyoKlasikServer/public/static/assets/thumbnails
```

The legacy disk is 23 GB (85 % used), so
the archive is at most ~20 GB: fits on the new server's 80 GB with room to
spare, uploads in well under an hour, costs ≤ $0.15/month in R2 beyond the
10 GB free tier.

### R3 — Migrate the existing archive (during deploy stage 1, staff only)

1. `importLegacy.js` (already part of stage 1) copies recordings + rows from
   the legacy folder to the new server. All rows start as `local`.
2. `recordingsToR2.js --dry-run` → check count/size match R2's numbers and
   the "missing on disk" list matches `importLegacy`'s report.
3. `recordingsToR2.js` → uploads + verifies + flips flags.
4. `recordingsToR2.js --verify` → must report 0 mismatches.
5. Test on `api-next…` (`DEPLOY_PLAN.md` stage 1):
   - website **preview deployment** pointed at `api-next`: play an old
     episode, seek to the middle, seek to the end;
   - the **store version of the mobile app** can't be repointed, so test the
     same redirect URL on a phone browser and with an Expo dev build of the
     app pointed at `api-next` (same player library);
   - `play_count` went up by 1 per play;
   - panel preview plays; editing metadata re-uploads and the new tags show.

**Rollback:** `recordingsToR2.js --back-to-local` (files are still on
disk), or simply leave `RECORDINGS_STORAGE=local` — public traffic isn't on
this server yet anyway.

### R4 — New recordings go to R2 (still stage 1)

1. Set `RECORDINGS_STORAGE=r2`, `./scripts/deploy.sh --no-pull`.
2. Record a 5-minute test show from the panel → badge shows Cloud within a
   minute → plays from the archive → delete it (lands in `trash/`).
3. Pull the network for a test (or use a wrong key) → upload fails →
   recording stays playable from disk, alert arrives, retry works after
   fixing.

**Rollback:** `RECORDINGS_STORAGE=local` + redeploy: new recordings stay on
disk again; existing `r2` rows keep working from R2 (or `--back-to-local`).

### R5 — Public cutover (with deploy stage 3, when `api.` moves)

1. During the stage-3 freeze: `importLegacy.js` catch-up (recordings made on
   legacy since R3) → `recordingsToR2.js` → `--verify`.
2. Flip DNS as in the deploy plan. Listeners now hit the new API, which
   redirects to R2.
3. Watch for a day: monitoring status (failed uploads = 0), Caddy log has
   302s for `/recording/recordings/`, no 404/5xx spike, server outbound
   traffic for recordings drops to near zero.

**Rollback to everything-legacy:** exactly as in `DEPLOY_PLAN.md` — run
`exportToLegacy.js` (pulls new recordings from R2 onto the legacy disk),
point DNS back. Legacy serves its own files and never knew about R2.

### R6 — Free the disk (≥ 7 days after R5, no rollback needed)

1. `recordingsToR2.js --verify` → 0 mismatches.
2. Confirm a fresh off-site backup ran and a restore drill passed.
3. `--prune-local --older-than 7d` once by hand, check the site, then set
   `RECORDINGS_PRUNE_LOCAL=true` so the daily job keeps it tidy.

**Rollback:** `--back-to-local` downloads everything again (≈ minutes for
≤ 20 GB; R2 has no egress fees).

## Risks & how they're covered

| Risk | Cover |
|---|---|
| Old app version doesn't follow redirects | Tested in R3 before anything public; if it fails, keep `local` for the legacy route only (flag per route) — the website still uses R2 |
| Upload half-done / corrupted | SHA-256 + size verified before the flag flips; `--verify` re-checks all |
| R2 outage | Local copies kept 7 days; `--back-to-local` restores; Cloudflare status alerts |
| Deleted by mistake | `trash/` kept 30 days |
| Keys leak | Token scoped to one bucket; rotate in the dashboard, update `.env` |
| Play counts look lower | Today every seek re-requests the file and counts again; with R2 seeks go straight to R2, so counts become closer to real plays. Expected, not a bug |

## Cost

Archive ≤ 20 GB + ~6 GB/year new: **≈ $0–0.25/month**; uploads/reads are
far inside the free operation allowances; **egress is free**.
