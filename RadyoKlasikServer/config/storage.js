const fs = require("fs");
const path = require("path");

// Where uploaded media lives. In docker this is the `media` volume mount
// (MEDIA_DIR=/var/media); locally it defaults to ./media under the server.
const MEDIA_DIR =
  process.env.MEDIA_DIR || path.join(__dirname, "..", "media");

const TRACKS_DIR = path.join(MEDIA_DIR, "tracks");
const ARTWORK_DIR = path.join(MEDIA_DIR, "artwork");

function ensureMediaDirs() {
  for (const dir of [MEDIA_DIR, TRACKS_DIR, ARTWORK_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

module.exports = { MEDIA_DIR, TRACKS_DIR, ARTWORK_DIR, ensureMediaDirs };
