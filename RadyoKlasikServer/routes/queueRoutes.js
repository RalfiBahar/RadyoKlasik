const express = require("express");
const { staffRequired } = require("../services/staffAuth");

const staff = staffRequired();
const queue = require("../controllers/queueController");

const router = express.Router();

// All queue endpoints are operator-only (JWT).
router.get("/", staff, queue.list);
router.post("/", staff, queue.add);
router.patch("/reorder", staff, queue.reorder);
router.delete("/:id", staff, queue.remove);

module.exports = router;
