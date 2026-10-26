const express = require("express");
const { staffRequired } = require("../services/staffAuth");
const analytics = require("../controllers/analyticsController");

const router = express.Router();
const staff = staffRequired("admin", "dj");
const admin = staffRequired("admin");

// Phase 6 analytics. Live stats feed the dashboard (admins + DJs); the full
// reports and exports are admin-only (matching the studio's Analytics page).
router.get("/live", staff, analytics.live);
router.get("/listeners", admin, analytics.listeners);
router.get("/regional", admin, analytics.regional);
router.get("/hourly", admin, analytics.hourly);
router.get("/devices", admin, analytics.devices);
router.get("/tracks/monthly", admin, analytics.monthly);
router.get("/tracks", admin, analytics.tracks);
router.get("/export", admin, analytics.exportCsv);

module.exports = router;
