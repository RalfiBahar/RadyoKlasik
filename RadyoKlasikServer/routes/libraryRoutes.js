const express = require("express");
const multer = require("multer");
const { staffRequired } = require("../services/staffAuth");

const staff = staffRequired();
const editors = staffRequired("admin", "dj");
const library = require("../controllers/libraryController");

const router = express.Router();

// In-memory upload so we can hash + analyze before committing to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300 MB
});

const uploadFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "artwork", maxCount: 1 },
]);

router.get("/tracks", staff, library.listTracks);
router.get("/tracks/:id/waveform", staff, library.getWaveform);
router.get("/tracks/:id", staff, library.getTrack);
router.post("/tracks", editors, uploadFields, library.uploadTrack);
router.patch("/tracks/:id", editors, library.updateTrack);
router.delete("/tracks/:id", editors, library.deleteTrack);
router.post("/bulk", editors, library.bulk);

module.exports = router;
