const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.SECRET_KEY = process.env.SECRET_KEY || "test-secret";
process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "test-internal";
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin";
const { TEST_DATABASE_URL } = require("./setup/testDb");
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MEDIA_DIR = process.env.MEDIA_DIR || path.join(os.tmpdir(), `rk-media-mon-${Date.now()}`);

jest.mock("axios");
const axios = require("axios");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const alerts = require("../services/monitoring/alerts");
const { sequelize } = require("../models");

const healthy = {
  db: true,
  icecast: true,
  liquidsoap: true,
  mounts: { "/stream": 3 },
  missingMounts: [],
  hlsAgeSec: 3,
  deadAir: false,
  autopilot: true,
  liveOnAir: false,
  diskFreePct: 50,
};

afterAll(() => sequelize.close());
beforeEach(() => {
  alerts._reset();
  axios.post.mockReset();
  axios.post.mockResolvedValue({ status: 200 });
  process.env.ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/x";
});

describe("alert rules", () => {
  test("fires once after the threshold, then resolves once", async () => {
    const down = { ...healthy, liquidsoap: false };
    expect(await alerts.evaluate(down)).toEqual([]); // 1st check: not yet
    const fired = await alerts.evaluate(down);
    expect(fired).toEqual([expect.objectContaining({ rule: "liquidsoap_down", status: "firing" })]);
    expect(await alerts.evaluate(down)).toEqual([]); // no repeat spam
    expect(alerts.active().map((a) => a.rule)).toEqual(["liquidsoap_down"]);
    const resolved = await alerts.evaluate(healthy);
    expect(resolved).toEqual([expect.objectContaining({ rule: "liquidsoap_down", status: "resolved" })]);
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][1]).toEqual({ text: expect.stringContaining("Liquidsoap") });
  });

  test("silence only alerts when autopilot is on and nobody is live", async () => {
    const offAir = { ...healthy, deadAir: true, autopilot: false };
    await alerts.evaluate(offAir);
    expect(await alerts.evaluate(offAir)).toEqual([]);
    const dead = { ...healthy, deadAir: true };
    await alerts.evaluate(dead);
    expect((await alerts.evaluate(dead))[0].rule).toBe("dead_air");
  });

  test("missing mounts and stale HLS", async () => {
    const bad = { ...healthy, missingMounts: ["/stream-hd"], hlsAgeSec: 120 };
    await alerts.evaluate(bad);
    const rules = (await alerts.evaluate(bad)).map((c) => c.rule).sort();
    expect(rules).toEqual(["hls_stale", "mount_missing"]);
  });

  test("Discord and generic webhook payloads", () => {
    expect(alerts.payloadFor("https://discord.com/api/webhooks/1/x", "hi", {})).toEqual({ content: "hi" });
    expect(alerts.payloadFor("https://ntfy.example/x", "hi", { rule: "r" })).toEqual({ text: "hi", rule: "r" });
  });
});

describe("/metrics", () => {
  test("requires the metrics token when configured", async () => {
    process.env.METRICS_TOKEN = "scrape-me";
    expect((await request(app).get("/metrics")).status).toBe(401);
    const res = await request(app).get("/metrics").set("Authorization", "Bearer scrape-me");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/rk_up\{component="db"\} 1/);
    expect(res.text).toMatch(/rk_autopilot_enabled/);
    delete process.env.METRICS_TOKEN;
  });

  test("monitoring status is admin-only", async () => {
    const dj = jwt.sign({ role: "dj" }, process.env.SECRET_KEY);
    expect((await request(app).get("/api/v1/monitoring/status").set("Authorization", `Bearer ${dj}`)).status).toBe(403);
    const admin = jwt.sign({ role: "admin" }, process.env.SECRET_KEY);
    const res = await request(app).get("/api/v1/monitoring/status").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("alerts");
  });
});

describe("hardening", () => {
  test("login is rate limited per IP", async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app).post("/auth/studio_login").send({ username: "x", password: "y" });
    }
    expect(last.status).toBe(429);
  });

  test("the public listener token can't send push notifications or start recordings", async () => {
    const listener = `Bearer ${jwt.sign({}, process.env.SECRET_KEY)}`;
    const rejected = [401, 403];
    expect(rejected).toContain((await request(app).post("/notification/send_notification").set("Authorization", listener)).status);
    expect(rejected).toContain((await request(app).post("/recording/start").set("Authorization", listener)).status);
    expect(rejected).toContain((await request(app).delete("/notification/delete_all_notification_tokens")).status);
  });
});

describe("legacy EJS dashboard still works after the lockdown", () => {
  test("session login reaches the admin recording + chat routes", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/auth/login")
      // Browsers send Origin on form POSTs — the API's own origin must pass.
      .set("Origin", "http://localhost:8001")
      .set("Host", "localhost:8001")
      // Its own client IP: the rate-limit test above exhausted 127.0.0.1.
      .set("X-Forwarded-For", "10.9.9.9")
      .type("form")
      .send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
    expect(login.status).toBe(302);
    expect(login.headers.location).toBe("/dashboard");
    expect((await agent.get("/dashboard")).status).toBe(200);
    // Admin-only routes accept the dashboard session (no staff token needed).
    expect((await agent.get("/recording/status")).status).toBe(200);
    expect((await agent.get("/recording/get_artworks")).status).toBe(200);
    // Without the session the same route is refused.
    expect([401, 403]).toContain((await request(app).get("/recording/status")).status);
  });
});

describe("CORS", () => {
  test("an unknown origin gets no CORS headers instead of a 500", async () => {
    const res = await request(app).get("/api/v1/health").set("Origin", "https://evil.example");
    expect(res.status).not.toBe(500);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("the website origin is allowed", async () => {
    const res = await request(app).get("/api/v1/health").set("Origin", "https://radyoklasik.online");
    expect(res.headers["access-control-allow-origin"]).toBe("https://radyoklasik.online");
  });
});
