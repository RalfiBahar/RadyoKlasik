const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const NodeID3 = require("node-id3");
const md5 = require("md5");
const { RECORDINGS_DIR, THUMBNAILS_DIR } = require("../config/appData");
const logger = require("../logger");

// The programme recorder (one at a time), shared by the legacy /recording
// routes (EJS admin dashboard) and the panel's /api/v1/recordings. It runs
// record.js against our own Icecast mix; when it finishes, the MP3 is tagged
// (ID3 + artwork) and a Recording row is created — the past programmes the
// website and mobile app list.

const MAX_HOURS = Number(process.env.RECORDING_MAX_HOURS || 6);

function recordStreamUrl() {
  if (process.env.RECORD_STREAM_URL) return process.env.RECORD_STREAM_URL;
  const host = process.env.ICECAST_HOST || "icecast";
  const port = process.env.ICECAST_PORT || 8000;
  return `http://${host}:${port}/stream`;
}

// Synchronous so the file size recorded afterwards includes the embedded
// artwork (the async variant made the archive under-report sizes).
function addMetadata(filePath, title, artist, album, artworkPath) {
  logger.info("Adding metadata to file", { filePath, artworkPath });
  const result = NodeID3.write({ title, artist, album, APIC: artworkPath }, filePath);
  if (result instanceof Error) logger.error("Error writing ID3 tags:", result);
}

// Newest artwork in the thumbnails folder (the legacy default).
function newestArtwork() {
  const files = fs
    .readdirSync(THUMBNAILS_DIR)
    .filter((f) => fs.lstatSync(path.join(THUMBNAILS_DIR, f)).isFile());
  files.sort(
    (a, b) =>
      fs.statSync(path.join(THUMBNAILS_DIR, b)).mtime.getTime() -
      fs.statSync(path.join(THUMBNAILS_DIR, a)).mtime.getTime()
  );
  return files[0] || null;
}

function legacyArtist(date = new Date()) {
  return `Bant Yayini (${date.toLocaleDateString("en-GB").replace(/\//g, ".")})`;
}

let current = null; // { proc, startedAt, title, artist, artwork, startedBy }
let lastResult = null; // { ok, recordingId?, error?, at }
let maxTimer = null;

function broadcast() {
  try {
    require("../ws/studioSocket").broadcast("recorder:state", status());
  } catch (_) {
    // no WS in tests
  }
}

function isRecording() {
  return !!current;
}

function status() {
  return {
    recording: !!current,
    startedAt: current ? current.startedAt.toISOString() : null,
    elapsedSec: current ? Math.floor((Date.now() - current.startedAt) / 1000) : 0,
    title: current ? current.title : null,
    artist: current ? current.artist : null,
    artwork: current ? current.artwork : null,
    startedBy: current ? current.startedBy : null,
    maxHours: MAX_HOURS,
    last: lastResult,
  };
}

// Start recording. Throws { code: "BUSY" } if one is already running.
function start({ title, artist, album = "", artwork, startedBy = null } = {}) {
  if (current) {
    const err = new Error("Recording already in progress");
    err.code = "BUSY";
    throw err;
  }
  const startedAt = new Date();
  const proc = spawn("node", [path.join(__dirname, "..", "record.js"), recordStreamUrl()], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  current = {
    proc,
    startedAt,
    title: title || "Morning Delight",
    artist: artist || legacyArtist(startedAt),
    album,
    artwork: artwork || null,
    startedBy,
  };
  const job = current;

  proc.on("message", async (message) => {
    if (message.status === "finished") {
      try {
        const filePath = message.filePath;
        const fileName = path.basename(filePath);
        const artworkFile = job.artwork || newestArtwork();
        const artworkPath = artworkFile ? path.join(THUMBNAILS_DIR, artworkFile) : undefined;
        addMetadata(filePath, job.title, job.artist, job.album, artworkPath);
        const { Recording } = require("../models");
        const rec = await Recording.create({
          // Legacy id scheme (md5 of the file path), kept for compatibility.
          id: md5(filePath),
          filename: fileName,
          stream: `recording/recordings/${fileName}`,
          title: job.title,
          artist: job.artist,
          album: job.album,
          artwork: artworkFile ? `static/assets/thumbnails/${artworkFile}` : null,
          duration: Math.floor(message.duration),
          size: fs.statSync(filePath).size / (1024 * 1024),
          play_count: 0,
          date: new Date(),
        });
        lastResult = { ok: true, recordingId: rec.id, title: rec.title, at: new Date().toISOString() };
        logger.info("Recording processed and saved", { id: rec.id, fileName });
        // Upload to R2 in the background when RECORDINGS_STORAGE=r2; it stays
        // playable from disk until then (and if the upload fails).
        require("./recordingStorage")
          .afterRecorded(rec)
          .then(broadcast)
          .catch((err) => logger.error("Recording upload failed", { error: String(err) }));
      } catch (err) {
        lastResult = { ok: false, error: String(err), at: new Date().toISOString() };
        logger.error("Recording save failed", { error: String(err) });
      }
      broadcast();
    } else if (message.status === "error") {
      lastResult = { ok: false, error: message.error, at: new Date().toISOString() };
      logger.error("Recording process encountered an error", { error: message.error });
    }
  });

  proc.on("exit", () => {
    if (current === job) current = null;
    clearTimeout(maxTimer);
    broadcast();
  });

  // Safety net: a forgotten recorder would fill the disk.
  clearTimeout(maxTimer);
  maxTimer = setTimeout(() => {
    if (current === job) {
      logger.warn("Recording hit the maximum length; stopping", { hours: MAX_HOURS });
      stop();
    }
  }, MAX_HOURS * 3600 * 1000);
  if (maxTimer.unref) maxTimer.unref();

  logger.info("Recording started", { title: current.title, startedBy });
  broadcast();
  return status();
}

// Ask record.js to stop; the file is finalized + saved asynchronously.
function stop() {
  if (!current) {
    const err = new Error("No recording in progress");
    err.code = "IDLE";
    throw err;
  }
  current.proc.send("stop");
  current = null; // matches the legacy route: idle as soon as stop is sent
  clearTimeout(maxTimer);
  broadcast();
  return status();
}

module.exports = {
  start,
  stop,
  status,
  isRecording,
  recordStreamUrl,
  addMetadata,
  RECORDINGS_DIR,
  THUMBNAILS_DIR,
};
