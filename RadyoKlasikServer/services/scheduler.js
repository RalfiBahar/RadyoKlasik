const settings = require("./settings");
const logger = require("../logger");

// Phase 7 — the station schedule. Resolves which ScheduleSlot is on air right
// now (in the station timezone) and what that means for playout:
//   - a slot with a playlist (its own, or its show's) narrows AutoDJ to that
//     playlist's songs for the duration of the slot (jingles/commercials still
//     come from the whole library);
//   - a show slot decides which DJs may go live when the schedule is enforced.
// The active slot is re-resolved on a timer and whenever slots change; on a
// change the AutoDJ plan is rebuilt and studio clients are notified.

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;
// DJs may connect a little before their slot starts to set up.
const EARLY_ACCESS_MINUTES = Number(process.env.SCHEDULE_EARLY_ACCESS_MIN || 10);

// --- Pure time helpers (unit-tested) ---------------------------------------

// Station-local calendar parts for an instant: { date: "YYYY-MM-DD",
// dayOfWeek: 0..6 (Sunday = 0), minute: 0..1439 }.
function localParts(now, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value])
  );
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek: days[parts.weekday],
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function dayDiff(fromDate, toDate) {
  const a = Date.UTC(...fromDate.split("-").map((n, i) => (i === 1 ? n - 1 : +n)));
  const b = Date.UTC(...toDate.split("-").map((n, i) => (i === 1 ? n - 1 : +n)));
  return Math.round((b - a) / 86400000);
}

// Minutes since the slot's most recent start, or null if that occurrence is
// not running at `local`. Slots may run past midnight.
function minutesIntoSlot(slot, local) {
  let diff;
  if (slot.date) {
    diff = dayDiff(slot.date, local.date) * MINUTES_PER_DAY + local.minute - slot.startMinute;
  } else {
    if (slot.dayOfWeek == null) return null;
    const days = (local.dayOfWeek - slot.dayOfWeek + 7) % 7;
    diff = days * MINUTES_PER_DAY + local.minute - slot.startMinute;
    // Just before the weekly start: the previous occurrence may still run.
    if (diff < 0) diff += MINUTES_PER_WEEK;
  }
  return diff >= 0 && diff < slot.durationMinutes ? diff : null;
}

// The slot on air at `now`. One-off slots override weekly ones; among equals
// the most recently started wins (so a short slot nested in a long one shows).
function resolveActive(slots, now, timeZone) {
  const local = localParts(now, timeZone);
  let best = null;
  for (const slot of slots) {
    const into = minutesIntoSlot(slot, local);
    if (into == null) continue;
    const rank = [slot.date ? 1 : 0, -into];
    if (
      !best ||
      rank[0] > best.rank[0] ||
      (rank[0] === best.rank[0] && rank[1] > best.rank[1])
    ) {
      best = { slot, rank, minutesInto: into };
    }
  }
  if (!best) return null;
  // Local minutes are whole, so measure from the start of the current minute
  // (every timezone offset is a whole number of minutes).
  const minuteStart = Math.floor(now.getTime() / 60000) * 60000;
  const endsAt = new Date(
    minuteStart + (best.slot.durationMinutes - best.minutesInto) * 60000
  );
  return { slot: best.slot, minutesInto: best.minutesInto, endsAt };
}

// Minutes until the slot next starts (0..one week), for early DJ access.
function minutesUntilStart(slot, now, timeZone) {
  const local = localParts(now, timeZone);
  if (slot.date) {
    const diff =
      dayDiff(local.date, slot.date) * MINUTES_PER_DAY + slot.startMinute - local.minute;
    return diff >= 0 ? diff : null;
  }
  if (slot.dayOfWeek == null) return null;
  const days = (slot.dayOfWeek - local.dayOfWeek + 7) % 7;
  let diff = days * MINUTES_PER_DAY + slot.startMinute - local.minute;
  if (diff < 0) diff += MINUTES_PER_WEEK;
  return diff;
}

// --- Runtime state ---------------------------------------------------------

let active = null; // { slot (plain), show, playlistId, endsAt }
let timer = null;

function models() {
  return require("../models");
}

async function loadSlots() {
  const { ScheduleSlot, Show, User, Playlist } = models();
  return ScheduleSlot.findAll({
    include: [
      {
        model: Show,
        as: "show",
        include: [{ model: User, as: "hosts", attributes: ["id"] }],
      },
      { model: Playlist, as: "playlist", attributes: ["id", "name"] },
    ],
  });
}

// Re-resolve the active slot. Rebuilds the AutoDJ plan + notifies the studio
// when it changed. Returns the active descriptor (or null).
async function refresh(now = new Date()) {
  let slots;
  try {
    slots = await loadSlots();
  } catch (err) {
    logger.warn("scheduler.refresh: load failed", { error: String(err) });
    return active;
  }
  const found = resolveActive(slots, now, settings.get("timezone"));
  const next = found
    ? {
        slot: found.slot,
        show: found.slot.show || null,
        playlistId:
          found.slot.playlistId || (found.slot.show && found.slot.show.playlistId) || null,
        endsAt: found.endsAt,
      }
    : null;

  const prevKey = active ? `${active.slot.id}:${active.playlistId}` : null;
  const nextKey = next ? `${next.slot.id}:${next.playlistId}` : null;
  active = next;
  if (prevKey !== nextKey) {
    logger.info("schedule: active slot changed", {
      slot: next ? next.slot.id : null,
      title: next ? describe(next).title : null,
    });
    onChange();
  }
  return active;
}

function onChange() {
  try {
    require("../ws/studioSocket").broadcast("schedule:now", getNow());
    // Rebuild the NEXT panel from the new pool.
    require("./queueSync")
      .broadcastUpdate()
      .catch(() => {});
  } catch (err) {
    logger.warn("scheduler.onChange failed", { error: String(err) });
  }
}

function describe(a) {
  if (!a) return null;
  return {
    slotId: a.slot.id,
    title:
      a.slot.title ||
      (a.show && a.show.title) ||
      (a.slot.playlist && a.slot.playlist.name) ||
      "Scheduled block",
    showId: a.show ? a.show.id : null,
    showTitle: a.show ? a.show.title : null,
    playlistId: a.playlistId,
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    color: a.slot.color || (a.show && a.show.color) || null,
  };
}

function getNow() {
  return { active: describe(active), timezone: settings.get("timezone") };
}

function getActive() {
  return active;
}

// Track pools for AutoDJ under the current schedule. `key` identifies the pool
// so the rotation plan is rebuilt when the schedule switches it.
async function rotationPools(attributes) {
  const { Track, PlaylistItem } = models();
  const [jingles, commercials] = await Promise.all([
    Track.findAll({ where: { type: "jingle" }, attributes }),
    Track.findAll({ where: { type: "commercial" }, attributes }),
  ]);

  const playlistId = active && active.playlistId;
  if (playlistId) {
    const items = await PlaylistItem.findAll({
      where: { playlistId },
      order: [["position", "ASC"]],
      include: [
        {
          model: Track,
          as: "track",
          attributes,
          where: { type: "song" },
        },
      ],
    });
    const songs = items.map((i) => i.track).filter(Boolean);
    // An empty scheduled playlist falls back to the whole library rather
    // than starving AutoDJ.
    if (songs.length > 0) {
      return {
        key: `playlist:${playlistId}:${active.slot.shuffle ? "shuffle" : "ordered"}`,
        songs,
        jingles,
        commercials,
        ordered: !active.slot.shuffle,
      };
    }
  }

  const songs = await Track.findAll({ where: { type: "song" }, attributes });
  return { key: "library", songs, jingles, commercials, ordered: false };
}

// Live-access decision for a user (from the JWT): { allowed, reason, show }.
async function liveAccess(user, now = new Date()) {
  const a = active;
  const show = a && a.show ? { id: a.show.id, title: a.show.title } : null;
  if (!user) return { allowed: false, reason: "Not signed in", show };
  if (user.role === "admin") return { allowed: true, reason: null, show };
  if (user.role === "guest") {
    // The invite window is enforced by the auth middleware on every request.
    return { allowed: true, reason: null, show };
  }
  if (!settings.get("enforceSchedule")) return { allowed: true, reason: null, show };

  const hosts = (s) => (s && s.hosts ? s.hosts.map((h) => h.id) : []);
  if (a && a.show && hosts(a.show).includes(user.id)) {
    return { allowed: true, reason: null, show };
  }
  // Early access: a slot of a show this DJ hosts starts within the window.
  try {
    const slots = await loadSlots();
    const tz = settings.get("timezone");
    for (const slot of slots) {
      if (!slot.show || !hosts(slot.show).includes(user.id)) continue;
      const until = minutesUntilStart(slot, now, tz);
      if (until != null && until <= EARLY_ACCESS_MINUTES) {
        return {
          allowed: true,
          reason: null,
          show: { id: slot.show.id, title: slot.show.title },
        };
      }
    }
  } catch (err) {
    logger.warn("scheduler.liveAccess: slot lookup failed", { error: String(err) });
  }
  return {
    allowed: false,
    reason: "You can go live during your scheduled show (or 10 minutes before it).",
    show,
  };
}

function start(intervalMs = Number(process.env.SCHEDULER_TICK_MS || 15000)) {
  if (timer) return;
  refresh().catch(() => {});
  timer = setInterval(() => refresh().catch(() => {}), intervalMs);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Test seam.
function _setActive(a) {
  active = a;
}

module.exports = {
  // pure
  localParts,
  minutesIntoSlot,
  resolveActive,
  minutesUntilStart,
  // runtime
  refresh,
  getNow,
  getActive,
  rotationPools,
  liveAccess,
  start,
  stop,
  _setActive,
};
