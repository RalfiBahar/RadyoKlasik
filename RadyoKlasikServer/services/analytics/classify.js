const crypto = require("crypto");

// Phase 6 — pure helpers for listener analytics: device classification from
// the User-Agent, GeoIP country, privacy-preserving IP hashing, and session
// length from streamed bytes.

// Device buckets matching RadioJar's device report.
function deviceFromUserAgent(ua) {
  const s = String(ua || "");
  if (!s) return "Unknown";
  if (/iPad/i.test(s)) return "iPad";
  if (/iPhone|iPod/i.test(s)) return "iPhone";
  if (/Android/i.test(s)) return "Android";
  // Native app / player clients that don't send a browser UA.
  if (/okhttp|ExoPlayer|Dalvik/i.test(s)) return "Android";
  if (/CFNetwork|AppleCoreMedia|Darwin/i.test(s)) {
    return /Macintosh|Mac OS X(?!.*Mobile)/i.test(s) && !/iPhone|iPad/i.test(s)
      ? "Desktop"
      : "iPhone";
  }
  if (/Windows|Macintosh|X11|Linux|CrOS/i.test(s)) return "Desktop";
  if (/VLC|Winamp|foobar|mpv|iTunes|Lavf|ffmpeg|curl|Wget/i.test(s)) return "Player";
  if (/SmartTV|Tizen|WebOS|Roku|AppleTV|Sonos|Alexa/i.test(s)) return "Smart speaker / TV";
  return "Other";
}

let geoip;
let geoipFailed = false;
// ISO country (e.g. "TR") or null for private / unknown addresses. geoip-lite
// is loaded lazily (it holds its database in memory) and is optional.
function countryFromIp(ip) {
  if (!ip || geoipFailed || process.env.GEOIP_ENABLED === "false") return null;
  if (!geoip) {
    try {
      geoip = require("geoip-lite");
    } catch (_) {
      geoipFailed = true;
      return null;
    }
  }
  const hit = geoip.lookup(String(ip).replace(/^::ffff:/, ""));
  return hit && hit.country ? hit.country : null;
}

// Salted hash so unique listeners can be counted without storing raw IPs.
function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.ANALYTICS_IP_SALT || process.env.SECRET_KEY || "rk";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

// Icecast sends an initial burst (default burst-size 64 KiB) before streaming
// in real time, so seconds ≈ (bytes - burst) / (bitrate / 8).
const BURST_BYTES = Number(process.env.ICECAST_BURST_BYTES || 65535);
function durationFromBytes(bytes, kbps = Number(process.env.STREAM_BITRATE_KBPS || 128)) {
  const b = Number(bytes) || 0;
  if (b <= 0 || !kbps) return 0;
  return Math.max(0, Math.round((b - BURST_BYTES) / ((kbps * 1000) / 8)));
}

module.exports = { deviceFromUserAgent, countryFromIp, hashIp, durationFromBytes };
