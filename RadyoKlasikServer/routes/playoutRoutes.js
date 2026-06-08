const express = require("express");
const { tokenRequired } = require("../middlewares/authMiddleware");
const { internalOnly } = require("../middlewares/internalAuth");
const playout = require("../controllers/playoutController");

const router = express.Router();

// Internal endpoints driven by Liquidsoap (internal secret, not a user JWT).
router.get("/next", internalOnly, playout.next);
router.post("/metadata", internalOnly, playout.metadata);
router.post("/harbor", internalOnly, playout.harbor);
router.post("/airstate", internalOnly, playout.airstate);

// Operator status (JWT-protected).
router.get("/status", tokenRequired, playout.status);

// Phase 3 transport controls (JWT-protected).
router.post("/skip", tokenRequired, playout.skip);
router.post("/autopilot", tokenRequired, playout.autopilot);

module.exports = router;
