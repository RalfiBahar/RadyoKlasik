const path = require("path");
const axios = require("axios");

const { Track, PlayHistory } = require("../models");
const { MEDIA_DIR } = require("../config/storage");
const rotation = require("../services/rotation");
const nowPlaying = require("../services/nowPlaying");
const logger = require("../logger");

const PLAY_SOURCES = ["autodj", "live", "request"];

// Convert a Phase 1 ReplayGain value (dB to reach the reference loudness) into
// the linear multiplicative factor Liquidsoap's `amplify` operator expects via
// the `liq_amplify` annotation.
function replaygainToLinear(replaygain) {
  const db = Number(replaygain);
  if (replaygain == null || Number.isNaN(db)) return 1;
  return Math.pow(10, db / 20);
}

// Build the `annotate:` URI Liquidsoap plays. The annotation carries the
// metadata that round-trips back via the on_track hook (so the API can map the
// track and write PlayHistory) plus the per-track loudness normalization.
function annotateUri(track) {
  const abs = path.isAbsolute(track.filePath)
    ? track.filePath
    : path.join(MEDIA_DIR, track.filePath);
  const fields = {
    title: track.title || "",
    artist: track.artist || "",
    album: track.album || "",
    track_id: track.id,
    source: "autodj",
    liq_amplify: replaygainToLinear(track.replaygain).toFixed(4),
  };
  const annotation = Object.entries(fields)
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join(",");
  return `annotate:${annotation}:${abs}`;
}

// GET /api/v1/playout/next  (internal; called by Liquidsoap request.dynamic)
// Returns a single `annotate:` URI (text/plain) for the next track, or 404 +
// empty body when the library is empty (Liquidsoap then uses its fallback).
exports.next = async (req, res) => {
  try {
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
    autopilot: true,
  });
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
