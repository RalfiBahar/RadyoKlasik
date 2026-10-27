const axios = require("axios");
const { probe } = require("./probe");
const logger = require("../../logger");

// Phase 9 — alerting. Every ALERT_CHECK_MS the station is probed; a rule that
// stays true for ALERT_AFTER consecutive checks FIRES (one notification) and
// RESOLVES (one notification) when it clears. Notifications go to
// ALERT_WEBHOOK_URL: Slack and Discord incoming webhooks get their native
// payload, anything else a generic JSON body.

const CHECK_MS = Number(process.env.ALERT_CHECK_MS || 30000);
const AFTER = Number(process.env.ALERT_AFTER || 2);
const HLS_STALE_SEC = Number(process.env.ALERT_HLS_STALE_SEC || 30);
const DISK_MIN_PCT = Number(process.env.ALERT_DISK_MIN_PCT || 10);

// Each rule: (probe) -> message string when unhealthy, else null.
const RULES = {
  db_down: (s) => (!s.db ? "Database is unreachable" : null),
  icecast_down: (s) => (!s.icecast ? "Icecast is unreachable — listeners can't connect" : null),
  liquidsoap_down: (s) => (!s.liquidsoap ? "Liquidsoap is unreachable — playout engine down" : null),
  mount_missing: (s) =>
    s.icecast && s.missingMounts.length
      ? `Stream mount(s) off air: ${s.missingMounts.join(", ")}`
      : null,
  hls_stale: (s) =>
    s.hlsAgeSec != null && s.hlsAgeSec > HLS_STALE_SEC
      ? `HLS playlist not updated for ${s.hlsAgeSec}s`
      : null,
  // Silence is intentional with autopilot off; with it on it's dead air.
  dead_air: (s) => (s.deadAir && s.autopilot && !s.liveOnAir ? "Dead air: the station is silent" : null),
  disk_low: (s) =>
    s.diskFreePct != null && s.diskFreePct < DISK_MIN_PCT
      ? `Media disk almost full (${s.diskFreePct}% free)`
      : null,
  recording_upload_failed: (s) =>
    s.recordingUploadsFailed > 0
      ? `${s.recordingUploadsFailed} recording(s) failed to upload to R2 (still playing from the server; retried hourly)`
      : null,
};

const state = {}; // rule -> { streak, firing, message, since }
let timer = null;

function station() {
  return process.env.STATION_NAME || "Radyo Klasik";
}

// Webhook body for the given URL's service.
function payloadFor(url, text, extra) {
  if (/hooks\.slack\.com/.test(url)) return { text };
  if (/discord(app)?\.com\/api\/webhooks/.test(url)) return { content: text };
  return { text, ...extra };
}

async function notify(rule, status, message) {
  const icon = status === "firing" ? "🔴" : "✅";
  const text = `${icon} [${station()}] ${status === "firing" ? message : `Resolved: ${message}`}`;
  logger[status === "firing" ? "error" : "info"]("alert", { rule, status, message });
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await axios.post(url, payloadFor(url, text, { rule, status, message, at: new Date().toISOString() }), {
      timeout: 5000,
    });
  } catch (err) {
    logger.warn("alert webhook failed", { rule, error: String(err) });
  }
}

// Evaluate all rules against one probe. Returns the transitions it caused.
async function evaluate(snapshot) {
  const s = snapshot || (await probe());
  const changes = [];
  for (const [rule, check] of Object.entries(RULES)) {
    const message = check(s);
    const st = state[rule] || (state[rule] = { streak: 0, firing: false, message: null, since: null });
    if (message) {
      st.streak += 1;
      st.message = message;
      if (!st.firing && st.streak >= AFTER) {
        st.firing = true;
        st.since = new Date().toISOString();
        changes.push({ rule, status: "firing", message });
        await notify(rule, "firing", message);
      }
    } else {
      if (st.firing) {
        changes.push({ rule, status: "resolved", message: st.message });
        await notify(rule, "resolved", st.message);
      }
      Object.assign(st, { streak: 0, firing: false, since: null });
    }
  }
  return changes;
}

function active() {
  return Object.entries(state)
    .filter(([, st]) => st.firing)
    .map(([rule, st]) => ({ rule, message: st.message, since: st.since }));
}

function start() {
  if (timer || process.env.ALERTS_ENABLED === "false") return;
  // Give the stack a moment to come up before the first check.
  timer = setInterval(() => {
    evaluate().catch((err) => logger.warn("alert check failed", { error: String(err) }));
  }, CHECK_MS);
  if (timer.unref) timer.unref();
  logger.info("alerting started", { webhook: !!process.env.ALERT_WEBHOOK_URL });
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function _reset() {
  for (const k of Object.keys(state)) delete state[k];
}

module.exports = { RULES, evaluate, active, start, stop, payloadFor, notify, _reset };
