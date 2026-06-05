const os = require("os");
const path = require("path");
const http = require("http");

// Wire env BEFORE requiring app/models.
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
  path.join(os.tmpdir(), `rk-media-studio-${Date.now()}`);

// Mock the Liquidsoap telnet client so the studio/live contract can be
// exercised without the live stack. Records every command for assertions.
jest.mock("../services/liquidsoapClient", () => {
  return {
    command: jest.fn(async (cmd) => (cmd === "studio.level" ? "0.0" : "Done.")),
    pushRequest: jest.fn(async () => "1000"),
    skip: jest.fn(async () => "Done."),
    reachable: jest.fn(async () => true),
  };
});

const request = require("supertest");
const jwt = require("jsonwebtoken");
const WebSocket = require("ws");
const app = require("../app");
const studioSocket = require("../ws/studioSocket");
const ingest = require("../ws/ingest");
const liquidsoap = require("../services/liquidsoapClient");
const liveSession = require("../services/liveSession");
const { runMigrations } = require("../config/migrate");
const { sequelize, User, PlayHistory } = require("../models");

const INTERNAL = process.env.INTERNAL_API_SECRET;
const AUTH = `Bearer ${jwt.sign({ role: "admin" }, process.env.SECRET_KEY)}`;

let dj;
let server;
let wsPort;

beforeAll(async () => {
  await runMigrations();
  dj = await User.create({
    username: `dj-${Math.random().toString(36).slice(2, 8)}`,
    role: "dj",
    micPreferencesJson: { duckLevel: 0.4, micGain: 2, timeoutMs: 3000 },
  });

  server = http.createServer(app);
  studioSocket.init(server);
  ingest.init(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  wsPort = server.address().port;
}, 120000);

afterAll(async () => {
  await PlayHistory.destroy({ where: { source: "live" } });
  await User.destroy({ where: { id: dj.id } });
  await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

afterEach(async () => {
  // Reset the singleton + its timers between tests.
  await liveSession.stop();
  liquidsoap.command.mockClear();
});

describe("auth", () => {
  test("POST /api/v1/studio/session/start requires a JWT", async () => {
    const res = await request(app).post("/api/v1/studio/session/start").send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/studio/session/start", () => {
  test("reserves /live, returns ingest endpoint, configures voice-over", async () => {
    const res = await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover", show: "Evening Jazz", dj: "DJ Test" });

    expect(res.status).toBe(201);
    expect(res.body.mode).toBe("voiceover");
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.ingest.path).toBe("/ws/ingest");
    expect(res.body.ingest.mount).toBe("/live");
    expect(res.body.ingest.query.session).toBe(res.body.sessionId);

    // Voice-over keeps the music bed at full gain.
    expect(liquidsoap.command).toHaveBeenCalledWith(
      "var.set live_music_gain = 1.0000"
    );
  });

  test("full live takeover cuts the music bed (music_gain 0)", async () => {
    const res = await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "live" });
    expect(res.status).toBe(201);
    expect(liquidsoap.command).toHaveBeenCalledWith(
      "var.set live_music_gain = 0.0000"
    );
  });

  test("applies per-DJ mic preferences from User.micPreferencesJson", async () => {
    const res = await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover", userId: dj.id });
    expect(res.status).toBe(201);
    // duckLevel 0.4 + micGain 2 from the DJ's prefs.
    expect(liquidsoap.command).toHaveBeenCalledWith("var.set live_duck = 0.4000");
    expect(liquidsoap.command).toHaveBeenCalledWith(
      "var.set live_mic_gain = 2.0000"
    );
  });

  test("rejects a second concurrent session (409)", async () => {
    const first = await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover" });
    expect(second.status).toBe(409);
  });
});

describe("harbor connect/disconnect drives onAir + now-playing", () => {
  test("connect -> onAir, now-playing reflects the live show", async () => {
    const start = await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover", show: "Morning Drive", dj: "DJ Ada" });
    expect(start.status).toBe(201);

    const con = await request(app)
      .post("/api/v1/playout/harbor")
      .set("X-Internal-Secret", INTERNAL)
      .send({ event: "connect" });
    expect(con.status).toBe(200);
    expect(con.body.state.onAir).toBe(true);

    const np = await request(app).get("/playout/nowplaying");
    expect(np.body.title).toBe("Morning Drive");
    expect(np.body.artist).toBe("DJ Ada");

    // A live PlayHistory row was recorded.
    const livePlays = await PlayHistory.count({ where: { source: "live" } });
    expect(livePlays).toBeGreaterThanOrEqual(1);
  });

  test("autodj metadata does NOT clobber now-playing while live", async () => {
    await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover", show: "Live Now", dj: "DJ Live" });
    await request(app)
      .post("/api/v1/playout/harbor")
      .set("X-Internal-Secret", INTERNAL)
      .send({ event: "connect" });

    // Music bed track change underneath the voice-over.
    await request(app)
      .post("/api/v1/playout/metadata")
      .set("X-Internal-Secret", INTERNAL)
      .send({ title: "Some Song", artist: "Some Artist", source: "autodj" });

    const np = await request(app).get("/playout/nowplaying");
    expect(np.body.title).toBe("Live Now"); // still the live show
  });

  test("disconnect flips onAir off + restores the music-bed now-playing", async () => {
    await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover", show: "Going Live", dj: "DJ X" });
    await request(app)
      .post("/api/v1/playout/harbor")
      .set("X-Internal-Secret", INTERNAL)
      .send({ event: "connect" });

    // Music bed advances underneath the live show (held out of public NP, but
    // stashed as the shadow track).
    await request(app)
      .post("/api/v1/playout/metadata")
      .set("X-Internal-Secret", INTERNAL)
      .send({ title: "Bed Track", artist: "Bed Artist", source: "autodj" });
    expect((await request(app).get("/playout/nowplaying")).body.title).toBe(
      "Going Live"
    );

    const dis = await request(app)
      .post("/api/v1/playout/harbor")
      .set("X-Internal-Secret", INTERNAL)
      .send({ event: "disconnect" });
    expect(dis.status).toBe(200);
    expect(dis.body.state.onAir).toBe(false);

    // On failback the underlying AutoDJ track is promoted immediately.
    const np = await request(app).get("/playout/nowplaying");
    expect(np.body.title).toBe("Bed Track");
  });

  test("harbor endpoint rejects an unknown event + requires the internal secret", async () => {
    const noSecret = await request(app)
      .post("/api/v1/playout/harbor")
      .send({ event: "connect" });
    expect(noSecret.status).toBe(401);

    await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover" });
    const bad = await request(app)
      .post("/api/v1/playout/harbor")
      .set("X-Internal-Secret", INTERNAL)
      .send({ event: "bogus" });
    expect(bad.status).toBe(400);
  });
});

describe("POST /api/v1/studio/session/mode", () => {
  test("switches live <-> voiceover and re-pushes the music gain", async () => {
    await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover" });

    liquidsoap.command.mockClear();
    const toLive = await request(app)
      .post("/api/v1/studio/session/mode")
      .set("Authorization", AUTH)
      .send({ mode: "live" });
    expect(toLive.status).toBe(200);
    expect(toLive.body.mode).toBe("live");
    expect(liquidsoap.command).toHaveBeenCalledWith(
      "var.set live_music_gain = 0.0000"
    );
  });
});

describe("ingest WS authorization", () => {
  test("authorize() requires a valid JWT + an active matching session", async () => {
    const start = await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover" });
    const sessionId = start.body.sessionId;
    const token = jwt.sign({ role: "dj" }, process.env.SECRET_KEY);

    expect(ingest.authorize(token, sessionId)).toBe(true);
    expect(ingest.authorize(token, "not-the-session")).toBe(false);
    expect(ingest.authorize("bad.token", sessionId)).toBe(false);
    expect(ingest.authorize(null, sessionId)).toBe(false);
  });

  test("harborUrl points at the Liquidsoap harbor mount", () => {
    expect(ingest.harborUrl()).toMatch(/^icecast:\/\/.+@.+:\d+\/live$/);
  });

  test("WS upgrade is rejected without a valid token", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/ingest`);
    await new Promise((resolve) => {
      ws.on("error", resolve); // handshake rejected -> error
      ws.on("open", () => {
        ws.close();
        resolve();
      });
    });
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });
});

describe("/ws/studio broadcasts studio:state", () => {
  test("a connected client receives studio:state when a session starts", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/studio`);
    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    const got = new Promise((resolve) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "studio:state") resolve(msg);
      });
    });
    let timer;
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error("no studio:state within 5s")), 5000);
    });

    await request(app)
      .post("/api/v1/studio/session/start")
      .set("Authorization", AUTH)
      .send({ mode: "voiceover", show: "WS Show" });

    const msg = await Promise.race([got, timeout]);
    clearTimeout(timer);
    expect(msg.event).toBe("studio:state");
    expect(msg.data).toHaveProperty("onAir");
    expect(msg.data).toHaveProperty("mode");

    await new Promise((resolve) => {
      ws.on("close", resolve);
      ws.close();
    });
  });
});
