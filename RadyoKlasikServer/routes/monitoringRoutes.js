const express = require("express");
const { staffRequired } = require("../services/staffAuth");
const monitoring = require("../controllers/monitoringController");

const router = express.Router();
const admin = staffRequired("admin");

// Phase 9 station health for the studio (admin).
router.get("/status", admin, monitoring.status);
router.post("/test-alert", admin, monitoring.testAlert);

module.exports = router;
