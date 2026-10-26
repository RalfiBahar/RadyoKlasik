const express = require("express");
const { staffRequired } = require("../services/staffAuth");
const shows = require("../controllers/showController");

const router = express.Router();
const staff = staffRequired();
const admin = staffRequired("admin");

// Phase 7 shows + hosts + episode log.
router.get("/", staff, shows.list);
router.post("/", admin, shows.create);
router.patch("/:id", admin, shows.update);
router.delete("/:id", admin, shows.remove);
router.get("/:id/episodes", staff, shows.episodes);

module.exports = router;
