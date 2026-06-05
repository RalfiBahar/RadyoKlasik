# Radyo Klasik Studio (Phase 5)

The self-hosted **DJ host dashboard / operator panel** for Radyo Klasik — a
Next.js 14 (App Router) + TypeScript + Tailwind app that reproduces the RadioJar
operator experience: **General Dashboard**, **Media Library / Upload**, and the
**Virtual Studio** (live mic-over-music broadcasting), plus Analytics and
Scheduling shells.

It is a separate app from the public listener frontend (`radyo-klasik-web`) to
keep the listener bundle small and isolate operator auth.

## Architecture

- **REST + media + auth** are proxied through Next rewrites (`next.config.mjs`)
  to the control-plane API (`RadyoKlasikServer`), so the browser is same-origin
  (no CORS). Configure the target with `STUDIO_API_URL`.
- **WebSockets** (`/ws/studio`, `/ws/ingest`) connect directly to the API via
  `NEXT_PUBLIC_WS_URL` (WS upgrades aren't proxied by Next rewrites).
- **Auth**: `POST /auth/generate_token { shared_secret }` → JWT (stored in
  `localStorage`). The backend JWT has no role claim yet (Phase 7), so the chosen
  role (admin/dj/guest) is stored client-side and enforced by route guards
  (`src/lib/permissions.ts`).

## Backing APIs by page

| Page          | APIs                                                                 |
| ------------- | ------------------------------------------------------------------- |
| Dashboard     | `GET /api/v1/playout/status`, `GET /playout/nowplaying`             |
| Media Library | `GET/POST/PATCH/DELETE /api/v1/library/tracks`, `/bulk`, waveform   |
| Virtual Studio| `/api/v1/queue*`, `/api/v1/playout/{skip,autopilot}`, `/api/v1/studio/session*`, `/ws/studio`, `/ws/ingest` |
| Analytics     | Phase 6 (UI shell only)                                             |
| Scheduling/DJs| Phase 7 (UI shells only)                                            |

## Develop

```bash
cp .env.example .env.local            # edit STUDIO_API_URL / NEXT_PUBLIC_WS_URL
npm install
npm run dev                            # http://localhost:3001
```

Requires the backend stack running (`cd ../infra && docker compose up`). Log in
with the dev shared secret `dev-shared`.

## Test

```bash
npm test          # vitest (unit + component)
npm run build     # production build / typecheck
```
