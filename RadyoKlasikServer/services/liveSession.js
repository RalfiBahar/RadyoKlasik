const crypto = require("crypto");
const liquidsoap = require("./liquidsoapClient");
const nowPlaying = require("./nowPlaying");
const studioSocket = require("../ws/studioSocket");
const logger = require("../logger");

// Phase 4 — Live DJ session state machine + Liquidsoap control plane.
//
// A single live session at a time "reserves" the Liquidsoap input.harbor /live
// mount. The studio bridges mic audio over /ws/ingest (ws/ingest.js -> ffmpeg
// -> harbor). Liquidsoap tells us when the SOURCE actually connects/drops
// (POST /api/v1/playout/harbor) — the authoritative "audio is flowing" signal.
//
// Modes:
//   - "voiceover": music keeps playing but ducks under the mic (smooth_add in
//     radio.liq fades music to the per-DJ duck level while the DJ talks).
//   - "live": full takeover — the master music gain is cut to 0 so only the mic
//     is heard. On disconnect Liquidsoap resets the gain to 1.0 itself, so
//     AutoDJ resumes with no dead air even if the API is slow to react.
//
// The mode/duck/mic-gain are pushed to Liquidsoap as telnet interactive vars
// (var.set ...), so switching is instant and needs no script reload.

const STATES = Object.freeze({
  IDLE: "idle",
  LIVE: "live",
  VOICEOVER: "voiceover",
});

const MODES = new Set([STATES.LIVE, STATES.VOICEOVER]);

// Liquidsoap interactive var names (must match infra/liquidsoap/radio.liq).
const VAR_MUSIC_GAIN = "live_music_gain";
const VAR_DUCK = "live_duck";
const VAR_MIC_GAIN = "live_mic_gain";

const DEFAULT_DUCK = Number(process.env.LIVE_DUCK_LEVEL || 0.25);
const DEFAULT_THRESHOLD = Number(process.env.LIVE_SILENCE_THRESHOLD || 0.05);
const DEFAULT_TIMEOUT_MS = Number(process.env.LIVE_FALLBACK_TIMEOUT_MS || 8000);

// --- Pure helpers (unit-tested without the stack) -------------------------

// Validate a session state-machine transition. Returns the next state, or
// null if the transition is not allowed from the current state.
//   idle      --start(live)--------> live
//   idle      --start(voiceover)---> voiceover
//   live      --setMode(voiceover)-> voiceover
//   voiceover --setMode(live)------> live
//   live|vo   --stop---------------> idle
//   live|vo   --disconnect---------> idle   (failback after timeout)
function transition(state, event = {}) {
  const { type } = event;
  if (type === "start") {
    if (state !== STATES.IDLE) return null;
    return MODES.has(event.mode) ? event.mode : null;
  }
  if (type === "setMode") {
    if (state === STATES.IDLE) return null;
    return MODES.has(event.mode) ? event.mode : null;
  }
  if (type === "stop" || type === "disconnect") {
    return STATES.IDLE;
  }
  return null;
}

// Side-chain duck gain: while the mic level is above the silence threshold the
// music is held at `duckLevel`; otherwise it plays at full (1.0). This mirrors
// what smooth_add does in Liquidsoap and is exposed for the API/tests.
function duckGain(micLevel, { threshold = DEFAULT_THRESHOLD, duckLevel = DEFAULT_DUCK } = {}) {
  const level = Number(micLevel) || 0;
  return level >= threshold ? clamp01(duckLevel) : 1;
}

// Normalize a User.micPreferencesJson blob into the values we apply at connect.
function normalizePrefs(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  return {
    inputDeviceId: p.inputDeviceId || null,
    micGain: clampRange(numberOr(p.micGain, 1), 0, 4),
    duckLevel: clamp01(numberOr(p.duckLevel, DEFAULT_DUCK)),
    silenceThreshold: clamp01(numberOr(p.silenceThreshold, DEFAULT_THRESHOLD)),
    timeoutMs: Math.max(1000, numberOr(p.timeoutMs, DEFAULT_TIMEOUT_MS)),
  };
}

// Liquidsoap interactive-var values for a given mode + prefs.
function modeVars(mode, prefs = {}) {
  const duck = clamp01(numberOr(prefs.duckLevel, DEFAULT_DUCK));
  const micGain = clampRange(numberOr(prefs.micGain, 1), 0, 4);
  if (mode === STATES.LIVE) {
    // Full takeover: cut the music bed entirely.
    return { [VAR_MUSIC_GAIN]: 0, [VAR_DUCK]: duck, [VAR_MIC_GAIN]: micGain };
  }
  if (mode === STATES.VOICEOVER) {
    return { [VAR_MUSIC_GAIN]: 1, [VAR_DUCK]: duck, [VAR_MIC_GAIN]: micGain };
  }
  // idle / unknown -> music at full, mic gain reset.
  return { [VAR_MUSIC_GAIN]: 1, [VAR_DUCK]: DEFAULT_DUCK, [VAR_MIC_GAIN]: 1 };
}

function clamp01(n) {
  return clampRange(n, 0, 1);
}
function clampRange(n, lo, hi) {
  const v = Number(n);
  if (Number.isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}
function numberOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// --- Stateful singleton ---------------------------------------------------

let state = STATES.IDLE;
let session = null; // { id, userId, show, dj, mode, prefs, startedAt }
let onAir = false; // true once the harbor SOURCE is actually connected
let levels = { mic: 0 };
let failbackTimer = null;
let levelTimer = null;

function isActive() {
  return state !== STATES.IDLE && !!session;
}

function isValidSession(sessionId) {
  return isActive() && session.id === sessionId;
}

function getState() {
  return {
    onAir,
    state,
    mode: isActive() ? state : null,
    sessionId: session ? session.id : null,
    show: session ? session.show : null,
    dj: session ? session.dj : null,
    levels: { ...levels },
  };
}

function isOnAir() {
  return onAir;
}

function broadcastState() {
  studioSocket.broadcast("studio:state", getState());
}

// Push the interactive vars for `mode` to Liquidsoap (best-effort; logs on
// failure so a telnet hiccup never throws into a request handler).
async function applyVars(mode, prefs) {
  const vars = modeVars(mode, prefs);
  for (const [name, value] of Object.entries(vars)) {
    try {
      await liquidsoap.command(`var.set ${name} = ${formatVar(value)}`);
    } catch (err) {
      logger.warn("liveSession: var.set failed", {
        name,
        value,
        error: String(err),
      });
    }
  }
  return vars;
}

function formatVar(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return Number(value).toFixed(4);
}

// Start (reserve) a live session and configure Liquidsoap for the chosen mode.
// Returns the ingest endpoint + the resolved per-DJ prefs.
async function start({ userId = null, mode = STATES.VOICEOVER, show = null, dj = null } = {}) {
  if (!MODES.has(mode)) {
    const err = new Error(`invalid mode: ${mode}`);
    err.code = "INVALID_MODE";
    throw err;
  }
  if (isActive()) {
    const err = new Error("a live session is already active");
    err.code = "SESSION_ACTIVE";
    throw err;
  }

  const prefs = await loadPrefs(userId);
  const next = transition(STATES.IDLE, { type: "start", mode });
  if (!next) {
    const err = new Error("cannot start from current state");
    err.code = "BAD_TRANSITION";
    throw err;
  }

  session = {
    id: crypto.randomUUID(),
    userId,
    show: show || "Live Show",
    dj: dj || "Live DJ",
    mode: next,
    prefs,
    startedAt: new Date().toISOString(),
  };
  state = next;
  onAir = false;
  levels = { mic: 0 };

  await applyVars(state, prefs);
  broadcastState();
  logger.info("liveSession started", { sessionId: session.id, mode: state });

  return {
    sessionId: session.id,
    mode: state,
    prefs,
    ingest: {
      transport: "ws-opus",
      path: "/ws/ingest",
      query: { session: session.id },
      mount: "/live",
      // The browser supplies its existing JWT as ?token=; the session id is
      // the reservation handle returned here.
    },
  };
}

// The studio mic SOURCE actually connected (POST /playout/harbor connect).
async function onHarborConnected() {
  if (!isActive()) {
    logger.warn("harbor connect with no active session — ignoring");
    return getState();
  }
  clearFailback();
  onAir = true;
  // Now-playing reflects the live show while on air.
  nowPlaying.set({
    title: session.show,
    artist: session.dj,
    album: null,
    thumb: null,
    source: "live",
    trackId: null,
  });
  await recordLivePlay();
  startLevelLoop();
  broadcastState();
  logger.info("liveSession on air", { sessionId: session.id });
  return getState();
}

// The studio mic SOURCE dropped (POST /playout/harbor disconnect). Liquidsoap
// has already restored the music gain locally (no dead air); we schedule the
// session teardown after the configurable failback window unless audio returns.
function onHarborDisconnected() {
  if (!isActive()) return getState();
  onAir = false;
  stopLevelLoop();
  levels = { mic: 0 };
  // The music bed resumes immediately (Liquidsoap reset the gain on disconnect);
  // promote the stashed underlying track so public now-playing follows at once.
  nowPlaying.promoteShadow();
  broadcastState();

  const timeoutMs = session.prefs ? session.prefs.timeoutMs : DEFAULT_TIMEOUT_MS;
  clearFailback();
  failbackTimer = setTimeout(() => {
    if (!onAir) {
      logger.info("liveSession failback: no reconnect within window, idle", {
        sessionId: session ? session.id : null,
        timeoutMs,
      });
      finalizeIdle();
    }
  }, timeoutMs);
  if (failbackTimer.unref) failbackTimer.unref();
  return getState();
}

// Switch mode (live <-> voiceover) on an active session.
async function setMode(mode) {
  const next = transition(state, { type: "setMode", mode });
  if (!next) {
    const err = new Error(`cannot switch to mode: ${mode}`);
    err.code = "BAD_TRANSITION";
    throw err;
  }
  state = next;
  session.mode = next;
  await applyVars(state, session.prefs);
  broadcastState();
  logger.info("liveSession mode set", { sessionId: session.id, mode: state });
  return getState();
}

async function setDuckLevel(duckLevel) {
  if (!isActive()) return getState();
  session.prefs.duckLevel = clamp01(numberOr(duckLevel, session.prefs.duckLevel));
  await applyVars(state, session.prefs);
  broadcastState();
  return getState();
}

async function setMicGain(micGain) {
  if (!isActive()) return getState();
  session.prefs.micGain = clampRange(numberOr(micGain, session.prefs.micGain), 0, 4);
  await applyVars(state, session.prefs);
  broadcastState();
  return getState();
}

// Apply a control message from the ingest WS: { mode?, duckLevel?, micGain? }.
async function applyControl(msg = {}) {
  if (msg.mode && MODES.has(msg.mode) && msg.mode !== state) {
    await setMode(msg.mode);
  }
  if (msg.duckLevel != null) await setDuckLevel(msg.duckLevel);
  if (msg.micGain != null) await setMicGain(msg.micGain);
  return getState();
}

// Explicit stop (POST /studio/session/stop or stop button).
async function stop() {
  if (!isActive()) {
    return getState();
  }
  logger.info("liveSession stopping", { sessionId: session.id });
  finalizeIdle();
  return getState();
}

function finalizeIdle() {
  clearFailback();
  stopLevelLoop();
  const had = isActive();
  state = STATES.IDLE;
  onAir = false;
  session = null;
  levels = { mic: 0 };
  // Restore the music-bed now-playing (if held during the broadcast).
  nowPlaying.promoteShadow();
  // Reset Liquidsoap to plain AutoDJ (music gain up, duck/mic-gain defaults).
  applyVars(STATES.IDLE, {}).catch(() => {});
  if (had) broadcastState();
}

async function loadPrefs(userId) {
  if (!userId) return normalizePrefs(null);
  try {
    const { User } = require("../models");
    const user = await User.findByPk(userId);
    return normalizePrefs(user ? user.micPreferencesJson : null);
  } catch (err) {
    logger.warn("liveSession: failed to load mic prefs", {
      userId,
      error: String(err),
    });
    return normalizePrefs(null);
  }
}

async function recordLivePlay() {
  try {
    const { PlayHistory } = require("../models");
    await PlayHistory.create({
      trackId: null,
      source: "live",
      startedAt: new Date(),
    });
  } catch (err) {
    logger.warn("liveSession: PlayHistory(live) write failed", {
      error: String(err),
    });
  }
}

function clearFailback() {
  if (failbackTimer) {
    clearTimeout(failbackTimer);
    failbackTimer = null;
  }
}

function startLevelLoop() {
  if (levelTimer || process.env.NODE_ENV === "test") return;
  levelTimer = setInterval(async () => {
    try {
      const raw = await liquidsoap.command("studio.level");
      const lvl = parseFloat(String(raw).trim());
      if (Number.isFinite(lvl)) {
        levels = { mic: lvl };
        broadcastState();
      }
    } catch (_) {
      // best-effort metering
    }
  }, Number(process.env.LIVE_LEVEL_POLL_MS || 1000));
  if (levelTimer.unref) levelTimer.unref();
}

function stopLevelLoop() {
  if (levelTimer) {
    clearInterval(levelTimer);
    levelTimer = null;
  }
}

module.exports = {
  STATES,
  // pure helpers
  transition,
  duckGain,
  normalizePrefs,
  modeVars,
  // stateful API
  start,
  stop,
  setMode,
  setDuckLevel,
  setMicGain,
  applyControl,
  onHarborConnected,
  onHarborDisconnected,
  getState,
  isActive,
  isOnAir,
  isValidSession,
  // test seam
  _finalizeIdle: finalizeIdle,
};
