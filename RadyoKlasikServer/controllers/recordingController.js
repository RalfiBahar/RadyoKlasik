const fs = require("fs");
const path = require("path");
const { Router } = require("express");
const multer = require("multer");
const { tokenRequired } = require("../middlewares/authMiddleware");
const Recording = require("../models/recording");
const { sequelize } = require("../config/database");
const mime = require("mime-types");
const md5 = require("md5");
const NodeID3 = require("node-id3");
const { Sequelize } = require("sequelize");
const { spawn } = require("child_process");
const convertToHttps = require("../utils/convertToHttps");
const logger = require("../logger");
const router = Router();
const upload = multer();

let isRecording = false;
let recordThread = null;
let audioData = Buffer.from([]);
const recordingsDir = path.join(__dirname, "..", "recordings");
const thumbnailsDir = path.join(
  __dirname,
  "..",
  "public",
  "static",
  "assets",
  "thumbnails"
);
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

// Helper function to add metadata to MP3 files
function addMetadata(filePath, title, artist, album, artworkPath) {
  logger.info("Adding metadata to file", { filePath, artworkPath });
  const tags = {
    title: title,
    artist: artist,
    album: album,
    APIC: artworkPath,
  };

  NodeID3.write(tags, filePath, (err) => {
    if (err) {
      logger.error("Error writing ID3 tags:", err);
    }
  });
}

// Start recording route
router.post("/start", tokenRequired, (req, res) => {
  if (isRecording) {
    return res.status(400).json({ message: "Recording already in progress" });
  }

  const url = "http://stream.radiojar.com/bw66d94ksg8uv";

  const scriptPath = path.join(__dirname, "..", "record.js");
  recordingProcess = spawn("node", [scriptPath, url], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  isRecording = true;
  recordingStartTime = Date.now();
  logger.info("Recording started", { url });

  durationInterval = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
    logger.info(`Recording duration: ${elapsedSeconds} seconds`);
  }, 1000);

  recordingProcess.on("message", async (message) => {
    if (message.status === "finished") {
      logger.info("Recording finished, processing the file", {
        duration: message.duration,
      });
      // Apply metadata and add to the database
      const filePath = message.filePath;
      const duration = message.duration;
      const fileName = path.basename(filePath);
      const currDate = new Date()
        .toLocaleDateString("en-GB")
        .replace(/\//g, ".");
      const selectedArtwork = req.body.selected_artwork;

      let artworkPath;
      if (selectedArtwork) {
        artworkPath = path.join(thumbnailsDir, selectedArtwork);
      } else {
        const listOfFiles = fs.readdirSync(thumbnailsDir);
        artworkPath = path.join(
          thumbnailsDir,
          listOfFiles.sort(
            (a, b) =>
              fs.statSync(path.join(thumbnailsDir, b)).mtime.getTime() -
              fs.statSync(path.join(thumbnailsDir, a)).mtime.getTime()
          )[0]
        );
      }

      const relativeArtworkPath = path.relative(
        path.join(__dirname, "../public"),
        artworkPath
      );

      logger.info("Adding metadata", { artworkPath });
      addMetadata(
        filePath,
        "Morning Delight",
        `Bant Yayini (${currDate})`,
        "",
        artworkPath
      );

      const recordingSize = fs.statSync(filePath).size / (1024 * 1024); // size in MB
      const newRecording = await Recording.create({
        id: getFileHash(filePath),
        filename: fileName,
        stream: `recording/recordings/${fileName}`,
        title: "Morning Delight",
        artist: `Bant Yayini (${currDate})`,
        album: "",
        artwork: relativeArtworkPath,
        duration: Math.floor(duration), // duration in seconds
        size: recordingSize, // in MB
        play_count: 0,
        date: new Date(),
      });

      logger.info("Recording processed and saved", { newRecording });
    } else if (message.status === "error") {
      logger.error("Recording process encountered an error", {
        error: message.error,
      });
    } else if (message.status === "stopped") {
      logger.info("Recording stopped gracefully");
    }
  });

  recordingProcess.on("exit", (code) => {
    logger.info(`Recording process exited with code ${code}`);
    isRecording = false;
    recordingProcess = null;
    recordingStartTime = null;
    clearInterval(durationInterval);
  });

  res.json({ message: "Recording started" });
});

// Stop recording route
router.post("/stop", tokenRequired, (req, res) => {
  if (!isRecording) {
    return res.status(400).json({ message: "No recording in progress" });
  }

  recordingProcess.send("stop");
  isRecording = false;
  recordingStartTime = null;
  clearInterval(durationInterval);
  logger.info("Recording stop signal sent");
  res.json({ message: "Recording stop signal sent" });
});

// Status route
router.get("/status", tokenRequired, (req, res) => {
  if (isRecording) {
    const elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
    res.json({
      message: "Recording in progress",
      is_recording: true,
      elapsed_time: `${elapsedSeconds}`,
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

    recording.play_count += 1;
    await recording.save();
    logger.info("Retrieving recording file", {
      filename,
      play_count: recording.play_count,
    });
    return res.sendFile(path.join(recordingsDir, filename));
  } catch (e) {
    logger.error("Error retrieving recording file", { error: e });
    return res.status(404).json({ error: String(e) });
  }
});

// Get recordings list
router.get("/recordings", tokenRequired, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const recordings = await Recording.findAll({
      order: [["date", "DESC"]],
      limit,
    });
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
  const baseUrl = "http://stream.radiojar.com/bw66d94ksg8uv";
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
router.post("/upload_artwork", upload.single("artwork"), async (req, res) => {
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
router.get("/get_artworks", tokenRequired, (req, res) => {
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
  tokenRequired,
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
router.delete("/remove/:recording_id", tokenRequired, async (req, res) => {
  const recordingId = req.params.recording_id;

  try {
    const existingRecording = await Recording.findOne({
      where: { id: recordingId },
    });
    if (!existingRecording) {
      logger.warn("Recording not found for removal", { recordingId });
      return res.status(404).json({ error: "Recording not found" });
    }

    const recordingPath = path.join(recordingsDir, existingRecording.filename);
    if (fs.existsSync(recordingPath)) {
      fs.unlinkSync(recordingPath);
    }

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
  tokenRequired,
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

module.exports = router;
