const rotation = require("../services/rotation");

const songs = [
  { id: "s1", type: "song" },
  { id: "s2", type: "song" },
  { id: "s3", type: "song" },
];
const jingles = [
  { id: "j1", type: "jingle" },
  { id: "j2", type: "jingle" },
];

describe("rotation.chooseNext", () => {
  test("never replays the immediately previous song", () => {
    let state = { songsSinceJingle: 0, lastSongId: "s1", lastJingleId: null };
    for (let i = 0; i < 50; i++) {
      const result = rotation.chooseNext(state, { songs, jingles: [] });
      expect(result.kind).toBe("song");
      expect(result.item.id).not.toBe(state.lastSongId);
      state = result.state;
    }
  });

  test("inserts a jingle every N songs (cadence)", () => {
    const jingleEvery = 4;
    let state = rotation.chooseNext(
      { songsSinceJingle: 0, lastSongId: null, lastJingleId: null },
      { songs, jingles },
      jingleEvery
    ).state;

    const kinds = [];
    for (let i = 0; i < 20; i++) {
      const result = rotation.chooseNext(state, { songs, jingles }, jingleEvery);
      kinds.push(result.kind);
      state = result.state;
    }

    // With cadence 4 we expect roughly one jingle per 4 songs and never two
    // jingles back to back.
    expect(kinds).toContain("jingle");
    for (let i = 1; i < kinds.length; i++) {
      if (kinds[i] === "jingle") expect(kinds[i - 1]).not.toBe("jingle");
    }
    const songsBetween = [];
    let run = 0;
    for (const k of kinds) {
      if (k === "song") run++;
      else {
        songsBetween.push(run);
        run = 0;
      }
    }
    // Each jingle should be preceded by at most `jingleEvery` songs.
    for (const n of songsBetween) expect(n).toBeLessThanOrEqual(jingleEvery);
  });

  test("avoids repeating the previous jingle when alternatives exist", () => {
    let state = { songsSinceJingle: 4, lastSongId: "s1", lastJingleId: "j1" };
    const result = rotation.chooseNext(state, { songs, jingles }, 4);
    expect(result.kind).toBe("jingle");
    expect(result.item.id).toBe("j2");
  });

  test("falls back to a jingle when no songs exist", () => {
    const result = rotation.chooseNext(
      { songsSinceJingle: 0, lastSongId: null, lastJingleId: null },
      { songs: [], jingles },
      4
    );
    expect(result.kind).toBe("jingle");
  });

  test("returns no item when the library is empty", () => {
    const result = rotation.chooseNext(
      { songsSinceJingle: 0, lastSongId: null, lastJingleId: null },
      { songs: [], jingles: [] }
    );
    expect(result.item).toBeNull();
    expect(result.kind).toBeNull();
  });

  test("advance() mutates and persists runtime state", () => {
    rotation.resetState();
    const a = rotation.advance({ songs, jingles: [] });
    const b = rotation.advance({ songs, jingles: [] });
    expect(a.item.id).not.toBe(b.item.id);
    expect(rotation.getState().lastSongId).toBe(b.item.id);
  });
});
