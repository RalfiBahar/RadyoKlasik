/** @type {import('next').NextConfig} */

// The panel is served under /panel on the API's own domain
// (api.radyoklasik.online/panel): Caddy sends /panel* here and every other
// path to the API, so in production the browser calls the API same-origin.
// In dev (localhost:3001/panel) the rewrites below proxy the API paths to the
// dockerized API on :8001. WebSockets connect to NEXT_PUBLIC_WS_URL, or to the
// page's own host when unset (production).
const API_URL = process.env.STUDIO_API_URL || "http://localhost:8001";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/panel";

// API paths the panel calls (new /api/v1 + the legacy recording/chat/push
// routes it now manages, and the thumbnails they reference).
const API_PATHS = ["api/v1", "auth", "playout", "media", "recording", "chat", "notification", "static"];

const nextConfig = {
  reactStrictMode: true,
  basePath: BASE_PATH,
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  // Phase 9: self-contained server bundle for the production container.
  output: "standalone",
  async rewrites() {
    return API_PATHS.map((p) => ({
      source: `/${p}/:path*`,
      destination: `${API_URL}/${p}/:path*`,
      // API paths live at the domain root, not under /panel.
      basePath: false,
    }));
  },
};

export default nextConfig;
