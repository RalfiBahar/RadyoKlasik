// In-memory now-playing cache. Populated by the Liquidsoap -> API metadata
// hook (POST /api/v1/playout/metadata) and read by the public
// GET /playout/nowplaying and GET /api/v1/playout/status endpoints.
//
// Intentionally NOT persisted: a single track-change is cheap to recompute and
// is re-pushed by Liquidsoap on the next track, so a process restart simply
// shows empty metadata until the next `on_track`. (No new migration needed.)

let current = null;
// Latest non-live (autodj/request) metadata seen while a live DJ is on air. The
// public now-playing shows the live show during a broadcast, but the music bed
// keeps advancing underneath; we stash it here so a live drop can instantly
// restore the correct now-playing (Phase 4 failback) instead of waiting for the
// next track boundary.
let shadow = null;

function normalize(meta = {}) {
  return {
    title: meta.title ?? null,
    artist: meta.artist ?? null,
    album: meta.album ?? null,
    thumb: meta.thumb ?? null,
    source: meta.source || "autodj",
    trackId: meta.trackId ?? null,
    startedAt: meta.startedAt || new Date().toISOString(),
  };
}

function set(meta = {}) {
  current = normalize(meta);
  return current;
}

function get() {
  return current;
}

// Remember the underlying music track while the public now-playing is held on
// the live show.
function setShadow(meta = {}) {
  shadow = normalize(meta);
  return shadow;
}

// On live failback, promote the stashed music metadata to current so the public
// now-playing immediately reflects the AutoDJ track that resumes the air.
function promoteShadow() {
  if (shadow) {
    current = shadow;
    shadow = null;
  }
  return current;
}

function clear() {
  current = null;
  shadow = null;
}

module.exports = { set, get, setShadow, promoteShadow, clear };
