const express = require("express");
const multer = require("multer");
const { staffRequired } = require("../services/staffAuth");
const recordings = require("../controllers/recordingsApiController");
const content = require("../controllers/listenerContentController");

// Panel API for the listener-side features that used to live only in the EJS
// dashboard: recorded programmes, listener chat, announcement, push.
const router = express.Router();
const admin = staffRequired("admin");
const hosts = staffRequired("admin", "dj");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Recorder: DJs can record their own show.
router.get("/recordings/recorder", hosts, recordings.recorderStatus);
router.post("/recordings/recorder/start", hosts, recordings.recorderStart);
router.post("/recordings/recorder/stop", hosts, recordings.recorderStop);
// Artwork + the archive.
router.get("/recordings/artworks", hosts, recordings.artworks);
router.post("/recordings/artworks", admin, imageUpload.single("artwork"), recordings.uploadArtwork);
router.delete("/recordings/artworks/:file", admin, recordings.deleteArtwork);
router.get("/recordings", hosts, recordings.list);
router.get("/recordings/:id/audio", hosts, recordings.audio);
router.patch("/recordings/:id", admin, recordings.update);
router.put("/recordings/:id/file", admin, upload.single("file"), recordings.replaceFile);
router.delete("/recordings/:id", admin, recordings.remove);
router.post("/recordings/:id/upload", admin, recordings.upload);

// Listener chat: DJs moderate and reply during their show.
router.get("/chat", hosts, content.chatList);
router.post("/chat", hosts, content.chatPost);
router.delete("/chat/:id", hosts, content.chatDelete);
router.delete("/chat", admin, content.chatClear);

// Announcement + push notifications: admin.
router.get("/announcement", hosts, content.announcementGet);
router.put("/announcement", admin, content.announcementSet);
router.delete("/announcement", admin, content.announcementClear);
router.get("/notifications", admin, content.pushOverview);
router.post("/notifications", admin, content.pushSend);

module.exports = router;
