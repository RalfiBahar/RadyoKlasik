// AutoDJ rotation selection. The DB drives playout: Liquidsoap's
// request.dynamic calls GET /api/v1/playout/next, which uses this module to
// choose the next item honoring two rules:
//   1. No immediate repeats (don't replay the track we just served).
//   2. Jingle cadence: insert a jingle every N songs (AUTODJ_JINGLE_EVERY).
//
// `chooseNext` is a pure function (state + candidate pools -> selection) so it
// is trivially unit-testable; the module also keeps a small runtime state for
// the live server via advance()/getState()/setState().

const DEFAULT_JINGLE_EVERY = parseInt(
  process.env.AUTODJ_JINGLE_EVERY || "4",
  10
);

function freshState() {
  return { songsSinceJingle: 0, lastSongId: null, lastJingleId: null };
}

// Pick a random element from `list`, avoiding `avoidId` when alternatives exist.
function pickAvoiding(list, avoidId) {
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];
  const candidates = list.filter((t) => t.id !== avoidId);
  const pool = candidates.length > 0 ? candidates : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Pure selection. Returns { item, kind: 'song'|'jingle'|null, state }.
function chooseNext(state, pools, jingleEvery = DEFAULT_JINGLE_EVERY) {
  const songs = (pools && pools.songs) || [];
  const jingles = (pools && pools.jingles) || [];
  const s = { ...freshState(), ...state };

  const jingleDue =
    jingles.length > 0 && jingleEvery > 0 && s.songsSinceJingle >= jingleEvery;

  if (jingleDue) {
    const jingle = pickAvoiding(jingles, s.lastJingleId);
    if (jingle) {
      return {
        item: jingle,
        kind: "jingle",
        state: {
          songsSinceJingle: 0,
          lastSongId: s.lastSongId,
          lastJingleId: jingle.id,
        },
      };
    }
  }

  const song = pickAvoiding(songs, s.lastSongId);
  if (song) {
    return {
      item: song,
      kind: "song",
      state: {
        songsSinceJingle: s.songsSinceJingle + 1,
        lastSongId: song.id,
        lastJingleId: s.lastJingleId,
      },
    };
  }

  // No songs at all — fall back to a jingle if the library has any.
  const jingle = pickAvoiding(jingles, s.lastJingleId);
  if (jingle) {
    return {
      item: jingle,
      kind: "jingle",
      state: {
        songsSinceJingle: 0,
        lastSongId: s.lastSongId,
        lastJingleId: jingle.id,
      },
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
function advance(pools, jingleEvery = DEFAULT_JINGLE_EVERY) {
  const result = chooseNext(runtimeState, pools, jingleEvery);
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

module.exports = {
  chooseNext,
  pickAvoiding,
  advance,
  preview,
  getState,
  setState,
  resetState,
  DEFAULT_JINGLE_EVERY,
};
