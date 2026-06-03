const express = require("express");
const multer = require("multer");
const { tokenRequired } = require("../middlewares/authMiddleware");
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

router.get("/tracks", tokenRequired, library.listTracks);
router.get("/tracks/:id/waveform", tokenRequired, library.getWaveform);
router.get("/tracks/:id", tokenRequired, library.getTrack);
router.post("/tracks", tokenRequired, uploadFields, library.uploadTrack);
router.patch("/tracks/:id", tokenRequired, library.updateTrack);
router.delete("/tracks/:id", tokenRequired, library.deleteTrack);
router.post("/bulk", tokenRequired, library.bulk);

module.exports = router;
