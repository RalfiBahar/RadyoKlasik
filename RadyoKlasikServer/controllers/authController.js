const bcrypt = require("bcryptjs");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
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
  console.log("he");
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
};

exports.generateAccessToken = (req, res) => {
  const { shared_secret } = req.body;
  console.log(shared_secret);
  console.log(process.env.SHARED_SECRET_KEY);

  if (shared_secret !== process.env.SHARED_SECRET_KEY) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = jwt.sign({}, process.env.SECRET_KEY, { expiresIn: "5h" });
  res.json({ access_token: token });
};
exports.verifyToken = (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token is missing!" });
  }

  try {
    jwt.verify(token, process.env.SECRET_KEY);
    res.json({ message: "Token is valid" });
  } catch (error) {
    res.status(401).json({ message: "Invalid token!" });
  }
};
