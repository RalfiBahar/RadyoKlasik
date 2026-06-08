const os = require("os");
const path = require("path");

// Wire env BEFORE requiring app/models (config/database binds DATABASE_URL at
// require time, and the internal endpoints need the shared secret).
process.env.NODE_ENV = "test";
process.env.SECRET_KEY = process.env.SECRET_KEY || "test-secret";
process.env.INTERNAL_API_SECRET =
  process.env.INTERNAL_API_SECRET || "test-internal";
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin";
const { TEST_DATABASE_URL } = require("./setup/testDb");
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MEDIA_DIR =
  process.env.MEDIA_DIR ||
  path.join(os.tmpdir(), `rk-media-playout-${Date.now()}`);

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const { runMigrations } = require("../config/migrate");
const { sequelize, Track, PlayHistory } = require("../models");

const INTERNAL = process.env.INTERNAL_API_SECRET;
const AUTH = `Bearer ${jwt.sign({ role: "admin" }, process.env.SECRET_KEY)}`;

let songA;
let songB;
let jingle;
let artTrack;

function makeTrack(overrides) {
  const suffix = Math.random().toString(36).slice(2, 10);
  return Track.create({
    title: `T-${suffix}`,
    artist: "Tester",
    album: "Playout",
    type: "song",
    duration: 5,
    filePath: `tracks/${suffix}.mp3`,
    fileHash: `hash-${suffix}`,
    size: 1000,
    bitrate: 128000,
    sampleRate: 44100,
    loudnessLufs: -20,
    replaygain: 2,
    ...overrides,
  });
}

beforeAll(async () => {
  await runMigrations();
  songA = await makeTrack({ title: "Song A" });
  songB = await makeTrack({ title: "Song B" });
  jingle = await makeTrack({ title: "Jingle One", type: "jingle" });
  artTrack = await makeTrack({
    title: "Art Song",
    artworkPath: "artwork/cover.jpg",
  });
}, 120000);

afterAll(async () => {
  // Clean up our rows so the shared test DB isn't polluted for other suites
  // (suite execution order is not guaranteed). PlayHistory FKs SET NULL.
  await Track.destroy({
    where: { id: [songA.id, songB.id, jingle.id, artTrack.id] },
  });
  await sequelize.close();
});

describe("GET /api/v1/playout/next (internal)", () => {
  test("rejects without the internal secret", async () => {
    const res = await request(app).get("/api/v1/playout/next");
    expect(res.status).toBe(401);
  });

  test("rejects a wrong internal secret", async () => {
    const res = await request(app)
      .get("/api/v1/playout/next")
      .set("X-Internal-Secret", "nope");
    expect(res.status).toBe(401);
  });

  test("returns an annotate URI with metadata + normalization", async () => {
    const res = await request(app)
      .get("/api/v1/playout/next")
      .set("X-Internal-Secret", INTERNAL);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^annotate:/);
    expect(res.text).toContain("track_id=");
    expect(res.text).toContain("source=");
    expect(res.text).toContain("liq_amplify=");
    expect(res.text).toMatch(/tracks\/.+\.mp3$/);
  });

  test("consecutive calls do not serve the same song back-to-back", async () => {
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .get("/api/v1/playout/next")
        .set("X-Internal-Secret", INTERNAL);
      const m = res.text.match(/track_id="([^"]+)"/);
      ids.push(m && m[1]);
    }
    for (let i = 1; i < ids.length; i++) {
      // A song should never be immediately followed by the same song. (Jingles
      // are interleaved, so just assert no adjacent duplicates at all.)
      expect(ids[i]).not.toBe(ids[i - 1]);
    }
  });
});

describe("POST /api/v1/playout/metadata (internal)", () => {
  test("rejects without the internal secret", async () => {
    const res = await request(app)
      .post("/api/v1/playout/metadata")
      .send({ title: "x" });
    expect(res.status).toBe(401);
  });

  test("caches now-playing and writes PlayHistory for a known track", async () => {
    const before = await PlayHistory.count({ where: { trackId: songA.id } });
    const res = await request(app)
      .post("/api/v1/playout/metadata")
      .set("X-Internal-Secret", INTERNAL)
      .send({
        title: "Song A",
        artist: "Tester",
        album: "Playout",
        track_id: songA.id,
        source: "autodj",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const after = await PlayHistory.count({ where: { trackId: songA.id } });
    expect(after).toBe(before + 1);

    const ph = await PlayHistory.findOne({
      where: { trackId: songA.id },
      order: [["createdAt", "DESC"]],
    });
    expect(ph.source).toBe("autodj");
    expect(ph.startedAt).toBeTruthy();
  });

  test("maps artwork into the now-playing thumb", async () => {
    await request(app)
      .post("/api/v1/playout/metadata")
      .set("X-Internal-Secret", INTERNAL)
      .send({
        title: "Art Song",
        artist: "Tester",
        album: "Playout",
        track_id: artTrack.id,
        source: "autodj",
      });
    const res = await request(app).get("/playout/nowplaying");
    expect(res.status).toBe(200);
    expect(res.body.thumb).toBe("/media/artwork/cover.jpg");
  });

  test("tolerates an unknown track id (PlayHistory with null trackId)", async () => {
    const res = await request(app)
      .post("/api/v1/playout/metadata")
      .set("X-Internal-Secret", INTERNAL)
      .send({
        title: "Emergency Clip",
        artist: null,
        track_id: "00000000-0000-0000-0000-000000000000",
        source: "autodj",
      });
    expect(res.status).toBe(200);
    const np = await request(app).get("/playout/nowplaying");
    expect(np.body.title).toBe("Emergency Clip");
    expect(np.body.thumb).toBeNull();
  });
});

describe("GET /playout/nowplaying (public)", () => {
  test("returns the exact { album, artist, title, thumb } shape", async () => {
    await request(app)
      .post("/api/v1/playout/metadata")
      .set("X-Internal-Secret", INTERNAL)
      .send({
        title: "Public Song",
        artist: "Public Artist",
        album: "Public Album",
        track_id: songB.id,
        source: "autodj",
      });

    const res = await request(app).get("/playout/nowplaying");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      "album",
      "artist",
      "thumb",
      "title",
    ]);
    expect(res.body).toMatchObject({
      album: "Public Album",
      artist: "Public Artist",
      title: "Public Song",
    });
  });
});

describe("POST /api/v1/playout/airstate (internal)", () => {
  test("clears now-playing during true silence and restores it on noise", async () => {
    await request(app)
      .post("/api/v1/playout/metadata")
      .set("X-Internal-Secret", INTERNAL)
      .send({
        title: "Silent Test",
        artist: "Tester",
        album: "Playout",
        track_id: songB.id,
        source: "autodj",
      });

    const silent = await request(app)
      .post("/api/v1/playout/airstate")
      .set("X-Internal-Secret", INTERNAL)
      .send({ silent: true });
    expect(silent.status).toBe(200);
    expect(silent.body).toMatchObject({ ok: true, silent: true });

    const empty = await request(app).get("/playout/nowplaying");
    expect(empty.body).toEqual({
      album: null,
      artist: null,
      title: null,
      thumb: null,
    });

    const noise = await request(app)
      .post("/api/v1/playout/airstate")
      .set("X-Internal-Secret", INTERNAL)
      .send({ silent: false });
    expect(noise.status).toBe(200);

    const restored = await request(app).get("/playout/nowplaying");
    expect(restored.body).toMatchObject({
      album: "Playout",
      artist: "Tester",
      title: "Silent Test",
    });
  });
});

describe("GET /api/v1/playout/status", () => {
  test("requires a JWT", async () => {
    const res = await request(app).get("/api/v1/playout/status");
    expect(res.status).toBe(401);
  });

  test("returns playout status for an operator", async () => {
    const res = await request(app)
      .get("/api/v1/playout/status")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("source");
    expect(res.body).toHaveProperty("uptime");
    expect(res.body).toHaveProperty("autopilot", true);
    expect(res.body).toHaveProperty("currentTrack");
  });
});
