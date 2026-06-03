const express = require("express");
const { tokenRequired } = require("../middlewares/authMiddleware");
const playlists = require("../controllers/playlistController");

const router = express.Router();

router.get("/", tokenRequired, playlists.listPlaylists);
router.post("/", tokenRequired, playlists.createPlaylist);
router.get("/:id", tokenRequired, playlists.getPlaylist);
router.patch("/:id/reorder", tokenRequired, playlists.reorder);
router.patch("/:id", tokenRequired, playlists.updatePlaylist);
router.delete("/:id", tokenRequired, playlists.deletePlaylist);
router.post("/:id/items", tokenRequired, playlists.addItem);
router.delete("/:id/items/:itemId", tokenRequired, playlists.removeItem);

module.exports = router;
