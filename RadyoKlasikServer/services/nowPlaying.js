// In-memory now-playing cache. Populated by the Liquidsoap -> API metadata
// hook (POST /api/v1/playout/metadata) and read by the public
// GET /playout/nowplaying and GET /api/v1/playout/status endpoints.
//
// Intentionally NOT persisted: a single track-change is cheap to recompute and
// is re-pushed by Liquidsoap on the next track, so a process restart simply
// shows empty metadata until the next `on_track`. (No new migration needed.)

let current = null;

function set(meta = {}) {
  current = {
    title: meta.title ?? null,
    artist: meta.artist ?? null,
    album: meta.album ?? null,
    thumb: meta.thumb ?? null,
    source: meta.source || "autodj",
    trackId: meta.trackId ?? null,
    startedAt: meta.startedAt || new Date().toISOString(),
  };
  return current;
}

function get() {
  return current;
}

function clear() {
  current = null;
}

module.exports = { set, get, clear };
