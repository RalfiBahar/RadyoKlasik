const crypto = require("crypto");
const metrics = require("../services/monitoring/metrics");
const alerts = require("../services/monitoring/alerts");
const { probe } = require("../services/monitoring/probe");
const logger = require("../logger");

// Phase 9 — monitoring endpoints.

// GET /metrics — Prometheus exposition. Requires `Authorization: Bearer
// <METRICS_TOKEN>` when METRICS_TOKEN is set (Caddy also keeps /metrics off
// the public API domain).
exports.metrics = async (req, res) => {
  const expected = process.env.METRICS_TOKEN;
  if (expected) {
    const got = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const ok =
      got.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    if (!ok) return res.status(401).send("unauthorized\n");
  }
  try {
    res.set("Content-Type", metrics.contentType);
    return res.send(await metrics.render());
  } catch (err) {
    logger.error("metrics render failed", { error: String(err) });
    return res.status(500).send(String(err));
  }
};

// GET /api/v1/monitoring/status (admin) — station health + firing alerts for
// the studio dashboard.
exports.status = async (req, res) => {
  try {
    return res.json({ ...(await probe()), alerts: alerts.active() });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/monitoring/test-alert (admin) — send a test notification.
exports.testAlert = async (req, res) => {
  if (!process.env.ALERT_WEBHOOK_URL) {
    return res.status(400).json({ error: "ALERT_WEBHOOK_URL is not configured" });
  }
  await alerts.notify("test", "firing", "Test alert from the studio — alerts are working");
  return res.json({ sent: true });
};
