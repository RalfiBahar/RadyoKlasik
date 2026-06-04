const { QueueItem, Track } = require("../models");
const queueSync = require("../services/queueSync");
const logger = require("../logger");

// Phase 3 — operator request queue. The DB QueueItem table owns the order;
// queueSync mirrors it into Liquidsoap and broadcasts queue:update over the
// /ws/studio WebSocket on every change.

async function reloadItemWithTrack(id) {
  return QueueItem.findByPk(id, { include: [{ model: Track, as: "track" }] });
}

// GET /api/v1/queue -> { nowPlaying, items: [...] }
exports.list = async (req, res) => {
  try {
    const state = await queueSync.getState();
    return res.json(state);
  } catch (err) {
    logger.error("queue list failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/queue { trackId, position?, requestedBy? }
exports.add = async (req, res) => {
  try {
    const { trackId, position, requestedBy } = req.body || {};
    if (!trackId) {
      return res.status(400).json({ error: "trackId is required" });
    }
    const track = await Track.findByPk(trackId);
    if (!track) {
      return res.status(404).json({ error: "track not found" });
    }

    const pending = await queueSync.pendingItems();
    const ids = pending.map((i) => i.id);
    let insertAt = ids.length;
    if (Number.isInteger(position) && position >= 0 && position <= ids.length) {
      insertAt = position;
    }
    const appended = insertAt === ids.length;

    const item = await QueueItem.create({
      trackId,
      requestedBy: requestedBy || null,
      status: "pending",
      position: insertAt,
    });

    // Re-densify positions for the new order.
    ids.splice(insertAt, 0, item.id);
    await Promise.all(
      ids.map((id, idx) => QueueItem.update({ position: idx }, { where: { id } }))
    );

    // Push to Liquidsoap: append fast-path, otherwise rebuild to honor order.
    try {
      if (appended) {
        item.track = track;
        await queueSync.pushItem(item);
      } else {
        await queueSync.reconcile();
      }
    } catch (err) {
      logger.warn("queue add: liquidsoap sync failed", { error: String(err) });
    }

    const state = await queueSync.broadcastUpdate();
    const fresh = await reloadItemWithTrack(item.id);
    return res.status(201).json({
      item: queueSync.serializeItem(fresh),
      queue: state,
    });
  } catch (err) {
    logger.error("queue add failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// PATCH /api/v1/queue/reorder { orderedIds: [...] }
exports.reorder = async (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: "orderedIds must be an array" });
    }
    await Promise.all(
      orderedIds.map((id, idx) =>
        QueueItem.update(
          { position: idx },
          { where: { id, status: "pending" } }
        )
      )
    );
    try {
      await queueSync.reconcile();
    } catch (err) {
      logger.warn("queue reorder: reconcile failed", { error: String(err) });
    }
    const state = await queueSync.broadcastUpdate();
    return res.json(state);
  } catch (err) {
    logger.error("queue reorder failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// DELETE /api/v1/queue/:id
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await QueueItem.findByPk(id);
    if (!item) {
      return res.status(404).json({ error: "queue item not found" });
    }
    await item.destroy();
    try {
      await queueSync.reconcile();
    } catch (err) {
      logger.warn("queue remove: reconcile failed", { error: String(err) });
    }
    const state = await queueSync.broadcastUpdate();
    return res.json(state);
  } catch (err) {
    logger.error("queue remove failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};
