const logger = require("../logger");

// Phase 7: persisted station settings, cached in memory. The DB
// (StationSettings key/value) is the source of truth; `load()` fills the cache
// at boot and `update()` writes through. Reads are synchronous so hot paths
// (rotation, /playout/next) never wait on the database.

const DEFAULTS = Object.freeze({
  // AutoDJ on/off. Survives API restarts (previously reset to ON every boot).
  autopilot: process.env.AUTOPILOT_DEFAULT !== "false",
  // Break automation: a jingle every N songs, a commercial every N songs
  // (0 = never).
  jingleEvery: parseInt(process.env.AUTODJ_JINGLE_EVERY || "4", 10),
  commercialEvery: 0,
  // Station-local timezone the schedule is defined in.
  timezone: process.env.STATION_TIMEZONE || "Europe/Istanbul",
  // When true, DJs may only go live during a slot of a show they host (admins
  // always can; guests are bounded by their invite window).
  enforceSchedule: false,
});

const VALIDATORS = {
  autopilot: (v) => typeof v === "boolean",
  jingleEvery: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
  commercialEvery: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
  timezone: (v) => typeof v === "string" && isValidTimezone(v),
  enforceSchedule: (v) => typeof v === "boolean",
};

let cache = { ...DEFAULTS };

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

function model() {
  return require("../models").StationSetting;
}

async function load() {
  try {
    const rows = await model().findAll();
    const next = { ...DEFAULTS };
    for (const row of rows) {
      if (row.key in VALIDATORS && VALIDATORS[row.key](row.value)) {
        next[row.key] = row.value;
      }
    }
    cache = next;
  } catch (err) {
    logger.warn("settings.load failed; using defaults", { error: String(err) });
  }
  return getAll();
}

function get(key) {
  return cache[key];
}

function getAll() {
  return { ...cache };
}

// Validate + persist a partial patch. Throws { code: "INVALID_SETTING" } on a
// bad key/value (nothing is written in that case).
async function update(patch = {}) {
  const entries = Object.entries(patch);
  for (const [key, value] of entries) {
    if (!(key in VALIDATORS) || !VALIDATORS[key](value)) {
      const err = new Error(`invalid setting: ${key}`);
      err.code = "INVALID_SETTING";
      throw err;
    }
  }
  for (const [key, value] of entries) {
    await model().upsert({ key, value });
    cache[key] = value;
  }
  return getAll();
}

// Test seam: reset the cache to defaults without touching the DB.
function _reset() {
  cache = { ...DEFAULTS };
}

module.exports = { DEFAULTS, load, get, getAll, update, isValidTimezone, _reset };
