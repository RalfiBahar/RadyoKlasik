// In-memory autopilot flag. When ON (default), AutoDJ rotation feeds the stream
// via GET /api/v1/playout/next. When OFF, /playout/next returns 404 so the
// AutoDJ source produces nothing — only queued (and live) content plays.
//
// The flag is also mirrored into Liquidsoap as the interactive bool
// `autopilot_on` (see syncToLiquidsoap), which gates the emergency failover to
// AUTOMATION only: with autopilot OFF and nothing queued/live, the playout
// chain falls through to mksafe blank (intentional off-air silence) instead of
// the emergency playlist. Intentionally not persisted (mirrors nowPlaying): the
// operator re-toggles after a restart; default comes from env.

const liquidsoap = require("./liquidsoapClient");
const logger = require("../logger");

let enabled = process.env.AUTOPILOT_DEFAULT !== "false";

function isEnabled() {
  return enabled;
}

function set(value) {
  enabled = !!value;
  return enabled;
}

// Mirror the current flag into Liquidsoap's `autopilot_on` interactive bool over
// telnet. Best-effort: the telnet server may be momentarily unavailable (e.g.
// during boot), so callers should not treat a failure as fatal.
async function syncToLiquidsoap() {
  await liquidsoap.setVar("autopilot_on", enabled);
  return enabled;
}

// Push the current flag with a few retries (telnet may not be ready right at
// API boot). Resolves once synced or after exhausting attempts (logged only).
async function syncToLiquidsoapWithRetry(attempts = 5, delayMs = 2000) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await syncToLiquidsoap();
      logger.info("autopilot synced to liquidsoap", { enabled });
      return true;
    } catch (err) {
      if (i === attempts - 1) {
        logger.warn("autopilot initial sync gave up", { error: String(err) });
        return false;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

module.exports = { isEnabled, set, syncToLiquidsoap, syncToLiquidsoapWithRetry };
