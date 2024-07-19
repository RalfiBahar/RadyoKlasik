const bcrypt = require("bcryptjs");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const logger = require("../logger");
dotenv.config();

exports.login = (req, res) => {
  const { username, password } = req.body;
  const user = User.findByUsername(username);
  //console.log("Input Username:", username);
  //console.log("Input Password:", password);
  //console.log("User from DB:", user);

  if (user && bcrypt.compareSync(password, user.password)) {
    //console.log("Password match:", true);
    req.session.user = user;
    res.redirect("/dashboard");
  } else {
    //console.log("Password match:", false);
    res.render("login", { error: "Invalid username or password" });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
};

exports.generateAccessToken = (req, res) => {
  const { shared_secret } = req.body;

  if (shared_secret !== process.env.SHARED_SECRET_KEY) {
    logger.warn("Unauthorized access attempt with invalid shared secret");
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = jwt.sign({}, process.env.SECRET_KEY, { expiresIn: "5h" });
  logger.info("Access token generated");
  res.json({ access_token: token });
};
exports.verifyToken = (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    logger.warn("Token is missing in the request");
    return res.status(401).json({ message: "Token is missing!" });
  }

  try {
    jwt.verify(token, process.env.SECRET_KEY);
    logger.info("Token is valid");
    res.json({ message: "Token is valid" });
  } catch (error) {
    logger.error("Invalid token", { error });
    res.status(401).json({ message: "Invalid token!" });
  }
};
