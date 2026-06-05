const express = require("express");
const { tokenRequired } = require("../middlewares/authMiddleware");
const studio = require("../controllers/studioController");

const router = express.Router();

// Phase 4 live studio session control (operator JWT).
router.get("/session", tokenRequired, studio.state);
router.post("/session/start", tokenRequired, studio.start);
router.post("/session/stop", tokenRequired, studio.stop);
router.post("/session/mode", tokenRequired, studio.mode);

module.exports = router;
