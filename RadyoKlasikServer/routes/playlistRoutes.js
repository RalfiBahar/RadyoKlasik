const express = require("express");
const { staffRequired } = require("../services/staffAuth");

const staff = staffRequired();
const editors = staffRequired("admin", "dj");
const playlists = require("../controllers/playlistController");

const router = express.Router();

router.get("/", staff, playlists.listPlaylists);
router.post("/", editors, playlists.createPlaylist);
router.get("/:id", staff, playlists.getPlaylist);
router.patch("/:id/reorder", editors, playlists.reorder);
router.patch("/:id", editors, playlists.updatePlaylist);
router.delete("/:id", editors, playlists.deletePlaylist);
router.post("/:id/items", editors, playlists.addItem);
router.delete("/:id/items/:itemId", editors, playlists.removeItem);

module.exports = router;
