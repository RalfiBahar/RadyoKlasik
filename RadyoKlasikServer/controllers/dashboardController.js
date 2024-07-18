const path = require("path");

exports.index = (req, res) => {
  res.redirect("/dashboard");
};

exports.dashboard = (req, res) => {
  res.render("dashboard", { shared_secret_key: process.env.SHARED_SECRET_KEY });
};
