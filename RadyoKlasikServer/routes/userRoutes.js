const express = require("express");
const { staffRequired } = require("../services/staffAuth");
const users = require("../controllers/userController");

const router = express.Router();
const admin = staffRequired("admin");

// Phase 7 DJ / guest account management.
router.get("/", admin, users.list);
router.post("/", admin, users.create);
router.post("/guest", admin, users.createGuest);
router.patch("/:id", admin, users.update);
router.delete("/:id", admin, users.remove);

module.exports = router;
