const axios = require("axios");

const { Track, PlayHistory } = require("../models");
const rotation = require("../services/rotation");
const nowPlaying = require("../services/nowPlaying");
const autopilot = require("../services/autopilot");
const queueSync = require("../services/queueSync");
const { replaygainToLinear, annotateUri } = require("../services/playoutUri");
const logger = require("../logger");

const PLAY_SOURCES = ["autodj", "live", "request"];

// GET /api/v1/playout/next  (internal; called by Liquidsoap request.dynamic)
// Returns a single `annotate:` URI (text/plain) for the next track, or 404 +
// empty body when the library is empty OR autopilot is off (Liquidsoap then
// uses its fallback: queued items, else the emergency playlist).
exports.next = async (req, res) => {
  try {
    if (!autopilot.isEnabled()) {
      logger.info("playout/next: autopilot off, no rotation");
      return res.status(404).type("text/plain").send("");
    }
    const attributes = [
      "id",
      "title",
      "artist",
      "album",
      "type",
      "filePath",
      "replaygain",
    ];
    const [songs, jingles] = await Promise.all([
      Track.findAll({ where: { type: "song" }, attributes }),
      Track.findAll({ where: { type: "jingle" }, attributes }),
    ]);

    const { item, kind } = rotation.advance({ songs, jingles });
    if (!item) {
      logger.warn("playout/next: empty rotation (no tracks in library)");
      return res.status(404).type("text/plain").send("");
    }

    logger.info("playout/next selected", {
      id: item.id,
      kind,
      title: item.title,
    });
    return res.type("text/plain").send(annotateUri(item));
  } catch (err) {
    logger.error("playout/next failed", { error: String(err) });
    return res.status(500).type("text/plain").send("");
  }
};

// POST /api/v1/playout/metadata  (internal; called by Liquidsoap on_track)
// Caches now-playing and records a PlayHistory row for the track change.
exports.metadata = async (req, res) => {
  try {
    const body = req.body || {};
    const source = PLAY_SOURCES.includes(body.source) ? body.source : "autodj";
    const title = body.title || null;
    const artist = body.artist || null;
    const album = body.album || null;

    // Resolve the track (for artwork + a valid FK) when an id round-tripped.
    let trackId = body.track_id || body.trackId || null;
    let thumb = null;
    if (trackId) {
      const track = await Track.findByPk(trackId);
      if (track) {
        thumb = track.artworkPath ? `/media/${track.artworkPath}` : null;
      } else {
        trackId = null; // unknown id — avoid an FK violation on PlayHistory
      }
    }

    const np = nowPlaying.set({ title, artist, album, thumb, source, trackId });

    await PlayHistory.create({ trackId, source, startedAt: new Date() });
    if (trackId) {
      Track.increment("playCount", { where: { id: trackId } }).catch((err) =>
        logger.warn("playCount increment failed", { error: String(err) })
      );
    }

    // Phase 3: advance the queue mirror. Demote the previously-playing queued
    // item to "done" and, if this track is a queued item (queue_item_id round-
    // tripped through Liquidsoap), flip it to "playing", then push the fresh
    // queue state to studio WS clients.
    const queueItemId = body.queue_item_id || body.queueItemId || null;
    try {
      await queueSync.markStarted(queueItemId);
      await queueSync.broadcastUpdate();
    } catch (err) {
      logger.warn("queue markStarted failed", { error: String(err) });
    }

    logger.info("nowplaying updated", { title, artist, source });
    return res.json({ ok: true, nowPlaying: np });
  } catch (err) {
    logger.error("playout/metadata failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /playout/nowplaying  (public; consumed by the web + mobile players)
// Exact shape the frontend expects: { album, artist, title, thumb }.
exports.nowplaying = (req, res) => {
  const np = nowPlaying.get();
  return res.json({
    album: np ? np.album : null,
    artist: np ? np.artist : null,
    title: np ? np.title : null,
    thumb: np ? np.thumb : null,
  });
};

// GET /api/v1/playout/status  (operator; JWT-protected)
exports.status = async (req, res) => {
  const np = nowPlaying.get();
  let listeners = null;
  try {
    listeners = await getIcecastListeners();
  } catch (_) {
    listeners = null;
  }

  return res.json({
    source: np ? np.source : "autodj",
    listeners,
    uptime: Math.floor(process.uptime()),
    currentTrack: np
      ? {
          title: np.title,
          artist: np.artist,
          album: np.album,
          trackId: np.trackId,
          startedAt: np.startedAt,
        }
      : null,
    autopilot: autopilot.isEnabled(),
  });
};

// POST /api/v1/playout/skip  (operator; JWT) — skip the current track on air,
// whatever source (queue / AutoDJ / emergency) is playing.
exports.skip = async (req, res) => {
  try {
    const result = await queueSync.skipCurrent();
    logger.info("playout/skip", { result });
    return res.json({ ok: true });
  } catch (err) {
    logger.error("playout/skip failed", { error: String(err) });
    return res.status(502).json({ ok: false, error: String(err) });
  }
};

// POST /api/v1/playout/autopilot { enabled }  (operator; JWT)
// When disabled, AutoDJ rotation stops feeding the stream (GET /next 404s); the
// queue (and later live) still play, and the emergency failover holds the air
// when both are empty.
exports.autopilot = async (req, res) => {
  const body = req.body || {};
  if (typeof body.enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }
  autopilot.set(body.enabled);
  // Optionally cut the current AutoDJ track immediately when disabling so the
  // queue/failover takes over without waiting for the track to finish.
  if (!body.enabled && req.body.skipCurrent) {
    try {
      await queueSync.skipCurrent();
    } catch (err) {
      logger.warn("autopilot skip-on-disable failed", { error: String(err) });
    }
  }
  logger.info("playout/autopilot", { enabled: autopilot.isEnabled() });
  return res.json({ autopilot: autopilot.isEnabled() });
};

// Best-effort listener count from Icecast's public status JSON.
async function getIcecastListeners() {
  const host = process.env.ICECAST_HOST || "localhost";
  const port = process.env.ICECAST_PORT || 8000;
  const { data } = await axios.get(`http://${host}:${port}/status-json.xsl`, {
    timeout: 2000,
  });
  const source = data && data.icestats && data.icestats.source;
  if (!source) return 0;
  const sources = Array.isArray(source) ? source : [source];
  return sources.reduce((sum, s) => sum + (Number(s.listeners) || 0), 0);
}

exports.replaygainToLinear = replaygainToLinear;
exports.annotateUri = annotateUri;
