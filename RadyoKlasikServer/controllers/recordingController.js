const fs = require("fs");
const path = require("path");
const { Router } = require("express");
const multer = require("multer");
const {
  tokenRequired,
  adminRequired,
  loginRequired,
} = require("../middlewares/authMiddleware");
const Recording = require("../models/recording");
const { sequelize } = require("../config/database");
const mime = require("mime-types");
const md5 = require("md5");
const { Sequelize } = require("sequelize");
const convertToHttps = require("../utils/convertToHttps");
const logger = require("../logger");

const recorder = require("../services/recorder");
const recordingStorage = require("../services/recordingStorage");

// Listener apps get the public stream URL from /get_redirect.
function publicStreamUrl() {
  return (
    process.env.PUBLIC_STREAM_URL || "https://stream.radyoklasik.online/stream"
  );
}
const router = Router();
const upload = multer();

// Recordings + thumbnails live on the persistent app-data volume in docker.
const { RECORDINGS_DIR: recordingsDir, THUMBNAILS_DIR: thumbnailsDir, ANNOUNCEMENT_FILE } =
  require("../config/appData");
if (!fs.existsSync(thumbnailsDir)) {
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  logger.info("Thumbnails directory created");
}
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
  logger.info("Recordings directory created");
}

async function getDb() {
  return await sequelize.transaction();
}

// Helper function to get file hash
function getFileHash(fileContent) {
  return md5(fileContent);
}

// Start/stop/status delegate to the shared recorder (services/recorder.js),
// which the panel's /api/v1/recordings also uses — one recorder at a time.
// Responses are unchanged for the EJS dashboard.
router.post("/start", adminRequired, (req, res) => {
  try {
    recorder.start({ artwork: req.body.selected_artwork || null, startedBy: "dashboard" });
    res.json({ message: "Recording started" });
  } catch (err) {
    if (err.code === "BUSY") {
      return res.status(400).json({ message: "Recording already in progress" });
    }
    logger.error("Recording start failed", { error: String(err) });
    return res.status(500).json({ message: String(err) });
  }
});

router.post("/stop", adminRequired, (req, res) => {
  try {
    recorder.stop();
    res.json({ message: "Recording stop signal sent" });
  } catch (err) {
    return res.status(400).json({ message: "No recording in progress" });
  }
});

router.get("/status", adminRequired, (req, res) => {
  const st = recorder.status();
  if (st.recording) {
    res.json({
      message: "Recording in progress",
      is_recording: true,
      elapsed_time: `${st.elapsedSec}`,
    });
  } else {
    res.json({ message: "No recording in progress", is_recording: false });
  }
});

// Get recording file
//token
router.get("/recordings/:filename", tokenRequired, async (req, res) => {
  const filename = req.params.filename;
  try {
    const recording = await Recording.findOne({ where: { filename } });
    if (!recording) {
      logger.warn("Recording not found", { filename });
      return res.status(404).json({ error: "Recording not found" });
    }

    const where = await recordingStorage.resolvePlayback(recording);
    if (where.missing) {
      logger.warn("Recording file missing", { filename });
      return res.status(404).json({ error: "Recording file missing" });
    }

    recording.play_count += 1;
    await recording.save();
    logger.info("Retrieving recording file", {
      filename,
      play_count: recording.play_count,
      from: where.redirect ? "r2" : "disk",
    });
    // In R2: same URL for the apps, the player just follows the redirect and
    // seeks against R2 directly.
    if (where.redirect) {
      res.set("Cache-Control", "no-store");
      return res.redirect(302, where.redirect);
    }
    return res.sendFile(where.file);
  } catch (e) {
    logger.error("Error retrieving recording file", { error: e });
    return res.status(404).json({ error: String(e) });
  }
});

// Get recordings list
router.get("/recordings", tokenRequired, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;

    const findOptions = {
      order: [["date", "DESC"]],
    };
    if (limit !== undefined) {
      findOptions.limit = limit;
    }

    const recordings = await Recording.findAll(findOptions);

    const recordingsList = recordings.map((recording) => ({
      id: recording.id,
      filename: recording.filename,
      title: recording.title,
      artist: recording.artist,
      album: recording.album,
      artwork: recording.artwork,
      duration: recording.duration,
      size: recording.size,
      date: recording.date,
      stream: recording.stream,
      play_count: recording.play_count,
      special: recording.special,
    }));
    logger.info("Recordings list retrieved", { count: recordingsList.length });
    return res.json({ recordings: recordingsList });
  } catch (e) {
    logger.error("Error retrieving recordings list", { error: e });
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/get_redirect", tokenRequired, async (req, res) => {
  const baseUrl = publicStreamUrl();
  try {
    const finalUrl = await getFinalMp3Url(baseUrl);
    if (finalUrl) {
      logger.info("Redirect MP3 stream URL retrieved", { finalUrl });
      return res.json({ url: finalUrl });
    } else {
      logger.error("Failed to retrieve the redirect MP3 stream URL");
      return res
        .status(500)
        .json({ error: "Failed to retrieve the redirect MP3 stream URL" });
    }
  } catch (e) {
    logger.error("Error retrieving redirect MP3 stream URL", { error: e });
    return res.status(500).json({ error: String(e) });
  }
});

async function getFinalMp3Url(baseUrl) {
  try {
    const parsedUrl = new URL(baseUrl);
    const scheme = parsedUrl.protocol.slice(0, -1);

    return new Promise((resolve, reject) => {
      const conn = require(scheme).request(parsedUrl.href, (response) => {
        // Only the status/headers matter; never consume a live stream body
        // (an Icecast mount is an endless response).
        response.destroy();
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            // logger.info("Redirecting to new URL", { redirectUrl });
            resolve(convertToHttps(redirectUrl));
          } else {
            reject(new Error("Redirect URL not found"));
          }
        } else {
          resolve(parsedUrl.href);
        }
      });

      conn.on("error", (err) => {
        logger.error("Error in HTTP request", { error: err });
        reject(err);
      });

      conn.end();
    });
  } catch (e) {
    logger.error("Error occurred while processing URL", { error: e });
    return null;
  }
}

// Upload artwork
router.post("/upload_artwork", adminRequired, upload.single("artwork"), async (req, res) => {
  const file = req.file;
  if (!file) {
    logger.warn("No file part in upload request");
    return res.status(400).json({ error: "No file part" });
  }

  const fileContent = file.buffer;
  const fileHash = getFileHash(fileContent);

  const mimeType = file.mimetype;
  let extension = mime.extension(mimeType);
  if (!extension) {
    extension = "jpg";
  }

  const filename = `${fileHash}.${extension}`;
  const filePath = path.join(thumbnailsDir, filename);
  fs.writeFileSync(filePath, fileContent);
  logger.info("Artwork uploaded", { filename });

  return res.redirect("/dashboard");
});

// Get artworks list
router.get("/get_artworks", adminRequired, (req, res) => {
  try {
    const artworks = fs
      .readdirSync(thumbnailsDir)
      .filter((file) => fs.lstatSync(path.join(thumbnailsDir, file)).isFile());
    artworks.sort(
      (a, b) =>
        fs.statSync(path.join(thumbnailsDir, b)).mtime.getTime() -
        fs.statSync(path.join(thumbnailsDir, a)).mtime.getTime()
    );
    logger.info("Artworks list retrieved", { count: artworks.length });
    return res.json(artworks);
  } catch (e) {
    logger.error("Error retrieving artworks list", { error: e });
    return res.status(500).json({ error: String(e) });
  }
});

// Replace recording
router.post(
  "/replace",
  adminRequired,
  upload.single("replacement"),
  async (req, res) => {
    const recordingId = req.body.recording_id;
    const file = req.file;
    if (!recordingId || !file) {
      logger.warn("Invalid request for replacing recording", { recordingId });
      return res.status(400).json({ error: "Invalid request" });
    }

    try {
      const existingRecording = await Recording.findOne({
        where: { id: recordingId },
      });
      if (!existingRecording) {
        logger.warn("Recording not found for replacement", { recordingId });
        return res.status(404).json({ error: "Recording not found" });
      }

      const replacementPath = path.join(
        recordingsDir,
        existingRecording.filename
      );
      fs.writeFileSync(replacementPath, file.buffer);
      logger.info("Recording replaced", { recordingId });

      const recordingSize = fs.statSync(replacementPath).size / (1024 * 1024); // size in MB
      const musicMetadata = await import("music-metadata");
      const metadata = await musicMetadata.parseFile(replacementPath);
      const duration = Math.floor(metadata.format.duration);
      const title = metadata.common.title || existingRecording.title;
      const artist = metadata.common.artist || existingRecording.artist;
      const album = metadata.common.album || existingRecording.album;

      existingRecording.size = recordingSize;
      existingRecording.duration = duration;
      existingRecording.title = title;
      existingRecording.artist = artist;
      existingRecording.album = album;

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const artworkData = metadata.common.picture[0].data;
        const artworkHash = getFileHash(artworkData);
        const mimeType = metadata.common.picture[0].format;
        let extension = mime.extension(mimeType);

        if (!extension) {
          extension = "jpg";
        }

        const artworkFilename = `${artworkHash}.${extension}`;
        const artworkPath = path.join(thumbnailsDir, artworkFilename);

        const existingFiles = [".jpg", ".jpeg", ".png", ".gif", ".bmp"].map(
          (ext) => path.join(thumbnailsDir, `${artworkHash}${ext}`)
        );
        const fileExists = existingFiles.find((file) => fs.existsSync(file));

        if (!fileExists) {
          fs.writeFileSync(artworkPath, artworkData);
        }

        existingRecording.artwork = `/static/assets/thumbnails/${artworkFilename}`;
      }

      await existingRecording.save();
      await recordingStorage.afterLocalChange(existingRecording);
      logger.info("Recording metadata updated after replacement", {
        recordingId,
      });
      return res.json({
        message: "Recording replaced and updated successfully",
      });
    } catch (e) {
      logger.error("Error replacing recording", { error: e });
      return res.status(400).json({ error: String(e) });
    }
  }
);

// Remove recording
router.delete("/remove/:recording_id", adminRequired, async (req, res) => {
  const recordingId = req.params.recording_id;

  try {
    const existingRecording = await Recording.findOne({
      where: { id: recordingId },
    });
    if (!existingRecording) {
      logger.warn("Recording not found for removal", { recordingId });
      return res.status(404).json({ error: "Recording not found" });
    }

    await recordingStorage.removeFiles(existingRecording);
    await existingRecording.destroy();

    logger.info("Recording removed successfully", { recordingId });
    return res.json({ message: "Recording removed successfully" });
  } catch (e) {
    logger.error("Error removing recording", { error: e });
    return res.status(400).json({ error: String(e) });
  }
});

// Remove artwork
router.delete(
  "/remove_artwork/:artwork_filename",
  adminRequired,
  async (req, res) => {
    const artworkFilename = req.params.artwork_filename;
    const artworkPath = path.join(thumbnailsDir, artworkFilename);

    if (!fs.existsSync(artworkPath)) {
      logger.warn("Artwork not found for removal", { artworkFilename });
      return res.status(404).json({ error: "Artwork not found" });
    }

    try {
      const artworkBase = path.basename(
        artworkFilename,
        path.extname(artworkFilename)
      );
      const recordingsUsingArtwork = await Recording.count({
        where: {
          artwork: {
            [Sequelize.Op.like]: `%${artworkBase}%`,
          },
        },
      });

      if (recordingsUsingArtwork > 0) {
        logger.warn("Artwork is being used by one or more recordings", {
          artworkFilename,
        });
        return res
          .status(400)
          .json({ error: "Artwork is being used by one or more recordings" });
      }

      fs.unlinkSync(artworkPath);
      logger.info("Artwork removed successfully", { artworkFilename });
      return res.json({ message: "Artwork removed successfully" });
    } catch (e) {
      logger.error("Error removing artwork", { error: e });
      return res.status(400).json({ error: String(e) });
    }
  }
);

const announcementFilePath = ANNOUNCEMENT_FILE;

// Create or overwrite announcement
router.post("/announcement", adminRequired, async (req, res) => {
  const { announcement } = req.body;

  if (!announcement) {
    return res
      .status(400)
      .json({ message: "Announcement content is required" });
  }

  try {
    // Write or overwrite the announcement to the file
    fs.writeFileSync(announcementFilePath, announcement, "utf8");
    logger.info("Announcement created/updated", { announcement });
    return res.json({ message: "Announcement created/updated successfully" });
  } catch (error) {
    logger.error("Error writing announcement", { error });
    return res
      .status(500)
      .json({ message: "Error creating/updating announcement" });
  }
});

// Get the current announcement
router.get("/announcement", tokenRequired, async (req, res) => {
  try {
    if (!fs.existsSync(announcementFilePath)) {
      logger.warn("No announcement found");
      return res.status(404).json({ message: "No announcement found" });
    }

    // Read the current announcement
    const announcement = fs.readFileSync(announcementFilePath, "utf8");
    logger.info("Announcement retrieved", { announcement });
    return res.json({ announcement });
  } catch (error) {
    logger.error("Error retrieving announcement", { error });
    return res.status(500).json({ message: "Error retrieving announcement" });
  }
});

router.get("/announcement-center", loginRequired, (req, res) => {
  res.render("announcement-center", {
    shared_secret_key: process.env.SHARED_SECRET_KEY,
  });
});

module.exports = router;
