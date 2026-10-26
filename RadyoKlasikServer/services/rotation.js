// AutoDJ rotation selection. The DB drives playout: Liquidsoap's
// request.dynamic calls GET /api/v1/playout/next, which uses this module to
// choose the next item honoring these rules:
//   1. No immediate repeats (don't replay the track we just served).
//   2. Break cadence: a commercial every N songs and a jingle every M songs
//      (station settings; commercials win when both are due).
//   3. Ordered pools (a non-shuffled scheduled playlist) play songs in list
//      order, wrapping around, instead of at random.
//
// `chooseNext` is a pure function (state + candidate pools -> selection) so it
// is trivially unit-testable; the module also keeps a small runtime state for
// the live server via advance()/getState()/setState().

const DEFAULT_JINGLE_EVERY = parseInt(
  process.env.AUTODJ_JINGLE_EVERY || "4",
  10
);

function freshState() {
  return {
    songsSinceJingle: 0,
    songsSinceCommercial: 0,
    lastSongId: null,
    lastJingleId: null,
    lastCommercialId: null,
  };
}

// Pick a random element from `list`, avoiding `avoidId` when alternatives exist.
function pickAvoiding(list, avoidId) {
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];
  const candidates = list.filter((t) => t.id !== avoidId);
  const pool = candidates.length > 0 ? candidates : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

// The song after `lastId` in list order (wrapping); the first if unknown.
function pickOrdered(list, lastId) {
  if (!list || list.length === 0) return null;
  const idx = list.findIndex((t) => t.id === lastId);
  return list[(idx + 1) % list.length];
}

// Pure selection. Returns { item, kind: 'song'|'jingle'|'commercial'|null,
// state }. `commercialEvery` 0 disables commercial breaks.
function chooseNext(
  state,
  pools,
  jingleEvery = DEFAULT_JINGLE_EVERY,
  commercialEvery = 0
) {
  const songs = (pools && pools.songs) || [];
  const jingles = (pools && pools.jingles) || [];
  const commercials = (pools && pools.commercials) || [];
  const s = { ...freshState(), ...state };

  const commercialDue =
    commercials.length > 0 &&
    commercialEvery > 0 &&
    s.songsSinceCommercial >= commercialEvery;
  if (commercialDue) {
    const commercial = pickAvoiding(commercials, s.lastCommercialId);
    return {
      item: commercial,
      kind: "commercial",
      state: { ...s, songsSinceCommercial: 0, lastCommercialId: commercial.id },
    };
  }

  const jingleDue =
    jingles.length > 0 && jingleEvery > 0 && s.songsSinceJingle >= jingleEvery;
  if (jingleDue) {
    const jingle = pickAvoiding(jingles, s.lastJingleId);
    return {
      item: jingle,
      kind: "jingle",
      state: { ...s, songsSinceJingle: 0, lastJingleId: jingle.id },
    };
  }

  const song = pools && pools.ordered
    ? pickOrdered(songs, s.lastSongId)
    : pickAvoiding(songs, s.lastSongId);
  if (song) {
    return {
      item: song,
      kind: "song",
      state: {
        ...s,
        songsSinceJingle: s.songsSinceJingle + 1,
        songsSinceCommercial: s.songsSinceCommercial + 1,
        lastSongId: song.id,
      },
    };
  }

  // No songs at all — fall back to a jingle if the library has any.
  const jingle = pickAvoiding(jingles, s.lastJingleId);
  if (jingle) {
    return {
      item: jingle,
      kind: "jingle",
      state: { ...s, songsSinceJingle: 0, lastJingleId: jingle.id },
    };
  }

  return { item: null, kind: null, state: s };
}

// --- Runtime (server) state ------------------------------------------------
let runtimeState = freshState();

function getState() {
  return runtimeState;
}
function setState(state) {
  runtimeState = { ...freshState(), ...state };
}
function resetState() {
  runtimeState = freshState();
}

// Advance the live rotation by one selection, mutating the runtime state.
function advance(pools, jingleEvery = DEFAULT_JINGLE_EVERY, commercialEvery = 0) {
  const result = chooseNext(runtimeState, pools, jingleEvery, commercialEvery);
  runtimeState = result.state;
  return result;
}

// Preview upcoming AutoDJ selections without mutating the live runtime state.
// Liquidsoap still owns actual playout by calling /api/v1/playout/next one item
// at a time; this is just for the Studio NEXT panel.
function preview(
  pools,
  count = 6,
  jingleEvery = DEFAULT_JINGLE_EVERY,
  startState = runtimeState
) {
  const out = [];
  let state = { ...freshState(), ...startState };
  for (let i = 0; i < count; i += 1) {
    const result = chooseNext(state, pools, jingleEvery);
    if (!result.item) break;
    out.push({ item: result.item, kind: result.kind });
    state = result.state;
  }
  return out;
}

// --- Planned rotation --------------------------------------------------------
// The studio NEXT panel must show what will ACTUALLY air, so instead of
// re-rolling a random preview on every request, the server commits to a plan:
//   served  — items already handed to Liquidsoap (request.dynamic prefetches
//             one ahead) that have not started airing yet.
//   plan    — the committed upcoming picks, extended on demand.
// takeNext() serves plan[0] to Liquidsoap; markAired() drops served items once
// the metadata hook reports them on air; upcoming() is served + plan.
const PLAN_SIZE = parseInt(process.env.AUTODJ_PREVIEW_COUNT || "8", 10);
let plan = [];
let served = [];
// Identifies the pool the plan was built from (e.g. "library" or a scheduled
// playlist). When the schedule switches pools the plan is rebuilt.
let planKey = null;

function indexPools(pools) {
  const all = [
    ...((pools && pools.songs) || []),
    ...((pools && pools.jingles) || []),
    ...((pools && pools.commercials) || []),
  ];
  return new Map(all.map((t) => [t.id, t]));
}

// Cadence from station settings unless the caller overrides it (tests).
function cadence(jingleEvery) {
  const settings = require("./settings");
  return {
    jingle: jingleEvery != null ? jingleEvery : settings.get("jingleEvery"),
    commercial: settings.get("commercialEvery") || 0,
  };
}

// Drop planned/served entries whose track no longer exists (deleted / retyped)
// and extend the plan to `size` entries from the runtime rotation state.
function syncPlan(pools, size = PLAN_SIZE, jingleEvery) {
  const key = (pools && pools.key) || "library";
  if (key !== planKey) {
    plan = [];
    planKey = key;
  }
  const byId = indexPools(pools);
  plan = plan.filter((e) => byId.has(e.id));
  // Served items are already inside Liquidsoap and will air regardless, so
  // only drop them if the track itself is gone (not on a pool switch).
  served = served.filter((e) => byId.has(e.id) || e.track);
  const { jingle, commercial } = cadence(jingleEvery);
  while (plan.length < size) {
    const result = advance(pools, jingle, commercial);
    if (!result.item) break;
    plan.push({ id: result.item.id, kind: result.kind });
  }
  return byId;
}

// Serve the next planned item to Liquidsoap. Returns { item, kind } (item null
// when the library is empty).
function takeNext(pools, jingleEvery) {
  const byId = syncPlan(pools, PLAN_SIZE, jingleEvery);
  const entry = plan.shift();
  if (!entry) return { item: null, kind: null };
  // request.dynamic only prefetches one ahead; cap so a lost on_track can
  // never let stale entries pile up at the head of the preview. Keep the track
  // row so the preview can still show it after a pool switch.
  served.push({ ...entry, track: byId.get(entry.id) });
  if (served.length > 2) served = served.slice(-2);
  syncPlan(pools, PLAN_SIZE, jingleEvery);
  return { item: byId.get(entry.id), kind: entry.kind };
}

// The metadata hook saw `trackId` start airing from AutoDJ: drop it (and
// anything served before it) from the served list.
function markAired(trackId) {
  const idx = served.findIndex((e) => e.id === trackId);
  if (idx >= 0) served = served.slice(idx + 1);
}

// What AutoDJ will air next, in order: [{ item, kind }].
function upcoming(pools, count = PLAN_SIZE, jingleEvery) {
  const byId = syncPlan(pools, count, jingleEvery);
  return [...served, ...plan]
    .slice(0, count)
    .map((e) => ({ item: byId.get(e.id) || e.track, kind: e.kind }))
    .filter((e) => e.item);
}

// Remove planned (not yet served) entries, e.g. to re-plan after the library
// changes. Served entries are kept: Liquidsoap already holds them.
function resetPlan() {
  plan = [];
}

function resetAll() {
  resetState();
  plan = [];
  served = [];
  planKey = null;
}

module.exports = {
  chooseNext,
  pickAvoiding,
  advance,
  preview,
  getState,
  setState,
  resetState,
  takeNext,
  markAired,
  upcoming,
  resetPlan,
  resetAll,
  DEFAULT_JINGLE_EVERY,
};
