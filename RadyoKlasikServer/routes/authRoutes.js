const express = require("express");
const {
  login,
  logout,
  generateAccessToken,
  verifyToken,
  studioLogin,
} = require("../controllers/authController");
const router = express.Router();

router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", login);
router.post("/logout", logout);
router.post("/generate_token", generateAccessToken);
router.post("/studio_login", studioLogin);
router.post("/verify_token", verifyToken);

module.exports = router;
