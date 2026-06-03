const express = require("express");
const session = require("express-session");
const dotenv = require("dotenv");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const recordingRoutes = require("./routes/recordingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const healthRoutes = require("./routes/healthRoutes");
const libraryRoutes = require("./routes/libraryRoutes");
const playlistRoutes = require("./routes/playlistRoutes");
const path = require("path");
const { sequelize } = require("./config/database");
// Loads every model + their associations in one place (no sync() side effects).
require("./models");
const { runMigrations } = require("./config/migrate");
const { MEDIA_DIR } = require("./config/storage");
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

// Serve uploaded media (artwork, audio) for the library/studio UIs.
app.use("/media", express.static(MEDIA_DIR));

app.use("/api/v1", healthRoutes);
app.use("/api/v1/library", libraryRoutes);
app.use("/api/v1/playlists", playlistRoutes);
app.use("/auth", authRoutes);
app.use("/recording", recordingRoutes);
app.use("/notification", notificationRoutes);
app.use("/", dashboardRoutes);
app.use("/chat", chatRoutes);

// Schema is managed by migrations (single source of truth) instead of
// per-model sequelize.sync(), removing the Phase 0 duplicate-table race.
// Skipped under test, where the harness controls migration timing.
if (process.env.NODE_ENV !== "test") {
  (async () => {
    try {
      await runMigrations();
    } catch (error) {
      logger.error("Unable to run database migrations", { error });
      console.error("Unable to run database migrations:", error);
    }
  })();
}

module.exports = app;
