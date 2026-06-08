const os = require("os");
const path = require("path");
const http = require("http");

// Wire env BEFORE requiring app/models (config/database binds DATABASE_URL at
// require time, and internal endpoints need the shared secret).
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
  path.join(os.tmpdir(), `rk-media-queue-${Date.now()}`);

// Mock the Liquidsoap telnet client so the queue contract can be exercised
// without the live stack. Records every command + push for assertions.
jest.mock("../services/liquidsoapClient", () => {
  let rid = 1000;
  return {
    command: jest.fn(async (cmd) => (cmd.endsWith(".queue") ? "" : "Done.")),
    pushRequest: jest.fn(async () => String(++rid)),
    setVar: jest.fn(async () => "Done."),
    skip: jest.fn(async () => "Done."),
    reachable: jest.fn(async () => true),
  };
});

const request = require("supertest");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const WebSocket = require("ws");
const app = require("../app");
const studioSocket = require("../ws/studioSocket");
const liquidsoap = require("../services/liquidsoapClient");
const autopilot = require("../services/autopilot");
const nowPlaying = require("../services/nowPlaying");
const { runMigrations } = require("../config/migrate");
const { sequelize, Track, QueueItem, PlayHistory } = require("../models");

const INTERNAL = process.env.INTERNAL_API_SECRET;
const AUTH = `Bearer ${jwt.sign({ role: "admin" }, process.env.SECRET_KEY)}`;

let trackA;
let trackB;
let trackC;
let server;
let wsPort;

function makeTrack(title) {
  const suffix = Math.random().toString(36).slice(2, 10);
  return Track.create({
    title,
    artist: "Queue Tester",
    album: "Queue",
    type: "song",
    duration: 5,
    filePath: `tracks/${suffix}.mp3`,
    fileHash: `qhash-${suffix}`,
    replaygain: 0,
  });
}

beforeAll(async () => {
  await runMigrations();
  trackA = await makeTrack("Queue A");
  trackB = await makeTrack("Queue B");
  trackC = await makeTrack("Queue C");

  // Real HTTP server so the studio WebSocket can attach (REST still goes
  // through supertest's own ephemeral server).
  server = http.createServer(app);
  studioSocket.init(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  wsPort = server.address().port;
}, 120000);

afterAll(async () => {
  // Clean up our rows so the shared test DB isn't polluted for other suites.
  await QueueItem.destroy({ where: {} });
  await PlayHistory.destroy({
    where: { trackId: [trackA.id, trackB.id, trackC.id] },
  });
  await Track.destroy({ where: { id: [trackA.id, trackB.id, trackC.id] } });
  autopilot.set(true);
  await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

beforeEach(async () => {
  await QueueItem.destroy({ where: {} });
  liquidsoap.command.mockClear();
  liquidsoap.pushRequest.mockClear();
  liquidsoap.setVar.mockClear();
  autopilot.set(true);
});

describe("auth", () => {
  test("GET /api/v1/queue requires a JWT", async () => {
    const res = await request(app).get("/api/v1/queue");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/queue (add + order)", () => {
  test("adds 3 tracks that queue in order ahead of rotation", async () => {
    for (const t of [trackA, trackB, trackC]) {
      const res = await request(app)
        .post("/api/v1/queue")
        .set("Authorization", AUTH)
        .send({ trackId: t.id, requestedBy: "dj" });
      expect(res.status).toBe(201);
    }

    // Each add pushed a request URI to Liquidsoap (in order).
    expect(liquidsoap.pushRequest).toHaveBeenCalledTimes(3);

    const list = await request(app)
      .get("/api/v1/queue")
      .set("Authorization", AUTH);
    expect(list.status).toBe(200);
    expect(list.body.items.map((i) => i.track.title)).toEqual([
      "Queue A",
      "Queue B",
      "Queue C",
    ]);
    expect(list.body.items.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  test("rejects a missing trackId / unknown track", async () => {
    const bad = await request(app)
      .post("/api/v1/queue")
      .set("Authorization", AUTH)
      .send({});
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .post("/api/v1/queue")
      .set("Authorization", AUTH)
      .send({ trackId: "00000000-0000-0000-0000-000000000000" });
    expect(missing.status).toBe(404);
  });
});

describe("PATCH /api/v1/queue/reorder", () => {
  test("reorders pending items and rebuilds the Liquidsoap queue", async () => {
    const ids = [];
    for (const t of [trackA, trackB, trackC]) {
      const res = await request(app)
        .post("/api/v1/queue")
        .set("Authorization", AUTH)
        .send({ trackId: t.id });
      ids.push(res.body.item.id);
    }

    liquidsoap.command.mockClear();
    const reversed = [ids[2], ids[1], ids[0]];
    const res = await request(app)
      .patch("/api/v1/queue/reorder")
      .set("Authorization", AUTH)
      .send({ orderedIds: reversed });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.id)).toEqual(reversed);

    // Reorder rebuilds the queue: clear + re-push in the new order.
    expect(liquidsoap.command).toHaveBeenCalledWith("requests.clear");
  });
});

describe("DELETE /api/v1/queue/:id", () => {
  test("removes a queued item", async () => {
    const add = await request(app)
      .post("/api/v1/queue")
      .set("Authorization", AUTH)
      .send({ trackId: trackA.id });
    const id = add.body.item.id;

    const del = await request(app)
      .delete(`/api/v1/queue/${id}`)
      .set("Authorization", AUTH);
    expect(del.status).toBe(200);
    expect(del.body.items.find((i) => i.id === id)).toBeUndefined();

    const missing = await request(app)
      .delete(`/api/v1/queue/${id}`)
      .set("Authorization", AUTH);
    expect(missing.status).toBe(404);
  });
});

describe("metadata hook flips queued items as they air", () => {
  test("queue_item_id moves a pending item to playing and writes request PlayHistory", async () => {
    const add = await request(app)
      .post("/api/v1/queue")
      .set("Authorization", AUTH)
      .send({ trackId: trackB.id });
    const id = add.body.item.id;

    const before = await PlayHistory.count({ where: { source: "request" } });
    const meta = await request(app)
      .post("/api/v1/playout/metadata")
      .set("X-Internal-Secret", INTERNAL)
      .send({
        title: "Queue B",
        artist: "Queue Tester",
        track_id: trackB.id,
        queue_item_id: id,
        source: "request",
      });
    expect(meta.status).toBe(200);

    // It is no longer in the pending list (it is now on air).
    const list = await request(app)
      .get("/api/v1/queue")
      .set("Authorization", AUTH);
    expect(list.body.items.find((i) => i.id === id)).toBeUndefined();
    expect(list.body.nowPlaying.source).toBe("request");

    const item = await QueueItem.findByPk(id);
    expect(item.status).toBe("playing");

    const after = await PlayHistory.count({ where: { source: "request" } });
    expect(after).toBe(before + 1);
  });
});

describe("now-playing recovery", () => {
  test("queue state recovers the deck from Icecast after an API restart", async () => {
    nowPlaying.clear();
    const spy = jest.spyOn(axios, "get").mockResolvedValueOnce({
      data: {
        icestats: {
          source: {
            title: "Queue Tester - Queue B",
            stream_start_iso8601: "2026-06-08T02:09:46+0000",
          },
        },
      },
    });

    const list = await request(app)
      .get("/api/v1/queue")
      .set("Authorization", AUTH);

    expect(list.status).toBe(200);
    expect(list.body.nowPlaying).toMatchObject({
      title: "Queue B",
      artist: "Queue Tester",
      source: "autodj",
      trackId: trackB.id,
    });
    spy.mockRestore();
  });
});

describe("POST /api/v1/playout/skip", () => {
  test("skips the current track via the output source", async () => {
    const res = await request(app)
      .post("/api/v1/playout/skip")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(liquidsoap.command).toHaveBeenCalledWith("radio_out.skip");
  });

  test("requires a JWT", async () => {
    const res = await request(app).post("/api/v1/playout/skip");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/playout/autopilot", () => {
  test("toggling autopilot off stops AutoDJ rotation (next 404s), on resumes", async () => {
    const off = await request(app)
      .post("/api/v1/playout/autopilot")
      .set("Authorization", AUTH)
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.autopilot).toBe(false);

    // With autopilot off + (no rotation) Liquidsoap's /next yields nothing, so
    // the failover policy (queue, else emergency) keeps air alive.
    const nextOff = await request(app)
      .get("/api/v1/playout/next")
      .set("X-Internal-Secret", INTERNAL);
    expect(nextOff.status).toBe(404);

    const on = await request(app)
      .post("/api/v1/playout/autopilot")
      .set("Authorization", AUTH)
      .send({ enabled: true });
    expect(on.body.autopilot).toBe(true);

    const nextOn = await request(app)
      .get("/api/v1/playout/next")
      .set("X-Internal-Secret", INTERNAL);
    expect(nextOn.status).toBe(200);
    expect(nextOn.text).toMatch(/^annotate:/);
  });

  test("rejects a non-boolean enabled", async () => {
    const res = await request(app)
      .post("/api/v1/playout/autopilot")
      .set("Authorization", AUTH)
      .send({ enabled: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("/ws/studio broadcasts queue:update", () => {
  test("a connected client receives queue:update on a queue change", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/studio`);
    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    const got = new Promise((resolve) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "queue:update") resolve(msg);
      });
    });

    let timer;
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error("no queue:update within 5s")), 5000);
    });

    await request(app)
      .post("/api/v1/queue")
      .set("Authorization", AUTH)
      .send({ trackId: trackC.id });

    const msg = await Promise.race([got, timeout]);
    clearTimeout(timer);
    expect(msg.event).toBe("queue:update");
    expect(Array.isArray(msg.data.items)).toBe(true);
    expect(msg.data.items.some((i) => i.track.id === trackC.id)).toBe(true);

    await new Promise((resolve) => {
      ws.on("close", resolve);
      ws.close();
    });
  });
});
