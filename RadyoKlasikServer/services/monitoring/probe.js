const fs = require("fs");
const path = require("path");
const { sequelize } = require("../../config/database");
const { checkTcp } = require("../healthChecks");
const icecastStatus = require("../icecastStatus");
const nowPlaying = require("../nowPlaying");
const autopilot = require("../autopilot");
const liveSession = require("../liveSession");
const { MEDIA_DIR } = require("../../config/storage");

// Phase 9 — one snapshot of station health, shared by the Prometheus metrics
// and the alerting loop. Never throws: anything unreachable reports as down.

const EXPECTED_MOUNTS = (process.env.EXPECTED_MOUNTS || "/stream,/stream-hd,/stream-low")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Seconds since HLS last wrote a playlist (null = HLS not visible). The master
// live.m3u8 is written once; the per-variant playlists change every segment,
// so the newest .m3u8 is what shows HLS is alive.
function hlsAgeSec(now = Date.now(), dir = process.env.HLS_DIR || "/var/hls") {
  try {
    const newest = Math.max(
      ...fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".m3u8"))
        .map((f) => fs.statSync(path.join(dir, f)).mtimeMs)
    );
    return Number.isFinite(newest) ? Math.round((now - newest) / 1000) : null;
  } catch (_) {
    return null;
  }
}

function diskFreePct(dir = MEDIA_DIR) {
  try {
    const s = fs.statfsSync(dir);
    return Math.round((100 * s.bavail) / s.blocks);
  } catch (_) {
    return null;
  }
}

async function probe() {
  const out = {
    at: new Date().toISOString(),
    db: false,
    icecast: false,
    liquidsoap: false,
    mounts: {}, // mount -> listeners (present = source connected)
    expectedMounts: EXPECTED_MOUNTS,
    missingMounts: [],
    hlsAgeSec: hlsAgeSec(),
    deadAir: nowPlaying.isSilent(),
    autopilot: autopilot.isEnabled(),
    liveOnAir: liveSession.isOnAir(),
    queueDepth: 0,
    diskFreePct: diskFreePct(),
    recordingUploadsFailed: 0,
  };

  const [db, icecast, liquidsoap] = await Promise.all([
    sequelize.authenticate().then(() => true, () => false),
    checkTcp(process.env.ICECAST_HOST || "localhost", process.env.ICECAST_PORT || 8000),
    checkTcp(process.env.LIQUIDSOAP_HOST || "localhost", process.env.LIQUIDSOAP_TELNET_PORT || 1234),
  ]);
  Object.assign(out, { db, icecast, liquidsoap });

  if (icecast) {
    try {
      const data = await icecastStatus.getStatusJson();
      const src = data && data.icestats && data.icestats.source;
      for (const s of Array.isArray(src) ? src : src ? [src] : []) {
        let mount;
        try {
          mount = new URL(s.listenurl).pathname;
        } catch (_) {
          continue;
        }
        out.mounts[mount] = Number(s.listeners) || 0;
      }
    } catch (_) {
      // icecast up but status unreadable: treat mounts as unknown/missing
    }
  }
  out.missingMounts = EXPECTED_MOUNTS.filter((m) => !(m in out.mounts));

  if (db) {
    try {
      const { QueueItem } = require("../../models");
      out.queueDepth = await QueueItem.count({ where: { status: "pending" } });
      // Recordings whose upload to R2 failed (still playable from disk).
      const { Recording } = require("../../models");
      const { Op } = require("sequelize");
      out.recordingUploadsFailed = await Recording.count({
        where: { storage: "pending", storageError: { [Op.ne]: null } },
      });
    } catch (_) {
      // ignore
    }
  }
  return out;
}

module.exports = { probe, hlsAgeSec, diskFreePct, EXPECTED_MOUNTS };
