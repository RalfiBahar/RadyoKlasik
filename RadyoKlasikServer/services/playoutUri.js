const path = require("path");
const { MEDIA_DIR } = require("../config/storage");

// Shared builder for the Liquidsoap `annotate:` URIs used by both AutoDJ
// rotation (GET /api/v1/playout/next) and the request queue (queueSync). Kept
// in its own module so the playout controller and the queue service can both
// use it without a circular dependency.

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
//
// opts.source  -> the playout source label (default "autodj"; "request" for
//                 queued items). NOTE: the `source` annotation key does not
//                 reliably round-trip through Liquidsoap, so the live source is
//                 actually fixed per on_track hook in radio.liq; it is still
//                 included here for completeness / debugging.
// opts.extra   -> additional annotate fields (e.g. { queue_item_id }). These
//                 custom keys DO round-trip and arrive as metadata.
function annotateUri(track, opts = {}) {
  const source = opts.source || "autodj";
  const extra = opts.extra || {};
  const abs = path.isAbsolute(track.filePath)
    ? track.filePath
    : path.join(MEDIA_DIR, track.filePath);
  const fields = {
    title: track.title || "",
    artist: track.artist || "",
    album: track.album || "",
    track_id: track.id,
    source,
    liq_amplify: replaygainToLinear(track.replaygain).toFixed(4),
    ...extra,
  };
  const annotation = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join(",");
  return `annotate:${annotation}:${abs}`;
}

module.exports = { replaygainToLinear, annotateUri };
