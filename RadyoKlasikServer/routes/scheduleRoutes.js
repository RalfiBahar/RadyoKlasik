const express = require("express");
const { staffRequired } = require("../services/staffAuth");
const schedule = require("../controllers/scheduleController");
const users = require("../controllers/userController");

const router = express.Router();
const staff = staffRequired();
const admin = staffRequired("admin");

// Phase 7 schedule + station settings + current user.
router.get("/schedule", staff, schedule.list);
router.get("/schedule/now", staff, schedule.now);
router.post("/schedule", admin, schedule.create);
router.patch("/schedule/:id", admin, schedule.update);
router.delete("/schedule/:id", admin, schedule.remove);

router.get("/settings", staff, schedule.getSettings);
router.patch("/settings", admin, schedule.updateSettings);

router.get("/me", staff, users.me);

module.exports = router;
