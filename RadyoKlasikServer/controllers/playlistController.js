const {
  sequelize,
  Playlist,
  PlaylistItem,
  Track,
} = require("../models");
const { serializeTrack } = require("./libraryController");
const logger = require("../logger");

function serializePlaylist(playlist, items) {
  const out = {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    createdAt: playlist.createdAt,
  };
  if (items) {
    out.itemCount = items.length;
    out.items = items.map((item) => ({
      id: item.id,
      position: item.position,
      track: item.track ? serializeTrack(item.track) : null,
    }));
  }
  return out;
}

async function loadItems(playlistId) {
  return PlaylistItem.findAll({
    where: { playlistId },
    order: [["position", "ASC"]],
    include: [{ model: Track, as: "track" }],
  });
}

// POST /api/v1/playlists
exports.createPlaylist = async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const playlist = await Playlist.create({ name, description });
    return res.status(201).json(serializePlaylist(playlist, []));
  } catch (err) {
    logger.error("Create playlist failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/playlists
exports.listPlaylists = async (req, res) => {
  try {
    const playlists = await Playlist.findAll({
      order: [["createdAt", "DESC"]],
      include: [{ model: PlaylistItem, as: "items", attributes: ["id"] }],
    });
    return res.json({
      items: playlists.map((p) => ({
        ...serializePlaylist(p),
        itemCount: p.items ? p.items.length : 0,
      })),
    });
  } catch (err) {
    logger.error("List playlists failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/playlists/:id
exports.getPlaylist = async (req, res) => {
  const playlist = await Playlist.findByPk(req.params.id);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  const items = await loadItems(playlist.id);
  return res.json(serializePlaylist(playlist, items));
};

// PATCH /api/v1/playlists/:id
exports.updatePlaylist = async (req, res) => {
  const playlist = await Playlist.findByPk(req.params.id);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  const { name, description } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  await playlist.update(updates);
  return res.json(serializePlaylist(playlist));
};

// DELETE /api/v1/playlists/:id
exports.deletePlaylist = async (req, res) => {
  const playlist = await Playlist.findByPk(req.params.id);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  await playlist.destroy(); // PlaylistItems cascade
  return res.json({ deleted: true, id: playlist.id });
};

// POST /api/v1/playlists/:id/items  { trackId, position? }
exports.addItem = async (req, res) => {
  const playlist = await Playlist.findByPk(req.params.id);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });

  const { trackId, position } = req.body || {};
  if (!trackId) return res.status(400).json({ error: "trackId is required" });

  const track = await Track.findByPk(trackId);
  if (!track) return res.status(404).json({ error: "Track not found" });

  try {
    const item = await sequelize.transaction(async (transaction) => {
      const items = await PlaylistItem.findAll({
        where: { playlistId: playlist.id },
        order: [["position", "ASC"]],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      let insertAt = items.length;
      if (position !== undefined && position !== null) {
        insertAt = Math.max(0, Math.min(items.length, parseInt(position, 10)));
      }
      // Shift items at/after the insert point to keep positions dense.
      for (let i = items.length - 1; i >= insertAt; i--) {
        await items[i].update(
          { position: items[i].position + 1 },
          { transaction }
        );
      }
      return PlaylistItem.create(
        { playlistId: playlist.id, trackId, position: insertAt },
        { transaction }
      );
    });

    const items = await loadItems(playlist.id);
    return res.status(201).json({
      item: { id: item.id, position: item.position, trackId },
      playlist: serializePlaylist(playlist, items),
    });
  } catch (err) {
    logger.error("Add playlist item failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// PATCH /api/v1/playlists/:id/reorder  { orderedIds: [playlistItemId, ...] }
exports.reorder = async (req, res) => {
  const playlist = await Playlist.findByPk(req.params.id);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });

  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "orderedIds must be an array" });
  }

  try {
    const items = await PlaylistItem.findAll({
      where: { playlistId: playlist.id },
    });
    const itemIds = new Set(items.map((i) => i.id));
    if (
      orderedIds.length !== items.length ||
      !orderedIds.every((id) => itemIds.has(id))
    ) {
      return res.status(400).json({
        error: "orderedIds must be a permutation of this playlist's item ids",
      });
    }

    await sequelize.transaction(async (transaction) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await PlaylistItem.update(
          { position: i },
          { where: { id: orderedIds[i] }, transaction }
        );
      }
    });

    const reloaded = await loadItems(playlist.id);
    return res.json(serializePlaylist(playlist, reloaded));
  } catch (err) {
    logger.error("Reorder playlist failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// DELETE /api/v1/playlists/:id/items/:itemId
exports.removeItem = async (req, res) => {
  const playlist = await Playlist.findByPk(req.params.id);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });

  try {
    await sequelize.transaction(async (transaction) => {
      const item = await PlaylistItem.findOne({
        where: { id: req.params.itemId, playlistId: playlist.id },
        transaction,
      });
      if (!item) {
        const e = new Error("Item not found");
        e.status = 404;
        throw e;
      }
      const removedPos = item.position;
      await item.destroy({ transaction });
      // Close the gap so positions stay dense.
      const after = await PlaylistItem.findAll({
        where: { playlistId: playlist.id },
        order: [["position", "ASC"]],
        transaction,
      });
      for (const it of after) {
        if (it.position > removedPos) {
          await it.update({ position: it.position - 1 }, { transaction });
        }
      }
    });

    const reloaded = await loadItems(playlist.id);
    return res.json(serializePlaylist(playlist, reloaded));
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: "Item not found" });
    }
    logger.error("Remove playlist item failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};
