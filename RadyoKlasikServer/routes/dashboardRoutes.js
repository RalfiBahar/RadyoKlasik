const express = require("express");
const { index, dashboard } = require("../controllers/dashboardController");
const { loginRequired } = require("../middlewares/authMiddleware");
const router = express.Router();

router.get("/", loginRequired, index);
router.get("/dashboard", loginRequired, dashboard);

module.exports = router;
