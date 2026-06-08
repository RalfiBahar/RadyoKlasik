// In-memory now-playing cache. Populated by the Liquidsoap -> API metadata
// hook (POST /api/v1/playout/metadata) and read by the public
// GET /playout/nowplaying and GET /api/v1/playout/status endpoints.
//
// Intentionally NOT persisted: a single track-change is cheap to recompute and
// is re-pushed by Liquidsoap on the next track, so a process restart simply
// shows empty metadata until the next `on_track`. (No new migration needed.)

let current = null;
// Dead-air flag: true while Liquidsoap reports the music bed is genuinely
// silent (autopilot off + empty queue + no live). When set, get() reports no
// now-playing so the studio deck / public player show nothing — but `current`
// is preserved so a transient dip (on_noise) can restore it without a track
// change. A real track (set) or a restart clears it.
let silent = false;
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
  silent = false; // real audio with metadata is on air
  return current;
}

function get() {
  return silent ? null : current;
}

// Flag/unflag dead air. Returns the effective now-playing after the change.
function setSilent(value) {
  silent = !!value;
  return get();
}

function isSilent() {
  return silent;
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
  silent = false;
  return get();
}

function clear() {
  current = null;
  shadow = null;
  silent = false;
}

module.exports = { set, get, setSilent, isSilent, setShadow, promoteShadow, clear };
