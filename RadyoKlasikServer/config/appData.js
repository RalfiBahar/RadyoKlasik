const fs = require("fs");
const path = require("path");

// Persistent files of the legacy listener features (recordings, recording
// thumbnails, chat history, announcement). In docker APP_DATA_DIR is the
// `appdata` volume so they survive rebuilds/deploys; locally they default to
// the old in-repo locations so nothing moves for a plain `node server.js`.
const SERVER_ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.APP_DATA_DIR || null;

const RECORDINGS_DIR = DATA_DIR
  ? path.join(DATA_DIR, "recordings")
  : path.join(SERVER_ROOT, "recordings");
// Thumbnails stay at the URL /static/assets/thumbnails/<file> (app.js serves
// THUMBNAILS_DIR there), so stored artwork paths and clients don't change.
const BUNDLED_THUMBNAILS_DIR = path.join(SERVER_ROOT, "public", "static", "assets", "thumbnails");
const THUMBNAILS_DIR = DATA_DIR ? path.join(DATA_DIR, "thumbnails") : BUNDLED_THUMBNAILS_DIR;
const CHAT_HISTORY_FILE = DATA_DIR
  ? path.join(DATA_DIR, "chatHistory.json")
  : path.join(SERVER_ROOT, "chatHistory.json");
const ANNOUNCEMENT_FILE = DATA_DIR
  ? path.join(DATA_DIR, "announcement.txt")
  : path.join(SERVER_ROOT, "announcement.txt");

// Create the dirs and copy the bundled default thumbnails into the volume the
// first time (the recorder needs at least one artwork to tag recordings).
function ensureAppData() {
  for (const dir of [RECORDINGS_DIR, THUMBNAILS_DIR]) fs.mkdirSync(dir, { recursive: true });
  if (THUMBNAILS_DIR !== BUNDLED_THUMBNAILS_DIR && fs.existsSync(BUNDLED_THUMBNAILS_DIR)) {
    for (const f of fs.readdirSync(BUNDLED_THUMBNAILS_DIR)) {
      const dest = path.join(THUMBNAILS_DIR, f);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(BUNDLED_THUMBNAILS_DIR, f), dest);
    }
  }
}

module.exports = {
  RECORDINGS_DIR,
  THUMBNAILS_DIR,
  CHAT_HISTORY_FILE,
  ANNOUNCEMENT_FILE,
  ensureAppData,
};
