const os = require("os");
const path = require("path");
const fs = require("fs");

// Wire env BEFORE requiring app/models (config/database binds DATABASE_URL at
// require time).
process.env.NODE_ENV = "test";
process.env.SECRET_KEY = process.env.SECRET_KEY || "test-secret";
// Legacy models/user.js hashes ADMIN_PASSWORD at import time (via authRoutes),
// so provide defaults before requiring the app.
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin";
const { TEST_DATABASE_URL } = require("./setup/testDb");
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MEDIA_DIR =
  process.env.MEDIA_DIR || path.join(os.tmpdir(), `rk-media-test-${Date.now()}`);

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { makeMp3Buffer } = require("./helpers/fixtures");
const app = require("../app");
const { runMigrations } = require("../config/migrate");
const { sequelize } = require("../models");
const { TRACKS_DIR } = require("../config/storage");

const AUTH = `Bearer ${jwt.sign({ role: "admin" }, process.env.SECRET_KEY)}`;

let songBuf;
let jingleBuf;
let songId;
let jingleId;
let playlistId;

beforeAll(async () => {
  await runMigrations();
  songBuf = await makeMp3Buffer({ freq: 440, duration: 2 });
  jingleBuf = await makeMp3Buffer({ freq: 660, duration: 1 });
}, 120000);

afterAll(async () => {
  await sequelize.close();
});

describe("library upload + ingest", () => {
  test("rejects upload without a token", async () => {
    const res = await request(app)
      .post("/api/v1/library/tracks")
      .attach("file", songBuf, { filename: "x.mp3", contentType: "audio/mpeg" });
    expect(res.status).toBe(401);
  });

  test("uploads a song and ingests metadata + waveform", async () => {
    const res = await request(app)
      .post("/api/v1/library/tracks")
      .set("Authorization", AUTH)
      .field("title", "Test Song")
      .field("artist", "Sine Wave")
      .field("album", "Frequencies")
      .field("type", "song")
      .field("tags", "test,electronic")
      .attach("file", songBuf, {
        filename: "song.mp3",
        contentType: "audio/mpeg",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe("Test Song");
    expect(res.body.type).toBe("song");
    expect(res.body.duration).toBeGreaterThan(1.5);
    expect(res.body.bitrate).toBeGreaterThan(0);
    expect(typeof res.body.loudnessLufs).toBe("number");
    expect(res.body.waveformUrl).toBe(
      `/api/v1/library/tracks/${res.body.id}/waveform`
    );
    expect(res.body.tags.sort()).toEqual(["electronic", "test"]);
    songId = res.body.id;
  });

  test("stored the audio file on disk", () => {
    const files = fs.readdirSync(TRACKS_DIR);
    expect(files.some((f) => f.endsWith(".mp3"))).toBe(true);
  });

  test("rejects an identical upload as a duplicate (hash dedupe)", async () => {
    const res = await request(app)
      .post("/api/v1/library/tracks")
      .set("Authorization", AUTH)
      .attach("file", songBuf, {
        filename: "dup.mp3",
        contentType: "audio/mpeg",
      });
    expect(res.status).toBe(409);
    expect(res.body.track.id).toBe(songId);
  });

  test("serves the generated waveform JSON", async () => {
    const res = await request(app)
      .get(`/api/v1/library/tracks/${songId}/waveform`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.peaks)).toBe(true);
    expect(res.body.peaks.length).toBeGreaterThan(0);
  });

  test("uploads a jingle of a different type", async () => {
    const res = await request(app)
      .post("/api/v1/library/tracks")
      .set("Authorization", AUTH)
      .field("title", "Station Jingle")
      .field("type", "jingle")
      .attach("file", jingleBuf, {
        filename: "jingle.mp3",
        contentType: "audio/mpeg",
      });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("jingle");
    jingleId = res.body.id;
  });
});

describe("library listing + filtering", () => {
  test("lists with counts, total size and pagination metadata", async () => {
    const res = await request(app)
      .get("/api/v1/library/tracks?page=1&pageSize=15")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(15);
    expect(res.body.total).toBe(2);
    expect(res.body.counts).toMatchObject({ all: 2, song: 1, jingle: 1 });
    expect(res.body.totalSizeMb).toBeGreaterThan(0);
    expect(res.body.items.length).toBe(2);
  });

  test("filters by type", async () => {
    const res = await request(app)
      .get("/api/v1/library/tracks?type=jingle")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(jingleId);
  });

  test("filters by tag", async () => {
    const res = await request(app)
      .get("/api/v1/library/tracks?tag=electronic")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.id)).toContain(songId);
  });

  test("searches by query", async () => {
    const res = await request(app)
      .get("/api/v1/library/tracks?q=Station")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.id)).toContain(jingleId);
  });
});

describe("track update", () => {
  test("patches title and tags", async () => {
    const res = await request(app)
      .patch(`/api/v1/library/tracks/${songId}`)
      .set("Authorization", AUTH)
      .send({ title: "Renamed Song", tags: ["chill"] });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed Song");
    expect(res.body.tags).toEqual(["chill"]);
  });
});

describe("playlists", () => {
  test("creates a playlist", async () => {
    const res = await request(app)
      .post("/api/v1/playlists")
      .set("Authorization", AUTH)
      .send({ name: "Morning Rotation", description: "AM mix" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Morning Rotation");
    playlistId = res.body.id;
  });

  test("adds two items in order", async () => {
    const r1 = await request(app)
      .post(`/api/v1/playlists/${playlistId}/items`)
      .set("Authorization", AUTH)
      .send({ trackId: songId });
    expect(r1.status).toBe(201);
    const r2 = await request(app)
      .post(`/api/v1/playlists/${playlistId}/items`)
      .set("Authorization", AUTH)
      .send({ trackId: jingleId });
    expect(r2.status).toBe(201);
    expect(r2.body.playlist.items.map((i) => i.track.id)).toEqual([
      songId,
      jingleId,
    ]);
  });

  test("reorders items", async () => {
    const get = await request(app)
      .get(`/api/v1/playlists/${playlistId}`)
      .set("Authorization", AUTH);
    const ids = get.body.items.map((i) => i.id);
    const reversed = [...ids].reverse();

    const res = await request(app)
      .patch(`/api/v1/playlists/${playlistId}/reorder`)
      .set("Authorization", AUTH)
      .send({ orderedIds: reversed });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.track.id)).toEqual([songId, jingleId].reverse());
    expect(res.body.items.map((i) => i.position)).toEqual([0, 1]);
  });

  test("removes an item and keeps positions dense", async () => {
    const get = await request(app)
      .get(`/api/v1/playlists/${playlistId}`)
      .set("Authorization", AUTH);
    const firstItemId = get.body.items[0].id;

    const res = await request(app)
      .delete(`/api/v1/playlists/${playlistId}/items/${firstItemId}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].position).toBe(0);
  });

  test("deletes the playlist", async () => {
    const res = await request(app)
      .delete(`/api/v1/playlists/${playlistId}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });
});

describe("track delete", () => {
  test("deletes a track and removes its file", async () => {
    const filesBefore = fs
      .readdirSync(TRACKS_DIR)
      .filter((f) => f.endsWith(".mp3")).length;

    const res = await request(app)
      .delete(`/api/v1/library/tracks/${jingleId}`)
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const after = await request(app)
      .get(`/api/v1/library/tracks/${jingleId}`)
      .set("Authorization", AUTH);
    expect(after.status).toBe(404);

    const filesAfter = fs
      .readdirSync(TRACKS_DIR)
      .filter((f) => f.endsWith(".mp3")).length;
    expect(filesAfter).toBe(filesBefore - 1);
  });
});
