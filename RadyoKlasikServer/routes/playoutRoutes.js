const express = require("express");
const { staffRequired } = require("../services/staffAuth");

const staff = staffRequired();
const editors = staffRequired("admin", "dj");
const { internalOnly } = require("../middlewares/internalAuth");
const playout = require("../controllers/playoutController");

const router = express.Router();

// Internal endpoints driven by Liquidsoap (internal secret, not a user JWT).
router.get("/next", internalOnly, playout.next);
router.post("/metadata", internalOnly, playout.metadata);
router.post("/harbor", internalOnly, playout.harbor);
router.post("/airstate", internalOnly, playout.airstate);

// Operator status (JWT-protected).
router.get("/status", staff, playout.status);

// Phase 3 transport controls (JWT-protected).
router.post("/skip", staff, playout.skip);
router.post("/autopilot", editors, playout.autopilot);

module.exports = router;
