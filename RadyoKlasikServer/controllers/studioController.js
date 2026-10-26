const liveSession = require("../services/liveSession");
const scheduler = require("../services/scheduler");
const { ENV_ADMIN_ID } = require("../services/staffAuth");
const logger = require("../logger");

// Phase 4 — Virtual Studio live session control (operator; JWT-protected).
// Reserves/releases the Liquidsoap /live mount and returns the ingest endpoint
// the studio browser uses to bridge mic audio (ws/ingest.js).

// GET /api/v1/studio/access -> { allowed, reason, show } for the caller.
exports.access = async (req, res) => {
  try {
    return res.json(await scheduler.liveAccess(req.user));
  } catch (err) {
    logger.error("studio access check failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/studio/session/start { mode?, show?, dj? }
// The DJ identity comes from the staff token (per-DJ mic prefs, episode log);
// whether they may go live right now is decided by the schedule (Phase 7).
exports.start = async (req, res) => {
  try {
    const body = req.body || {};
    const mode = body.mode || liveSession.STATES.VOICEOVER;
    const access = await scheduler.liveAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ error: access.reason });
    }
    const user = req.user || {};
    const userId = user.id && user.id !== ENV_ADMIN_ID ? user.id : null;
    const result = await liveSession.start({
      userId,
      mode,
      show: body.show || (access.show && access.show.title) || null,
      showId: access.show ? access.show.id : null,
      dj: body.dj || user.name || null,
    });
    return res.status(201).json(result);
  } catch (err) {
    if (err.code === "SESSION_ACTIVE") {
      return res.status(409).json({ error: "a live session is already active" });
    }
    if (err.code === "INVALID_MODE" || err.code === "BAD_TRANSITION") {
      return res.status(400).json({ error: err.message });
    }
    logger.error("studio session start failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/studio/session/stop
exports.stop = async (req, res) => {
  try {
    const state = await liveSession.stop();
    return res.json(state);
  } catch (err) {
    logger.error("studio session stop failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/studio/session/mode { mode }
exports.mode = async (req, res) => {
  try {
    const { mode } = req.body || {};
    const state = await liveSession.setMode(mode);
    return res.json(state);
  } catch (err) {
    if (err.code === "BAD_TRANSITION") {
      return res.status(400).json({ error: err.message });
    }
    logger.error("studio session mode failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/studio/session — current live state.
exports.state = (req, res) => {
  return res.json(liveSession.getState());
};

module.exports = exports;
