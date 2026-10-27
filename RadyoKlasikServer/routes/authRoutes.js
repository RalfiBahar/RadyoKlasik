const express = require("express");
const {
  login,
  logout,
  generateAccessToken,
  verifyToken,
  studioLogin,
} = require("../controllers/authController");
const { loginLimiter } = require("../middlewares/rateLimit");
const router = express.Router();

router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.post("/generate_token", generateAccessToken);
router.post("/studio_login", loginLimiter, studioLogin);
router.post("/verify_token", verifyToken);

module.exports = router;
