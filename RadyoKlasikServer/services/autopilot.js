// In-memory autopilot flag. When ON (default), AutoDJ rotation feeds the stream
// via GET /api/v1/playout/next. When OFF, /playout/next returns 404 so the
// AutoDJ source produces nothing — only queued (and, later, live) content
// plays; with an empty queue the Liquidsoap failover chain keeps air alive on
// the emergency playlist. Intentionally not persisted (mirrors nowPlaying):
// the operator re-toggles after a restart; default comes from env.

let enabled = process.env.AUTOPILOT_DEFAULT !== "false";

function isEnabled() {
  return enabled;
}

function set(value) {
  enabled = !!value;
  return enabled;
}

module.exports = { isEnabled, set };
