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
const playoutRoutes = require("./routes/playoutRoutes");
const queueRoutes = require("./routes/queueRoutes");
const studioRoutes = require("./routes/studioRoutes");
const userRoutes = require("./routes/userRoutes");
const showRoutes = require("./routes/showRoutes");
const scheduleRoutes = require("./routes/scheduleRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const monitoringRoutes = require("./routes/monitoringRoutes");
const listenerRoutes = require("./routes/listenerRoutes");
const monitoringController = require("./controllers/monitoringController");
const playoutController = require("./controllers/playoutController");
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
  // Phase 5 DJ studio (radyo-klasik-studio). Its Next dev server proxies REST
  // here and forwards the browser Origin, so the studio origin must be allowed.
  "http://localhost:3001",
  "http://localhost:3000",
  "https://studio.radyoklasik.online",
];

// Extra studio origins can be supplied via env (comma-separated) for other
// deploy hosts without editing this list.
if (process.env.EXTRA_CORS_ORIGINS) {
  for (const o of process.env.EXTRA_CORS_ORIGINS.split(",")) {
    const trimmed = o.trim();
    if (trimmed) allowedOrigins.push(trimmed);
  }
}

// Use CORS middleware. Same-origin requests (the EJS admin dashboard served by
// this API, e.g. its login form POST) are always allowed. An unknown origin
// just gets no CORS headers — the browser then blocks it — instead of a 500.
app.use(
  cors((req, callback) => {
    const origin = req.header("Origin");
    const self = `${req.protocol}://${req.get("host")}`;
    const allowed = !origin || origin === self || allowedOrigins.includes(origin);
    callback(null, {
      origin: allowed,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    });
  })
);

// Behind Caddy: trust X-Forwarded-* from private-network proxies so req.ip /
// req.protocol are the client's (rate limiting, absolute media URLs).
app.set("trust proxy", "loopback, uniquelocal");

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

// Recording thumbnails may live on the app-data volume (config/appData.js);
// serve them at their historical URL ahead of the bundled public/ folder.
const { THUMBNAILS_DIR, ensureAppData } = require("./config/appData");
ensureAppData();
app.use("/static/assets/thumbnails", express.static(THUMBNAILS_DIR));
app.use(express.static(path.join(__dirname, "public")));

// Serve uploaded media (artwork, audio) for the library/studio UIs.
app.use("/media", express.static(MEDIA_DIR));

app.use("/api/v1", healthRoutes);
app.use("/api/v1/library", libraryRoutes);
app.use("/api/v1/playlists", playlistRoutes);
app.use("/api/v1/playout", playoutRoutes);
app.use("/api/v1/queue", queueRoutes);
app.use("/api/v1/studio", studioRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/shows", showRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/monitoring", monitoringRoutes);
app.use("/api/v1", listenerRoutes);
app.get("/metrics", monitoringController.metrics);
app.use("/api/v1", scheduleRoutes);
// Public now-playing (no /api/v1 prefix) — consumed by the web + mobile players.
app.get("/playout/nowplaying", playoutController.nowplaying);
app.use("/auth", authRoutes);
app.use("/recording", recordingRoutes);
app.use("/notification", notificationRoutes);
app.use("/", dashboardRoutes);
app.use("/chat", chatRoutes);

// Schema is managed by migrations (single source of truth) instead of
// per-model sequelize.sync(), removing the Phase 0 duplicate-table race.
// Skipped under test, where the harness controls migration timing.
// `app.ready` resolves once migrations (and the seed) are done, so boot-time
// readers of new tables (settings, scheduler) wait for them.
app.ready = Promise.resolve();
if (process.env.NODE_ENV !== "test") {
  app.ready = (async () => {
    try {
      await runMigrations();
    } catch (error) {
      logger.error("Unable to run database migrations", { error });
      console.error("Unable to run database migrations:", error);
    }
    // Seed a small AutoDJ rotation so the stream has something to play on a
    // fresh stack (best-effort; no-op once the library has tracks).
    if (process.env.SEED_ON_START !== "false") {
      try {
        const { seedRotation } = require("./scripts/seedRotation");
        await seedRotation();
      } catch (error) {
        logger.error("Rotation seed on start failed", { error: String(error) });
      }
    }
  })();
}

module.exports = app;
