const { Show, User, Episode, Playlist, ShowHost, sequelize } = require("../models");
const scheduler = require("../services/scheduler");
const logger = require("../logger");

// Phase 7 — shows (title, tagline, colour, hosts, automation playlist) and
// their episode log. Reads are open to staff; writes are admin-only.

function serialize(show) {
  return {
    id: show.id,
    title: show.title,
    tagline: show.tagline || null,
    color: show.color || null,
    playlistId: show.playlistId || null,
    playlistName: show.playlist ? show.playlist.name : null,
    hosts: (show.hosts || []).map((h) => ({
      id: h.id,
      username: h.username,
      name: h.displayName || h.username,
    })),
    createdAt: show.createdAt,
  };
}

const INCLUDE = [
  { model: User, as: "hosts", attributes: ["id", "username", "displayName"] },
  { model: Playlist, as: "playlist", attributes: ["id", "name"] },
];

async function load(id) {
  return Show.findByPk(id, { include: INCLUDE });
}

async function setHosts(showId, hostIds, transaction) {
  await ShowHost.destroy({ where: { showId }, transaction });
  const ids = [...new Set((hostIds || []).filter(Boolean))];
  if (ids.length === 0) return;
  const users = await User.findAll({ where: { id: ids }, transaction });
  await ShowHost.bulkCreate(
    users.map((u) => ({ showId, userId: u.id })),
    { transaction }
  );
}

function validColor(c) {
  return c == null || c === "" || /^#[0-9a-f]{6}$/i.test(c);
}

// GET /api/v1/shows
exports.list = async (req, res) => {
  try {
    const shows = await Show.findAll({ include: INCLUDE, order: [["title", "ASC"]] });
    return res.json({ items: shows.map(serialize) });
  } catch (err) {
    logger.error("shows list failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/shows { title, tagline?, color?, playlistId?, hostIds? }
exports.create = async (req, res) => {
  const { title, tagline, color, playlistId, hostIds } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (!validColor(color)) return res.status(400).json({ error: "color must be #rrggbb" });
  try {
    const show = await sequelize.transaction(async (t) => {
      const s = await Show.create(
        {
          title: String(title).trim(),
          tagline: tagline || null,
          color: color || null,
          playlistId: playlistId || null,
        },
        { transaction: t }
      );
      await setHosts(s.id, hostIds, t);
      return s;
    });
    await scheduler.refresh();
    return res.status(201).json(serialize(await load(show.id)));
  } catch (err) {
    logger.error("show create failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// PATCH /api/v1/shows/:id
exports.update = async (req, res) => {
  const body = req.body || {};
  if (body.color !== undefined && !validColor(body.color)) {
    return res.status(400).json({ error: "color must be #rrggbb" });
  }
  try {
    const show = await Show.findByPk(req.params.id);
    if (!show) return res.status(404).json({ error: "show not found" });
    await sequelize.transaction(async (t) => {
      if (body.title !== undefined) {
        if (!String(body.title).trim()) throw Object.assign(new Error("title is required"), { status: 400 });
        show.title = String(body.title).trim();
      }
      if (body.tagline !== undefined) show.tagline = body.tagline || null;
      if (body.color !== undefined) show.color = body.color || null;
      if (body.playlistId !== undefined) show.playlistId = body.playlistId || null;
      await show.save({ transaction: t });
      if (body.hostIds !== undefined) await setHosts(show.id, body.hostIds, t);
    });
    await scheduler.refresh();
    return res.json(serialize(await load(show.id)));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("show update failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// DELETE /api/v1/shows/:id (its schedule slots cascade)
exports.remove = async (req, res) => {
  try {
    const n = await Show.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ error: "show not found" });
    await scheduler.refresh();
    return res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    logger.error("show delete failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/shows/:id/episodes
exports.episodes = async (req, res) => {
  try {
    const items = await Episode.findAll({
      where: { showId: req.params.id },
      order: [["airedAt", "DESC"]],
      limit: 100,
    });
    return res.json({
      items: items.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        airedAt: e.airedAt,
      })),
    });
  } catch (err) {
    logger.error("episodes list failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};
