const express = require("express");
const session = require("express-session");
const dotenv = require("dotenv");
const authRoutes = require("./routes/authRoutes");
const recordingRoutes = require("./routes/recordingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const path = require("path");
const { sequelize } = require("./config/database");
const Recording = require("./models/recording");

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
  })
);

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "public")));

app.use("/auth", authRoutes);
app.use("/recording", recordingRoutes);
app.use("/", dashboardRoutes);

(async () => {
  try {
    await sequelize.sync({ force: false });
    console.log("Database synchronized");
  } catch (error) {
    console.error("Unable to synchronize the database:", error);
  }
})();

module.exports = app;
