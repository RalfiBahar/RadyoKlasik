/** @type {import('next').NextConfig} */

// The control-plane API (RadyoKlasikServer) base URL. In dev this is the
// dockerized API published on :8001; in prod it's api.radyoklasik.online.
// REST + media + auth are proxied through Next rewrites so the browser talks to
// the studio's own origin (no CORS), while WebSockets connect directly via
// NEXT_PUBLIC_WS_URL (see src/lib/ws.ts).
const API_URL = process.env.STUDIO_API_URL || "http://localhost:8001";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` },
      { source: "/auth/:path*", destination: `${API_URL}/auth/:path*` },
      { source: "/playout/:path*", destination: `${API_URL}/playout/:path*` },
      { source: "/media/:path*", destination: `${API_URL}/media/:path*` },
    ];
  },
};

export default nextConfig;
