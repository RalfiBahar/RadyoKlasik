const { User, Show } = require("../models");
const staffAuth = require("../services/staffAuth");
const logger = require("../logger");

// Phase 7 — DJ & guest account management (admin only), plus GET /me for any
// staff user.

const ROLES = ["admin", "dj", "guest"];
const USERNAME_RE = /^[a-z0-9._-]{2,40}$/i;

function serialize(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || null,
    email: user.email || null,
    role: user.role,
    active: user.active,
    accessFrom: user.accessFrom || null,
    accessUntil: user.accessUntil || null,
    micPreferences: user.micPreferencesJson || null,
    shows: (user.shows || []).map((s) => ({ id: s.id, title: s.title })),
    createdAt: user.createdAt,
  };
}

function badRequest(res, error) {
  return res.status(400).json({ error });
}

// GET /api/v1/users
exports.list = async (req, res) => {
  try {
    const users = await User.findAll({
      order: [["createdAt", "ASC"]],
      include: [{ model: Show, as: "shows", attributes: ["id", "title"] }],
    });
    return res.json({ items: users.map(serialize) });
  } catch (err) {
    logger.error("users list failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/users { username, password, displayName?, email?, role }
exports.create = async (req, res) => {
  try {
    const { username, password, displayName, email, role = "dj" } = req.body || {};
    if (!username || !USERNAME_RE.test(username)) {
      return badRequest(res, "username must be 2-40 letters, digits, . _ or -");
    }
    if (!ROLES.includes(role) || role === "guest") {
      return badRequest(res, "role must be admin or dj (use guest invites for guests)");
    }
    if (!password || String(password).length < 8) {
      return badRequest(res, "password must be at least 8 characters");
    }
    if (username === process.env.ADMIN_USERNAME) {
      return res.status(409).json({ error: "username is taken" });
    }
    const exists = await User.findOne({ where: { username } });
    if (exists) return res.status(409).json({ error: "username is taken" });

    const user = await User.create({
      username,
      displayName: displayName || null,
      email: email || null,
      role,
      passwordHash: await staffAuth.hashPassword(password),
      active: true,
    });
    return res.status(201).json(serialize(user));
  } catch (err) {
    logger.error("user create failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// PATCH /api/v1/users/:id { displayName?, email?, role?, active?, password?,
//   micPreferences?, accessFrom?, accessUntil? }
exports.update = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: "user not found" });
    const body = req.body || {};

    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) return badRequest(res, "invalid role");
      if ((user.role === "guest") !== (body.role === "guest")) {
        return badRequest(res, "guest accounts can't be converted");
      }
      user.role = body.role;
    }
    if (body.displayName !== undefined) user.displayName = body.displayName || null;
    if (body.email !== undefined) user.email = body.email || null;
    if (body.active !== undefined) user.active = !!body.active;
    if (body.micPreferences !== undefined) user.micPreferencesJson = body.micPreferences;
    if (body.accessFrom !== undefined) user.accessFrom = body.accessFrom || null;
    if (body.accessUntil !== undefined) user.accessUntil = body.accessUntil || null;
    if (body.password) {
      if (String(body.password).length < 8) {
        return badRequest(res, "password must be at least 8 characters");
      }
      user.passwordHash = await staffAuth.hashPassword(body.password);
    }
    await user.save();
    return res.json(serialize(user));
  } catch (err) {
    logger.error("user update failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// DELETE /api/v1/users/:id
exports.remove = async (req, res) => {
  try {
    if (req.user && req.user.id === req.params.id) {
      return badRequest(res, "you can't delete your own account");
    }
    const n = await User.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ error: "user not found" });
    return res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    logger.error("user delete failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// POST /api/v1/users/guest { name, accessFrom, accessUntil }
// Creates a time-boxed guest DJ and returns the invite token (the studio turns
// it into a link). The token stops working when the window ends or the guest
// is disabled/deleted.
exports.createGuest = async (req, res) => {
  try {
    const { name, accessFrom, accessUntil } = req.body || {};
    if (!name || !String(name).trim()) return badRequest(res, "name is required");
    const from = accessFrom ? new Date(accessFrom) : new Date();
    const until = accessUntil ? new Date(accessUntil) : null;
    if (Number.isNaN(from.getTime()) || !until || Number.isNaN(until.getTime())) {
      return badRequest(res, "accessUntil is required (ISO date)");
    }
    if (until <= from) return badRequest(res, "accessUntil must be after accessFrom");
    if (until.getTime() - from.getTime() > 31 * 24 * 3600 * 1000) {
      return badRequest(res, "guest access can be at most 31 days");
    }

    const slug = String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20);
    const user = await User.create({
      username: `guest-${slug || "dj"}-${Math.random().toString(36).slice(2, 7)}`,
      displayName: String(name).trim(),
      role: "guest",
      active: true,
      accessFrom: from,
      accessUntil: until,
    });
    const token = staffAuth.signStaffToken(user);
    return res.status(201).json({ user: serialize(user), token });
  } catch (err) {
    logger.error("guest create failed", { error: String(err) });
    return res.status(500).json({ error: String(err) });
  }
};

// GET /api/v1/me
exports.me = async (req, res) => {
  const u = req.user;
  let shows = [];
  if (u.id && u.id !== staffAuth.ENV_ADMIN_ID) {
    const row = await User.findByPk(u.id, {
      include: [{ model: Show, as: "shows", attributes: ["id", "title"] }],
    });
    if (row) shows = row.shows.map((s) => ({ id: s.id, title: s.title }));
  }
  return res.json({ id: u.id, role: u.role, name: u.name, shows });
};
