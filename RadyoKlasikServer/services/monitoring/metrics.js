const client = require("prom-client");
const { probe } = require("./probe");

// Phase 9 — Prometheus metrics (GET /metrics). Gauges are refreshed from a
// station probe at scrape time; counters are bumped by the playout hooks.

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "rk_api_" });

const g = (name, help, labelNames = []) =>
  new client.Gauge({ name, help, labelNames, registers: [registry] });

const up = g("rk_up", "1 when the component is reachable", ["component"]);
const listeners = g("rk_listeners", "Current listeners", ["mount"]);
const mountUp = g("rk_mount_up", "1 when the expected Icecast mount has a source", ["mount"]);
const hlsAge = g("rk_hls_playlist_age_seconds", "Seconds since the HLS playlist was rewritten");
const deadAir = g("rk_dead_air", "1 while the music bed is silent");
const autopilotOn = g("rk_autopilot_enabled", "1 when AutoDJ autopilot is on");
const liveOnAir = g("rk_live_on_air", "1 while a live DJ is on air");
const queueDepth = g("rk_queue_depth", "Pending items in the request queue");
const diskFree = g("rk_media_disk_free_percent", "Free space on the media volume");
const activeAlerts = g("rk_alerts_active", "Number of currently firing alerts");

const trackChanges = new client.Counter({
  name: "rk_track_changes_total",
  help: "Track changes reported by Liquidsoap",
  labelNames: ["source"],
  registers: [registry],
});

async function render() {
  const s = await probe();
  up.set({ component: "db" }, s.db ? 1 : 0);
  up.set({ component: "icecast" }, s.icecast ? 1 : 0);
  up.set({ component: "liquidsoap" }, s.liquidsoap ? 1 : 0);
  listeners.reset();
  for (const [mount, n] of Object.entries(s.mounts)) listeners.set({ mount }, n);
  const { activeHlsListeners } = require("../analytics/collector");
  listeners.set({ mount: "/hls" }, activeHlsListeners());
  for (const m of s.expectedMounts) mountUp.set({ mount: m }, s.missingMounts.includes(m) ? 0 : 1);
  if (s.hlsAgeSec != null) hlsAge.set(s.hlsAgeSec);
  deadAir.set(s.deadAir ? 1 : 0);
  autopilotOn.set(s.autopilot ? 1 : 0);
  liveOnAir.set(s.liveOnAir ? 1 : 0);
  queueDepth.set(s.queueDepth);
  if (s.diskFreePct != null) diskFree.set(s.diskFreePct);
  activeAlerts.set(require("./alerts").active().length);
  return registry.metrics();
}

module.exports = { registry, render, trackChanges, contentType: registry.contentType };
