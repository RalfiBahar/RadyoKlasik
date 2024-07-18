const express = require("express");
const {
  login,
  logout,
  generateAccessToken,
  verifyToken,
} = require("../controllers/authController");
const router = express.Router();

router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", login);
router.post("/logout", logout);
router.post("/generate_token", generateAccessToken);
router.post("/verify_token", verifyToken);

module.exports = router;
