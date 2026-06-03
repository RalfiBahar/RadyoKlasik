# Self-Hosted Online Radio — Master Build Plan

> Goal: Replace the third-party **RadioJar** service with a **fully self-hosted** online radio platform that reproduces every RadioJar capability we use today: AutoDJ playout, song database + uploads, queuing/requests, scheduling/autopilot, dead-air failover, a browser **Virtual Studio** for live mic-over-music broadcasting, a **DJ host dashboard**, and listener **analytics**.
>
> This document is the single source of truth. Each phase is self-contained: open a new agent window, point it at the relevant phase, and it has the context, inputs, outputs, functionality, and tests it needs.

---

## Execution workflow (how to build this with Cursor agents)

**Do NOT build all phases in one chat.** Context windows degrade as they fill — the agent forgets earlier decisions, re-reads files, and drifts. Use one fresh agent window per phase (the doc carries the context, the chat is disposable).

### Per-phase kickoff prompt (copy/paste, edit the phase number + done list)
```
Read SELF_HOSTED_RADIO_PLAN.md, then implement Phase <N> (<name>).
Follow that phase's scope, inputs/outputs, key files, and tests exactly.
Phases <list already merged> are already merged. When done: run the
phase's tests, update this doc's checklist + add a short
"Status / decisions / gotchas" note under the phase, then summarize.
```

### Rules
- **Single branch for the whole plan**: all phases land on `feature/self-hosted-radio` (cut from `main`). Commit at the end of each phase = a clean checkpoint; no per-phase sub-branches.
- **Update the ledger**: at the end of every phase window, tick the parity checklist and add a `Status / decisions / gotchas` note under that phase. This is the most important habit — it prevents drift between windows.
- **Tell each window what's already done** so it doesn't redo merged work.
- **Re-verify the stack** at the start of each phase: `docker compose up`, `GET /api/v1/health`, stream plays.
- **Split big phases**: Phase 4 (Virtual Studio) and Phase 5 (Dashboard) should each span 2–3 windows by their sub-bullets.
- **Run tests for real**: ask the agent to actually run the integration/smoke tests, not just claim done.
- **Keep `.env.example` current** — it's the contract between phases.

### Sequencing
- `0 → 1 → 2 → 3 → 4` strictly sequential (each depends on the prior).
- Once backing APIs exist, **Phase 5 (dashboard UI)** and **Phase 6 (analytics)** can run in parallel windows (mostly different files); good candidates for background agents.

---

## 0. Context: where we are today

### Repos in this workspace
- `RadyoKlasik/` — backend monorepo.
  - `RadyoKlasikServer/` — **primary** Node/Express backend. EJS admin dashboard, JWT + session auth, SQLite via Sequelize. Records the live stream from `http://stream.radiojar.com/bw66d94ksg8uv` using `axios` + `fluent-ffmpeg` (`record.js`), stores MP3s + ID3 metadata + thumbnails, exposes `/recording`, `/chat`, `/notification`, `/auth`, `/dashboard` routes. Default port **8001**.
  - `RadyoKlasikServerFlask/` — legacy Flask equivalent (Dockerized). Reference only.
  - `RadyoKlasikMobile/` — Expo/React Native listener app.
- `radyo-klasik-web/` — **listener frontend**. Next.js 14 App Router + TypeScript + Tailwind. HTML5 `Audio` player pointed at `NEXT_PUBLIC_STREAM_URL` (already set to `https://stream.radyoklasik.online/stream`, falls back to RadioJar). REST chat via backend. Polls `GET /playout/nowplaying` (endpoint does **not exist on the backend yet** — we will build it). Deployed on Vercel. Branch `feature/self-hosted-streaming` already started the Icecast migration.

### Key facts that constrain the design
- The frontend **already expects** `GET /playout/nowplaying` returning `{ album, artist, title, thumb }`. Phase 2 must implement it.
- The existing **recording** feature should keep working — but record from **our own Icecast** instead of RadioJar.
- Auth today is a single admin (env-based) + a `shared_secret` → JWT flow. We will extend to multi-user (admin / DJ / guest DJ) roles.
- Media + DB today: MP3s on disk, SQLite. We will migrate to **PostgreSQL** + a media volume (S3-compatible MinIO optional).

### Target architecture (decided)
- **Icecast2** = stream distribution (mount points, multiple bitrates).
- **Liquidsoap** = playout engine: AutoDJ rotation, crossfades, scheduled playlists, jingle/break insertion, request queue, **live source takeover**, **dead-air failover**, loudness normalization, and metadata injection.
- **Node control-plane API** (extends `RadyoKlasikServer`) = orchestrates Liquidsoap (via its telnet/HTTP command server), owns the database, media uploads, auth, analytics aggregation, now-playing, queue, scheduling, WebRTC ingest bridge.
- **Next.js DJ dashboard** = the operator UI (general dashboard, library/upload, **Virtual Studio**, analytics, scheduling, DJ management). Can be a new app in `radyo-klasik-web` (e.g. `/studio` routes) or a separate `radyo-klasik-studio` Next app. Recommended: a separate authenticated app to keep the public listener bundle small.
- **Deployment**: Docker Compose on a persistent Linux VPS (Icecast, Liquidsoap, Node API, Postgres, MinIO optional, reverse proxy w/ TLS). Listener frontend stays on Vercel.

```mermaid
flowchart LR
  subgraph studio [DJ Virtual Studio - Next.js]
    Mic[Mic capture WebRTC]
    StudioUI[Library / Queue / Transport]
  end
  subgraph vps [VPS - Docker Compose]
    Node[Node Control Plane API]
    LS[Liquidsoap playout]
    Ice[Icecast2]
    PG[(PostgreSQL)]
    Media[(Media volume)]
  end
  Listener[Listener Frontend - Vercel + Mobile]

  Mic -->|WebRTC/WS audio| Node
  Node -->|harbor source| LS
  StudioUI -->|REST + WS| Node
  Node -->|telnet/HTTP cmds| LS
  Node --> PG
  Node --> Media
  LS -->|AutoDJ + live mix| Ice
  LS -->|metadata| Node
  Ice -->|MP3/AAC/HLS| Listener
  Node -->|/playout/nowplaying, /chat, /recording| Listener
```

### Conventions used in every phase
- **Branch strategy**: cut `feature/self-hosted-radio` from the default branch in `RadyoKlasik/`; the frontend continues on `feature/self-hosted-streaming`. All backend phases commit directly to the single `feature/self-hosted-radio` branch (no per-phase sub-branches).
- **API base**: control-plane API at `/api/v1/...` for new endpoints; keep legacy `/recording`, `/chat`, `/auth` working during migration.
- **Auth**: Bearer JWT. New role claim `role: admin|dj|guest`.
- **"Definition of done"** for each phase: code + migrations + tests (unit + integration) + a manual acceptance checklist all green, and the phase's smoke test passes against the Docker Compose stack.

---

## Phase 0 — Infrastructure scaffolding & Docker Compose stack ✅ COMPLETE

**Objective**: Stand up the full self-hosted stack locally and on the VPS so later phases have something to deploy into. No product features yet — just a streamable test loop.

**Decision (locked)**: Migrate the backend from SQLite to **PostgreSQL in this phase**. Rationale: high-frequency concurrent writes coming in later phases (analytics listener sessions, `PlayHistory` per track change, queue mutations) would cause SQLite lock contention; Postgres also fits the multi-container Compose topology and the analytics time-series query load. It's cheapest to switch now while there is essentially no data to migrate. Sequelize makes this mostly a dialect + DSN change.

**Scope / functionality**
- `infra/docker-compose.yml` with services: `icecast`, `liquidsoap`, `api` (Node), `postgres`, `caddy` (reverse proxy + TLS), optional `minio`.
- Icecast config (`infra/icecast/icecast.xml`): admin/source passwords from env, mounts `/stream` (MP3 128k) + `/stream-hd` (AAC 192k) placeholder, `<http-headers>` CORS for the web player.
- Minimal Liquidsoap script (`infra/liquidsoap/radio.liq`) that plays a single bundled test playlist to `/stream` and exposes a telnet command server on `127.0.0.1:1234`.
- Caddy reverse proxy mapping `stream.radyoklasik.online` → Icecast, `api.radyoklasik.online` → Node API, with automatic HTTPS.
- `.env.example` consolidating all secrets/keys (Icecast passwords, Liquidsoap telnet port, Postgres DSN, JWT secret, shared secret, MinIO keys).
- Postgres container + a healthcheck; Node API switched from SQLite to Postgres (Sequelize dialect change) with a no-op startup that just connects.

**Inputs**
- Env vars: `ICECAST_SOURCE_PASSWORD`, `ICECAST_ADMIN_PASSWORD`, `ICECAST_HOSTNAME`, `LIQUIDSOAP_TELNET_PORT`, `DATABASE_URL`, `JWT_SECRET`, `SHARED_SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `MEDIA_DIR`, (optional) `MINIO_ROOT_USER/PASSWORD`.
- A small bundled set of royalty-free test MP3s in `infra/liquidsoap/test-media/`.

**Outputs / artifacts**
- `docker compose up` yields a live MP3 stream at `https://<host>/stream` (or `:8000/stream` locally) playing the test loop.
- Icecast admin reachable; Liquidsoap telnet reachable from the `api` container only.
- Node API boots, connects to Postgres, responds `GET /api/v1/health` → `{ status: "ok", services: { db, icecast, liquidsoap } }`.

**Key files**
- `RadyoKlasik/infra/docker-compose.yml`
- `RadyoKlasik/infra/icecast/icecast.xml`
- `RadyoKlasik/infra/liquidsoap/radio.liq`
- `RadyoKlasik/infra/caddy/Caddyfile`
- `RadyoKlasik/RadyoKlasikServer/config/database.js` (Postgres)
- `RadyoKlasik/RadyoKlasikServer/controllers/healthController.js`

**Testing**
- Unit: `health` controller returns service statuses (mock socket checks).
- Integration: `docker compose up` in CI; assert `curl -sI http://localhost:8000/stream` returns `200` + `Content-Type: audio/mpeg`; assert `GET /api/v1/health` → 200.
- Manual acceptance: open the stream URL in VLC/browser and hear the test loop; confirm Caddy serves HTTPS.

### Status / decisions / gotchas (Phase 0)

**Status: DONE.** All work lives on the single plan branch `feature/self-hosted-radio` (cut from `main`). Stack builds and runs; smoke test green.

**What landed**
- `infra/docker-compose.yml` — services `postgres`, `icecast`, `liquidsoap`, `api`, `caddy`, plus optional `minio` (behind `--profile minio`). Private `radyonet` network; named volumes `pgdata`, `media`, `caddy_data`, `caddy_config`, `minio_data`.
- `infra/icecast/icecast.xml` — mounts `/stream` (MP3 128k) + `/stream-hd` (AAC 192k placeholder), `<http-headers>` CORS for the web player. Mounted **read-only**; secrets injected at container start.
- `infra/liquidsoap/radio.liq` — loops the bundled test playlist to `/stream`, `mksafe` (no dead air), telnet command server on `0.0.0.0:1234`.
- `infra/liquidsoap/test-media/*.mp3` — three synthesized royalty-free sine-tone clips (C4/E4/G4, 18s, 128k). A `.gitignore` negation re-includes them despite the global `*.mp3` ignore.
- `infra/caddy/Caddyfile` — reverse proxy `STREAM_DOMAIN → icecast:8000`, `API_DOMAIN → api:8001`, automatic HTTPS (domains via env so local vs VPS differ).
- `infra/.env.example` — consolidated cross-phase secrets contract (+ a gitignored `infra/.env` for local dev).
- `RadyoKlasikServer/Dockerfile` + `.dockerignore` — `node:20-bookworm-slim`, bundles `ffmpeg`/`curl`.
- `RadyoKlasikServer/config/database.js` — **SQLite → PostgreSQL** via single `DATABASE_URL` DSN (locked decision).
- `controllers/healthController.js` + `services/healthChecks.js` + `routes/healthRoutes.js` → `GET /api/v1/health` returns `{ status, services: { db, icecast, liquidsoap } }`. Mounted in `app.js` at `/api/v1`.
- Unit tests: `__tests__/healthController.test.js` (jest, 3/3 passing, socket checks mocked).

**Smoke test results (local)**
- `GET /api/v1/health` → `200 {"status":"ok","services":{"db":"up","icecast":"up","liquidsoap":"up"}}`.
- `GET http://localhost:8000/stream` → `200`, `Content-Type: audio/mpeg`; captured bytes decode cleanly as MP3 44.1kHz stereo 128k (VLC-playable).

**Decisions**
- Postgres migration done now (per locked decision): added `pg`/`pg-hstore`, **removed `sqlite3`** (also dodges native-build pain in the Docker image). Local non-docker dev now needs a Postgres (default DSN `postgres://radyo:radyo@localhost:5432/radyoklasik`).
- Icecast image: `libretime/icecast:2.4.4`. Its default entrypoint rewrites the mounted config **in place** from env (would leak secrets into the committed file), so we override the entrypoint to `sed` the `@TOKEN@` placeholders from env into `/tmp/icecast.xml` and run from there; the repo file stays read-only and secret-free.
- Liquidsoap telnet binds `0.0.0.0:1234` (not `127.0.0.1`) so the `api` container can reach it over `radyonet`; the port is **not published** to the host, so it stays api-only (satisfies the spec intent).

**Gotchas (read before Phase 1)**
- **HEAD on `/stream` returns 400** — that's normal Icecast behavior. Use `GET` for the smoke test, not `curl -I`.
- **Host port shadowing**: if a local `node server.js` (default port 8001) is running, it shadows the container on `localhost:8001` and you'll get a 404 for `/api/v1/health` from the host. Verify via `docker compose exec api curl localhost:8001/api/v1/health`, or stop the local server. Port 8000/8001 are forwarded by Docker/OrbStack.
- **Benign startup error**: `models/recording.js` calls `sequelize.sync({ alter: true })` at import while `app.js` also syncs, racing to `CREATE TABLE "Recordings"` → one logs a duplicate-type error (`23505`). App continues fine (`db: "up"`). Phase 1 should centralize schema into proper migrations and drop the per-model `sync()` calls.
- **jest on Node 25 locally**: `jest-environment-node` trips on Node 25's experimental Web Storage. Run with `NODE_OPTIONS=--no-experimental-webstorage` locally; the Docker/CI image is Node 20 where `npm test` works as-is (don't bake the flag into the npm script — Node 20 rejects it).
- **Caddy is VPS-oriented**: locally it can't get public certs for the real domains; the local smoke test hits Icecast `:8000` and the API `:8001` directly (Caddy is not started by the core smoke-test `up`).
- **`savonet/liquidsoap:v2.2.5` is ~1.3 GB** — first pull is slow; budget for it.

**Run it**: `cd RadyoKlasik/infra && cp .env.example .env && docker compose up --build` (add `--profile minio` for object storage). Core-only: `docker compose up -d postgres icecast liquidsoap api`.

---

## Phase 1 — Media library & database

**Objective**: A proper music database + upload/ingest pipeline. Reproduces RadioJar's **Media Library** (the Library screenshot: Songs / Jingles / Commercials, artists, albums, playlists, tags, upload tracks).

**Scope / functionality**
- Postgres schema (Sequelize models + migrations):
  - `Track` (id, title, artist, album, type[`song|jingle|commercial`], duration, filePath, fileHash, size, bitrate, sampleRate, loudnessLufs, replaygain, waveformJson, artworkPath, tags[], playCount, createdAt).
  - `Artist`, `Album` (optional normalization or denormalized strings + lookup tables).
  - `Playlist`, `PlaylistItem` (ordered), `Tag`, `TrackTag`.
  - `User` (id, username, email, passwordHash, role, micPreferencesJson), `Show`, `Episode` (used in later phases but tables created here).
  - `PlayHistory` (trackId, startedAt, source[`autodj|live|request`]).
- Upload pipeline (`POST /api/v1/library/tracks`, multipart):
  - Store file to `MEDIA_DIR` (or MinIO), compute hash (dedupe), `ffprobe` for duration/bitrate, extract ID3 (`node-id3`/`music-metadata`), generate **waveform JSON** (ffmpeg/audiowaveform) for the studio UI, run **EBU R128 loudness** analysis (`ffmpeg -af ebur128`) and store LUFS for normalization in Phase 2, extract embedded artwork or accept uploaded thumbnail.
- CRUD + listing endpoints with pagination, search, filter by type, tag, artist, album, playlist. Mirrors the Library UI (paged 15/page, type counts, artists/albums/playlists/tags counts, total size).
- Bulk operations: tag, delete, add-to-playlist.

**Inputs**
- `POST /api/v1/library/tracks` — multipart `file` + optional `{ title, artist, album, type, tags[] }`.
- `GET /api/v1/library/tracks?type=&q=&tag=&artist=&page=&pageSize=&sort=`.
- `PATCH /api/v1/library/tracks/:id` — `{ title?, artist?, album?, type?, tags?, artworkAssetId? }`.
- `DELETE /api/v1/library/tracks/:id`.
- Playlist: `POST /api/v1/playlists`, `POST /api/v1/playlists/:id/items`, `PATCH .../reorder`, `DELETE`.

**Outputs**
- Track JSON: `{ id, title, artist, album, type, duration, bitrate, loudnessLufs, waveformUrl, artworkUrl, tags, playCount, createdAt }`.
- List JSON: `{ items: Track[], page, pageSize, total, counts: { all, song, jingle, commercial }, totalSizeMb }`.

**Key files**
- `RadyoKlasik/RadyoKlasikServer/models/{track,artist,album,playlist,playlistItem,tag,user,show,episode,playHistory}.js`
- `RadyoKlasik/RadyoKlasikServer/migrations/*`
- `RadyoKlasik/RadyoKlasikServer/controllers/libraryController.js`, `playlistController.js`
- `RadyoKlasik/RadyoKlasikServer/services/mediaIngest.js` (ffprobe/ffmpeg/waveform/loudness)
- `RadyoKlasik/RadyoKlasikServer/routes/libraryRoutes.js`

**Testing**
- Unit: ingest service parses a fixture MP3 → correct duration/bitrate/LUFS; hash dedupe rejects duplicates; waveform JSON shape valid.
- Integration: upload a fixture → row created, file on disk, artwork + waveform generated; list/filter/search return expected; pagination correct; delete removes file + row.
- Manual: upload 5 tracks of each type, confirm counts and total size match the Library UI expectations.

### Status / decisions / gotchas (Phase 1)

**Status: DONE.** All work is on the single plan branch `feature/self-hosted-radio`. The full media DB schema, the upload/ingest pipeline, and the library/playlist CRUD endpoints are implemented and verified for real against the Docker Compose stack (health green, stream still plays, live end-to-end upload exercised the ingest pipeline). Tests: **23/23 passing** (unit + integration).

**What landed**
- **Models** (`models/*.js` + `models/index.js`): `Track`, `Artist`, `Album`, `Tag`, `TrackTag` (join), `Playlist`, `PlaylistItem` (ordered), `User` (table `Users`, roles admin/dj/guest, `micPreferencesJson`), `Show`, `Episode`, `PlayHistory`. UUID PKs; denormalized `artist`/`album` strings on `Track` plus FK links to `Artists`/`Albums`. Associations are centralized in `models/index.js`; no model has side effects on import.
- **Migrations** (`migrations/*` + `config/migrate.js`): schema is now managed by **Sequelize migrations** run at startup via **Umzug** (tracked in the standard `SequelizeMeta` table, so `npx sequelize-cli db:migrate` also works — `.sequelizerc` + `config/sequelize-cli.js` provided). `20260602000001-legacy-tables` moves the previously sync()'d `Recordings`/`NotificationTokens` into migrations; `20260602000002-library-schema` creates the Phase 1 tables. **The Phase 0 duplicate-table race is gone**: removed `sequelize.sync()` from `models/recording.js` and `app.js`. Startup log now shows a clean `Migrations: applying … / done`.
- **Ingest service** (`services/mediaIngest.js`): sha256 hash (dedupe key), `ffprobe` (duration/bitrate/sampleRate), **EBU R128** integrated loudness + LRA via `ffmpeg -af ebur128` (parsed from stderr) → stores LUFS and a derived `replaygain` (= −18 LUFS reference − integrated), and a compact **waveform JSON** (decode → mono PCM @ 8 kHz → 1000 normalized peaks).
- **Library API** (`controllers/libraryController.js`, `routes/libraryRoutes.js`): `POST /api/v1/library/tracks` (multipart `file` [+ optional `artwork`]), `GET /api/v1/library/tracks` (pagination, `q` search, filter by `type`/`tag`/`artist`/`album`/`playlist`, `sort`/`order`, returns `{ items, page, pageSize, total, counts:{all,song,jingle,commercial}, totalSizeMb }`), `GET /tracks/:id`, `GET /tracks/:id/waveform`, `PATCH /tracks/:id`, `DELETE /tracks/:id` (removes row + file), and `POST /api/v1/library/bulk` (`tag` | `delete` | `addToPlaylist`).
- **Playlist API** (`controllers/playlistController.js`, `routes/playlistRoutes.js`): `POST/GET/PATCH/DELETE /api/v1/playlists`, `POST /:id/items`, `PATCH /:id/reorder`, `DELETE /:id/items/:itemId`. Positions are kept dense on insert/reorder/remove.
- **Media serving**: `app.use("/media", express.static(MEDIA_DIR))`; uploads stored under `MEDIA_DIR/tracks/<sha256>.<ext>` and artwork under `MEDIA_DIR/artwork/` (`config/storage.js`).

**Decisions**
- **Migrations over sync** via Umzug at boot (single source of truth) — directly fixes the Phase 0 gotcha. Compatible with sequelize-cli (same `SequelizeMeta`).
- **Auth**: new `/api/v1/library` + `/api/v1/playlists` routes are protected by the existing `tokenRequired` JWT middleware. Get a token via `POST /auth/generate_token { "shared_secret": <SHARED_SECRET_KEY> }`. Full role-based auth + user management is deferred to Phase 7 (the `Users` table is created now so later phases have it).
- **Legacy `models/user.js` left untouched** (env-based admin used by `authController`). The Sequelize User model lives in `models/userAccount.js` to avoid a filename clash that would break auth.
- **Tag extraction uses `node-id3` (CJS)** instead of `music-metadata` (ESM-only) in the ingest path, so the module is require-able under jest without `--experimental-vm-modules`.
- **File extension** is taken from the uploaded filename first (mime `audio/mpeg` maps to `mpga`, not `mp3`).
- **`infra/docker-compose.yml`**: published Postgres `5432:5432` for host-run tooling/integration tests (the API/Liquidsoap still use the in-network `postgres` host).
- New deps: `umzug` (prod); `supertest`, `sequelize-cli` (dev).

**How tests were run (for real)**
- Canonical run is **inside the Node 20 image on the compose network** (matches the prod runtime and reaches the dockerized Postgres):
  ```
  cd RadyoKlasik/infra && docker compose up -d --build postgres icecast liquidsoap api
  cd ../RadyoKlasikServer && docker run --rm --network radyoklasik_radyonet \
    -e NODE_ENV=test -e SECRET_KEY=test-secret \
    -e TEST_DATABASE_URL=postgres://radyo:dev-postgres-pw@postgres:5432/radyoklasik_test \
    -e MEDIA_DIR=/tmp/rk-media-test -v "$PWD":/app -v /app/node_modules \
    radyoklasik-api bash -lc "npm install --no-save jest supertest && npx jest --no-watchman --runInBand"
  ```
  Result: **3 suites, 23 tests, all green** (`mediaIngest` unit, `healthController` unit, `library.integration` integration). The integration suite provisions a clean `radyoklasik_test` DB (jest `globalSetup`) and runs migrations against it.
- Live smoke: uploaded a synthesized 3 s MP3 → `201` with `duration≈3.03`, `bitrate≈129k`, `sampleRate=44100`, `loudnessLufs=-22.2`, `replaygain=4.2`, waveform URL, file on disk as `<sha256>.mp3`; list reflected `counts`/`totalSizeMb`; delete removed row + file. `GET /api/v1/health` → `ok`; `GET :8000/stream` → `200 audio/mpeg` throughout.

**Gotchas (read before Phase 2)**
- **Node 25 locally can't run the integration suite**: `jsonwebtoken` → `buffer-equal-constant-time` uses the removed `SlowBuffer`, crashing on `require`. Unit suites that don't touch JWT (`mediaIngest`, `healthController`) still run locally with `NODE_OPTIONS=--no-experimental-webstorage npx jest --no-watchman`. **Run the full suite in the Node 20 container (above).**
- **Host port 5432 shadowing**: if a local Postgres is running on the host it will answer on `localhost:5432` instead of the container (you'll see `role "radyo" does not exist`). Running tests *inside* the compose network (using host `postgres`) sidesteps this.
- **Migrations assume a fresh-ish DB**: the legacy-tables migration `createTable`s `Recordings`/`NotificationTokens`. If you point at an old DB where Phase 0's `sync()` already created them (without a `SequelizeMeta` row), the first migration will fail with "already exists". Dev fix: reset the volume (`docker compose down -v` then `up`) — there is essentially no data to migrate.
- **ffmpeg/ffprobe required** for ingest (present in the API image and assumed on PATH locally). Override with `FFMPEG_PATH`/`FFPROBE_PATH` if needed.

**Run it**: `cd RadyoKlasik/infra && cp .env.example .env && docker compose up --build`. Then `POST /auth/generate_token` for a JWT and hit `/api/v1/library/*`.

---

## Phase 2 — AutoDJ playout engine (Liquidsoap) + now-playing

**Objective**: Replace RadioJar's automated playout. Liquidsoap continuously streams from the library with crossfades, jingle rotation, normalization, and **dead-air failover**, and reports now-playing back to the API (powering the existing `GET /playout/nowplaying`).

**Scope / functionality**
- Liquidsoap `radio.liq` upgraded to:
  - Pull the active rotation from a **playlist file the API regenerates** (`MEDIA_DIR/playout/rotation.m3u`) or via `request.dynamic` calling the API for the next track (recommended: `request.dynamic` → `GET /api/v1/playout/next` so the DB drives selection).
  - **Crossfade** (`crossfade(fade_in, fade_out, smart)`), **ReplayGain/normalization** using the LUFS computed in Phase 1 (`amplify`/`normalize`).
  - **Jingle/break insertion** every N tracks or on schedule (`rotate`/`switch` with a jingles source).
  - **Failover chain**: `fallback(track_sensitive=false, [ live_or_requests, autodj, mksafe(emergency_playlist) ])` so there is never dead air.
  - **Metadata hook**: `on_metadata` posts `{ title, artist, album, source }` to `POST /api/v1/playout/metadata` (internal secret) so the API caches now-playing and writes `PlayHistory`.
  - Liquidsoap **command server** (telnet/HTTP) enabled for the API to push requests, skip, reload rotation.
- Node endpoints:
  - `GET /api/v1/playout/next` (called by Liquidsoap `request.dynamic`) → returns the next track file path honoring rotation rules.
  - `POST /api/v1/playout/metadata` (internal) → updates now-playing cache + `PlayHistory`.
  - `GET /playout/nowplaying` (public, **already consumed by the frontend**) → `{ album, artist, title, thumb }`.
  - `GET /api/v1/playout/status` → `{ source, listeners, uptime, currentTrack, autopilot }`.

**Inputs**
- Liquidsoap → API: `GET /api/v1/playout/next`, `POST /api/v1/playout/metadata`.
- API → Liquidsoap: telnet commands (`request.push <uri>`, `<source>.skip`, `rotation.reload`).

**Outputs**
- Continuous AutoDJ stream on Icecast `/stream` with smooth crossfades and correct loudness.
- `GET /playout/nowplaying` returns live, accurate metadata that the existing web/mobile players render.

**Key files**
- `RadyoKlasik/infra/liquidsoap/radio.liq` (rotation, crossfade, failover, jingles, metadata hook, command server)
- `RadyoKlasik/RadyoKlasikServer/controllers/playoutController.js`
- `RadyoKlasik/RadyoKlasikServer/services/liquidsoapClient.js` (telnet/HTTP command wrapper)
- `RadyoKlasik/RadyoKlasikServer/routes/playoutRoutes.js`

**Testing**
- Unit: `liquidsoapClient` formats/sends commands (mock socket); `/playout/next` rotation logic (no immediate repeats, jingle cadence).
- Integration: bring up stack with a seeded library; assert stream stays up for 5 min; `nowplaying` changes per track; killing the rotation source falls back to emergency playlist (no dead air); metadata POST writes `PlayHistory`.
- Manual: listen for crossfades + jingle insertion; confirm loudness is consistent across tracks.

---

## Phase 3 — Queue & request management

**Objective**: Reproduce the Virtual Studio **NEXT/queue** panel and the **Add** action: operators queue specific tracks to play next, reorder, remove, and skip; toggle autopilot.

**Scope / functionality**
- A Liquidsoap `request.queue` (or `request.equeue`) spliced ahead of AutoDJ in the fallback chain so queued items play before rotation resumes.
- API queue model mirrored in the DB (`QueueItem`: trackId, position, requestedBy, status) kept in sync with Liquidsoap.
- Endpoints:
  - `GET /api/v1/queue` → ordered upcoming items + the currently playing item.
  - `POST /api/v1/queue` → `{ trackId, position? }` pushes to Liquidsoap request queue.
  - `PATCH /api/v1/queue/reorder` → `{ orderedIds: [] }`.
  - `DELETE /api/v1/queue/:id` → remove a queued item.
  - `POST /api/v1/playout/skip` → skip current track.
  - `POST /api/v1/playout/autopilot` → `{ enabled: boolean }` (when off, only queued/live content plays; when empty + off, failover keeps air alive per policy).
- Real-time updates over WebSocket (`/ws/studio`) so the studio queue panel updates live.

**Inputs**
- `POST /api/v1/queue { trackId }`, `PATCH /api/v1/queue/reorder { orderedIds }`, `DELETE /api/v1/queue/:id`, `POST /api/v1/playout/skip`, `POST /api/v1/playout/autopilot { enabled }`.

**Outputs**
- `GET /api/v1/queue` → `{ nowPlaying: Track, items: [{ id, track, requestedBy, addedAt }] }`.
- WS event `queue:update` broadcast on any change.

**Key files**
- `RadyoKlasik/RadyoKlasikServer/controllers/queueController.js`
- `RadyoKlasik/RadyoKlasikServer/services/queueSync.js` (DB ↔ Liquidsoap reconciliation)
- `RadyoKlasik/RadyoKlasikServer/ws/studioSocket.js`
- `infra/liquidsoap/radio.liq` (add `request.queue` to fallback chain)

**Testing**
- Unit: reorder logic; queue→Liquidsoap command mapping.
- Integration: add 3 tracks → they play in order ahead of rotation; reorder reflected; skip advances; autopilot off + empty queue → failover policy holds; WS clients receive `queue:update`.
- Manual: drive the queue from a REST client and hear the order change live.

---

## Phase 4 — Live DJ: Virtual Studio engine (WebRTC mic over music)

> The most important phase. Reproduce RadioJar's Virtual Studio audio behavior: a DJ talks over the music live; music **ducks** under voice; the live source can **take over** the stream; if the DJ disconnects, **AutoDJ resumes with no dead air**.

**Objective**: Browser microphone → server → mixed into the live Icecast stream, with voice-activated ducking and seamless live/auto handoff.

**Scope / functionality**
- **Ingest path**: Studio browser captures mic via `getUserMedia`, encodes Opus, sends to a Node **WebRTC/WHIP ingest** (or WebSocket PCM/Opus fallback). Node bridges audio to Liquidsoap `input.harbor` (Icecast SOURCE protocol) via ffmpeg, OR Liquidsoap consumes an SRT/WHIP input directly. Recommended v1: browser → WS (Opus) → Node → ffmpeg → `input.harbor` mount `/live`.
- **Live takeover**: `fallback(track_sensitive=false, [ input.harbor("/live"), queue, autodj, emergency ])`. When `/live` is active it overrides AutoDJ with a crossfade; on disconnect, fallback returns to queue/AutoDJ.
- **Voice-over ducking** (talk over music, not replace it): when DJ is in "voice-over" mode, the AutoDJ/music source continues but is **amplified down** while the mic is active. Implement side-chain ducking in Liquidsoap (`amplify` driven by a mic level/RMS gate) so music dips to a configurable level (per-DJ preference) under voice and rises when silent — exactly RadioJar's auto compressor behavior.
- **Modes**: (a) full live takeover (mic replaces music), (b) voice-over (mic + ducked music), toggled in the studio (`Autofeed ON/OFF` in the screenshot).
- **Monitoring**: studio plays the current air feed (with `Deck Out`/`Listen` toggle), shows the live waveform + remaining time of current track (screenshot), `Autoplay` toggle, output volume.
- **Per-DJ mic preferences**: input device, input gain, silence threshold, voice-over duck level, timeout — stored on `User.micPreferencesJson` (from Phase 1) and applied at connect.
- **Resilience**: if the studio WS/WebRTC drops, Liquidsoap fails back to AutoDJ within a configurable timeout; the DJ can reconnect and resume.

**Inputs**
- WS/WebRTC ingest stream from the studio (Opus frames) + control messages `{ mode: "live"|"voiceover", duckLevel, micGain }`.
- `POST /api/v1/studio/session/start` / `stop` → reserves the `/live` mount, returns ingest credentials/endpoint.

**Outputs**
- Live audio mixed into Icecast `/stream`; `GET /playout/nowplaying` shows the live show metadata (DJ/show name) while live.
- WS `studio:state` events (`onAir`, `mode`, `levels`).

**Key files**
- `RadyoKlasik/RadyoKlasikServer/ws/ingest.js` (WebRTC/WS audio ingest → ffmpeg → harbor)
- `RadyoKlasik/RadyoKlasikServer/services/liveSession.js`
- `infra/liquidsoap/radio.liq` (`input.harbor`, ducking, live fallback)
- Studio client audio module (Phase 5 UI) — `src/app/studio/audio/*`

**Testing**
- Unit: ducking gain function; session state machine (idle→live→voiceover→idle); fallback timeout config.
- Integration: connect a synthetic Opus source → `/live` overrides AutoDJ within crossfade window; disconnect → AutoDJ resumes < timeout with no dead air; voice-over mode ducks music to target dB then restores; nowplaying reflects live show.
- Manual acceptance: talk into the mic on the studio page, hear music duck under voice and restore; switch to full-live and back; pull the network and confirm AutoDJ saves the air.

---

## Phase 5 — DJ host dashboard / panel (Next.js)

> Build the operator UI matching the provided screenshots: (a) **General Dashboard**, (b) **Media Library / Upload**, (c) **Virtual Studio**. This phase wires the UIs to Phases 1–4 + 6.

**Objective**: A polished, authenticated DJ/admin web app reproducing the RadioJar operator experience.

**Scope / functionality** (a separate Next.js app `radyo-klasik-studio`, or `/studio` routes in the existing web app — recommend separate app for auth isolation)
- **Auth & roles**: login, JWT with `role`, route guards (`admin` sees everything; `dj` sees studio + library + own shows; `guest` time-boxed studio access).
- **General Dashboard** (screenshot 1): online listeners + countries (live from Phase 6), world map heat, average connections, average listening time, **last played tracks**, **broadcast link settings** (host/port/mount/credentials surfaced read-only), today/yesterday comparison.
- **Media Library / Upload** (screenshot 6): paginated table (artist/title/album/duration/tags), type filters (All/Songs/Jingles/Commercials), artists/albums/playlists/tags counts, total size, search, bulk select → edit/delete/tag/playlist, **Upload tracks** modal with drag-drop + progress, artwork management. Backed by Phase 1.
- **Virtual Studio** (screenshot 4) — the centerpiece:
  - Top bar: ON AIR indicator + current time, **Autofeed ON/OFF**, Lobby/Facebook toggles (stub the social ones), settings gear, **LISTEN** monitor toggle.
  - Now-playing card: artwork, title/artist, **live waveform** + elapsed/remaining, transport (play/pause/next).
  - Center controls: **Autoplay** toggle, **Deck Out**, output volume slider, **mic on/off** button.
  - Left: **Stations library** browser with tabs (All/Songs/Jingles/Commercials), **search**, **+Add** to queue, per-row "add to queue" / "play next".
  - Right: **queue panel** (NEXT + upcoming) with drag-reorder, remove, source badges (USER/BREAK), backed by Phase 3 + live WS updates.
- **Analytics page** (screenshot 2,3,5): Listeners, Track reports, Monthly tracks tabs; charts (sessions, listening minutes, GB, device, regional map, hourly table); period selector; export. Backed by Phase 6.
- **Scheduling & DJ management** pages — UI shells here, logic in Phase 7.

**Inputs/Outputs**: consumes all `/api/v1/*` endpoints from Phases 1–4 & 6; subscribes to `/ws/studio` for queue + studio state.

**Key files**
- `radyo-klasik-studio/` (new Next.js app) or `radyo-klasik-web/src/app/studio/*`
- Components: `StudioPlayer`, `Waveform`, `LibraryBrowser`, `QueuePanel`, `TransportControls`, `MicControl`, `DashboardStats`, `AnalyticsCharts`.

**Testing**
- Unit/component: queue drag-reorder calls correct API; mic toggle drives studio session; library filters/search; auth guards redirect by role.
- Integration (Playwright): login → upload track → it appears in library → add to queue → see it in NEXT panel → skip → nowplaying updates; go on air → ON AIR indicator lights.
- Manual acceptance: side-by-side with the screenshots, confirm each control exists and works.

---

## Phase 6 — Analytics & reporting

**Objective**: Reproduce RadioJar's analytics (screenshots 2,3,5): listeners over time, total sessions, listening minutes/hours, GBs, **regional** (country) stats with map, **hourly** stats, **device** stats, **track reports**, **monthly tracks**, with period selection and export.

**Scope / functionality**
- **Collector**: poll Icecast `admin/stats` (or `status-json.xsl`) for live listener count + per-connection data; capture connect/disconnect events (Icecast access log tailing or mount stats) to build **sessions** with duration, bytes, IP → **GeoIP** (MaxMind GeoLite2) for country, **User-Agent** parsing for device (iPhone/Android/iPad/Desktop, matching screenshot 5).
- **Storage**: `ListenerSession` (id, mount, ip, country, device, startedAt, endedAt, durationSec, bytes), aggregated rollups (`hourly`, `daily`) for fast queries.
- **Track reports**: from `PlayHistory` (Phase 2) — most played, by period, monthly.
- Endpoints:
  - `GET /api/v1/analytics/listeners?period=today|yesterday|7d|30d` → time series + KPIs (avg sessions/hour, total sessions, avg listening minutes, total listening hours, total GB).
  - `GET /api/v1/analytics/regional?period=` → `[{ country, sessions, uniqueIps, tlh, pct }]`.
  - `GET /api/v1/analytics/hourly?period=` → per-hour rows.
  - `GET /api/v1/analytics/devices?period=` → `[{ device, sessions, avgMinutes, pct }]`.
  - `GET /api/v1/analytics/tracks?period=` and `.../tracks/monthly`.
  - `GET /api/v1/analytics/export?type=&period=&format=csv`.

**Inputs**: period query params; internal Icecast stats credentials.

**Outputs**: JSON series + KPI objects feeding the dashboard/analytics charts; CSV export.

**Key files**
- `RadyoKlasik/RadyoKlasikServer/services/icecastStats.js` (poller)
- `RadyoKlasik/RadyoKlasikServer/services/geoip.js`, `userAgent.js`
- `RadyoKlasik/RadyoKlasikServer/models/listenerSession.js` + rollup models/migrations
- `RadyoKlasik/RadyoKlasikServer/controllers/analyticsController.js`
- `RadyoKlasik/RadyoKlasikServer/jobs/aggregateAnalytics.js` (cron)

**Testing**
- Unit: UA→device classification; GeoIP lookup; session duration math; rollup aggregation.
- Integration: feed synthetic Icecast stats + access log → sessions created; regional/hourly/device endpoints return correct aggregates; export produces valid CSV.
- Manual: generate a few listeners, confirm online count + country map + device split look right.

---

## Phase 7 — Scheduling, autopilot & DJ management

**Objective**: Reproduce RadioJar's autopilots/schedules/breaks + **DJ & shows management** (drag-and-drop scheduling, access control, per-DJ preferences, collaborative shows, show/episode profiles).

**Scope / functionality**
- **Scheduler**: time-based playlist/show scheduling. `ScheduleSlot` (showId or playlistId, dayOfWeek/RRULE, startTime, endTime, priority). A scheduler service computes the active source and instructs Liquidsoap (`switch` predicates by time, or API-driven rotation swap).
- **Breaks/jingles automation**: configurable cadence + scheduled breaks; commercials rotation.
- **Shows & episodes**: `Show` (title, tagline, logo, cover), `Episode`; assign DJs to shows; show profile editing (matches DJ Management features).
- **DJ management**: create users with roles; **access control** so a DJ can only go live during their scheduled slot or with a granted window (guest one-time tokens); per-DJ mic preferences (used in Phase 4).
- **Autopilot policy**: when no live show and autopilot on → AutoDJ; scheduled playlist overrides default rotation during its window.
- Endpoints: `CRUD /api/v1/shows`, `/api/v1/schedule`, `/api/v1/users` (admin), `POST /api/v1/users/:id/guest-token`.

**Inputs**: schedule CRUD payloads (RRULE-based), show/episode payloads (multipart for logo/cover), user CRUD.

**Outputs**: active-schedule resolution feeding playout; DJ access decisions enforced at studio session start (Phase 4 checks schedule).

**Key files**
- `RadyoKlasik/RadyoKlasikServer/controllers/{showController,scheduleController,userController}.js`
- `RadyoKlasik/RadyoKlasikServer/services/scheduler.js`
- `infra/liquidsoap/radio.liq` (time-based `switch`)
- Studio UI: calendar/drag-drop scheduling pages (Phase 5 shells filled in).

**Testing**
- Unit: RRULE expansion; active-slot resolution at a given timestamp; access-window enforcement.
- Integration: schedule a playlist for a window → it airs in that window then reverts; DJ outside window denied live; guest token grants one-time access then expires.
- Manual: drag a show onto the calendar, confirm it airs on schedule.

---

## Phase 8 — Listener frontend & mobile integration

**Objective**: Point the existing public listener apps fully at the self-hosted stack and remove RadioJar fallbacks.

**Scope / functionality**
- `radyo-klasik-web`: confirm `NEXT_PUBLIC_STREAM_URL` → Icecast mount; remove RadioJar fallback in `Player.tsx`; ensure `/playout/nowplaying` (Phase 2) drives `NowPlayingContext`; verify chat/recordings still work; add HD/standard mount selector if multi-bitrate.
- Mobile app: update stream URL + `now_playing` source from RadioJar API to our `/playout/nowplaying`.
- Keep the existing **recording** feature but record from our Icecast mount instead of `stream.radiojar.com` (update `record.js` source URL/env).

**Inputs/Outputs**: same frontend contracts; only stream + nowplaying sources change.

**Key files**
- `radyo-klasik-web/src/app/components/Player.tsx`, `context/NowPlayingContext.tsx`, `.env`
- `RadyoKlasik/RadyoKlasikServer/record.js` (record from self-hosted mount)
- `RadyoKlasikMobile/app/index.tsx`

**Testing**
- Integration: web + mobile play self-hosted stream; nowplaying matches air; recording captures the self-hosted stream and saves correctly.
- Manual: full listen-through on web + mobile with no RadioJar references in network calls.

---

## Phase 9 — Hardening, scaling, observability & deployment

**Objective**: Production-readiness matching RadioJar's "infinite scale / no single point of failure / multiple encodings / stream protection".

**Scope / functionality**
- **Multi-bitrate / multi-codec**: Liquidsoap outputs MP3 128k, AAC 192k, and **HLS** (`output.file.hls`) served via Caddy/CDN; Icecast relays for scale.
- **Stream protection / listener management**: optional token-authenticated mounts; geo/role limits.
- **Observability**: structured logs (winston already present), Prometheus metrics (listeners, source up/down, queue depth), alerting (dead-air, source disconnect), Icecast + Liquidsoap health probes.
- **Backups**: Postgres dumps + media volume snapshots; restore runbook.
- **Security**: rotate Icecast/source passwords, secrets via env/secret store, rate limiting, CORS lockdown, audit the `upload_artwork`/`delete_all_notification_tokens` auth gaps noted in the current backend.
- **CI/CD**: build/test pipeline; deploy Compose to VPS; zero-downtime reload of Liquidsoap config.
- **Load test**: simulate N listeners; verify Icecast/CDN scaling.

**Key files**
- `infra/docker-compose.prod.yml`, `infra/caddy/Caddyfile` (HLS + CDN), `infra/liquidsoap/radio.liq` (multi-encoder + HLS)
- `RadyoKlasik/RadyoKlasikServer/metrics/*`, `.github/workflows/*`

**Testing**
- Integration: all mounts + HLS playable; metrics endpoint exposes expected gauges; backup→restore round-trip succeeds.
- Load: k6/locust simulate listeners; assert stable under target concurrency.
- Manual: chaos test (kill Liquidsoap, kill source) → alerts fire, failover holds.

---

## Phase 10 — Cutover & RadioJar decommission

**Objective**: Migrate production to self-hosted and retire RadioJar.

**Scope / functionality**
- Migrate existing media/metadata into the new library (if any lives in RadioJar) and seed rotation.
- DNS: point `stream.radyoklasik.online` at the VPS Icecast/CDN; confirm web (`NEXT_PUBLIC_STREAM_URL`) + mobile already target it.
- Parallel-run window: keep RadioJar as emergency fallback for a defined period, then disable.
- Final acceptance against the full RadioJar feature checklist below; cancel RadioJar.

**Testing**
- Full end-to-end production smoke: AutoDJ airs, DJ goes live with mic-over-music, queue/skip work, analytics populate, scheduled show airs, listeners on web + mobile, recordings save.

---

## RadioJar feature parity checklist (acceptance criteria)

- [ ] Continuous AutoDJ playout with crossfades and loudness normalization (Phase 2)
- [x] Media library: songs, jingles, commercials, artists, albums, playlists, tags, search, paging, total size (Phase 1 ✅ backend/API; Phase 5 UI)
- [x] Upload tracks (drag-drop + metadata + artwork + waveform) (Phase 1 ✅ ingest: metadata/artwork/waveform/loudness; Phase 5 drag-drop UI)
- [ ] Queue / request management: add, reorder, remove, skip, play-next (Phase 3, 5)
- [ ] Virtual Studio: browser mic broadcasting, **voice-over ducking**, live takeover, monitoring, transport, autoplay/autofeed toggles (Phase 4, 5)
- [ ] Dead-air failover / cloud automation when DJ disconnects (Phase 2, 4)
- [ ] DJ & shows management: roles, access control, guest DJs, per-DJ mic prefs, show/episode profiles, collaborative shows (Phase 7)
- [ ] Scheduling / autopilots / breaks (Phase 7)
- [ ] Analytics: listeners, sessions, listening time, GB, regional map, hourly, device, track reports, monthly, export (Phase 6)
- [ ] Multiple stream outputs / encodings + scaling + stream protection (Phase 9)
- [ ] Broadcast link settings surfaced (host/port/mount/credentials) (Phase 5)
- [ ] Public listener web + mobile fully on self-hosted stream + nowplaying (Phase 8)
- [ ] Recording of the live stream preserved (Phase 8)

## Dependency order (run phases sequentially)
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Phases 5 and 6 can overlap once their backing APIs (1–4 / 6 collector) exist; everything else is strictly sequential.
