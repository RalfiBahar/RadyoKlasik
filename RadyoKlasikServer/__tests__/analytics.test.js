const os = require("os");
const fs = require("fs");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.SECRET_KEY = process.env.SECRET_KEY || "test-secret";
process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "test-internal";
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin";
const { TEST_DATABASE_URL } = require("./setup/testDb");
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MEDIA_DIR =
  process.env.MEDIA_DIR || path.join(os.tmpdir(), `rk-media-an-${Date.now()}`);

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const settings = require("../services/settings");
const collector = require("../services/analytics/collector");
const {
  deviceFromUserAgent,
  countryFromIp,
  durationFromBytes,
} = require("../services/analytics/classify");
const { toCsv } = require("../controllers/analyticsController");
const { runMigrations } = require("../config/migrate");
const {
  sequelize,
  ListenerSession,
  ListenerSnapshot,
  PlayHistory,
  Track,
} = require("../models");

const ADMIN = `Bearer ${jwt.sign({ role: "admin" }, process.env.SECRET_KEY)}`;
const DJ = `Bearer ${jwt.sign({ role: "dj" }, process.env.SECRET_KEY)}`;

function caddyLine({ ip = "85.105.1.1", ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", size = 65535 + 16000 * 120, uri = "/stream", status = 200, ts = Date.now() / 1000 } = {}) {
  return JSON.stringify({
    level: "info",
    ts,
    msg: "handled request",
    request: { client_ip: ip, remote_ip: ip, method: "GET", uri, headers: { "User-Agent": [ua] } },
    duration: 0,
    size,
    status,
  });
}

describe("classification helpers", () => {
  test("device from user agent", () => {
    expect(deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe("iPad");
    expect(deviceFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("Android");
    expect(deviceFromUserAgent("okhttp/4.9.2")).toBe("Android");
    expect(deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Desktop");
    expect(deviceFromUserAgent("VLC/3.0.20 LibVLC/3.0.20")).toBe("Player");
    expect(deviceFromUserAgent("")).toBe("Unknown");
  });

  test("country from IP (GeoIP) and private addresses", () => {
    expect(countryFromIp("85.105.1.1")).toBe("TR");
    expect(countryFromIp("192.168.1.10")).toBeNull();
  });

  test("session length from streamed bytes (minus Icecast burst)", () => {
    expect(durationFromBytes(65535 + 16000 * 60)).toBe(60);
    expect(durationFromBytes(1000)).toBe(0);
  });

  test("CSV escapes commas and quotes", () => {
    expect(toCsv([{ a: 'x,"y"', b: 2 }], ["a", "b"])).toBe('a,b\n"x,""y""",2');
  });
});

describe("collector parsing", () => {
  test("a Caddy stream line becomes a session with real country + device", () => {
    const s = collector.sessionFromCaddyLine(caddyLine());
    expect(s).toMatchObject({ source: "caddy", country: "TR", device: "iPhone", durationSec: 120, mount: "/stream" });
    expect(s.ipHash).toHaveLength(32);
    expect(s.ipHash).not.toContain("85.105");
  });

  test("ignores non-stream paths, errors and short probes", () => {
    expect(collector.sessionFromCaddyLine(caddyLine({ uri: "/status-json.xsl" }))).toBeNull();
    expect(collector.sessionFromCaddyLine(caddyLine({ status: 404 }))).toBeNull();
    expect(collector.sessionFromCaddyLine(caddyLine({ size: 70000 }))).toBeNull();
    expect(collector.sessionFromCaddyLine("not json")).toBeNull();
  });

  test("parses Icecast listclients XML", () => {
    const xml =
      '<?xml version="1.0"?><icestats><source mount="/stream"><Listeners>1</Listeners>' +
      "<listener><IP>1.2.3.4</IP><UserAgent>VLC &amp; co</UserAgent><Connected>42</Connected><ID>7</ID></listener>" +
      "</source></icestats>";
    expect(collector.parseListClients(xml)).toEqual([
      { id: "7", ip: "1.2.3.4", userAgent: "VLC & co", connected: 42 },
    ]);
  });
});

describe("analytics API", () => {
  let track;
  const logFile = path.join(os.tmpdir(), `caddy-${Date.now()}.log`);

  beforeAll(async () => {
    await runMigrations();
    await settings.load();
    await ListenerSession.destroy({ where: {} });
    await ListenerSnapshot.destroy({ where: {} });
    track = await Track.create({
      title: "Analytics Song",
      artist: "Tester",
      type: "song",
      duration: 100,
      filePath: "an.mp3",
      fileHash: `an-${Date.now()}`,
    });
  }, 120000);

  afterAll(async () => {
    await PlayHistory.destroy({ where: { trackId: track.id } });
    await Track.destroy({ where: { id: track.id } });
    await ListenerSession.destroy({ where: {} });
    await ListenerSnapshot.destroy({ where: {} });
    fs.rmSync(logFile, { force: true });
  });

  test("ingests the Caddy log idempotently", async () => {
    const now = Date.now() / 1000;
    fs.writeFileSync(
      logFile,
      [
        caddyLine({ ts: now - 60 }),
        caddyLine({ ts: now - 30, ip: "8.8.8.8", ua: "Mozilla/5.0 (Windows NT 10.0)", size: 65535 + 16000 * 600 }),
        caddyLine({ uri: "/favicon.ico" }),
      ].join("\n") + "\n"
    );
    collector._resetCaddyOffset();
    expect(await collector.ingestCaddyLog(logFile)).toBe(2);
    // A restart re-reads the file from the top without duplicating rows.
    collector._resetCaddyOffset();
    await collector.ingestCaddyLog(logFile);
    expect(await ListenerSession.count()).toBe(2);
  });

  test("listeners KPIs combine sessions and minute snapshots", async () => {
    const minute = Math.floor(Date.now() / 60000) * 60000;
    await ListenerSnapshot.bulkCreate([
      { at: new Date(minute - 120000), listeners: 3 },
      { at: new Date(minute - 60000), listeners: 5 },
    ]);
    const res = await request(app)
      .get("/api/v1/analytics/listeners?period=today")
      .set("Authorization", ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.kpis).toMatchObject({ peakListeners: 5, totalSessions: 2, uniqueListeners: 2 });
    expect(res.body.kpis.avgListeningMinutes).toBe(6); // (2 + 10) / 2
    expect(res.body.series.length).toBeGreaterThan(0);
  });

  test("regional and device breakdowns", async () => {
    const reg = await request(app).get("/api/v1/analytics/regional?period=today").set("Authorization", ADMIN);
    expect(reg.body.items.map((r) => r.country).sort()).toEqual(["TR", "US"]);
    const dev = await request(app).get("/api/v1/analytics/devices?period=today").set("Authorization", ADMIN);
    expect(dev.body.items.map((d) => d.device).sort()).toEqual(["Desktop", "iPhone"]);
  });

  test("hourly returns all 24 hours", async () => {
    const res = await request(app).get("/api/v1/analytics/hourly?period=7d").set("Authorization", ADMIN);
    expect(res.body.items).toHaveLength(24);
    expect(res.body.items.reduce((s, h) => s + h.sessions, 0)).toBe(2);
  });

  test("track reports + monthly from play history", async () => {
    await PlayHistory.bulkCreate([
      { trackId: track.id, source: "autodj", startedAt: new Date() },
      { trackId: track.id, source: "request", startedAt: new Date() },
    ]);
    const res = await request(app).get("/api/v1/analytics/tracks?period=today").set("Authorization", ADMIN);
    const row = res.body.items.find((t) => t.trackId === track.id);
    expect(row).toMatchObject({ plays: 2, requested: 1 });
    const monthly = await request(app).get("/api/v1/analytics/tracks/monthly").set("Authorization", ADMIN);
    expect(monthly.body.items[0].plays).toBeGreaterThanOrEqual(2);
  });

  test("CSV export + roles (DJs get live stats only)", async () => {
    const csv = await request(app).get("/api/v1/analytics/export?type=regional&period=today").set("Authorization", ADMIN);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text.split("\n")[0]).toBe("country,sessions,uniqueListeners,listeningHours,pct");
    expect((await request(app).get("/api/v1/analytics/listeners").set("Authorization", DJ)).status).toBe(403);
    expect((await request(app).get("/api/v1/analytics/live").set("Authorization", DJ)).status).toBe(200);
  });
});

describe("HLS listener tracking", () => {
  const seg = (ts, ip = "85.105.1.1", ua = "Mozilla/5.0 (iPhone)") =>
    JSON.stringify({
      ts,
      request: { client_ip: ip, method: "GET", uri: "/hls/aac_128_7.ts", headers: { "User-Agent": [ua] } },
      size: 64000,
      status: 200,
    });

  test("a run of segment requests is one session; idle clients are flushed", async () => {
    collector._resetCaddyOffset();
    const file = path.join(os.tmpdir(), `hls-${Date.now()}.log`);
    const t0 = Date.now() / 1000 - 300;
    const lines = [];
    for (let i = 0; i < 10; i++) lines.push(seg(t0 + i * 4));
    fs.writeFileSync(file, lines.join("\n") + "\n");
    expect(await collector.ingestCaddyLog(file)).toBe(0); // no Icecast-style sessions
    expect(collector.activeHlsListeners(t0 * 1000 + 40000)).toBe(1);
    expect(collector.activeHlsListeners(Date.now())).toBe(0);
    const written = await collector.flushIdleHls(Date.now());
    expect(written).toBe(1);
    const row = await ListenerSession.findOne({ where: { source: "hls" } });
    expect(row).toMatchObject({ country: "TR", device: "iPhone", durationSec: 40 });
    expect(Number(row.bytes)).toBe(640000);
    fs.rmSync(file, { force: true });
  });
});

afterAll(async () => {
  await ListenerSession.destroy({ where: { source: "hls" } });
  await sequelize.close();
});
