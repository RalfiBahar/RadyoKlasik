const { QueryTypes } = require("sequelize");
const { sequelize } = require("../models");
const settings = require("../services/settings");
const logger = require("../logger");

// Phase 6 — analytics & reporting (RadioJar parity): listeners over time,
// sessions / listening time / GB, regional, hourly, devices, track reports,
// monthly tracks, CSV export. All periods are station-local (settings.timezone).

const PERIODS = new Set(["today", "yesterday", "7d", "30d"]);

// Resolve ?period= into a station-local [from, to) range + chart bucket.
// Accepts today | yesterday | 7d | 30d | YYYY-MM (a calendar month).
async function resolveRange(period = "today") {
  const tz = settings.get("timezone");
  let sql;
  let bucket = "hour";
  const month = /^\d{4}-\d{2}$/.test(period) ? period : null;
  if (month) {
    bucket = "day";
    sql = `SELECT (CAST(:month || '-01' AS timestamp) AT TIME ZONE :tz) AS "from",
                  ((CAST(:month || '-01' AS timestamp) + interval '1 month') AT TIME ZONE :tz) AS "to"`;
  } else {
    if (!PERIODS.has(period)) period = "today";
    const days = { today: [0, 1], yesterday: [-1, 0], "7d": [-6, 1], "30d": [-29, 1] }[period];
    if (period === "7d" || period === "30d") bucket = "day";
    sql = `SELECT ((date_trunc('day', now() AT TIME ZONE :tz) + make_interval(days => :d0)) AT TIME ZONE :tz) AS "from",
                  ((date_trunc('day', now() AT TIME ZONE :tz) + make_interval(days => :d1)) AT TIME ZONE :tz) AS "to"`;
    const [row] = await sequelize.query(sql, {
      replacements: { tz, d0: days[0], d1: days[1] },
      type: QueryTypes.SELECT,
    });
    return { ...row, bucket, tz, period };
  }
  const [row] = await sequelize.query(sql, {
    replacements: { tz, month },
    type: QueryTypes.SELECT,
  });
  return { ...row, bucket, tz, period: month };
}

function q(sql, replacements) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

const round = (n, d = 1) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d;

// Sessions that ENDED in the range, plus direct sessions still open (so a
// long-running listener isn't invisible until they leave).
const SESSION_WHERE = `(("endedAt" >= :from AND "endedAt" < :to)
  OR ("endedAt" IS NULL AND "startedAt" < :to))`;

async function listenersData(range) {
  const r = { from: range.from, to: range.to, tz: range.tz, bucket: range.bucket };
  const [series, [snap], [sess]] = await Promise.all([
    q(
      `SELECT date_trunc(:bucket, at AT TIME ZONE :tz) AS t,
              round(avg(listeners)::numeric, 2) AS avg, max(listeners) AS peak
         FROM "ListenerSnapshots" WHERE at >= :from AND at < :to
        GROUP BY 1 ORDER BY 1`,
      r
    ),
    q(
      `SELECT coalesce(max(listeners), 0) AS peak,
              coalesce(avg(listeners), 0) AS avg,
              coalesce(sum(listeners), 0) / 60.0 AS hours
         FROM "ListenerSnapshots" WHERE at >= :from AND at < :to`,
      r
    ),
    q(
      `SELECT count(*) AS sessions,
              count(DISTINCT "ipHash") AS unique,
              coalesce(avg("durationSec"), 0) / 60.0 AS "avgMinutes",
              coalesce(sum("durationSec"), 0) / 3600.0 AS hours,
              coalesce(sum(bytes), 0) / 1e9 AS gb
         FROM "ListenerSessions" WHERE ${SESSION_WHERE}`,
      r
    ),
  ]);
  const spanHours = Math.max(1, (new Date(range.to) - new Date(range.from)) / 3600000);
  return {
    period: range.period,
    from: range.from,
    to: range.to,
    bucket: range.bucket,
    timezone: range.tz,
    series: series.map((s) => ({
      t: s.t,
      avg: Number(s.avg),
      peak: Number(s.peak),
    })),
    kpis: {
      peakListeners: Number(snap.peak),
      avgListeners: round(snap.avg, 2),
      // Listening hours from the minute snapshots cover everyone, including
      // listeners whose session hasn't ended yet.
      listeningHours: round(snap.hours, 1),
      totalSessions: Number(sess.sessions),
      uniqueListeners: Number(sess.unique),
      avgSessionsPerHour: round(Number(sess.sessions) / spanHours, 2),
      avgListeningMinutes: round(sess.avgMinutes, 1),
      sessionHours: round(sess.hours, 1),
      totalGb: round(sess.gb, 3),
    },
  };
}

async function regionalData(range) {
  const rows = await q(
    `SELECT coalesce(country, '??') AS country, count(*) AS sessions,
            count(DISTINCT "ipHash") AS unique,
            coalesce(sum("durationSec"), 0) / 3600.0 AS hours
       FROM "ListenerSessions" WHERE ${SESSION_WHERE}
      GROUP BY 1 ORDER BY sessions DESC`,
    { from: range.from, to: range.to }
  );
  const total = rows.reduce((s, r) => s + Number(r.sessions), 0) || 1;
  return rows.map((r) => ({
    country: r.country === "??" ? null : r.country,
    sessions: Number(r.sessions),
    uniqueListeners: Number(r.unique),
    listeningHours: round(r.hours, 1),
    pct: round((100 * Number(r.sessions)) / total, 1),
  }));
}

async function hourlyData(range) {
  const r = { from: range.from, to: range.to, tz: range.tz };
  const [sess, snaps] = await Promise.all([
    q(
      `SELECT extract(hour FROM "startedAt" AT TIME ZONE :tz)::int AS hour,
              count(*) AS sessions,
              coalesce(avg("durationSec"), 0) / 60.0 AS "avgMinutes",
              coalesce(sum("durationSec"), 0) / 3600.0 AS hours
         FROM "ListenerSessions" WHERE ${SESSION_WHERE}
        GROUP BY 1`,
      r
    ),
    q(
      `SELECT extract(hour FROM at AT TIME ZONE :tz)::int AS hour,
              avg(listeners) AS avg, max(listeners) AS peak
         FROM "ListenerSnapshots" WHERE at >= :from AND at < :to
        GROUP BY 1`,
      r
    ),
  ]);
  const byHour = (list) => Object.fromEntries(list.map((x) => [x.hour, x]));
  const s = byHour(sess);
  const n = byHour(snaps);
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sessions: Number(s[hour]?.sessions || 0),
    avgListeningMinutes: round(s[hour]?.avgMinutes, 1),
    listeningHours: round(s[hour]?.hours, 1),
    avgListeners: round(n[hour]?.avg, 2),
    peakListeners: Number(n[hour]?.peak || 0),
  }));
}

async function devicesData(range) {
  const rows = await q(
    `SELECT coalesce(device, 'Unknown') AS device, count(*) AS sessions,
            coalesce(avg("durationSec"), 0) / 60.0 AS "avgMinutes"
       FROM "ListenerSessions" WHERE ${SESSION_WHERE}
      GROUP BY 1 ORDER BY sessions DESC`,
    { from: range.from, to: range.to }
  );
  const total = rows.reduce((s, r) => s + Number(r.sessions), 0) || 1;
  return rows.map((r) => ({
    device: r.device,
    sessions: Number(r.sessions),
    avgListeningMinutes: round(r.avgMinutes, 1),
    pct: round((100 * Number(r.sessions)) / total, 1),
  }));
}

async function tracksData(range, { type, limit = 100 } = {}) {
  const rows = await q(
    `SELECT t.id, t.title, t.artist, t.album, t.type, count(*) AS plays,
            max(ph."startedAt") AS "lastPlayed",
            sum(CASE WHEN ph.source = 'request' THEN 1 ELSE 0 END) AS requested
       FROM "PlayHistories" ph JOIN "Tracks" t ON t.id = ph."trackId"
      WHERE ph."startedAt" >= :from AND ph."startedAt" < :to
        ${type ? "AND t.type = :type" : ""}
      GROUP BY t.id ORDER BY plays DESC, "lastPlayed" DESC
      LIMIT :limit`,
    { from: range.from, to: range.to, type: type || null, limit }
  );
  return rows.map((r) => ({
    trackId: r.id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    type: r.type,
    plays: Number(r.plays),
    requested: Number(r.requested),
    lastPlayed: r.lastPlayed,
  }));
}

function handler(fn) {
  return async (req, res) => {
    try {
      const range = await resolveRange(String(req.query.period || "today"));
      return res.json(await fn(range, req));
    } catch (err) {
      logger.error("analytics query failed", { error: String(err) });
      return res.status(500).json({ error: String(err) });
    }
  };
}

// GET /api/v1/analytics/listeners?period=
exports.listeners = handler((range) => listenersData(range));
// GET /api/v1/analytics/regional?period=
exports.regional = handler(async (range) => ({ period: range.period, items: await regionalData(range) }));
// GET /api/v1/analytics/hourly?period=
exports.hourly = handler(async (range) => ({ period: range.period, items: await hourlyData(range) }));
// GET /api/v1/analytics/devices?period=
exports.devices = handler(async (range) => ({ period: range.period, items: await devicesData(range) }));
// GET /api/v1/analytics/tracks?period=&type=song
exports.tracks = handler(async (range, req) => ({
  period: range.period,
  items: await tracksData(range, { type: req.query.type || null }),
}));

// GET /api/v1/analytics/tracks/monthly?months=12 -> plays per month + top track
exports.monthly = async (req, res) => {
  try {
    const months = Math.min(36, Math.max(1, Number(req.query.months) || 12));
    const tz = settings.get("timezone");
    const rows = await q(
      `WITH m AS (
         SELECT to_char(ph."startedAt" AT TIME ZONE :tz, 'YYYY-MM') AS month,
                ph."trackId", count(*) AS plays
           FROM "PlayHistories" ph
          WHERE ph."startedAt" >= (date_trunc('month', now() AT TIME ZONE :tz)
                                   - make_interval(months => :months - 1)) AT TIME ZONE :tz
            AND ph."trackId" IS NOT NULL
          GROUP BY 1, 2)
       SELECT m.month, sum(m.plays) AS plays, count(*) AS "distinctTracks",
              (array_agg(t.title ORDER BY m.plays DESC))[1] AS "topTitle",
              (array_agg(t.artist ORDER BY m.plays DESC))[1] AS "topArtist",
              max(m.plays) AS "topPlays"
         FROM m JOIN "Tracks" t ON t.id = m."trackId"
        GROUP BY m.month ORDER BY m.month DESC`,
      { tz, months }
    );
    return res.json({
      items: rows.map((r) => ({
        month: r.month,
        plays: Number(r.plays),
        distinctTracks: Number(r.distinctTracks),
        topTrack: r.topTitle ? { title: r.topTitle, artist: r.topArtist, plays: Number(r.topPlays) } : null,
      })),
    });
  } catch (err) {
    logger.error("analytics monthly failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/analytics/live -> listeners now + recent countries/devices
exports.live = async (req, res) => {
  try {
    let listeners = null;
    try {
      listeners = await require("../services/analytics/collector").liveListeners();
    } catch (_) {
      listeners = null;
    }
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const countries = await q(
      `SELECT country, count(*) AS sessions FROM "ListenerSessions"
        WHERE (("endedAt" >= :since) OR "endedAt" IS NULL) AND country IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
      { since }
    );
    const recent = await q(
      `SELECT ph."startedAt", ph.source, t.title, t.artist, t.type
         FROM "PlayHistories" ph LEFT JOIN "Tracks" t ON t.id = ph."trackId"
        ORDER BY ph."startedAt" DESC LIMIT 10`,
      {}
    );
    return res.json({
      listeners,
      timezone: settings.get("timezone"),
      countries24h: countries.map((c) => ({ country: c.country, sessions: Number(c.sessions) })),
      lastPlayed: recent.map((r) => ({
        startedAt: r.startedAt,
        source: r.source,
        title: r.title || (r.source === "live" ? "Live show" : null),
        artist: r.artist || null,
        type: r.type || null,
      })),
    });
  } catch (err) {
    logger.error("analytics live failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// --- CSV export ----------------------------------------------------------------

function toCsv(rows, columns) {
  const esc = (v) => {
    if (v == null) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

// GET /api/v1/analytics/export?type=listeners|regional|hourly|devices|tracks&period=
exports.exportCsv = async (req, res) => {
  try {
    const type = String(req.query.type || "listeners");
    const range = await resolveRange(String(req.query.period || "today"));
    let rows;
    let columns;
    if (type === "regional") {
      rows = await regionalData(range);
      columns = ["country", "sessions", "uniqueListeners", "listeningHours", "pct"];
    } else if (type === "hourly") {
      rows = await hourlyData(range);
      columns = ["hour", "sessions", "avgListeningMinutes", "listeningHours", "avgListeners", "peakListeners"];
    } else if (type === "devices") {
      rows = await devicesData(range);
      columns = ["device", "sessions", "avgListeningMinutes", "pct"];
    } else if (type === "tracks") {
      rows = await tracksData(range, { limit: 1000 });
      columns = ["title", "artist", "album", "type", "plays", "requested", "lastPlayed"];
    } else {
      rows = (await listenersData(range)).series;
      columns = ["t", "avg", "peak"];
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="radyoklasik-${type}-${range.period}.csv"`
    );
    return res.send(toCsv(rows, columns));
  } catch (err) {
    logger.error("analytics export failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

exports.resolveRange = resolveRange;
exports.toCsv = toCsv;
