const { ScheduleSlot, Show, Playlist } = require("../models");
const scheduler = require("../services/scheduler");
const settings = require("../services/settings");
const logger = require("../logger");

// Phase 7 — the station schedule (weekly + one-off slots) and station
// settings. Reads are open to staff; writes are admin-only.

const MAX_DURATION = 24 * 60;

function serialize(slot) {
  return {
    id: slot.id,
    title: slot.title || null,
    showId: slot.showId || null,
    showTitle: slot.show ? slot.show.title : null,
    playlistId: slot.playlistId || null,
    playlistName: slot.playlist ? slot.playlist.name : null,
    dayOfWeek: slot.dayOfWeek,
    date: slot.date || null,
    startMinute: slot.startMinute,
    durationMinutes: slot.durationMinutes,
    shuffle: slot.shuffle,
    color: slot.color || (slot.show && slot.show.color) || null,
  };
}

const INCLUDE = [
  { model: Show, as: "show", attributes: ["id", "title", "color"] },
  { model: Playlist, as: "playlist", attributes: ["id", "name"] },
];

// Validate a create/patch payload merged over `base`. Returns an error string
// or null.
function validate(v) {
  if (!v.showId && !v.playlistId) return "a slot needs a show or a playlist";
  if (v.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return "date must be YYYY-MM-DD";
  } else if (!Number.isInteger(v.dayOfWeek) || v.dayOfWeek < 0 || v.dayOfWeek > 6) {
    return "dayOfWeek must be 0 (Sun) .. 6 (Sat) for a weekly slot";
  }
  if (!Number.isInteger(v.startMinute) || v.startMinute < 0 || v.startMinute >= 1440) {
    return "startMinute must be 0..1439";
  }
  if (
    !Number.isInteger(v.durationMinutes) ||
    v.durationMinutes < 5 ||
    v.durationMinutes > MAX_DURATION
  ) {
    return "durationMinutes must be 5..1440";
  }
  if (v.color && !/^#[0-9a-f]{6}$/i.test(v.color)) return "color must be #rrggbb";
  return null;
}

const FIELDS = [
  "title",
  "showId",
  "playlistId",
  "dayOfWeek",
  "date",
  "startMinute",
  "durationMinutes",
  "shuffle",
  "color",
];

function pick(body) {
  const out = {};
  for (const k of FIELDS) if (body[k] !== undefined) out[k] = body[k];
  if (out.date === "") out.date = null;
  if (out.showId === "") out.showId = null;
  if (out.playlistId === "") out.playlistId = null;
  return out;
}

async function reload(id) {
  return ScheduleSlot.findByPk(id, { include: INCLUDE });
}

// GET /api/v1/schedule
exports.list = async (req, res) => {
  try {
    const slots = await ScheduleSlot.findAll({
      include: INCLUDE,
      order: [
        ["dayOfWeek", "ASC"],
        ["startMinute", "ASC"],
      ],
    });
    return res.json({
      items: slots.map(serialize),
      now: scheduler.getNow(),
    });
  } catch (err) {
    logger.error("schedule list failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/schedule/now
exports.now = (req, res) => res.json(scheduler.getNow());

// POST /api/v1/schedule
exports.create = async (req, res) => {
  try {
    const values = { shuffle: true, ...pick(req.body || {}) };
    if (values.date) values.dayOfWeek = null;
    const error = validate(values);
    if (error) return res.status(400).json({ error });
    const slot = await ScheduleSlot.create(values);
    await scheduler.refresh();
    return res.status(201).json(serialize(await reload(slot.id)));
  } catch (err) {
    logger.error("schedule create failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// PATCH /api/v1/schedule/:id
exports.update = async (req, res) => {
  try {
    const slot = await ScheduleSlot.findByPk(req.params.id);
    if (!slot) return res.status(404).json({ error: "slot not found" });
    const patch = pick(req.body || {});
    const merged = { ...slot.get({ plain: true }), ...patch };
    if (patch.date) merged.dayOfWeek = null;
    const error = validate(merged);
    if (error) return res.status(400).json({ error });
    await slot.update({ ...patch, dayOfWeek: merged.dayOfWeek });
    await scheduler.refresh();
    return res.json(serialize(await reload(slot.id)));
  } catch (err) {
    logger.error("schedule update failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// DELETE /api/v1/schedule/:id
exports.remove = async (req, res) => {
  try {
    const n = await ScheduleSlot.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ error: "slot not found" });
    await scheduler.refresh();
    return res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    logger.error("schedule delete failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/settings
exports.getSettings = (req, res) => res.json(settings.getAll());

// PATCH /api/v1/settings { jingleEvery?, commercialEvery?, timezone?, enforceSchedule? }
// (autopilot has its own endpoint because it also drives Liquidsoap.)
exports.updateSettings = async (req, res) => {
  const { autopilot, ...patch } = req.body || {};
  try {
    const next = await settings.update(patch);
    // Cadence / timezone changes affect what AutoDJ plans next.
    require("../services/rotation").resetPlan();
    await scheduler.refresh();
    await require("../services/queueSync").broadcastUpdate();
    return res.json(next);
  } catch (err) {
    if (err.code === "INVALID_SETTING") {
      return res.status(400).json({ error: err.message });
    }
    logger.error("settings update failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};
