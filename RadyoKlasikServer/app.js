const express = require("express");
const session = require("express-session");
const dotenv = require("dotenv");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const recordingRoutes = require("./routes/recordingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const path = require("path");
const { sequelize } = require("./config/database");
const Recording = require("./models/recording");
const logger = require("./logger");

dotenv.config();

const app = express();

const allowedOrigins = [
  "https://radyo-klasik-web.vercel.app",
  "https://radyoklasik.online",
  "https://www.radyoklasik.online",
  "https://api.radyoklasik.online",
  "http://localhost:8000",
];

// Use CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

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
app.use("/notification", notificationRoutes);
app.use("/", dashboardRoutes);
app.use("/chat", chatRoutes);

(async () => {
  try {
    await sequelize.sync({ force: false });
    logger.info("Database synchronized");
  } catch (error) {
    console.error("Unable to synchronize the database:", error);
  }
})();

module.exports = app;
