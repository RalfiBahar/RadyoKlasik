const express = require("express");
const { staffRequired } = require("../services/staffAuth");

const staff = staffRequired();
const studio = require("../controllers/studioController");

const router = express.Router();

// Phase 4 live studio session control (operator JWT).
router.get("/session", staff, studio.state);
router.get("/access", staff, studio.access);
router.post("/session/start", staff, studio.start);
router.post("/session/stop", staff, studio.stop);
router.post("/session/mode", staff, studio.mode);

module.exports = router;
