const { sequelize } = require("../config/database");
const { checkTcp } = require("../services/healthChecks");

// GET /api/v1/health
// Reports the control-plane's view of the stack:
//   { status: "ok" | "degraded", services: { db, icecast, liquidsoap } }
// The DB is the only hard dependency for the API, so overall status is "ok"
// when the DB is reachable; Icecast/Liquidsoap are reported but non-fatal.
exports.health = async (req, res) => {
  const services = { db: "down", icecast: "down", liquidsoap: "down" };

  try {
    await sequelize.authenticate();
    services.db = "up";
  } catch (err) {
    services.db = "down";
  }

  const icecastHost = process.env.ICECAST_HOST || "localhost";
  const icecastPort = process.env.ICECAST_PORT || 8000;
  const liquidsoapHost = process.env.LIQUIDSOAP_HOST || "localhost";
  const liquidsoapPort = process.env.LIQUIDSOAP_TELNET_PORT || 1234;

  const [icecastUp, liquidsoapUp] = await Promise.all([
    checkTcp(icecastHost, icecastPort),
    checkTcp(liquidsoapHost, liquidsoapPort),
  ]);

  services.icecast = icecastUp ? "up" : "down";
  services.liquidsoap = liquidsoapUp ? "up" : "down";

  const ok = services.db === "up";
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    services,
  });
};
