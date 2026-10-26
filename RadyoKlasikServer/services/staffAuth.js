const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const logger = require("../logger");

// Phase 7 — staff (admin / DJ / guest DJ) authentication for the studio.
//
// Staff tokens are JWTs carrying { sub, role, name }. They are the ONLY tokens
// the operator API (/api/v1/*) and the studio WebSockets accept. The legacy
// shared-secret token from POST /auth/generate_token has no role claim: it is
// shipped inside the public listener apps, so it must never grant operator
// access — it keeps working only for the legacy listener routes.
//
// The bootstrap admin comes from ADMIN_USERNAME / ADMIN_PASSWORD (the same
// credentials as the legacy EJS dashboard) and has sub "env-admin".

const STAFF_ROLES = ["admin", "dj", "guest"];
const ENV_ADMIN_ID = "env-admin";
const TOKEN_TTL = process.env.STAFF_TOKEN_TTL || "12h";

function displayName(user) {
  return user.displayName || user.username;
}

function signStaffToken(user) {
  const payload = { sub: user.id, role: user.role, name: displayName(user) };
  const opts = {};
  if (user.role === "guest" && user.accessUntil) {
    // A guest link dies with its window.
    opts.expiresIn = Math.max(
      60,
      Math.floor((new Date(user.accessUntil).getTime() - Date.now()) / 1000)
    );
  } else {
    opts.expiresIn = TOKEN_TTL;
  }
  return jwt.sign(payload, process.env.SECRET_KEY, opts);
}

function envAdmin() {
  const username = process.env.ADMIN_USERNAME;
  if (!username || !process.env.ADMIN_PASSWORD) return null;
  return { id: ENV_ADMIN_ID, username, displayName: username, role: "admin" };
}

// Verify username/password. Returns the user (plain object) or null. Guests
// can't log in with a password — they use their invite link.
async function authenticate(username, password) {
  if (!username || !password) return null;
  const admin = envAdmin();
  if (admin && username === admin.username) {
    return password === process.env.ADMIN_PASSWORD ? admin : null;
  }
  const { User } = require("../models");
  const user = await User.findOne({ where: { username } });
  if (!user || !user.active || !user.passwordHash || user.role === "guest") {
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user.get({ plain: true }) : null;
}

// Guest access window check (null bounds are open).
function withinWindow(user, now = new Date()) {
  if (user.accessFrom && now < new Date(user.accessFrom)) return false;
  if (user.accessUntil && now > new Date(user.accessUntil)) return false;
  return true;
}

// Decode + validate a staff token. Returns { id, role, name } or throws an
// Error with .status (401 invalid/expired, 403 not staff / disabled / outside
// the guest window).
async function verifyStaffToken(token, roles = STAFF_ROLES) {
  if (!token) throw httpError(401, "Token is missing!");
  let payload;
  try {
    payload = jwt.verify(token, process.env.SECRET_KEY);
  } catch (err) {
    throw httpError(401, err instanceof jwt.TokenExpiredError ? "token_expired" : "Invalid token!");
  }
  if (!STAFF_ROLES.includes(payload.role)) {
    throw httpError(403, "Studio access requires a staff account");
  }

  let user = { id: payload.sub || null, role: payload.role, name: payload.name || null };
  // Re-check DB-backed accounts so disabling a DJ or revoking a guest takes
  // effect immediately rather than when their token expires.
  if (payload.sub && payload.sub !== ENV_ADMIN_ID) {
    const { User } = require("../models");
    const row = await User.findByPk(payload.sub);
    if (!row || !row.active) throw httpError(403, "Account is disabled");
    if (row.role === "guest" && !withinWindow(row)) {
      throw httpError(403, "Guest access window has ended");
    }
    user = { id: row.id, role: row.role, name: displayName(row) };
  }
  if (!roles.includes(user.role)) {
    throw httpError(403, "Not allowed for your role");
  }
  return user;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function tokenFromRequest(req) {
  return req.headers.authorization?.split(" ")[1] || req.query.token || null;
}

// Express middleware: staff JWT with one of `roles` (default any staff role).
function staffRequired(...roles) {
  const allowed = roles.length ? roles : STAFF_ROLES;
  return async (req, res, next) => {
    try {
      req.user = await verifyStaffToken(tokenFromRequest(req), allowed);
      next();
    } catch (err) {
      if (!err.status) logger.error("staffRequired failed", { error: String(err) });
      res.status(err.status || 500).json({ error: err.message });
    }
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

module.exports = {
  STAFF_ROLES,
  ENV_ADMIN_ID,
  signStaffToken,
  authenticate,
  verifyStaffToken,
  staffRequired,
  withinWindow,
  hashPassword,
  tokenFromRequest,
};
