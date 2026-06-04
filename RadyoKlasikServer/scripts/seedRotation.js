const fs = require("fs");
const path = require("path");

const ingest = require("../services/mediaIngest");
const { Track } = require("../models");
const { TRACKS_DIR, ensureMediaDirs } = require("../config/storage");
const logger = require("../logger");

// Seeds a small AutoDJ rotation from bundled media so the stream has something
// to play out of the box. Runs the full Phase 1 ingest (hash dedupe + ffprobe +
// EBU R128 loudness + waveform) on each file and creates Track rows.
//
// Source defaults to the bundled royalty-free test clips mounted into the api
// container (SEED_MEDIA_DIR=/srv/test-media). Idempotent: a file already in the
// library (same sha256) is skipped, and by default seeding is a no-op once the
// library has any tracks (pass { force: true } / --force to override).

const SEED_MEDIA_DIR = process.env.SEED_MEDIA_DIR || "/srv/test-media";
const AUDIO_RE = /\.(mp3|mpga|aac|m4a|ogg|oga|flac|wav)$/i;
const JINGLE_HINT = /jingle|sweep|sting|station[-_ ]?id|\bid\b/i;

async function ingestFile(absSrc, { type }) {
  const buffer = fs.readFileSync(absSrc);
  const hash = ingest.computeHash(buffer);

  const existing = await Track.findOne({ where: { fileHash: hash } });
  if (existing) return { skipped: true, track: existing };

  ensureMediaDirs();
  const ext = path.extname(absSrc).replace(/^\./, "").toLowerCase() || "mp3";
  const filename = `${hash}.${ext}`;
  const destAbs = path.join(TRACKS_DIR, filename);
  if (!fs.existsSync(destAbs)) fs.writeFileSync(destAbs, buffer);

  const analysis = await ingest.analyzeTrack(destAbs);
  const title =
    analysis.tags.title || path.basename(absSrc, path.extname(absSrc));

  const track = await Track.create({
    title,
    artist: analysis.tags.artist || "Radyo Klasik",
    album: analysis.tags.album || "Test Rotation",
    type,
    duration: analysis.duration,
    filePath: `tracks/${filename}`,
    fileHash: hash,
    size: buffer.length,
    bitrate: analysis.bitrate,
    sampleRate: analysis.sampleRate,
    loudnessLufs: analysis.loudnessLufs,
    loudnessRange: analysis.loudnessRange,
    replaygain: analysis.replaygain,
    waveformJson: analysis.waveformJson,
  });
  return { skipped: false, track };
}

async function seedRotation({ force = false } = {}) {
  const existingCount = await Track.count();
  if (existingCount > 0 && !force) {
    logger.info(
      `Seed skipped: library already has ${existingCount} track(s)`
    );
    return { seeded: 0, skipped: true };
  }

  if (!fs.existsSync(SEED_MEDIA_DIR)) {
    logger.warn(`Seed source dir not found: ${SEED_MEDIA_DIR}`);
    return { seeded: 0, skipped: true };
  }

  const files = fs
    .readdirSync(SEED_MEDIA_DIR)
    .filter((f) => AUDIO_RE.test(f))
    .sort();

  if (files.length === 0) {
    logger.warn(`Seed source dir has no audio files: ${SEED_MEDIA_DIR}`);
    return { seeded: 0, skipped: true };
  }

  let seeded = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    // Tag obvious jingles by name; otherwise reserve the last file as a jingle
    // (when there is more than one) so the jingle cadence has something to use.
    const isJingle =
      JINGLE_HINT.test(f) || (files.length > 1 && i === files.length - 1);
    const type = isJingle ? "jingle" : "song";
    try {
      const result = await ingestFile(path.join(SEED_MEDIA_DIR, f), { type });
      if (!result.skipped) seeded++;
      logger.info(`Seed ${result.skipped ? "skip" : "add"}: ${f} (${type})`);
    } catch (err) {
      logger.error(`Seed failed for ${f}: ${err.message}`);
    }
  }

  logger.info(`Seed done: ${seeded} track(s) added`);
  return { seeded, skipped: false };
}

module.exports = { seedRotation, ingestFile };

// Allow running standalone: `node scripts/seedRotation.js [--force]`.
if (require.main === module) {
  (async () => {
    try {
      const { runMigrations } = require("../config/migrate");
      await runMigrations();
      await seedRotation({ force: process.argv.includes("--force") });
      process.exit(0);
    } catch (err) {
      console.error("Seed failed:", err);
      process.exit(1);
    }
  })();
}
