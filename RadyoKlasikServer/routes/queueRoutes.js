const express = require("express");
const { tokenRequired } = require("../middlewares/authMiddleware");
const queue = require("../controllers/queueController");

const router = express.Router();

// All queue endpoints are operator-only (JWT).
router.get("/", tokenRequired, queue.list);
router.post("/", tokenRequired, queue.add);
router.patch("/reorder", tokenRequired, queue.reorder);
router.delete("/:id", tokenRequired, queue.remove);

module.exports = router;
