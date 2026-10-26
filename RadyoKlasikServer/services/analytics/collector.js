const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const { Op } = require("sequelize");
const icecastStatus = require("../icecastStatus");
const {
  deviceFromUserAgent,
  countryFromIp,
  hashIp,
  durationFromBytes,
} = require("./classify");
const logger = require("../../logger");

// Phase 6 — listener analytics collection.
//
// Icecast 2.4 can't see a proxied listener's real IP (it has no
// X-Forwarded-For support), so sessions come from two places:
//   1. Caddy's stream access log (CADDY_STREAM_LOG): every listener that came
//      through the HTTPS proxy, with real client IP, user agent and bytes —
//      written when the session ends.
//   2. Icecast's client list (admin/listclients): listeners connected
//      directly (not via Caddy). Tracked live and closed when they leave.
//      Clients whose IP is the proxy (STREAM_PROXY_IP) are skipped here
//      because the Caddy log covers them.
// Plus a once-a-minute snapshot of the Icecast listener count.

const MIN_SESSION_SEC = Number(process.env.ANALYTICS_MIN_SESSION_SEC || 5);
const STREAM_PATH_RE = /^\/stream[\w-]*(\?|$)/;

function models() {
  return require("../../models");
}

// --- Caddy access log -------------------------------------------------------

// Parse one Caddy JSON access-log line into a session row, or null when it's
// not a listening session (other paths, errors, sub-MIN_SESSION_SEC probes).
function sessionFromCaddyLine(line) {
  let d;
  try {
    d = JSON.parse(line);
  } catch (_) {
    return null;
  }
  const r = d && d.request;
  if (!r || r.method !== "GET" || d.status !== 200) return null;
  const uri = String(r.uri || "");
  if (!STREAM_PATH_RE.test(uri)) return null;

  const bytes = Number(d.size) || 0;
  // Caddy reports duration 0 for proxied streams, so fall back to bytes.
  const dur = Number(d.duration) > 1 ? Math.round(Number(d.duration)) : durationFromBytes(bytes);
  if (dur < MIN_SESSION_SEC) return null;

  const ip = r.client_ip || r.remote_ip || null;
  const ua = (r.headers && r.headers["User-Agent"] && r.headers["User-Agent"][0]) || null;
  const endedAt = new Date(Number(d.ts) * 1000);
  return {
    externalId: `caddy:${crypto.createHash("sha1").update(line).digest("hex")}`,
    source: "caddy",
    mount: uri.split("?")[0],
    ipHash: hashIp(ip),
    country: countryFromIp(ip),
    device: deviceFromUserAgent(ua),
    userAgent: ua ? ua.slice(0, 512) : null,
    startedAt: new Date(endedAt.getTime() - dur * 1000),
    endedAt,
    durationSec: dur,
    bytes,
  };
}

let logOffset = 0;
let partial = "";

// Read new lines from the Caddy log since the last call. Restarts read the
// file from the top; inserts are idempotent (unique externalId).
async function ingestCaddyLog(file = process.env.CADDY_STREAM_LOG) {
  if (!file) return 0;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (_) {
    return 0; // no log yet (no proxied listeners / not deployed behind Caddy)
  }
  if (stat.size < logOffset) {
    // Rotated: start the new file from the top.
    logOffset = 0;
    partial = "";
  }
  if (stat.size === logOffset) return 0;

  const fd = fs.openSync(file, "r");
  let chunk;
  try {
    const len = Math.min(stat.size - logOffset, 8 * 1024 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, logOffset);
    logOffset += len;
    chunk = partial + buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
  const lines = chunk.split("\n");
  partial = lines.pop(); // incomplete trailing line
  const rows = lines.map(sessionFromCaddyLine).filter(Boolean);
  if (rows.length) {
    await models().ListenerSession.bulkCreate(rows, { ignoreDuplicates: true });
  }
  return rows.length;
}

// --- Icecast direct clients ---------------------------------------------------

function icecastBase() {
  const host = process.env.ICECAST_HOST || "localhost";
  const port = process.env.ICECAST_PORT || 8000;
  return `http://${host}:${port}`;
}

// Parse admin/listclients XML into [{ id, ip, userAgent, connected }].
function parseListClients(xml) {
  const out = [];
  const re = /<listener>([\s\S]*?)<\/listener>/g;
  let m;
  const tag = (body, name) => {
    const t = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body);
    return t ? t[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : null;
  };
  while ((m = re.exec(xml))) {
    out.push({
      id: tag(m[1], "ID"),
      ip: tag(m[1], "IP"),
      userAgent: tag(m[1], "UserAgent"),
      connected: Number(tag(m[1], "Connected")) || 0,
    });
  }
  return out;
}

async function listClients(mount) {
  const password = process.env.ICECAST_ADMIN_PASSWORD;
  if (!password) return null;
  const { data } = await axios.get(`${icecastBase()}/admin/listclients`, {
    params: { mount },
    auth: { username: process.env.ICECAST_ADMIN_USER || "admin", password },
    timeout: 3000,
    responseType: "text",
  });
  return parseListClients(String(data));
}

async function mounts() {
  const data = await icecastStatus.getStatusJson();
  const src = data && data.icestats && data.icestats.source;
  const list = Array.isArray(src) ? src : src ? [src] : [];
  return list
    .map((s) => {
      try {
        return new URL(s.listenurl).pathname;
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

// Upsert open sessions for direct listeners and close the ones that left.
async function syncIcecastClients(now = new Date()) {
  const { ListenerSession } = models();
  const proxyIp = process.env.STREAM_PROXY_IP || null;
  const seen = new Set();
  for (const mount of await mounts()) {
    const clients = await listClients(mount);
    if (!clients) return; // no admin password configured
    for (const c of clients) {
      if (!c.id || (proxyIp && c.ip === proxyIp)) continue;
      // Minute-rounded start keeps the key stable across polls.
      const startMs = Math.floor((now.getTime() - c.connected * 1000) / 60000) * 60000;
      const externalId = `icecast:${mount}:${c.id}:${startMs}`;
      seen.add(externalId);
      const bytes = Math.round((c.connected * Number(process.env.STREAM_BITRATE_KBPS || 128) * 1000) / 8);
      const [row, created] = await ListenerSession.findOrCreate({
        where: { externalId },
        defaults: {
          externalId,
          source: "icecast",
          mount,
          ipHash: hashIp(c.ip),
          country: countryFromIp(c.ip),
          device: deviceFromUserAgent(c.userAgent),
          userAgent: c.userAgent ? c.userAgent.slice(0, 512) : null,
          startedAt: new Date(startMs),
          durationSec: c.connected,
          bytes,
        },
      });
      if (!created) await row.update({ durationSec: c.connected, bytes });
    }
  }
  // Close open direct sessions that are no longer connected.
  const open = await ListenerSession.findAll({
    where: { source: "icecast", endedAt: null },
  });
  for (const row of open) {
    if (seen.has(row.externalId)) continue;
    const endedAt = new Date(row.startedAt.getTime() + row.durationSec * 1000);
    if (row.durationSec < MIN_SESSION_SEC) await row.destroy();
    else await row.update({ endedAt });
  }
}

// --- Snapshots ---------------------------------------------------------------

async function snapshot(now = new Date()) {
  const listeners = await icecastStatus.getListenerCount();
  const at = new Date(Math.floor(now.getTime() / 60000) * 60000);
  await models().ListenerSnapshot.upsert({ at, listeners });
  return listeners;
}

// --- Scheduler ---------------------------------------------------------------

const timers = [];
function every(ms, fn, label) {
  const run = () =>
    fn().catch((err) => logger.warn(`analytics ${label} failed`, { error: String(err) }));
  run();
  const t = setInterval(run, ms);
  if (t.unref) t.unref();
  timers.push(t);
}

function start() {
  if (timers.length || process.env.ANALYTICS_ENABLED === "false") return;
  every(60000, () => snapshot(), "snapshot");
  every(Number(process.env.ANALYTICS_POLL_MS || 20000), () => syncIcecastClients(), "icecast poll");
  every(15000, () => ingestCaddyLog(), "caddy log");
  every(24 * 3600 * 1000, () => prune(), "prune");
  logger.info("analytics collector started");
}

function stop() {
  while (timers.length) clearInterval(timers.pop());
}

// Purge sessions older than the retention window (default 400 days).
async function prune(days = Number(process.env.ANALYTICS_RETENTION_DAYS || 400)) {
  const cutoff = new Date(Date.now() - days * 86400000);
  const { ListenerSession, ListenerSnapshot } = models();
  await ListenerSession.destroy({ where: { startedAt: { [Op.lt]: cutoff } } });
  await ListenerSnapshot.destroy({ where: { at: { [Op.lt]: cutoff } } });
}

function _resetCaddyOffset() {
  logOffset = 0;
  partial = "";
}

module.exports = {
  sessionFromCaddyLine,
  parseListClients,
  ingestCaddyLog,
  syncIcecastClients,
  snapshot,
  start,
  stop,
  prune,
  _resetCaddyOffset,
};
